# DevexCapexSummaryPCF

A Power Apps Component Framework (PCF) control that renders the **DEVEX/CAPEX cost summary grid** inside a Canvas App.

- **Namespace / constructor:** `DEV.Controls.DevexCapexSummaryPCF`
- **Project folder:** `TableConnectedToDataversePCF` (the folder and CSS file keep the original project name; the control itself was renamed to `DevexCapexSummaryPCF`)
- **Solution project:** `DevexCapex_POC/DevexCapex_POC.cdsproj` → `DevexCapex_POC/bin/Release/DevexCapex_POC.zip`

---

## 1. Overview

This PCF displays DEVEX/CAPEX cost data as a hierarchical, Figma-styled table:

- **Account → Subaccount → Contract** hierarchy with expand/collapse and tree connector lines.
- **Monthly cost columns** (`M1`–`M12`) for the currently selected year, with a **cluster timeline header** drawn above them.
- **Total Cost**, and optionally **Total Planned Cost** / **Total Actual Cost** columns (all-years totals supplied by Canvas).
- **Paid month styling** (green cells) and a per-cell **Set as paid / Set as unpaid** dropdown (disabled with an explanatory tooltip for cluster/equal-distributed contracts), which also offers a **Comments** item.
- **Standard contract** rows highlighted in blue, and an **Add** dropdown per subaccount offering *Add New Cost* and *Add Standard Contract* (with a submenu when several standard options exist).
- **Comment indicators**: a red dot beside the contract name (general comments) and on individual month cells (payment-date comments), each with a dark hover tooltip.
- A sticky header at the top and a sticky **Grand Total** row at the bottom; only the rows in between scroll.
- All user actions (Add / Add Standard Contract / Edit / Delete / Comment / Set paid-unpaid) are sent **back to the Canvas App** through output trigger properties. The PCF itself never writes data.

## 2. Where this PCF is used

- Inside a **Power Apps Canvas App**, on the DEVEX/CAPEX cost screen (`Powerapps code/CapexScreenCode.txt` holds the exported screen code; `Powerapps code/OnStart.txt` the app OnStart).
- The **Canvas App owns** all Dataverse operations, validation, duplicate checks, refreshes, and business rules.
- The **PCF owns** rendering and user interaction only. Do not add Dataverse calls inside the PCF.

## 3. High-level architecture

```text
Canvas Collections / Dataverse Data
        ↓
Canvas builds colFinatCostDataOptimized        (yes, "Finat" — the typo is intentional/legacy)
        ↓
PCF Dataset: DevexCapexCostSummary
        ↓
DatasetParser.parseDatasetToTree()
        ↓
Account/Subaccount/Contract hierarchy
        ↓
GridRenderer renders table
        ↓
User clicks Add/Edit/Delete/Comment/Add Standard Contract/Set paid-unpaid
        ↓
index.ts sets output trigger booleans
        ↓
Canvas OnChange handles business logic
        ↓
Canvas refreshes collections and rebinds PCF
```

## 4. Data flow from Canvas to PCF

1. Canvas prepares **flat rows** in `colFinatCostDataOptimized` (one row per account, subaccount, or contract) via the hidden button `btn_Capex_Cost_Refresh_Capex_Cost_Code`.
2. The PCF receives those rows as dataset records on `DevexCapexCostSummary`.
3. `DatasetParser` detects field names **case-insensitively with many alias spellings** (column names are normalized by stripping everything except `a-z0-9`), reads values defensively, and normalizes IDs.
4. Rows are grouped into a tree using `RowId`, `ParentId`, and `Type`.
5. `GridRenderer` applies the UI filters (`CostPaidByFilter`, `ShowEmptyAccounts`), recalculates the visible totals, and renders the table.
6. If the main dataset is **empty**, `TemporaryTestBudgetFallback` renders sample data so the UI can be developed/tested (intentional — see §23).

## 5. Main dataset: `DevexCapexCostSummary`

