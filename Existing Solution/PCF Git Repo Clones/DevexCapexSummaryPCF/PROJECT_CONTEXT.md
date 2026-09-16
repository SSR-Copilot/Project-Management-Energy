# DevexCapexSummaryPCF Project Context

This document captures the current project map, implementation decisions, and the major work done during the PCF + Canvas App development flow.

The purpose is to make future development easier: when you come back to this project, this file should explain what the PCF does, where things live, how the main features are implemented, and what to be careful about.

## Project Identity

- Repository folder: `TableConnectedToDataversePCF`
- PCF control constructor: `DevexCapexSummaryPCF`
- PCF namespace: `DEV.Controls`
- Main PCF manifest: `TableConnectedToDataversePCF/ControlManifest.Input.xml`
- Current PCF version: `1.0.15`
- Current Dataverse solution version: `1.0.12`
- Solution project: `DevexCapex_POC/DevexCapex_POC.cdsproj`
- Current Release ZIP path: `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`
- Dev Canvas App code reference: `Powerapps code/CapexScreenCode`
- Main Canvas App code reference: `Powerapps code/CapexScreenCodePrev`

## High-Level Purpose

This PCF renders a DEVEX/CAPEX budget summary table for Power Apps.

It shows hierarchical cost data:

1. Account
2. Subaccount
3. Contract
4. Add row

The grid supports:

- Expand/collapse hierarchy
- Figma-like tree connector lines
- Cluster timeline header
- Month columns for selected year
- Total Cost, Total Planned Cost, and Total Actual Cost columns
- Sticky header
- Sticky Grand Total row
- Horizontal scrolling when Canvas App width is too small
- Add New Cost
- Add Standard Contract
- Edit / Comment / Delete contract actions
- Set monthly contract cost as paid/unpaid
- Browser-locale cost formatting
- Standard contract visual styling

## Important Source Files

### `TableConnectedToDataversePCF/index.ts`

This is the PCF entry point.

Responsibilities:

- Initializes the PCF control.
- Creates the `ActionDropdown`.
- Creates the `GridRenderer`.
- Stores PCF output trigger state.
- Sends output values back to Canvas App through `getOutputs`.
- Resets output trigger flags after Power Apps reads them.
- Listens for internal re-render events when expand/collapse changes.

Important implementation areas:

- `GridAction` type includes:
  - `Edit`
  - `Comment`
  - `Delete`
  - `Add`
  - `AddStandardContract`
  - `SetCostPaidUnpaid`
- `triggerAction(...)` centralizes all outgoing actions.
- `getOutputs()` returns the trigger booleans and selected IDs/details.

### `TableConnectedToDataversePCF/ui/GridRenderer.ts`

This is the main renderer for the table UI.

Responsibilities:

- Parses the Power Apps datasets into renderable tree data.
- Creates the table DOM.
- Renders timeline header.
- Renders month header row.
- Renders account, subaccount, contract, add, and grand total rows.
- Handles expand/collapse buttons.
- Handles Add dropdown and Add Standard Contract child dropdown.
- Handles paid/unpaid hover action on contract month cells.
- Applies browser-locale cost formatting.
- Applies filtering and visual classes.

Important constants:

- `NUMBER_COLUMN_MIN_WIDTH = 100`
- `ACCOUNT_NAME_COLUMN_MIN_WIDTH = 300`
- `TOTAL_COST_COLUMN_MIN_WIDTH = 100`
- `PLANNED_COST_COLUMN_MIN_WIDTH = 120`
- `ACTUAL_COST_COLUMN_MIN_WIDTH = 120`
- `MONTH_COLUMN_MIN_WIDTH = 65`
- `ACTION_COLUMN_WIDTH = 40`

These widths drive the responsive table layout. If Canvas App width is smaller than the table minimum width, horizontal scroll appears.

### `TableConnectedToDataversePCF/ui/ActionDropdown.ts`

This file handles the contract row three-dot dropdown.

Actions:

- Edit
- Comments
- Delete

The dropdown is appended to `document.body`, not inside the table cell, so it is not clipped by table overflow.

### `TableConnectedToDataversePCF/services/DatasetParser.ts`

This file converts the Power Apps dataset into the PCF tree model.

Responsibilities:

