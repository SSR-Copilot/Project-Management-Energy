# Claude Code Handoff Context - DevexCapexSummaryPCF

Last updated 2026-06-22 (Sprint 66 bug-fix pass). Earlier baseline by Codex on 2026-06-11.

This file is a full handoff for Claude Code or any next developer. It captures what was built in this PCF project, what Power Apps screen code is involved, the main problems that came up, the fixes applied, and the current state/open items.

## Changelog — Sprint 66 (June 2026)

Current versions after this pass: **PCF control `1.0.30`**, **solution `1.0.27`** (ZIP `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`).

### PCF fixes (this repo — shipped in v1.0.30)

- **13125 — Unnecessary horizontal scrollbar.** `GridRenderer.fitColumnsToScrollViewport()` re-runs `renderColGroup` against the scroll wrapper's live `clientWidth` (excludes the vertical scrollbar) after rows render, and a `ResizeObserver` re-fits on any host resize. `Math.max(minimumTableWidth, …)` still preserves the intended horizontal scroll on genuinely narrow canvases. **Note:** there is also a Canvas half to this bug — `con_Costs_ContentCostsInMonths.Width = Max(1590, Parent.Width)` forced a 1590px floor; see `CANVAS_APP_GUIDE.md` §12.
- **13280 — Column names.** Header captions renamed to **"Total Planned"** / **"Total Paid"** (were "Total Planned Cost" / "Total Actual Cost"). Label only; bindings unchanged.
- **13304 — Month headers.** Now three-letter abbreviations `Jan`…`Dec` with no year (`MONTH_ABBREVIATIONS`); removed the unused `shortYearStr`.
- **13284 — "Paid Cost" tooltip.** Paid month cells get `td.title = "Paid Cost"`.
- **13290 — Disabled-paid message.** "Cluster-distributed costs cannot be marked as paid." → **"Automatically distributed costs cannot be marked as paid."** (`isEqualDistribution` already covers both equal-by-cluster and equal-by-date).
- **13292 — Paid/unpaid popup toggle.** Re-clicking the same month cell now closes the dropdown (guard at the top of `showMonthActionDropdown`).
- **UI polish.** Three-dot (`ActionDropdown`) and Add buttons get a blue active state (`pcf-dots-btn-active` / `pcf-add-menu-btn-active`) while their menu is open; both menus toggle closed on re-click; Add button widened (`min-width: 110px`).

### Release skill changes (`~/.codex/skills/pcf-release-build`, NOT in this repo)

- **Dummy-data strip/restore.** The `TemporaryTestBudgetFallback` fallback is now ACTIVE in dev source (wrapped in `// PCF-DUMMY-DATA-START/END` markers in `GridRenderer.ts`). The release script comments those lines out before MSBuild and restores them byte-for-byte after, so production bundles never ship sample data. Caveat: a plain `npm run build` (outside the skill) WILL include the fallback.
- **UTF-8 encoding fix.** The strip step now reads/writes via `[System.IO.File]::ReadAllLines` / `WriteAllLines` (UTF-8 no-BOM). The earlier `Get-Content`/`Set-Content -Encoding UTF8` round-trip mojibaked the `−` (U+2212) collapse-toggle glyph and shipped it as a tofu box in v1.0.28 — fixed and verified at the byte level in v1.0.30.

### Canvas fixes (guidance — applied in Studio, see `CANVAS_APP_GUIDE.md` §12)

13121 (dropdown defaults), 13226 (SubLabel spacing/casing), 13281 (set-paid for non-linked costs), 13283 (popup cancel/X), 13291 (re-link-to-milestone confirmation + reset). These are Power Apps changes; the PCF was not involved.

## 1. Project Identity

- Repo/root folder: `TableConnectedToDataversePCF`
- Current working path:
  - `C:\Users\ShaktiSingh\OneDrive - Xebia\Desktop\Desktop\Lenovo Dev\MyDevelopement\TableConnectedToDataversePCF`
- PCF display/constructor name after rename:
  - `DevexCapexSummaryPCF`
- PCF namespace:
  - `DEV.Controls`
- Manifest file:
  - `TableConnectedToDataversePCF/ControlManifest.Input.xml`
- PCF project file:
  - `TableConnectedToDataversePCF.pcfproj`
- Dataverse solution project:
  - `DevexCapex_POC/DevexCapex_POC.cdsproj`
- Current PCF manifest version:
  - `1.0.19`
- Current solution version:
  - `1.0.16`
- Current solution ZIP path:
  - `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`
- Existing older context file:
  - `PROJECT_CONTEXT.md`
- This file is newer and includes later paid/unpaid/comment work.

Important note: latest comment-dot changes were validated with `npm run build`, but the release skill was not run after that change in this turn. If importing into Power Apps, run the release build skill to bump versions and regenerate the ZIP.

## 2. Project Purpose

This project is a Power Apps Component Framework control for rendering the DEVEX/CAPEX cost summary grid.

It replaces/augments a Canvas App gallery/table layout with a custom PCF table that supports:

- Hierarchical rows:
  - Account
  - Subaccount
  - Contract/cost row
  - Add row
  - Grand total row
- Expand/collapse tree behavior.
- Figma-like hierarchy connector lines.
- Cluster timeline header above month columns.
- Dynamic month headers based on selected year.
- Optional `Total Planned Cost` and `Total Actual Cost`.
- Sticky header.
- Sticky Grand Total row at bottom of allocated PCF height.
- Horizontal scroll when Canvas App gives less width than required minimum.
- Add New Cost from subaccount row.
- Add Standard Contract from subaccount row.
- Contract action dropdown:
  - Edit
  - Comments
  - Delete
- Monthly paid/unpaid action dropdown on cost cells.
- Standard contract blue styling.
- Browser-locale-aware numeric formatting.
- Comment red dots and hover tooltips for contract-level and month-level comments.