| Field Name | Expected Type | Required? | Used By | Purpose |
|---|---|---|---|---|
| `RowId` | Text (GUID) | Yes | DatasetParser | Unique row ID; subaccount `RowId` is also the match key for standard contract options. |
| `ParentId` | Text (GUID) | Yes (except accounts) | DatasetParser | Links a row to its parent (`subaccount → account`, `contract → subaccount`). |
| `Type` | Text | Yes | DatasetParser | `account` \| `subaccount` \| `contract` — drives row rendering and hierarchy. |
| `Number` | Text | No | GridRenderer | Account/subaccount number shown in the first column. |
| `Name` | Text | Yes | GridRenderer | Display name (contract rows usually carry `vsb_costdescription`). Ellipsized with a native tooltip when too long. |
| `SubLabel` | Text | No | DatasetParser, GridRenderer | Secondary line under contract names, e.g. `[SPV] Distribution from 12/2020 to 12/2024`. Also a fallback source for DevCo/SPV and `\|\|STD=1\|\|` metadata tokens. |
| `M1`–`M12` | Number | Yes (contracts) | GridRenderer | Monthly costs **for the selected `StartYear` only**. |
| `M1Paid`–`M12Paid` | Boolean | No | GridRenderer | Paid flags per month → green cells. Aliases: `Month1Paid`, `M1IsPaid`, `PaidM1`, `CostPaidM1`, … |
| `Month1Paid`–`Month12Paid` | Boolean | No | DatasetParser | Alias family for the same paid flags (Canvas currently sends both). |
| `TotalCost` | Number | Yes | GridRenderer | **All-years** total from Canvas. The PCF must never derive this from `M1`–`M12`. |
| `PlannedCost` | Number | When `ShowPlannedCost` | GridRenderer | All-years planned (unpaid) total from Canvas. |
| `ActualCost` | Number | When `ShowPlannedCost` | GridRenderer | All-years actual (paid) total from Canvas. |
| `IsStandardContract` | Boolean/Text | No | DatasetParser | Marks a standard contract → blue styling. |
| `IsStandard` / `StandardCost` / `StandardContract` | Boolean/Text | No | DatasetParser | Accepted aliases for the standard flag. |
| `CostPaidBy` | Text | No | DatasetParser | `DevCo` or `SPV` — drives the Cost Paid By filter. |
| `CostPaidByText` | Text | No | DatasetParser | Alias for `CostPaidBy`. |
| `Distribution` / `DistributionType` | Text | No | GridRenderer | `Individual Distribution`, `Equal Distribution`, `Cluster-distributed`, … Equal/cluster types disable the paid/unpaid action. |
| `HasComments` | Boolean | No | GridRenderer | Contract-level red dot beside the name. |
| `CommentTooltip` | Text | No | GridRenderer | Tooltip text for the contract-level dot (many aliases accepted). |
| `M1HasComments`–`M12HasComments` | Boolean | No | GridRenderer | Red dot on the month cell (payment-date comments, selected year only). |
| `M1CommentTooltip`–`M12CommentTooltip` | Text | No | GridRenderer | Tooltip text for the month-cell dots. |

> The same all-years total semantics apply at the subaccount and account levels: Canvas sends pre-aggregated values; after UI filtering the PCF recalculates from the rows that remain visible.

## 6. Row types

### Account rows
- Top-level grouping rows (`Type = account`), bold gray styling.
- Parent of subaccounts via `ParentId = account RowId`.

### Subaccount rows
- Child of an account, parent of contract rows (`Type = subaccount`), light gray styling.
- Standard contract options attach here (`SubaccountId = subaccount RowId`).
- Each subaccount gets an **Add** row beneath its contracts.

### Contract rows
- Child of a subaccount (`Type = contract`), white styling — the actual cost lines.
- Can be normal or standard (blue). Carry monthly values, paid flags, distribution type, and comment indicators.

## 7. `StandardContractOptions` dataset

- Controls the **Add Standard Contract** dropdown options.
- Each option belongs to a subaccount: the PCF matches the option's `SubaccountId` against the subaccount's `RowId`.
- **Canvas must remove already-created standard contracts** from this dataset (filter against `CAPEX Project Contracts`, remove the chosen option locally after add, then rebuild) — the PCF does no duplicate checking.
- If a subaccount has **no** options, the PCF renders **no** "Add Standard Contract" item at all (an earlier design wanted a *disabled* item instead — intentionally not implemented; see `showAddDropdown` if that is ever required).
- One option → the item triggers directly; several options → a child submenu lists them by name.