- Reads dataset rows.
- Detects flexible column names.
- Builds `AccountData`, `SubaccountData`, and `ContractData`.
- Parses monthly values.
- Parses paid/unpaid month flags.
- Parses planned/actual/total values.
- Parses standard contract flags.
- Parses standard contract options from the second dataset.
- Builds cluster timeline based on cluster date inputs.

Important rule:

The PCF does not calculate all-year totals from visible month columns. It displays the total values sent from Power Apps.

That means Power Apps must send:

- Contract `TotalCost` across all years for that contract.
- Subaccount `TotalCost` across all contracts/all years under that subaccount.
- Account `TotalCost` across all subaccounts/all years under that account.
- Same rule for `PlannedCost` and `ActualCost`.

### `TableConnectedToDataversePCF/models/GridModels.ts`

Defines the data contracts used internally by PCF:

- `ContractData`
- `SubaccountData`
- `AccountData`
- `StandardContractOption`
- `ClusterSpan`
- `ClusterTimeline`

The renderer depends on these interfaces.

### `TableConnectedToDataversePCF/css/TableConnectedToDataversePCF.css`

Main styling file.

Responsibilities:

- Table layout
- Header style
- Timeline style
- Tree connector lines
- Row backgrounds
- Font weights
- Standard contract color
- Add dropdown
- Action dropdown button styling
- Paid/unpaid hover button
- Sticky header
- Sticky grand total row
- Ellipsis and tooltip-friendly contract names

### `TableConnectedToDataversePCF/services/TemporaryTestBudgetFallback.ts`

Temporary fallback data source.

Current behavior:

- If the incoming dataset is empty, PCF can render test data from fallback.

Important:

- This is temporary.
- When asked to remove it, remove only the fallback behavior, not the parser or grid functionality.

## Manifest Inputs

Defined in `TableConnectedToDataversePCF/ControlManifest.Input.xml`.

### Datasets

#### `DevexCapexCostSummary`

Main cost summary dataset from Canvas App.

This should contain account, subaccount, and contract rows.

#### `StandardContractOptions`

Second dataset used by the Add dropdown.

This should contain standard contracts available for the current country, technology, and selected tab.

The PCF groups these options by parent subaccount.

### Input Properties

#### `ShowPlannedCost`

Controls whether planned and actual total columns are visible.

When true:

- `Total Costs`
- `Total Planned Cost`
- `Total Actual Cost`
- Month columns

When false:

- `Total Costs`
- Month columns

#### `StartYear`

Controls the visible year for month columns.

Example:

- `StartYear = 2026`
- Month headers become `01.26` to `12.26`

Only the visible 12 month columns follow this selected year. Total columns should still represent all-year totals.

#### `ShowEmptyAccounts`

Controls whether empty account/subaccount rows should be shown.

#### `CostPaidByFilter`

Used to filter cost type:

- All
- DevCo
- SPV

#### `Cluster1Date` to `Cluster6Date`

Used to draw the connected cluster timeline above month headers.

## Manifest Outputs

The PCF exposes output trigger fields to Canvas App.

### Existing Action Outputs

- `EditTriggered`
- `CommentTriggered`
- `DeleteTriggered`
- `AddTriggered`
- `AddStandardContractTriggered`
- `SelectedRecordId`
- `SelectedStandardContractId`

### Paid / Unpaid Outputs

- `SetCostPaidUnpaidTriggered`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

When user clicks `Set as paid` or `Set as unpaid`, PCF returns:

- Contract ID
- Cost year
- Cost month number
- Target paid state

Example:

- User hovers contract cost in March 2026.
- Button appears: `Set as paid`.
- User clicks.
- PCF output:
  - `SetCostPaidUnpaidTriggered = true`
  - `SelectedCostContractId = contract.id`
  - `SelectedCostYear = 2026`
  - `SelectedCostMonth = 3`
  - `SelectedCostPaid = true`

Canvas App must handle this in the PCF `OnChange` formula.

## Dataset Shape Expected from Canvas App

The main dataset should contain enough fields for PCF to build the hierarchy.

Recommended columns:

- `RowId`
- `ParentId`
- `Type`
- `Number`
- `Name`
- `SubLabel`
- `CostPaidBy`
- `TotalCost`
- `PlannedCost`
- `ActualCost`
- `HasComments`
- `IsStandardContract`
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
- Month paid flags if paid/unpaid behavior is used

The parser supports several aliases, but keeping stable names is safer.

## Total Cost Rule

This was an important business rule discovered during the work.

The 12 visible month columns show values for the selected `StartYear`.