## 3. Main Source Files

### `TableConnectedToDataversePCF/index.ts`

PCF entry point.

Responsibilities:

- Implements the PCF lifecycle.
- Creates `ActionDropdown`.
- Creates `GridRenderer`.
- Handles all PCF output trigger state.
- Sends action output properties back to Power Apps through `getOutputs`.
- Resets action trigger booleans after outputs are read.
- Listens to internal re-render events used by expand/collapse.

Important output action type:

```ts
type GridAction =
  "Edit" |
  "Comment" |
  "Delete" |
  "Add" |
  "AddStandardContract" |
  "SetCostPaidUnpaid";
```

Important outputs:

- `EditTriggered`
- `CommentTriggered`
- `DeleteTriggered`
- `AddTriggered`
- `AddStandardContractTriggered`
- `SetCostPaidUnpaidTriggered`
- `SelectedRecordId`
- `SelectedStandardContractId`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

Known detail:

- `SetCostPaidUnpaid` is implemented PCF-side, but current `Powerapps code/CapexScreenCode` does not appear to have a handler for `Self.SetCostPaidUnpaidTriggered` yet. Search returned no matches for `SetCostPaidUnpaidTriggered`, `SelectedCostYear`, `SelectedCostMonth`, or `SelectedCostPaid`.

### `TableConnectedToDataversePCF/ui/GridRenderer.ts`

Main DOM renderer.

Responsibilities:

- Parses incoming PCF dataset through `DatasetParser`.
- Falls back to `TemporaryTestBudgetFallback` if dataset is empty.
- Renders the table, header, body, and grand total.
- Calculates responsive widths and renders `colgroup`.
- Renders cluster timeline.
- Renders account/subaccount/contract/add rows.
- Maintains collapsed row IDs.
- Handles row tree connector classes.
- Handles add dropdown and standard-contract submenu.
- Handles monthly paid/unpaid dropdown.
- Formats all numeric costs using browser locale.
- Renders comment dots/tooltips.

Important column width constants:

```ts
NUMBER_COLUMN_MIN_WIDTH = 100;
ACCOUNT_NAME_COLUMN_MIN_WIDTH = 300;
TOTAL_COST_COLUMN_MIN_WIDTH = 100;
PLANNED_COST_COLUMN_MIN_WIDTH = 120;
ACTUAL_COST_COLUMN_MIN_WIDTH = 120;
MONTH_COLUMN_MIN_WIDTH = 65;
ACTION_COLUMN_WIDTH = 40;
```

History:

- Account Name column was increased from around `220` to `300` because Power Apps had right-side blank room and long names were too constrained.
- Widths are intentionally dynamic/minimum-based. When Canvas App width is too narrow, table uses horizontal scroll rather than squeezing columns until the UI breaks.
- Be careful changing only `ACCOUNT_NAME_COLUMN_MIN_WIDTH`; other column widths were tuned not to disturb the month area.

Current notable implementation points:

- Dataset is parsed:
  - `let accounts = DatasetParser.parseDatasetToTree(dataset);`
  - if empty, `TemporaryTestBudgetFallback.parse()` is used.
- Standard contract options are parsed from second dataset and applied by subaccount:
  - `DatasetParser.parseStandardContractOptionsDataset(context.parameters.StandardContractOptions)`
  - `applyStandardContractOptions(...)`
- Cost values are formatted with:
  - `new Intl.NumberFormat(browserLocales, { maximumFractionDigits: 0 })`
  - This means English browser shows `1,000`, German browser shows `1.000`.
- Contract name red dot:
  - `contract.hasComments` plus `contract.commentTooltip`
- Month-level red dot:
  - `contract.monthHasComments[monthIndex]`
  - `contract.monthCommentTooltips[monthIndex]`

Debug note:

- There are still temporary `console.log` blocks marked `Will Delete`/`Till Here` in `GridRenderer.ts` and `DatasetParser.ts`. They were intentionally left during troubleshooting. Remove them only when the team is ready; do not remove while debugging dataset issues.

### `TableConnectedToDataversePCF/ui/ActionDropdown.ts`

Contract row three-dot dropdown.

Actions:

- Edit
- Comments
- Delete

Design:

- Dropdown is appended to `document.body`, not inside table cells, to avoid clipping inside the scroll container.
- Comments item can show an inline red dot when `hasComments` is true.

### `TableConnectedToDataversePCF/services/DatasetParser.ts`

The most important integration file.

Responsibilities:

- Converts flat Power Apps dataset rows into nested model:
  - `AccountData`
  - `SubaccountData`
  - `ContractData`
- Detects many possible column names case-insensitively.
- Reads direct PCF dataset values safely through helper methods:
  - `safeGetValue`
  - `safeGetFormattedValue`
  - `firstAvailableValue`
- Normalizes field names using:
  - `normalizeFieldName(value).replace(/[^a-z0-9]/g, "")`
- Parses row type.
- Parses IDs.
- Parses month values `M1` through `M12`.
- Parses total/planned/actual cost.
- Parses standard contract flags.
- Parses cost paid by value (`DevCo`, `SPV`).
- Parses distribution type.
- Parses monthly paid flags.
- Parses comment tooltip fields.
- Parses `StandardContractOptions` dataset.
- Calculates cluster timeline.

Key design decision:

- The PCF does not calculate all-year totals from visible month columns.
- Power Apps must send all-year totals into:
  - `TotalCost`
  - `PlannedCost`
  - `ActualCost`
- Month columns `M1` to `M12` are only for the currently selected visible year.

This was a major bug/fix: earlier totals looked like selected-year-only totals. The fix was to make Power Apps produce all-year total columns separately using all costs in selected contracts, while PCF simply displays those total fields.

### `TableConnectedToDataversePCF/models/GridModels.ts`

Model definitions.

Current `ContractData` includes:

- `id`
- `parentId`
- `number`
- `name`
- `subLabel`
- `costPaidBy`
- `totalCost`
- `plannedCost`
- `actualCost`
- `hasComments`
- `commentTooltip`
- `isStandardContract`
- `distributionType`
- `months`
- `monthPaid`
- `monthHasComments`
- `monthCommentTooltips`

Comment fields were added latest.

### `TableConnectedToDataversePCF/css/TableConnectedToDataversePCF.css`

Main styling.

Important feature areas:

- Base PCF font/theme:
  - `Segoe UI`
  - 12px regular/bold variants
- Table layout:
  - sticky headers
  - scroll wrapper
  - fixed table layout
- Tree connector lines:
  - account/subaccount/contract/add row connector classes
- Cluster timeline:
  - pill labels
  - horizontal line
  - start/end short vertical ticks
- Cost cells:
  - paid green `#D6E7B3`
  - paid hover darker
  - unpaid hover gray
- Add dropdown.
- Action dropdown.
- Month paid/unpaid dropdown.
- Comment red dots and dark tooltip.
- Grand total sticky bottom row.

### `TableConnectedToDataversePCF/services/TemporaryTestBudgetFallback.ts`

Temporary fallback parser/data.

Purpose:

- If live dataset is empty, render test data so UI can be developed/tested.

User instruction/history:

- User explicitly asked to add this temporary behavior.
- User said: when asked to remove it later, remove only this functionality.
- Do not remove unrelated dataset parser logic.

Latest update:

- Fallback data now has sample comment fields:
  - `CommentTooltip`
  - `M7HasComments`
  - `M7CommentTooltip`

### `test_budget_dataset.csv`

Standalone test dataset.

Latest header includes:

- `CommentTooltip`
- `M7HasComments`
- `M7CommentTooltip`

Example test row has:

- contract-level tooltip: `Wrong name`
- month-level tooltip: `Wrong Cost too much`

## 4. Manifest Details

Manifest file:

- `TableConnectedToDataversePCF/ControlManifest.Input.xml`

Control:

- namespace: `DEV.Controls`
- constructor: `DevexCapexSummaryPCF`
- version: `1.0.19`

Datasets:

- `DevexCapexCostSummary`
  - main cost summary rows
- `StandardContractOptions`
  - available standard contracts by subaccount

Inputs:

- `ShowPlannedCost`
- `StartYear`
- `ShowEmptyAccounts`
- `CostPaidByFilter`
- `Cluster1Date`
- `Cluster2Date`
- `Cluster3Date`
- `Cluster4Date`
- `Cluster5Date`
- `Cluster6Date`

Outputs:

- `EditTriggered`
- `CommentTriggered`
- `DeleteTriggered`
- `AddTriggered`
- `AddStandardContractTriggered`
- `SetCostPaidUnpaidTriggered`
- `SelectedRecordId`
- `SelectedStandardContractId`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

## 5. Power Apps Code Files

Power Apps YAML-like exports are stored in:

- `Powerapps code/CapexScreenCode`
  - current/dev copy where most PCF integration work was done.
- `Powerapps code/CapexScreenCodePrev`
  - previous/main app copy.

Important reminder:

- These are large files, around 1.5 MB each.
- Use `rg`/targeted search, not full manual reading.
- The current app code has the PCF control named `DevexCapexSummaryPCF`.
- The previous app code has `DevexCapexSummaryPCF1` in places.

Useful searches:

```powershell
rg -n "DevexCapexSummaryPCF|colFinatCostDataOptimized|btn_Capex_Cost_Refresh_Capex_Cost_Code|btn_Capex_Cost_Add_Standard_Contract_Code|SetCostPaidUnpaidTriggered" "Powerapps code\CapexScreenCode"
```

## 6. Power Apps PCF Control Binding

Current PCF control block in `CapexScreenCode`:

- Control name:
  - `DevexCapexSummaryPCF`
- Component:
  - `dev_DEV.Controls.DevexCapexSummaryPCF`
- Main dataset:
  - `Items = colFinatCostDataOptimized`
- Standard contract dataset:
  - `StandardContractOptions_Items = colStandardContractOptionsForPCF`
- `StartYear = gblSelectedProjectYear`
- `ShowEmptyAccounts = tgl_Costs_ProjectCostbtn_ShowEmptyAccounts.Checked`
- `ShowPlannedCost = tgl_Costs_ProjectCostbtn_ShowPlannedPaid.Checked`
- `CostPaidByFilter = Coalesce(drp_Costs_ProjectCostbtn_ShowCostPaidBy.Selected.Value, "Show All Cost")`
- `Cluster1Date` through `Cluster6Date` come from `gblClusterDurations`.

Current PCF `OnChange` handles:

- `Self.AddTriggered`
- `Self.EditTriggered`
- `Self.AddStandardContractTriggered`
- `Self.DeleteTriggered`

Current PCF `OnChange` does not appear to handle:

- `Self.CommentTriggered`
- `Self.SetCostPaidUnpaidTriggered`

So comment panel and paid/unpaid persistence are still Canvas-side work to finish unless it exists elsewhere not found by search.

## 7. Power Apps Collections and Controls

### `btn_Capex_Cost_Refresh_Capex_Cost_Code`

This hidden button rebuilds `colFinatCostDataOptimized`.

Major steps:

1. Builds selected category collections:
   - `colCapexAccountsInSelectedCategoryNew`
   - `colCapexSubaccountsInSelectedCategoryNew`
   - `colCapexContractsInSelectedCategory`
   - `colCapexCostsInSelectedContracts`
2. Builds only current-year contract rows.
   - This was changed to avoid creating 1900/2021/etc. rows from bad year/reference logic.
3. Builds account/subaccount rows for selected category.
4. Merges hierarchy into `colFinatCostDataOptimizedTemp`.
5. Maps selected-year month costs into `colFlatCostsMapped`.
6. Maps all-year costs into `colFlatCostsAllYearsMapped`.
7. Builds final `colFinatCostDataOptimized`.