| Field | Type | Purpose |
|---|---|---|
| `StandardContractId` | Text (GUID) | The standard assumption record ID, echoed back as `SelectedStandardContractId`. |
| `SubaccountId` | Text (GUID) | Match key against the subaccount `RowId`. |
| `Name` | Text | Display name in the submenu. |
| `AutoId` | Number | Sort order (sorted in Canvas). |

## 8. Input properties

### `ShowPlannedCost` (TwoOptions, required)
Shows/hides the **Total Planned Cost** and **Total Actual Cost** columns.

### `ShowEmptyAccounts` (TwoOptions)
When **false**, accounts/subaccounts without any visible cost are hidden (evaluated *after* the Cost Paid By filter).

### `CostPaidByFilter` (Text)
Filters contract rows by payer. Expected values:
- `Show All Cost` (default/fallback)
- `DevCo`
- `SPV`

### `StartYear` (Whole number, required)
The year the `M1`–`M12` columns represent; also shown in month headers (e.g. `01.26`). Canvas rebuilds the dataset on every year change.

### `Cluster1Date` … `Cluster6Date` (DateOnly)
Cluster start dates (from `gblClusterDurations` in Canvas). They drive the **cluster timeline header** — pill labels, the horizontal track, and the short boundary ticks above the month columns.

## 9. Output properties

| Output | Type | Meaning |
|---|---|---|
| `AddTriggered` | TwoOptions | "Add New Cost" clicked; `SelectedRecordId` = subaccount RowId. |
| `AddStandardContractTriggered` | TwoOptions | Standard option chosen; `SelectedRecordId` = subaccount RowId, `SelectedStandardContractId` = standard assumption ID. |
| `EditTriggered` | TwoOptions | Edit clicked in the contract three-dot menu; `SelectedRecordId` = contract RowId. |
| `DeleteTriggered` | TwoOptions | Delete clicked; `SelectedRecordId` = contract RowId. |
| `CommentTriggered` | TwoOptions | Comments clicked (three-dot menu **or** the month-cell dropdown); `SelectedRecordId` = contract RowId. |
| `SetCostPaidUnpaidTriggered` | TwoOptions | "Set as paid/unpaid" clicked on a month cell. |
| `SelectedRecordId` | Text | Context record for the triggers above. |
| `SelectedStandardContractId` | Text | Chosen standard assumption (only for AddStandardContract). |
| `SelectedCostContractId` | Text | Contract for the paid/unpaid action. |
| `SelectedCostYear` | Whole | Year of the clicked month cell (= `StartYear`). |
| `SelectedCostMonth` | Whole | Month number 1–12 of the clicked cell. |
| `SelectedCostPaid` | TwoOptions | The **desired new** paid state (true = mark paid). |

### Trigger boolean pattern

```text
User clicks action in PCF
        ↓
PCF sets exactly ONE trigger boolean to true (triggerAction in index.ts)
        ↓
PCF sets selected record/standard contract/cost ids
        ↓
PCF calls notifyOutputChanged()
        ↓
Canvas OnChange reads output values
        ↓
Canvas performs the actual action (Dataverse + collection refresh)
        ↓
PCF resets trigger booleans right after getOutputs() is read,
so the next identical action still produces an observable change
```

## 10. TypeScript file responsibilities

### `index.ts`
PCF lifecycle entry point. Initializes `ActionDropdown` and `GridRenderer`, funnels every UI callback into the central `triggerAction()` handler (exactly one trigger true per action), exposes/resets outputs in `getOutputs()`, and listens for the `PCF_RE_RENDER` window event so expand/collapse can request a safe re-render from outside a click handler.

### `services/DatasetParser.ts`
**The integration point.** Reads dataset records defensively (`safeGetValue` / `safeGetFormattedValue` / `firstAvailableValue`), normalizes field names (`replace(/[^a-z0-9]/g, "")`) and IDs, parses month values, paid flags, standard-contract flags (field aliases + `||STD=1||` SubLabel token + `Standard ` name prefix fallback), distribution type, DevCo/SPV, comment summary fields, and the cluster timeline. Builds the `AccountData → SubaccountData → ContractData` tree and parses the `StandardContractOptions` dataset.