But the total columns must show all-year totals.

For contract row:

- `TotalCost` = total for the entire contract across all years.
- `PlannedCost` = total planned amount across all years.
- `ActualCost` = total actual amount across all years.

For subaccount row:

- Total values = sum of all contracts under that subaccount across all years.

For account row:

- Total values = sum of all subaccounts/contracts under that account across all years.

For Grand Total:

- Total values = sum of all visible account-level totals.

Important implementation note:

- PCF displays `TotalCost`, `PlannedCost`, and `ActualCost` received from Canvas App.
- If totals are wrong, first check Canvas App collection shaping.

## Cluster Timeline Implementation

The Figma header required connected cluster timeline lines.

Implementation approach:

1. PCF receives cluster start dates from `Cluster1Date` to `Cluster6Date`.
2. `DatasetParser` calculates which visible months belong to which cluster.
3. `GridRenderer.renderHeaders(...)` draws a timeline row above month headers.
4. Cluster pill is positioned over the span of months.
5. A horizontal line connects the timeline.
6. Short vertical markers appear at cluster start/end points.
7. The timeline starts at month `01`, not from `Total Costs`.

Important visual rules:

- Cluster pill should be connected to the line.
- Total cost/planned/actual header cells should have cell borders.
- Month cells should not have regular vertical separator borders.
- Last short vertical marker should remain visible.

## Tree Connector Line Implementation

The hierarchy tree lines were refined to match Figma.

Rules:

- Expand/collapse vertical line should be centered with the plus/minus button.
- Vertical line should start below the button, not pass through the button.
- Vertical line should not enter the parent row above.
- Subaccount vertical line should stop around the center of the last contract row.
- Add button row should not show the subaccount vertical line continuing downward.
- Contract rows show horizontal connector lines extending toward the contract description.
- Number/account vertical separator border was removed to match Figma.

Most of this is controlled through:

- Row classes generated in `GridRenderer.ts`
- CSS pseudo-elements and table cell positioning in `TableConnectedToDataversePCF.css`

When changing row height, always check tree lines again. Dynamic row height can easily break the connector illusion.

## Add Dropdown Implementation

The Add row was changed from a simple button to a dropdown.

Main Add button:

- Uses three-dot icon plus `Add` text.
- Uses same font family as the app.
- No strong background color.
- Follows the same clean dropdown theme as Figma.

Dropdown options:

1. `Add New Cost`
2. `Add Standard Contract`

Behavior:

- `Add New Cost` triggers the same `AddTriggered` behavior as before.
- If no standard contract is available for the subaccount:
  - `Add Standard Contract` is disabled.
- If exactly one standard contract is available:
  - Clicking `Add Standard Contract` directly triggers add standard contract.
- If more than one standard contract is available:
  - A child dropdown opens with available standard contract names.
  - Clicking a child option triggers add standard contract with selected standard contract ID.

Data source:

- Standard contract options are provided through the second PCF dataset: `StandardContractOptions`.
- These are filtered in Canvas App by country, technology, and selected tab before being passed to PCF.

## Standard Contract Styling

Standard contracts should look different from normal contracts.

Implementation:

- Parser reads `IsStandardContract`.
- Contract row gets class `pcf-row-standard`.
- Contract name gets class `pcf-contract-standard`.
- Standard contract label uses the same blue family as the three-dot/action theme.

This allows users to visually identify standard contracts without adding extra columns.

## Contract Name Overflow Handling

We tested dynamic wrapping and variable row height for long contract names.

Problem found:

- Wrapped/dynamic-height contract rows created visible gaps.
- Tree connector lines no longer aligned cleanly.

Final decision:

- Use ellipsis for long contract names.
- Add tooltip/title so full name appears on hover.
- Keep row height stable.

Why this is better:

- Cleaner grid UX.
- No broken tree lines.
- Full name still available on hover.

## Paid / Unpaid Hover Action Implementation

This feature was temporarily commented and later restored.

How it works:

1. Contract month cells are rendered by `appendContractMonthCell(...)`.
2. If month value is empty or zero:
   - Show dash.
   - No paid/unpaid button.
3. If month value has cost:
   - Show formatted cost.
   - Add hidden hover button inside the cell.
4. On hover:
   - Button appears below/near the month cost cell.
5. Button label depends on current month paid state:
   - If unpaid: `Set as paid`
   - If paid: `Set as unpaid`