Final collection expected columns include:

- `RowId`
- `ParentId`
- `Type`
- `Number`
- `Name`
- `HasComments`
- `TotalCost`
- `PlannedCost`
- `ActualCost`
- `M1` through `M12`
- `IsStandardContract`
- `SubLabel`
- fields for paid/unpaid and distribution if added in Power Apps
- fields for comments if added in Power Apps

Important typo:

- The collection is named `colFinatCostDataOptimized` in the app, not `colFinalCostDataOptimized`.
- Keep the existing typo unless deliberately refactoring app code.

### `btn_Capex_Cost_Build_StandardContractOptions_Code`

This hidden button builds `colStandardContractOptionsForPCF`.

It filters `Devex/Capex Standard Assumptions` by:

- selected category subaccounts
- same country as selected project
- same technology as selected project
- no existing project contract for same project + subaccount + standard assumption
- eligible checked cluster exists and cluster date is valid

It outputs rows with:

- `StandardContractId`
- `SubaccountId`
- `Name`
- `AutoId`
- `ShowOption`

Then it filters `ShowOption` and sorts by `AutoId`.

Important issue/fix:

- User saw already-added standard contracts still appearing in Add Standard Contract.
- This was diagnosed as a Power Apps data/refresh/filter issue, not PCF.
- Fix strategy:
  - filter standard assumptions against existing `CAPEX Project Contracts`
  - remove selected standard option locally after add
  - refresh `CAPEX Project Contracts`
  - rebuild `colStandardContractOptionsForPCF`

### `btn_Capex_Cost_Add_Standard_Contract_Code`

This hidden button loads/adds a selected standard contract into project contracts/costs.

Current PCF `OnChange` calls it when:

- `Self.AddStandardContractTriggered`

Process:

- PCF sends `SelectedRecordId` as subaccount row ID.
- PCF sends `SelectedStandardContractId` as selected standard assumption ID.
- Canvas sets:
  - `locSelectedCostRow`
  - `locGUIDforLoadingStandardContract`
- Then selects:
  - `btn_Capex_Cost_Add_Standard_Contract_Code`

After add, app should:

- refresh contracts/costs
- rebuild `colFinatCostDataOptimized`
- rebuild `colStandardContractOptionsForPCF`

This was needed because after add/edit/delete/add standard, PCF was going blank until the tab was clicked again.

### `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save`

This save button was discussed because after save/edit, PCF could go blank or not refresh.

Fix pattern:

- Do not disturb existing save logic.
- After successful save/patch, refresh local collections and call:
  - `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)`
  - optionally `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)`
- Reset/clear `locSelectedCostRow` only after data refresh is complete where needed.

### Year controls

Implemented in app:

- `btn_Costs_ProjectCostbtn_ShowPreviousYear`
- `btn_Costs_ProjectCostbtn_ShowNextYear`
- `drp_Costs_ProjectCostbtn_ShowSelectedYear`

Behavior:

- Previous year decrements `gblSelectedProjectYear` down to min year.
- Next year increments it and can extend `colProjectPeriods` if beyond current max.
- Dropdown directly selects a year from `colProjectPeriods`.
- Every year change calls:
  - `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)`

Known issue fixed/discussed:

- App was showing too many years such as 1900 to 2021.
- Cause was bad/default date/year values and reference table generation.
- Fix direction:
  - build `colProjectPeriods` from valid project/acquisition/cluster dates
  - ignore blanks/1900 years
  - build contract rows only for selected year, not every historical/invalid year

## 8. Dataset Contract PCF Expects

Main dataset `DevexCapexCostSummary` should provide one row per account/subaccount/contract.

Recommended canonical column names:

### Hierarchy

- `RowId`
- `ParentId`
- `Type`
  - accepted values:
    - `account`
    - `subaccount`
    - `contract`
- `Number`
- `Name`
- `SubLabel`

### Costs

- `TotalCost`
- `PlannedCost`
- `ActualCost`
- `M1`
- `M2`
- `M3`
- `M4`
- `M5`
- `M6`
- `M7`
- `M8`
- `M9`
- `M10`
- `M11`
- `M12`

Cost semantics:

- `M1` to `M12` = costs for currently selected `StartYear`.
- `TotalCost` = total for full contract/all years, not only visible year.
- `PlannedCost` = all-year planned total.
- `ActualCost` = all-year actual/paid total.
- Same all-year logic applies at subaccount and account levels.

### Standard contract

- `IsStandardContract`
  - boolean is best.
  - Parser also accepts many aliases:
    - `StandardContract`
    - `IsStandard`
    - `IsStandardCost`
    - `StandardCost`
    - `ContractType`
    - `vsb_isstandardcontract`
    - etc.
  - Parser also accepts metadata token in `SubLabel`:
    - `||STD=1||`
  - Parser also treats names starting with `Standard ` as standard fallback.

If standard contracts are not blue in Power Apps:

1. Confirm imported PCF version is latest.
2. Confirm `colFinatCostDataOptimized` contains `IsStandardContract = true` for those contract rows.
3. Confirm row type is `contract`, not `subaccount`.
4. Confirm browser/devtools console shows parser reading `isStandardContract: true`.
5. If value comes from Dataverse choice, convert it in Power Apps:
   - `CPC.'Is Standard Contract?' = 'Is Standard Contract? (CAPEX Project Contracts)'.Ja`

### Distribution type

Column:

- `DistributionType`

Accepted values:

- `Individual Distribution`
- `Equal Distribution`
- `Cluster-distributed`
- text containing `cluster distribution`
- text containing `equal distribution`

Usage:

- If distribution is equal/cluster distributed, PCF disables the month paid/unpaid dropdown action and shows info tooltip:
  - `Cluster-distributed costs cannot be marked as paid.`