### `ui/GridRenderer.ts`
Builds the HTML table: colgroup widths, cluster timeline header, account/subaccount/contract/add/grand-total rows, tree connector classes, expand/collapse, the Add dropdown (+ standard submenu), the month paid/unpaid dropdown (+ Comments item), comment dots and the floating tooltip, locale-aware number formatting, sticky viewport sizing, and the Cost Paid By / Show Empty Accounts filters with total recalculation.

### `models/GridModels.ts`
TypeScript interfaces for the view model (`AccountData`, `SubaccountData`, `ContractData`, `StandardContractOption`, cluster timeline types). Documents the data conventions (selected-year months vs all-years totals).

### `ui/ActionDropdown.ts`
The contract row three-dot dropdown (Edit / Comments / Delete). One shared instance appended to `document.body` (so the scroll container cannot clip it), repositioned per row, with an inline red dot on the Comments item when the contract has comments.

### `services/TemporaryTestBudgetFallback.ts`
Temporary sample-data fallback used when the live dataset is empty. **Remove only on explicit request**, and then remove only the fallback usage in `GridRenderer` plus this module — nothing else.

### `css/TableConnectedToDataversePCF.css`
All visual styling: layout, sticky header/footer, tree connectors, cluster timeline, row styles, paid/unpaid cells, dropdowns, standard-contract blue, comment dots/tooltips. Organized with section banner comments.

## 11. Rendering flow

1. Check dataset loading state (render loading UI and exit if loading).
2. Parse the main dataset with `DatasetParser.parseDatasetToTree()`.
3. If empty, fall back to `TemporaryTestBudgetFallback.parse()`.
4. Parse the `StandardContractOptions` dataset and attach options to matching subaccounts.
5. Apply the `CostPaidByFilter` (UI-only) and recalculate subaccount/account totals from visible contracts.
6. Apply `ShowEmptyAccounts` (hide accounts/subaccounts with no visible cost).
7. Render `<colgroup>` (responsive minimum widths; the table grows beyond the Canvas width and scrolls horizontally rather than squeezing columns).
8. Render the cluster timeline header row and the column header row (both sticky).
9. Render account rows → subaccount rows → contract rows → Add rows, assigning tree connector classes.
10. Render month cells with paid styling, comment dots, and click handlers.
11. Render the sticky Grand Total row.
12. Wire the dropdowns (three-dot, Add, month paid/unpaid) — all appended to `document.body`.

## 12. Total cost logic

- `M1`–`M12` show **selected-year** monthly values only.
- `TotalCost` represents the **all-years** total and comes from Canvas.
- The PCF must **not** calculate the all-years total by summing `M1`–`M12` — that was a real bug in the past (totals looked like selected-year-only sums). Canvas computes the all-year totals from all costs of the selected contracts.
- `PlannedCost` / `ActualCost` are also all-years values controlled by Canvas, displayed only when `ShowPlannedCost` is true.
- After UI filtering (DevCo/SPV, empty accounts), the PCF recalculates account/subaccount/grand totals **from the visible rows** so hidden contracts do not inflate the totals.

## 13. Paid month logic

- Paid indicators come from `M1Paid`–`M12Paid` (or the `Month1Paid`–`Month12Paid` / `M1IsPaid` / `PaidM1` / `CostPaidM1` alias families).
- A paid month cell renders green (`#D6E7B3`), darker on hover and while its dropdown is open; unpaid cells get a gray hover wash.
- Clicking a cell opens a dropdown: paid → *Set as unpaid*, unpaid → *Set as paid*, plus a *Comments* item.
- For **Equal/Cluster-distributed** contracts the paid action is disabled with an info icon and the tooltip *"Cluster-distributed costs cannot be marked as paid."*
- Canvas owns the paid status data; the PCF only reports the desired change through `SetCostPaidUnpaidTriggered` + `SelectedCostContractId/Year/Month/Paid`.

## 14. Standard contract styling

- Detection (in `DatasetParser`) accepts: `IsStandardContract`, `IsStandard`, `StandardCost`, `StandardContract`, `ContractType`, `vsb_isstandardcontract`, …; a `||STD=1||` token inside `SubLabel`; or, as a last resort, a name starting with `Standard `.
- Standard contract rows get the `pcf-row-standard` class → blue text `#006EB9` (the app theme blue).
- If standard rows are not blue in the live app, check: the imported PCF version, that `colFinatCostDataOptimized` sends `IsStandardContract = true` on **contract** rows, and the browser console parser output. Dataverse choice values must be converted in Canvas, e.g. `CPC.'Is Standard Contract?' = 'Is Standard Contract? (CAPEX Project Contracts)'.Ja`.