6. On click:
   - PCF closes open dropdowns.
   - PCF triggers `SetCostPaidUnpaid`.
   - PCF outputs contract ID, year, month, and target paid state.

Important output behavior:

- `SelectedCostPaid` is the target state, not necessarily the current state.

Example:

- Current month is unpaid.
- Button says `Set as paid`.
- On click, `SelectedCostPaid = true`.

## Sticky Header and Grand Total

We changed the table so that:

- Header stays fixed at top.
- Grand Total row stays fixed at bottom.
- Only middle hierarchy rows scroll vertically.

This is useful when Canvas App gives the PCF a fixed height like `900`.

Implementation concept:

- Main PCF wrapper uses a column/flex layout.
- Header/table structure is styled with sticky positioning.
- Grand Total row uses sticky bottom styling.
- Horizontal table width remains shared so values align.

When changing table structure, always verify:

- Header columns align with body.
- Grand Total columns align with body.
- Horizontal scroll does not desync header/body/footer.

## Browser Locale Cost Formatting

Cost values are formatted using the browser language.

Examples:

- English browser:
  - `1000` becomes `1,000`
- German browser:
  - `1000` becomes `1.000`

This applies only to numeric cost values:

- Month costs
- Total Cost
- Total Planned Cost
- Total Actual Cost
- Grand Total

It does not apply to:

- Month headers
- Account numbers
- Contract names
- Labels

Implementation:

- Formatting is centralized in `GridRenderer.formatCostValue(...)`.

## Responsive Width Implementation

The table uses calculated fixed/minimum column widths instead of allowing random browser compression.

Why:

- Power Apps Canvas App may give less width than needed.
- If columns shrink too much, UI becomes unreadable.
- Better behavior is to keep usable column widths and show horizontal scroll.

Implementation:

- Width constants are defined in `GridRenderer.ts`.
- `colgroup` is generated with those widths.
- Table width is total of all active columns.
- Planned/actual columns are included only when `ShowPlannedCost` is true.
- Account Name column was increased to `300`.

Important:

- If changing one column width, update only that constant unless a broader layout change is required.
- Do not randomly adjust month widths because timeline/header alignment depends on them.

## Power Apps / Canvas App Integration Notes

Canvas App is responsible for preparing the datasets.

Important discoveries:

- PCF went blank after add/edit/delete/add standard because the incoming collection was not refreshed/rebuilt after mutation.
- Clicking the tab again rebuilt the collection, so data reappeared.
- Fix direction: after each mutation button, rebuild the same PCF collection and keep selected tab/year variables stable.
- Dataset was blank at one point because tab `OnSelect` code was missing.
- Year dropdown showed extra years like `1900` because invalid dates/blank dates were included in year collection logic.
- Contract rows for invalid years should also be avoided in Canvas App collection shaping.

Controls discussed during work:

- `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save`
- `btn_Capex_Cost_Add_Standard_Contract_Code`
- Add/edit/delete buttons in CAPEX screen
- `Showpreviousyear`
- `shownextyear`
- Year dropdown for available years

Important Canvas App rule:

- The selected year drives visible month values.
- Total columns must still send all-year values.

## Build and Release Workflow

We created a Codex skill for release builds.

Skill name:

- `pcf-release-build`

Skill file:

- `C:/Users/ShaktiSingh/.codex/skills/pcf-release-build/SKILL.md`

Script:

- `C:/Users/ShaktiSingh/.codex/skills/pcf-release-build/scripts/release-pcf.ps1`

Preferred command from repo root:

```powershell
& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)
```

What the script does:

1. Reads PCF version from `ControlManifest.Input.xml`.
2. Increments PCF patch version.
3. Reads solution version from `DevexCapex_POC/src/Other/Solution.xml`.
4. Increments solution patch version.
5. Runs Visual Studio MSBuild.
6. Uses production PCF build mode.
7. Uses Release configuration.
8. Creates the import ZIP at `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`.
9. After successful build, refreshes parent `FilesForContent` folder.

`FilesForContent` behavior:

- Created in parent folder of repo.
- Flat folder only.
- Important source files copied directly into that folder.
- No nested `ui`, `models`, `services`, or `css` folders.
- Does not include:
  - `node_modules`
  - `.csproj`
  - `.pcfproj`
  - `bin`
  - `obj`
  - generated build output

## Build Commands

For quick local PCF validation:

```powershell
npm run build
```

This validates:

- Manifest
- Generated manifest types
- ESLint
- TypeScript compile
- PCF bundle

For import-ready solution build:

```powershell
& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)
```

Use the release skill when importing into Power Apps.

## Build Issues Encountered

### Missing .NET Framework v4.6.2 Reference Assemblies

At one point, `msbuild` failed because required .NET Framework reference assemblies were missing.

This happened when building the wrong project/context.

### .NET Framework v4.8 Reference Error

Another error said the project did not reference `.NETFramework,Version=v4.8`.

Fix direction:

- Use the correct solution project build flow.
- Do not randomly retarget unless specifically needed.

Current release build flow works through `DevexCapex_POC`.

## Current Stable State

Current implemented/working behavior:

- PCF renamed/displayed as `DevexCapexSummaryPCF`.
- Header/timeline close to Figma.
- Cluster timeline connected.
- Total cost/planned/actual header borders preserved.
- Month columns avoid unnecessary separator borders.
- Number/account separators adjusted to match Figma.
- Tree connector lines refined.
- Add row line issue fixed.
- Account Name width increased to `300`.
- Horizontal scroll appears when table is wider than Canvas area.
- Header is sticky at top.
- Grand Total is sticky at bottom.
- Add dropdown supports Add New Cost and Add Standard Contract.
- Standard contract child dropdown supported.
- Standard contracts show blue label.
- Long contract names use ellipsis + tooltip.
- Browser locale used for cost number separators.
- Paid/unpaid hover action restored and `npm run build` succeeded.

## Open Items / Things To Watch

### Run release build after paid/unpaid restore

After restoring paid/unpaid code, `npm run build` succeeded.

If importing into Power Apps, run the release skill again to:

- Increment PCF version.
- Increment solution version.
- Build production Release ZIP.

### Temporary fallback data

Fallback test data is still active.

When removing it, remove only:

- Empty dataset fallback to `TemporaryTestBudgetFallback.parse()`

Do not remove:

- Real dataset parsing
- Dummy data file itself unless specifically requested

### Canvas App paid/unpaid handler

Canvas App still needs/should handle:

- `SetCostPaidUnpaidTriggered`
- `SelectedCostContractId`
- `SelectedCostYear`
- `SelectedCostMonth`
- `SelectedCostPaid`

This should update Dataverse or the relevant collection, then rebuild the PCF incoming dataset.

### Total cost correctness

If total columns appear wrong:

1. Check Canvas App collection first.
2. Confirm `TotalCost`, `PlannedCost`, and `ActualCost` contain all-year values.
3. Confirm PCF dataset column names match parser aliases.
4. Confirm values are not overwritten with selected-year totals.

### Year dropdown correctness

If year dropdown shows too many years:

1. Check Canvas App year collection logic.
2. Exclude blank/invalid dates.
3. Exclude fallback `1900` dates.
4. Only include acquisition/cluster/project-relevant years.
5. Ensure contract rows are filtered with same valid-year logic.

## Development Guidelines For Future Work

- Make small changes.
- Do not rewrite the renderer unless necessary.
- Table alignment depends on shared widths, so change widths carefully.
- Tree connector lines depend on row height and CSS pseudo-elements.
- If wrapping text or changing row height, re-check every connector line.
- If adding outputs, update:
  - `ControlManifest.Input.xml`
  - `index.ts`
  - generated manifest types through build
  - Canvas App PCF `OnChange`
- If adding dataset columns, update:
  - Canvas App collection
  - `DatasetParser.ts`
  - `GridModels.ts` if the data is used in renderer
  - UI render logic if visible
- If importing to Power Apps, use the release skill, not just `npm run build`.

## Quick Mental Model

Power Apps prepares two datasets:

1. Main cost summary dataset
2. Standard contract options dataset

PCF receives:

- Datasets
- Selected year
- Cluster dates
- Display flags

PCF parses:

- Dataset rows into tree models
- Standard contracts into per-subaccount options
- Cluster dates into timeline spans

PCF renders:

- Header/timeline
- Hierarchy rows
- Add rows/dropdowns
- Contract action dropdowns
- Sticky grand total

PCF outputs:

- User action triggers
- Selected record IDs
- Standard contract ID
- Paid/unpaid month details

Canvas App handles outputs:

- Opens forms/panels
- Adds/edits/deletes cost
- Adds standard contract
- Sets paid/unpaid state
- Rebuilds dataset collection
- Sends fresh dataset back to PCF