### Paid/unpaid

Monthly boolean fields:

- `M1Paid`
- `M2Paid`
- ...
- `M12Paid`

Aliases supported:

- `M1IsPaid`
- `Month1Paid`
- `Month1IsPaid`
- `PaidM1`
- `CostPaidM1`
- `M1CostPaid`

Meaning:

- `true` = paid
- `false` = unpaid

PCF visual:

- paid cells are green.
- paid hover is darker green.
- unpaid hover is light gray.
- click opens dropdown:
  - paid -> `Set as unpaid`
  - unpaid -> `Set as paid`

Output on click:

- `SetCostPaidUnpaidTriggered = true`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

Canvas handler is still needed to patch the Dataverse cost paid field if not implemented elsewhere.

### Comments

Latest PCF comment support uses summary fields in the same main dataset.

Contract-level/general comment fields:

- `HasComments`
- `CommentTooltip`

Aliases accepted for tooltip:

- `GeneralCommentTooltip`
- `ContractCommentTooltip`
- `CommentText`
- `CommentDescription`
- `GeneralComment`
- `ContractComment`
- `LatestComment`
- `Comment`
- `Comments`
- `CommentSummary`

Month/payment-date comment fields:

- `M1HasComments`
- `M1CommentTooltip`
- ...
- `M12HasComments`
- `M12CommentTooltip`

Aliases accepted:

- `Month1HasComments`
- `Month1HasComment`
- `HasCommentsM1`
- `M1Comment`
- `M1Comments`
- `Month1Comment`
- `Month1Comments`
- `CommentM1`
- `CommentsM1`

PBI behavior:

- General comment:
  - red dot at contract description/name.
  - hover shows tooltip:
    - `Comment:`
    - comment text
- Payment-date comment:
  - red dot at exact month/year cost cell.
  - hover shows tooltip.
- Multiple comments:
  - PCF should receive a summarized tooltip string.
  - Full multi-comment management remains in separate Canvas comment panel.

Important current limitation:

- Power Apps code currently only sets `HasComments = false` in final collection.
- It does not yet populate `CommentTooltip`, `M1HasComments`, or `M1CommentTooltip` fields.
- The new Dataverse comments table needs to be folded into `colFinatCostDataOptimized` in Canvas.

Recommended Power Apps approach for comments:

- Keep the full comments table in Canvas collection for panel management.
- Add lightweight summary fields to `colFinatCostDataOptimized` for PCF display.
- For each contract row:
  - `HasComments = CountRows(Filter(colComments, ContractId = R.vsb_capexaccountlistid && CommentType = "General Comment" && !Resolved)) > 0`
  - `CommentTooltip = First(...)` or `Concat(...)`
  - `M1HasComments = CountRows(Filter(colComments, ContractId = R.vsb_capexaccountlistid && CommentType = "Comments to payment date" && Year = gblSelectedProjectYear && Month = 1 && !Resolved)) > 0`
  - `M1CommentTooltip = Concat(Filter(...), CommentText, Char(10))`
  - repeat for `M2` to `M12`

Use exact Dataverse logical names once known.

## 9. Standard Contract Options Dataset

Second dataset:

- `StandardContractOptions`

Expected columns:

- `StandardContractId`
- `SubaccountId`
- `Name`

Parser also accepts:

- standard ID:
  - `vsb_devexcapexstandardassumptionsid`
  - `devexcapexstandardassumptions`
  - `id`
- subaccount:
  - `vsb_subaccountid`
  - `capexaccountlist`
  - `subaccount`
- name:
  - `description`
  - `vsb_description`
  - `descriptioninput`
  - `itemdisplayname`
- auto ID:
  - `AutoId`
  - `vsb_autoid`

Add button behavior:

- Add row renders a main button with three dots + `Add`.
- Clicking opens dropdown.
- Dropdown always has:
  - `Add New Cost`
- If one standard contract option exists:
  - `Add Standard Contract` triggers that option directly.
- If multiple options exist:
  - `Add Standard Contract` opens a child submenu with names.
- If no options exist:
  - current code does not render the standard option at all.
  - Earlier desired design was disabled `Add Standard Contract`; revisit `showAddDropdown` if the disabled item is required.

## 10. Major UI Work and Fixes

### Cluster timeline header

Original target was Figma timeline:

- cluster pill above months.
- connected horizontal line.
- vertical connector from pill to timeline.
- short vertical ticks at cluster boundaries.
- line starts at first visible month, not `Total Costs`.
- total cost/planned/actual headers have regular cell border.
- months have no vertical cell separators.

Issues fixed:

- Timeline was starting at `Total Costs`; changed so it starts from first month column.
- Pill was floating/disconnected; connected with vertical line.
- Timeline middle line disappeared when trying to add start edge; fixed by drawing timeline as separate cluster header row/span logic, not relying only on individual cell borders.
- Last short vertical tick disappeared; restored boundary tick styling.
- Orange marker from PO markdown/design was intentionally not implemented.

### Header and grid borders

Target:

- `Total Costs`, `Total Planned Cost`, `Total Actual Cost` should be bordered cells.
- Month headers and month body cells should not have vertical separator borders.

Fix:

- Kept cost column border classes.
- Removed month separator borders.
- Add button rows also do not show vertical separators.

### Tree/collapsible connector lines

Several iterations happened to match Figma.

Target:

- Expand/collapse button centered in row.
- Vertical line starts below button, not through button.
- Parent vertical line should not intrude into previous parent cell.
- Connector lines should stretch horizontally toward description like Figma.
- Add row should not have extra vertical connector below last contract.
- For subaccount with one contract/add row, connector should stop around contract row center and not continue down to Add.

Issues fixed:

- Number column row appeared half-filled after expanding previous parent.
- Collapsed rows had extra blank row/gap.
- Parent account vertical connector was removed accidentally once; then restored.
- Subaccount connector was still going into add row; fixed to stop before Add row.
- Line was slightly intruding into above parent row; adjusted to respect row separator.
- Horizontal branch line extended to match Figma more closely.

Be careful:

- This area is fragile and CSS/DOM class interactions are subtle.
- Do not rewrite tree layout unless necessary.

### Grand total row

Target:

- Grand Total row should stick to bottom of allocated PCF height.
- Header sticks to top.
- Only rows in between scroll.

Implementation:

- `.pcf-row-grand` is sticky bottom.
- Scroll container height is based on PCF allocated height via `applyViewportHeight`.

### Responsive width

Need:

- Power Apps screen had unused right space.
- Account Name needed more width.
- If available Canvas width is small, PCF should show horizontal scroll.

Fix:

- Account Name min width set to `300`.
- Dynamic column sizing in `renderColGroup`.
- Minimum width per column maintained.
- Table width can exceed Canvas allocated width, causing horizontal scroll.

#### Bug 13125 — unnecessary horizontal scrollbar (fixed 2026-06-22)

Symptom:

- A horizontal scrollbar appeared even when the grid content fit horizontally,
  as soon as there were enough rows to need a vertical scrollbar.

Cause:

- `renderColGroup` sized the table to the Canvas `allocatedWidth` (the full outer
  width). When a vertical scrollbar appeared it consumed ~15-17px of the scroll
  wrapper's INNER width, so the table was now wider than the viewport → a spurious
  horizontal scrollbar.

Fix:

- Added a second sizing pass `fitColumnsToScrollViewport(showPlanned)`, called at the
  end of `render()` after all rows are in the DOM, which re-runs `renderColGroup`
  against `this._tableWrapper.clientWidth` (already excludes the vertical scrollbar).
- The `Math.max(minimumTableWidth, ...)` inside `renderColGroup` still preserves the
  INTENDED horizontal scroll when the canvas is genuinely too narrow — only the
  spurious scrollbar is removed. No oscillation: shrinking the table never removes the
  vertical scrollbar, so `clientWidth` is stable on the second pass.

### Long contract names

Options discussed:

1. Wrap text with dynamic height.
2. Ellipsis + tooltip.

Chosen:

- Ellipsis + tooltip for clean grid UX.

Later, user asked whether dynamic wrapping and row height could happen. It was tried/discussed, but gaps appeared in rows/tree lines. User asked to return to previous behavior.

Current expected behavior:

- Contract names are ellipsized.
- Full name available via native `title` tooltip.
- Avoid dynamic row height unless tree line math is rebuilt carefully.

### Standard contract blue styling

Requirement:

- Standard contracts should render in theme blue like edit/comment/delete dropdown color.

Implementation:

- Row class:
  - `pcf-row-standard`
- CSS makes standard contract row text blue:
  - `#006EB9`

Power Apps issue:

- If standard contracts do not show blue in live app, PCF must receive `IsStandardContract=true`.
- Parser was expanded to handle several aliases and metadata.
- Dummy/test data was updated.

### Paid/unpaid month cost action

Requirement:

- Hover over month cost cell highlights it.
- Color depends on paid state.
- Dropdown opens on click, not hover.
- On click, active color stays while dropdown is open.
- If cost is paid:
  - dropdown says `Set as unpaid`.
- If cost is unpaid:
  - dropdown says `Set as paid`.
- If contract distribution is Equal/Cluster:
  - dropdown item disabled.
  - info icon tooltip explains:
    - `Cluster-distributed costs cannot be marked as paid.`

Implementation:

- `appendContractMonthCell(...)` creates interactive month cells.
- `showMonthActionDropdown(...)` renders the dropdown.
- Dropdown uses money icon SVG.
- Dropdown width was iteratively adjusted and finally reduced to `220px`.
- Paid color:
  - base `#D6E7B3`
  - hover darker
  - active darker
- Unpaid:
  - hover gray
  - active gray

Outputs:

- `SetCostPaidUnpaidTriggered`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

Important:

- User once asked to comment out this feature temporarily, then later asked to uncomment it. It is currently active in PCF.
- Canvas handler still appears pending.

### Comment indicators

Latest PBI:

- Existing comments shown in table with red dot.
- Contract-level/general comments:
  - red dot beside contract name.
  - hover shows comment tooltip.
- Payment date/month comments:
  - red dot on exact month/year cost cell.
  - hover shows comment tooltip.
- Separate comments panel should manage:
  - multiple comments
  - year/month selection
  - sorting
  - show resolved
  - resolve/reset
  - edit/delete
  - type selection

Implementation done PCF-side:

- Added `commentTooltip`, `monthHasComments`, `monthCommentTooltips` to model.
- Parser consumes contract and month comment summary fields.
- Renderer creates red dots.
- CSS creates dark tooltip with `Comment:` label.
- Test CSV/fallback includes sample comment fields.

Not implemented yet:

- Canvas comment panel.
- Canvas collection fields from new Dataverse comment table.
- Role-based edit/delete behavior.

## 11. Power Apps Issues and Fixes Discussed

### `SubLabel` already exists

Issue:

- Power Apps error:
  - `A column named 'SubLabel' already exists.`

Cause:

- `AddColumns` attempted to add `SubLabel` when source table already had `SubLabel`.

Fix direction:

- Do not add a duplicate column with same name.
- Either:
  - set `SubLabel` earlier in the base row, or
  - use a temporary name and rename/drop as needed, or
  - remove existing column before adding, if safe.

### `Coalesce` invalid arguments

Issue:

- Power Apps error:
  - `The function 'Coalesce' has some invalid arguments.`

Cause:

- Mixed incompatible types, often Dataverse record/choice values mixed with text.

Fix direction:

- Convert values explicitly with `Text(...)` where needed.
- For standard contract name, use text fields in order:
  - `DCS.Description`
  - `DCS.'Description Input'`
  - `"Standard Contract " & Text(DCS.'Auto ID')`

### Name falling to last Coalesce parameter

Question:

- Why was `Name` referring to last parameter even though `vsb_name` had value?

Likely cause in Power Apps:

- PCF/display row type or field shape made `vsb_name` blank at that point for contract rows.
- For contract rows, `vsb_costdescription` often carries the contract name, not `vsb_name`.
- Final collection uses:
  - `Name = Coalesce(R.vsb_name, R.vsb_costdescription, "")`

This is okay if contract rows use `vsb_costdescription`.

### PCF blank after add/edit/delete/add standard

Issue:

- After adding/editing/deleting/adding standard cost, PCF went blank until tab clicked again.

Cause:

- Canvas local collections and PCF dataset were not refreshed/rebuilt after action.
- `locSelectedCostRow` sometimes pointed to stale/deleted row.

Fix pattern:

- After successful action:
  - refresh Dataverse/local collections where needed.
  - rebuild `colFinatCostDataOptimized`.
  - rebuild `colStandardContractOptionsForPCF`.
  - then clear `locSelectedCostRow`.

Controls involved:

- `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save`
- `btn_Capex_Cost_Add_Standard_Contract_Code`
- delete confirmation/action button
- `btn_Capex_Cost_Refresh_Capex_Cost_Code`
- `btn_Capex_Cost_Build_StandardContractOptions_Code`

### Project data not showing in PCF

Issue:

- Power Apps collection had data but PCF blank.

Cause found:

- Tab `OnSelect` code was not added/executed, so selection/context state was not correctly initialized.

Fix:

- Add required tab `OnSelect` to set selected category/year and trigger refresh.

### Years too broad / 1900 values

Issue:

- Acquisition data around 2020, cluster start around 2019, but year rows/dropdown had strange ranges like 1900-2021.

Causes:

- Blank Dataverse date fields can behave like 1900.
- Reference generation used overly broad project start/end defaults.
- Contract rows were being built for all generated years.

Fix direction:

- Ignore year values <= 1900.
- Build `colProjectPeriods` only from valid dates.
- Build only selected-year contract rows for PCF month values.
- Keep all-year total calculation separate from visible-year row generation.

### Standard contract duplicate options

Issue:

- After adding a standard contract, it still appeared in Add Standard Contract list under same subaccount.

Cause:

- Standard options collection not filtered/refreshed against Dataverse after add.

Fix:

- Filter `Devex/Capex Standard Assumptions` using a `LookUp` against `CAPEX Project Contracts`.
- Remove option locally after successful add.
- Refresh/rebuild standard options collection.

## 12. Build and Release

Normal TypeScript/PCF build:

```powershell
npm run build
```

Last normal build after comment-dot implementation:

- Succeeded.

Release/import build skill:

- Skill path:
  - `C:\Users\ShaktiSingh\.codex\skills\pcf-release-build`
- Run from repo root:

```powershell
& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)
```

What the skill does:

1. Increment PCF manifest patch version.
2. Increment Dataverse solution patch version.
3. Build solution in production/Release mode.
4. Produce:
   - `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`
5. Refresh parent folder:
   - `..\FilesForContent`

FilesForContent rules:

- Flat folder only.
- No nested `ui`, `models`, `services`, `css`.
- Include important source files:
  - `index.ts`
  - `GridRenderer.ts`
  - `ActionDropdown.ts`
  - `DatasetParser.ts`
  - `GridModels.ts`
  - `ControlManifest.Input.xml`
  - `TableConnectedToDataversePCF.css`
  - `test_budget_dataset.csv`
  - `TemporaryTestBudgetFallback.ts`
- Exclude:
  - `node_modules`
  - `.pcfproj`
  - `.cdsproj`
  - `bin`
  - `obj`
  - generated build output

Important:

- `..\FilesForContent` currently exists but may not include latest comment-dot changes until release skill is run again.

## 13. Build Issues That Occurred

### TypeScript `moduleResolution=node10` deprecation

Error/warning:

- TypeScript complained:
  - `Option 'moduleResolution=node10' is deprecated and will stop functioning in TypeScript 7.0.`

Fix:

- `tsconfig.json` now uses:

```json
{
  "extends": "./node_modules/pcf-scripts/tsconfig_base.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "typeRoots": ["./node_modules/@types"],
    "types": ["powerapps-component-framework"],
    "ignoreDeprecations": "5.0"
  }
}
```

### MSBuild missing .NET Framework reference assemblies

Initial error:

- `.NETFramework,Version=v4.6.2` reference assemblies were not found.

Fix direction:

- Retargeted projects to `.NET Framework 4.8`.
- Added `Microsoft.NETFramework.ReferenceAssemblies`.

Current PCF project:

- `TargetFrameworkVersion = v4.8`
- `TargetFramework = net48`
- `Microsoft.NETFramework.ReferenceAssemblies` package reference present.

Current solution project:

- `TargetFrameworkVersion = v4.8`
- `TargetFramework = net48`
- `Microsoft.NETFramework.ReferenceAssemblies` package reference present.

### NuGet target mismatch

Later error:

- NuGet/MSBuild said project did not reference `.NETFramework,Version=v4.8`.

Fix:

- Ensure both `.pcfproj` and `.cdsproj` have target framework settings aligned.
- Re-run restore/build through MSBuild.

### Production build

Skill was updated so release build is production mode and Release configuration.

## 14. Rename From Old PCF Name

User asked:

- Use `DevexCapexSummaryPCF` everywhere instead of `TableConnectedToDataversePCF` in PCF.

Done:

- Manifest constructor/display name updated.
- PCF project `<Name>` updated.
- Canvas component binding uses:
  - `dev_DEV.Controls.DevexCapexSummaryPCF`

Still present:

- Folder name remains `TableConnectedToDataversePCF`.
- CSS file remains `TableConnectedToDataversePCF.css`.
- This is okay unless project cleanup/rename is explicitly requested.

## 15. Current Visual/Design State

### Header

- Cluster timeline connected.
- Cost columns bordered.
- Month columns clean/no vertical separators.
- Month labels use format like `01.26`.

### Body rows

- Account rows bold gray.
- Subaccount rows light gray.
- Contract rows white.
- Add rows simple `... Add` button.
- Grand total row dark sticky bottom.

### Tree lines

- Figma-like vertical/horizontal connectors.
- Expand/collapse button centered.
- Lines avoid button interior.
- Connector should not continue through Add row.

### Add dropdown

- Main Add button has three dots icon + Add.
- Dropdown uses app-style font and icons.
- `Add New Cost`
- `Add Standard Contract`
- Child submenu for multiple standard contracts.

### Contract dropdown

- Three-dot button at right.
- Edit / Comments / Delete.
- Red dot badge if comments exist.

### Month paid dropdown

- Opens on click.
- Paid state changes color.
- Disabled for equal/cluster distribution.
- Uses money icon and Segoe UI style.

### Comments

- Red dot on contract name for general comments.
- Red dot top-right of month cell for payment date/month comments.
- Dark tooltip on hover/focus.

## 16. Important Open Items

### Comments Power Apps integration

PCF display is ready, but Canvas collection still needs to send:

- `CommentTooltip`
- `M1HasComments` ... `M12HasComments`
- `M1CommentTooltip` ... `M12CommentTooltip`

Need to map the new Dataverse comments table to these summary fields.

Need to implement/open the separate comment panel for:

- multiple comments
- sort/show resolved
- resolve/reset
- edit/delete
- type selection
- year/month selection

### CommentTriggered handling

Current PCF output has `CommentTriggered`, and action dropdown has Comments item.

Current `CapexScreenCode` search did not show a handler for `Self.CommentTriggered`.

Need to add Canvas `OnChange` branch:

- if `Self.CommentTriggered`, set selected contract/cost row and open Comments Panel.

### Paid/unpaid Canvas persistence

PCF output exists but current app code search did not find:

- `SetCostPaidUnpaidTriggered`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

Need to add Canvas `OnChange` branch:

- if `Self.SetCostPaidUnpaidTriggered`, find Dataverse cost record by:
  - contract ID
  - year
  - month
- patch paid flag true/false
- refresh local cost collection
- rebuild `colFinatCostDataOptimized`

### Debug logs

Remove temporary debug logs only after live dataset is stable.

Locations:

- `GridRenderer.ts`
- `DatasetParser.ts`

### Temporary fallback

Keep fallback until user explicitly asks removal.

When removing:

- remove only:
  - `TemporaryTestBudgetFallback` import/use in `GridRenderer.ts`
  - fallback module if no longer needed
  - fallback test behavior
- Do not remove `test_budget_dataset.csv` unless asked.

### Disabled Add Standard Contract item

Current PCF code does not render Add Standard Contract when no standard contracts exist.

Earlier design said:

- keep Add Standard Contract visible but disabled if none exists.

If strict Figma match is required, update `showAddDropdown` to always append disabled standard item when options length is 0.

## 17. Suggested Next Steps for Claude Code

If continuing comment PBI:

1. Inspect the new Dataverse comments table logical names from the attached metadata or Power Apps data source.
2. In `Powerapps code/CapexScreenCode`, update `btn_Capex_Cost_Refresh_Capex_Cost_Code` final `colFinatCostDataOptimized` build.
3. Add summary columns:
   - `CommentTooltip`
   - `M1HasComments` ... `M12HasComments`
   - `M1CommentTooltip` ... `M12CommentTooltip`
4. Add `Self.CommentTriggered` branch in PCF `OnChange` to open Comments Panel.
5. Add panel logic if not already present:
   - list comments for selected contract
   - type dropdown
   - year/month fields for payment comments
   - resolved toggle
   - edit/delete buttons
6. Add `Self.SetCostPaidUnpaidTriggered` branch if paid/unpaid should persist.
7. Run:
   - `npm run build`
8. Run release skill before import:
   - `& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)`

## 18. High-Risk Areas

Be careful changing:

- Tree line CSS/classes.
- `renderColGroup` widths.
- Sticky header/grand total behavior.
- Power Apps final collection column names.
- `RowId`/`ParentId` values.
- `Type` values.
- Standard contract ID matching.
- Year filtering.
- All-year total calculations.

Small mistakes in these areas can cause:

- rows disappearing
- PCF blank state
- standard contracts not blue
- duplicate standard contracts showing
- total cost showing selected-year-only values
- massive/invalid year range
- connector lines extending into wrong rows

## 19. Useful Commands

Build PCF:

```powershell
npm run build
```

Release/import build:

```powershell
& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)
```

Search PCF:

```powershell
rg -n "SetCostPaidUnpaid|CommentTooltip|IsStandardContract|showMonthActionDropdown|showAddDropdown" TableConnectedToDataversePCF
```

Search Power Apps:

```powershell
rg -n "DevexCapexSummaryPCF|colFinatCostDataOptimized|btn_Capex_Cost_Refresh_Capex_Cost_Code|CommentTriggered|SetCostPaidUnpaidTriggered" "Powerapps code\CapexScreenCode"
```

Check versions:

```powershell
Select-String -Path TableConnectedToDataversePCF\ControlManifest.Input.xml -Pattern "constructor|version"
Select-String -Path DevexCapex_POC\src\Other\Solution.xml -Pattern "<Version>"
```

## 20. Current Validation Status

Latest validation run:

```powershell
npm run build
```

Result:

- Succeeded.
- Webpack compiled successfully.
- PCF build succeeded.

No release ZIP was regenerated after the latest comment-dot changes unless release skill is run after this handoff.