## 15. Cost Paid By filter

- `Show All Cost` → all contracts visible (also the fallback for blank/unknown values).
- `DevCo` → only DevCo contracts; `SPV` → only SPV contracts.
- The payer comes from `CostPaidBy`/`CostPaidByText`, with a fallback to a `[DevCo]`/`[SPV]` tag inside `SubLabel`.
- Filtering is **UI-only** — the dataset is untouched; Canvas keeps sending all rows.
- After filtering, account/subaccount/grand totals are recalculated from visible contracts only.

## 16. Show Empty Accounts

- When `ShowEmptyAccounts = false`, empty subaccounts and accounts are hidden.
- "Empty" = no total cost, no monthly value, no planned/actual value, and no visible contracts (evaluated after the Cost Paid By filter).

## 17. Action dropdown behavior

| Action | Where | What the PCF outputs |
|---|---|---|
| Add New Cost | Subaccount Add row dropdown | `AddTriggered` + `SelectedRecordId` (subaccount) |
| Add Standard Contract | Add row dropdown / submenu | `AddStandardContractTriggered` + `SelectedRecordId` + `SelectedStandardContractId` |
| Edit | Contract three-dot menu | `EditTriggered` + `SelectedRecordId` (contract) |
| Delete | Contract three-dot menu | `DeleteTriggered` + `SelectedRecordId` (contract) |
| Comment | Contract three-dot menu **and** month-cell dropdown | `CommentTriggered` + `SelectedRecordId` (contract) |
| Set as paid/unpaid | Month-cell dropdown | `SetCostPaidUnpaidTriggered` + cost outputs |

- The PCF **only triggers** actions. Canvas performs the actual create/edit/delete/comment/patch.
- Standard contract duplicate validation must stay in Canvas.

## 18. Standard contract creation flow

```text
User opens subaccount action dropdown
        ↓
PCF checks standard options for that subaccount
        ↓
User selects Add Standard Contract (directly, or from the submenu)
        ↓
PCF outputs SelectedRecordId and SelectedStandardContractId
        ↓
Canvas OnChange receives AddStandardContractTriggered
        ↓
Canvas validates duplicate/cluster/business rules
        ↓
Canvas creates CAPEX Project Contract and CAPEX Costs
        (btn_Capex_Cost_Add_Standard_Contract_Code)
        ↓
Canvas refreshes collections
        ↓
Canvas rebuilds StandardContractOptions
        (btn_Capex_Cost_Build_StandardContractOptions_Code)
        ↓
PCF re-renders without the already-created standard option
```

## 19. Canvas App dependencies

Canvas must:

- Build `colFinatCostDataOptimized` (hidden button `btn_Capex_Cost_Refresh_Capex_Cost_Code`).
- Provide correct `RowId`, `ParentId`, and `Type` on every row.
- Provide **all-years** `TotalCost`, `PlannedCost`, `ActualCost`.
- Provide `CostPaidBy` (or a `[DevCo]`/`[SPV]` tag in `SubLabel`).
- Build `colStandardContractOptionsForPCF` (`btn_Capex_Cost_Build_StandardContractOptions_Code`) and **remove already-created standard options** from it.
- Bind all PCF input properties (`StartYear = gblSelectedProjectYear`, toggles, filter dropdown, cluster dates from `gblClusterDurations`).
- Handle the PCF output triggers in the control's `OnChange`.
- Refresh collections and rebuild both PCF collections **after any mutation** (add/edit/delete/add-standard/save) — otherwise the PCF can go blank until the tab is reselected.
- Populate the comment summary fields (`HasComments`, `CommentTooltip`, `M1HasComments`…`M12CommentTooltip`) from the `CAPEX Comments` table (see `Powerapps code/Comments_PCF_CodeSnippets.txt` for ready-made snippets).

> **Still missing in Canvas as of this writing:** `OnChange` branches for `Self.CommentTriggered` (open the comments panel) and `Self.SetCostPaidUnpaidTriggered` (patch the CAPEX Cost paid flag). Both PCF outputs currently fire into the void.

## 20. Debugging guide

### Contracts not showing
- Contract rows have `Type = contract`.
- Contract `ParentId` matches the subaccount `RowId` exactly (IDs are normalized to lowercase, but must be the same GUID).
- The tab's `OnSelect` ran (it initializes the selected category/year and triggers the refresh button).

### Subaccounts not showing
- Subaccount `ParentId` matches the account `RowId`.

### Total cost wrong
- Check Canvas `TotalCost` (all-years) in `colFinatCostDataOptimized`.
- Confirm the parser reads `TotalCost` (browser console debug logs) and that the value is not just the visible-year sum.

### Month values wrong
- Check `M1`–`M12`, the `StartYear` input, and that Canvas rebuilt the collection after a year change.

### Standard rows not blue
- Standard flag fields reach the PCF as `true` (convert Dataverse choices in Canvas).
- Parser logs show `isStandardContract: true`; the row has class `pcf-row-standard`; the row `Type` is `contract`.

### Add Standard Contract still visible after adding
- `StandardContractOptions` dataset still contains the option → fix the Canvas duplicate filter / local removal / rebuild after add. This is a Canvas data issue, not a PCF one.

### DevCo/SPV filter not working
- Check `CostPaidBy` / `CostPaidByText` values, the `SubLabel` tag fallback, and the `CostPaidByFilter` input binding.

### Empty account toggle not working
- Check the `ShowEmptyAccounts` binding and remember "empty" is evaluated **after** the Cost Paid By filter.

### PCF blank after add/edit/delete/save
- Canvas did not refresh/rebuild `colFinatCostDataOptimized` (and `colStandardContractOptionsForPCF`) after the mutation, or `locSelectedCostRow` points at a stale/deleted row.

### Sample data shows instead of real data
- The main dataset arrived empty, so `TemporaryTestBudgetFallback` kicked in. Check the Canvas collection and bindings.

## 21. Build and deploy

```powershell
npm install          # once, or after dependency changes
npm run refreshTypes # after any ControlManifest.Input.xml change
npm run build        # development build + type check
```

**Release / import build** (the project's preferred path — bumps the PCF and solution patch versions, builds Release/production, regenerates the solution ZIP, and refreshes the flat `..\FilesForContent` folder):

```powershell
& "$env:USERPROFILE\.codex\skills\pcf-release-build\scripts\release-pcf.ps1" -RepoRoot (Get-Location)
```

Alternatively, push straight to a dev environment:

```powershell
pac pcf push --publisher-prefix <prefix>
```

Notes:

- After manifest changes, run `npm run refreshTypes` (regenerates `generated/ManifestTypes.d.ts`).
- After importing a new PCF version, **rebind any new properties** in the Canvas App if needed, then **publish** the app.
- Import target: `DevexCapex_POC/bin/Release/DevexCapex_POC.zip` (Managed).

## 22. Safe change guidelines

**Safe to change**
- Comments, README, CSS colors, CSS spacing, column labels, minor visual spacing.

**Needs testing**
- Dataset field detection (aliases), output/input property names, row hierarchy logic, action trigger logic, standard contract option matching, the CostPaidBy filter, the ShowEmptyAccounts filter, total/planned/actual calculation.

**Do not change casually**
- `RowId` / `ParentId` handling and `Type` values.
- The output trigger reset logic in `index.ts getOutputs()`.
- The standard contract selected-ID output.
- Add/Edit/Delete/Comment/SetCostPaidUnpaid action names.
- Dataset names and Canvas-bound input/output property names in the manifest.
- Tree connector CSS/classes (several past regressions — see comments in `GridRenderer.ts` and the CSS).
- `renderColGroup` column widths (tuned together; widening one column disturbs the month area).
- Sticky header / grand total behavior.

## 23. Developer handover notes

- **Canvas owns business logic; PCF owns rendering and interaction.** Keep it that way.
- Do **not** add Dataverse calls inside the PCF.
- Standard contract duplicate checks must stay in Canvas.
- The PCF should remain generic and dataset-driven — any new business rule should first be evaluated for whether it belongs in Canvas or PCF.
- `TemporaryTestBudgetFallback` is intentional. Remove it **only when explicitly asked**, and then remove only the fallback usage in `GridRenderer.ts` and the module itself (keep `test_budget_dataset.csv` unless told otherwise).
- The `console.log` blocks marked `Will Delete` / `Till Here` in `GridRenderer.ts` and `DatasetParser.ts` are intentional troubleshooting aids — remove them only once the live dataset is stable.
- `CLAUDE_CODE_HANDOFF_CONTEXT.md` (repo root) is the full project handoff with history of every fix; `PROJECT_CONTEXT.md` is its older predecessor.
- Canvas screen exports live in `Powerapps code/` — they are ~1.5 MB, use targeted search (`rg`), never read them whole.

## 24. Developer Notes / Possible Issues

Found while documenting — **not fixed**, listed for awareness:

**Canvas integration gaps**
1. No Canvas `OnChange` handler exists yet for `Self.CommentTriggered` or `Self.SetCostPaidUnpaidTriggered` — both actions currently do nothing in the app.
2. Canvas sends both `Month1Paid..Month12Paid` **and** `M1Paid..M12Paid` (duplicate payload; harmless but wasteful).
3. Canvas hardcodes `HasComments = false` and does not yet populate any comment tooltip fields (snippets prepared in `Powerapps code/Comments_PCF_CodeSnippets.txt`).

**DatasetParser.ts**
4. If `TotalCost` is absent/empty, the total silently falls back to the selected-year month sum — quietly reintroducing the old "selected-year totals" bug for such datasets.
5. The `hasComments` column re-scan can overwrite a `true` from an alias with `false`, and `Number(text)` on a textual comment value yields `NaN` → false (partially rescued by the tooltip-length fallback).
6. `parseBoolean` treats any string containing "standard" as `true`; fine for the standard-contract choice labels but the same function parses paid flags.
7. `parseNumber` strips commas unconditionally — a comma-decimal string like `"1,5"` becomes `15` (relevant for German locales).
8. `parseCostPaidBy` does not unwrap Dataverse choice objects (could yield `"[object Object]"`).
9. The `"id"` RowId alias may collide with an unrelated `Id` column.
10. "Cluster distribution" text is normalized to `Equal Distribution` internally — same gating behavior, but the cluster distinction is lost downstream.
11. `parseStandardContractOptionsDataset` uses raw `record.getValue()` (not the throw-safe helpers) for some probes.

**GridRenderer.ts**
12. `removeEmptyAccounts`: when all of an account's subaccounts are filtered out, the account keeps its original totals — it can show a value with no visible detail rows.
13. SubLabel tag handling uses two different regexes (`/\[([^\]]+)\]/` to extract, `/\[\w+\]/` to remove) — a tag with non-word characters would render twice.
14. `context.mode.allocatedWidth` can be `-1` in some hosts; `-1` is truthy, so the `clientWidth` fallback never runs and the table may collapse to its minimum width.
15. The disabled month-dropdown tooltip always says "cannot be marked as **paid**", even when the item reads "Set as unpaid".
16. Month cells with no cost are not clickable, so a comment dot on an empty cell cannot open Comments from the cell.
17. `formatCostValue` allows up to 3 fraction digits (unusual for currency; typically 0 or 2).
18. The "no data" empty state is nearly unreachable because the test fallback injects sample data first, and its message ("Please bind a custom collection") can mislead in production.
19. Per-cell `console.log` calls run on every render (part of the flagged temporary debug blocks) — noticeable console noise on large grids.

**ActionDropdown.ts / index.ts**
20. The comment badge uses a fixed element id (`dropdown-comment-dot`); two instances of this PCF on one screen would conflict (`getElementById` returns the first match).
21. `PCF_RE_RENDER` is a global window event — with multiple control instances, one instance's expand/collapse re-renders all of them (wasteful, not incorrect).
22. The trigger reset in `getOutputs()` updates internal fields without a second `notifyOutputChanged()`; works with current Canvas behavior, but worth knowing if OnChange semantics ever change.

**CSS**
23. Dormant rules: `.pcf-paid-action-btn*` (replaced by the month dropdown) and `.pcf-selected-cell` (the code toggles `active` instead).
24. `.pcf-meta-tag-spv` and `.pcf-meta-tag-devco` are identical; one duplicated selector group for the timeline tick could be merged.

---

*Documentation pass: 2026-06-12. No runtime logic was changed — comments, manifest annotations, and this README only.*
