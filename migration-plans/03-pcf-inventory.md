# PCF inventory plan

This document is the full behavioral contract for the two custom PCF controls used by the
Project Costs Canvas app, so that the `capex-costs` and `add-costs-from-table` screen plans
(and their implementers) can design a native React replacement without re-reading PCF source.
It confirms and makes concrete the decision already recorded in
`01-global-architecture.md` §15: **both PCFs are recreated natively** with the shared `DataGrid`
component plus screen-specific `rules.ts`, not embedded as black boxes.

Sources read in full: both PCF Git repositories under
`Existing Solution/PCF Git Repo Clones/` (manifest XML, every `.ts`/`.tsx` source file, CSS,
generated types, and each repo's own README/handoff docs), the Canvas screen exports
`Powerapps code/CapexScreenCode.txt` and `Powerapps code/AddCostFromTableScreenCode.txt` (both
~1.5 MB — read via targeted `Grep`/offset reads, not in full), and `test_budget_dataset.csv`.
The packaged managed-solution manifests under
`ProjectCosts-CodeApp/_extracted/VSBCustomComponents/Controls/` were checked as corroboration
only; per `00-workspace-inventory.md` the Git repo clones are the source of truth. Both packaged
manifests are byte-identical in property/dataset shape to the Git repo manifests (same versions:
`DevexCapexSummaryPCF` `1.1.1`, `SpreadSheet` `1.0.77`), so no discrepancy was found there.

**Note on documentation currency.** The `DevexCapexSummaryPCF` repo's own `README.md` /
`CANVAS_APP_GUIDE.md` (dated through Sprint 66, June 2026) state that Canvas has **no**
`Self.CommentTriggered` handler yet. Reading the actual current `CapexScreenCode.txt` shows this
is now **out of date**: a full `Self.CommentTriggered` branch exists (line ~7313 of the export,
quoted in the PCF 1 section below) that opens the comments panel and loads `Capex Comments`
records. Screen-plan authors should trust the live Canvas export over the PCF repo's own
narrative docs wherever the two disagree; this inventory flags every place that happened.

---

## PCF: vsb_Dev.DevexCapexSummaryPCF

### Repository path

`Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/`
(namespace `DEV.Controls`, constructor `DevexCapexSummaryPCF`, manifest version `1.1.1`).
Solution project `DevexCapex_POC/DevexCapex_POC.cdsproj`. The folder and CSS file keep the
project's original name `TableConnectedToDataversePCF`; only the control's display/constructor
name was changed.

### Canvas control usage

Used on the Cost app's `Capex Costs Screen` (`Src/Capex Costs Screen.pa.yaml` per
`00-workspace-inventory.md` row 19), inside
`con_Costs_Screen > con_Costs_Body > con_Costs_BodyRightSide > con_Costs_ContentAssignableAccountCategories`
and `con_Costs_ContentCostsInMonths`, control name `DevexCapexSummaryPCF`, component
`dev_DEV.Controls.DevexCapexSummaryPCF` (source: `Powerapps code/CapexScreenCode.txt` line
~7094-7137). The whole cost section is only visible when a category tab is selected:
`Visible = Not(IsBlank(tab_Costs_ContentAssignableAccountCategories.Selected.'CAPEX Account List'))`.

**Exact property bindings** (verbatim from `CapexScreenCode.txt`):

```
Items: =colFinatCostDataOptimized
StandardContractOptions_Items: =colStandardContractOptionsForPCF
StartYear: =gblSelectedProjectYear
ShowEmptyAccounts: =tgl_Costs_ProjectCostbtn_ShowEmptyAccounts.Checked
ShowPlannedCost: =tgl_Costs_ProjectCostbtn_ShowPlannedPaid.Checked
CostPaidByFilter: =Coalesce(drp_Costs_ProjectCostbtn_ShowCostPaidBy.Selected.Value,"Show All Cost")
CollapseResetKey: =locSelectedCapexAccountCategory.'CAPEX Account List' & "|" & Text(locScreenVisitStamp)
Height: =Parent.Height-45
Width: =Parent.Width-10
Cluster1Date: |-
  =Date(
      Coalesce(LookUp(gblClusterDurations, Order = 1, StartYear), locNavigationMinYear, gblSelectedProjectYear),
      Coalesce(LookUp(gblClusterDurations, Order = 1, StartMonth), 1),
      1
  )
```
(`Cluster2Date`…`Cluster6Date` repeat the same shape with `Order = 2`…`6`.)

Note: the Canvas property panel binds the main dataset under the label `Items` (not the
manifest's dataset name `DevexCapexCostSummary`) and the second dataset under
`StandardContractOptions_Items` — this is the Canvas-side display alias for the manifest
dataset bindings, not a different contract; the manifest dataset names given below are the
authoritative ones for a native reimplementation.

**Exact `OnChange` handler** (the full trigger-boolean round trip, `CapexScreenCode.txt`
lines ~7138-7508). First resolves the clicked row:

```
=UpdateContext(
    {
        locSelectedCostRow: LookUp(
            colFinatCostDataOptimized,
            vsb_capexaccountlistid = GUID(Self.SelectedRecordId)
        )
    }
);
```

Then branches on each trigger, one `If(Self.<X>Triggered, ...)` block per action:

- `Self.AddTriggered` → seeds `locInitialCostPaidBy` from the subaccount's SPV/DevCo mapping,
  sets `locIsVisibleRightPanelAddContract: true`, `locWarmupMode: "addContract"`.
- `Self.EditTriggered` → loads the contract (`LookUp(colCapexProjectContracts, 'CAPEX Project
  Contract' = locSelectedCostRow.vsb_capexaccountlistid)`), sets `locWarmupMode: "edit"`,
  `locAllYearsCost: locTempContract.'Total Cost'`, opens the same right panel.
- `Self.AddStandardContractTriggered` → resolves `varSelectedStandardGuid =
  GUID(Self.SelectedStandardContractId)` and the subaccount row, checks for an existing
  `CAPEX Project Contracts` record with the same `Project`, `Account`, and
  `'Capex Standard Assumption Contract'.'Devex/Capex Standard Assumptions'`; if a duplicate
  exists it `Notify()`s and removes the option locally
  (`RemoveIf(colStandardContractOptionsForPCF, ...)`); otherwise it sets
  `locGUIDforLoadingStandardContract`, `Select(btn_Capex_Cost_Add_Standard_Contract_Code)`, then
  removes the option, refreshes `CAPEX Project Contracts`/`CAPEX Costs`, and re-selects
  `btn_Capex_Cost_Refresh_Capex_Cost_Code` + `btn_Capex_Cost_Build_StandardContractOptions_Code`.
- `Self.DeleteTriggered` → `UpdateContext({locIsVisibleSubaccountCostsDeletionDialog: true})`
  (this `If` block appears **twice**, verbatim, at lines ~7275 and ~7294-7297 of the export —
  a harmless duplicate, not two different behaviors).
- `Self.SetCostPaidUnpaidTriggered` → looks up the contract
  (`GUID(Self.SelectedCostContractId)`); if `Distribution = 'Individual Distribution'` **and**
  `'Linked Cluster'` is not blank, shows the cluster-unlink warning popup
  (`locIsVisibleSetPaidCost: true`); otherwise (per Bug-13281 fix) directly
  `Select(Btn_CodeforSettingCostPaidUnpaid)`. This `If` block **also appears twice** (lines
  ~7279-7293 and ~7298-7312); the second copy is missing the `else` and is dead/redundant code
  next to the first, not a second business path.
- `Self.CommentTriggered` → **implemented in the current export** (contradicting the PCF
  repo's own README — see the currency note above): `Refresh('Capex Comments')`, builds
  `recFilteredComments` (sorted, with computed `Resolver`/`RelatedCost`/`IsRoot`/`LocalID`/
  `SelectedYear` columns) from `Filter('Capex Comments', 'Capex Contract'.'CAPEX Project
  Contract' = locSelectedCostRow.vsb_capexaccountlistid)`, and opens the panel via
  `UpdateContext({locIsVisibleCapexComments: Self.CommentTriggered, locPinGeneralComments: true,
  locShowResolvedComments: false, locAvailebleCapexCosts: ShowColumns(Filter('CAPEX Costs',
  Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract'), Year,
  Month, 'CAPEX Cost', Contract, Cost)})`.

**Paid-flag worker** (`Btn_CodeforSettingCostPaidUnpaid`, sibling hidden button,
`CapexScreenCode.txt` line ~7514): reads
`DevexCapexSummaryPCF.SelectedCostContractId` / `SelectedCostYear` / `SelectedCostMonth` /
`SelectedCostPaid`, resolves the month choice via a 12-way `Switch`, finds the matching
`CAPEX Costs` row by `Contract.'CAPEX Project Contract'` + `Year` + `Month`, and on success:

```
Patch('CAPEX Costs', varCostRecord, {'Cost Paid': DevexCapexSummaryPCF.SelectedCostPaid})
```

followed by `Refresh('CAPEX Costs')` and `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`.
If no matching row is found it `Notify()`s a warning instead of patching.

**Delete confirmation** (`cmp_PopUp_SubaccountCostsDeletion_Confirmation`): `OnConfirm` does
`Remove('CAPEX Project Contracts', locContractToDelete)` (cost rows cascade — the direct
`RemoveIf` on `CAPEX Costs` is commented out in source) then
`Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)`.

**Post-mutation resync** (`btn_Capex_Cost_Reload_PCF_After_Mutation_Code`, selected after every
create/edit/delete/add-standard/set-paid path): `Refresh('CAPEX Project Contracts')` +
`Refresh('CAPEX Costs')` → rebuild `colCapexProjectContracts` + `colCapexCosts` →
`Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` → `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)`.
Skipping this step is documented (README §20, CANVAS_APP_GUIDE §11) as the historical cause of
"PCF goes blank after mutation until the tab is reselected" — this is a hard **data-refresh
requirement** for the native replacement, not merely a PCF quirk: after every write, the
Code App must re-fetch and re-derive the same tree before the grid re-renders.

### Manifest inputs (every `<property>`/`<data-set>`, verbatim from `ControlManifest.Input.xml`)

| Name | Type | Usage | Required | Notes |
|---|---|---|---|---|
| `DevexCapexCostSummary` (data-set) | dataset | input | — | Main hierarchy dataset, bound to `colFinatCostDataOptimized` (legacy "Finat" typo, kept intentionally). |
| `StandardContractOptions` (data-set) | dataset | input | — | Per-subaccount "add standard contract" options, bound to `colStandardContractOptionsForPCF`. |
| `ShowPlannedCost` | `TwoOptions` | input | `true` | Toggles Total Planned / Total Paid columns. |
| `StartYear` | `Whole.None` | input | `true` | Year whose `M1..M12` the dataset represents. |
| `ShowEmptyAccounts` | `TwoOptions` | input | `false` | Hides empty accounts/subaccounts after the DevCo/SPV filter; defaults to **true** (shown) when the input itself is blank (`?? true` in code). |
| `CostPaidByFilter` | `SingleLine.Text` | input | `false` | `"Show All Cost"` \| `"DevCo"` \| `"SPV"`; unrecognized/blank fails open to "show all". |
| `CollapseResetKey` | `SingleLine.Text` | input | `false` | Opaque string; a change (vs. the previous render) clears all expand/collapse state. |
| `Cluster1Date`…`Cluster6Date` | `DateAndTime.DateOnly` | input | `false` (each) | Cluster start dates driving the timeline header. |

### Manifest outputs

| Name | Type | Required | Meaning |
|---|---|---|---|
| `EditTriggered` | `TwoOptions` | `false` | Edit clicked (contract three-dot menu). |
| `CommentTriggered` | `TwoOptions` | `false` | Comments clicked (three-dot menu **or** month-cell dropdown — same action). |
| `DeleteTriggered` | `TwoOptions` | `false` | Delete clicked (contract three-dot menu). |
| `AddTriggered` | `TwoOptions` | `false` | "Add New Cost" clicked (subaccount Add row). |
| `AddStandardContractTriggered` | `TwoOptions` | `false` | A standard-contract option chosen (Add row / submenu). |
| `SetCostPaidUnpaidTriggered` | `TwoOptions` | `false` | "Set as paid/unpaid" clicked on a month cell. |
| `SelectedRecordId` | `SingleLine.Text` | `false` | Subaccount RowId (Add/AddStandardContract) or contract RowId (Edit/Delete/Comment). |
| `SelectedStandardContractId` | `SingleLine.Text` | `false` | Chosen standard-assumption id (AddStandardContract only). |
| `SelectedCostContractId` | `SingleLine.Text` | `false` | Contract id for the paid/unpaid action (deliberately blank for every other action). |
| `SelectedCostYear` | `Whole.None` | `false` | Year of the clicked month cell (= `StartYear`). |
| `SelectedCostMonth` | `Whole.None` | `false` | 1–12 month number of the clicked cell. |
| `SelectedCostPaid` | `TwoOptions` | `false` | The **desired new** paid state (not the current one). |

**Trigger-boolean contract, load-bearing for a native rewrite:** every user action sets exactly
one of the six `*Triggered` booleans true, sets the relevant selection outputs, and calls
`notifyOutputChanged()`. Immediately after `getOutputs()` is read, `index.ts` resets every
trigger/selection field to its default (false/""/0) — this is required because Canvas'
`OnChange` fires only on an output **value change**; without the reset, two identical clicks in
a row would look like `true → true` (no change) and Canvas would silently drop the second one. A
native React implementation replacing this with direct callback props (e.g. `onEdit(id)`,
`onDelete(id)`) does not need to reproduce the reset dance — that is a workaround for the
PCF's asynchronous output-property protocol, not a business rule — but it **is** the reason the
Canvas formula, when ported to `rules.ts`, must be read as "exactly one action per click", not as
stateful flags to preserve.

### Dataset bindings — field contract (from `ControlManifest.Input.xml` comments, `DatasetParser.ts`, and `test_budget_dataset.csv`)

`DevexCapexCostSummary` is a **flat** row set; `DatasetParser.parseDatasetToTree()` groups it
into a 3-level tree via `RowId`/`ParentId`/`Type` (case-insensitive, alias-tolerant field
matching — see "Reusable source files" below). Canonical/expected columns per row:

| Field | Type | Meaning |
|---|---|---|
| `RowId` | text GUID | Row's own id (falls back to the dataset record id). |
| `ParentId` | text GUID | Subaccount→account or contract→subaccount parent link; normalized to lowercase/trimmed on both sides. |
| `Type` | text | `"account"` \| `"subaccount"` \| `"contract"` (case-insensitive). |
| `Number` | text | Display number, first column. |
| `Name` | text | Display name (contract rows commonly carry `vsb_costdescription`). |
| `SubLabel` | text | Secondary line, e.g. `[SPV] Link to Milestone Cluster 1`; can also carry `\|\|KEY=value\|\|` metadata tokens (`STD`, `PAID`). |
| `M1`…`M12` | number | Monthly cost for the **selected `StartYear` only** — index 0 = January. |
| `M1Paid`…`M12Paid` (+ `Month1Paid`… and other aliases) | boolean | Per-month paid flag. |
| `TotalCost` / `PlannedCost` / `ActualCost` | number | **All-years** totals computed by Canvas — never derived by the PCF from `M1..M12`. |
| `IsStandardContract` (+ many aliases) | boolean/text | Marks a standard-assumption-sourced contract (blue styling). |
| `CostPaidBy` (+ aliases) | text | `"DevCo"` \| `"SPV"`, falls back to a `[DevCo]`/`[SPV]` tag inside `SubLabel`. |
| `DistributionType` (+ aliases) | text | `"Individual Distribution"` \| `"Equal Distribution"` \| `"Cluster-distributed"`/etc. — gates the paid/unpaid action. |
| `HasComments` / `CommentTooltip` | boolean / text | Contract-level comment red dot + tooltip. |
| `M1HasComments`…`M12HasComments` / `M1CommentTooltip`…`M12CommentTooltip` | boolean / text | Month-level (payment-date) comment red dot + tooltip. |

`StandardContractOptions` (bound to `colStandardContractOptionsForPCF`) is a per-subaccount
options list: `StandardContractId`, `SubaccountId` (must equal the matching subaccount's
`RowId`), `Name`, `AutoId` (sort order, applied in Canvas).

### React/TS component structure

| File | Responsibility |
|---|---|
| `index.ts` | PCF lifecycle only (`init`/`updateView`/`getOutputs`/`destroy`). Owns the six trigger booleans + five selection fields, the single `triggerAction()` choke point, and the `_expandedRowIds`/`_lastResetKey` state that must outlive re-renders. No DOM/rendering code. |
| `services/DatasetParser.ts` | Stateless flat→tree converter (two-pass: bucket by normalized `RowId`, then stitch via `ParentId`). Also builds the cluster timeline (`calculateClusterTimeline`/`calculateClusterSpans`) from `StartYear` + `Cluster1Date..6Date`. |
| `models/GridModels.ts` | `AccountData`/`SubaccountData`/`ContractData`/`StandardContractOption`/`ClusterSpan`/`ClusterTimeline` interfaces — the shape the renderer consumes. |
| `ui/GridRenderer.ts` | All DOM construction: colgroup sizing, cluster-timeline header, account/subaccount/contract/add/grand-total rows, tree-connector classes, the three dropdowns (three-dot, Add, month paid/unpaid), comment dots/tooltips, sticky header/footer, locale-aware number formatting, the two UI-only filters (`CostPaidByFilter`, `ShowEmptyAccounts`) with total recalculation. ~1700 lines; by far the largest file. |
| `ui/ActionDropdown.ts` | The contract-row three-dot menu (Edit/Comments/Delete), one shared instance appended to `document.body`. |
| `css/TableConnectedToDataversePCF.css` | All visual styling — see "Business behavior" for the parts that encode business rules, not just look. |

### Business behavior

**Hierarchy & rendering.** Account (bold gray, `#DCDCDC`) → Subaccount (light gray, `#EDEBE9`,
owns a synthetic "Add" row appended by the PCF, not present in Canvas data) → Contract (white;
blue `#006EB9` text/row when `isStandardContract`). Expand/collapse state (`_expandedRowIds`) is
**inverted**: an empty set means everything collapsed, which is the required default on
screen-entry/tab-switch (`CollapseResetKey` change clears the set). A sticky header (cluster
timeline row + column-label row) stays pinned to the top of the scroll viewport; a sticky
**Grand Total** row (dark, `#7D7D7D`/`#595959` label cell) stays pinned to the bottom; only the
rows in between scroll. A `pcf-row-footer-spacer` filler row is synthesized so the Grand Total
still sits flush at the bottom even with few data rows.

**Grouping/summary math (the algorithm most worth transcribing directly).** `TotalCost`,
`PlannedCost`, `ActualCost` at every level are **Canvas-computed all-years totals** and must
never be derived by summing `M1..M12` (that was a real historical bug — selected-year sums
displayed as if they were all-years totals). The PCF only re-aggregates when the **UI-only**
filters (`CostPaidByFilter`, `ShowEmptyAccounts`) hide rows: `recalculateSubaccount`/
`recalculateAccount` in `GridRenderer.ts` re-sum `totalCost`/`plannedCost`/`actualCost` and
element-wise-sum `months[]` from the surviving children — see `sumMonths()`. The Grand Total is
accumulated in `render()` across all (filtered) accounts, **including collapsed ones** —
collapsing hides detail rows, it must never change totals.

**DevCo/SPV filter (`CostPaidByFilter`).** `"Show All Cost"` (default and fail-open value for
blank/unrecognized input) shows everything; `"DevCo"`/`"SPV"` filter contract rows by matching
`costPaidBy` **or** a `[DevCo]`/`[SPV]` tag inside `SubLabel` (substring match, case-insensitive)
against `contract.costPaidBy + " " + contract.subLabel`. Filtering happens client-side only —
Canvas keeps sending all rows — and totals are recalculated from the rows that remain visible.

**Show Empty Accounts (`ShowEmptyAccounts`).** When false, `removeEmptyAccounts()` drops a
subaccount with zero contracts **and** no cost anywhere (`hasAnyCost` checks `totalCost`,
`plannedCost`, `actualCost`, and every `months[]` entry), then drops an account left with no
subaccounts and no own cost. Evaluated **after** the DevCo/SPV filter. Known defect (documented
in the PCF's own README §24 item 12): if all of an account's subaccounts get filtered out, the
account itself keeps its **original** (pre-filter) totals — it can show a nonzero figure with no
visible detail rows underneath. A native reimplementation should decide explicitly whether to
port or fix this; if fixed, it needs a `// SOURCE DEFECT:` note per `01-global-architecture.md`
§17/§8.

**Standard contract detection & styling.** Three independent, OR-ed signals (`DatasetParser`):
(1) any boolean-ish alias column (`IsStandardContract`, `IsStandard`, `StandardCost`,
`vsb_isstandardcontract`, …), (2) a `||STD=1||`/`||STD=true||` token inside `SubLabel`, (3) a
contract name starting with `"Standard "` (fallback). A true result adds the CSS class
`pcf-row-standard` → the whole row's text renders in the app's brand blue `#006EB9`.

**Distribution type gating.** `isEqualDistribution()` treats any `DistributionType` text
containing (after stripping non-alphanumerics) `"equal"`, `"cluster"`, or `"distributed"` as
"auto-distributed" — such contracts' month cells cannot be marked paid/unpaid (the amounts are
machine-generated, not user-entered); clicking the cell shows only an info message: *"Automatically
distributed costs cannot be marked as paid or assigned payment date comments."* (Bug 13290
wording; supersedes the older "Cluster-distributed…" text still referenced in some docs.)
Non-auto-distributed contracts get the real "Set as paid"/"Set as unpaid" + "Comments" menu.

**Paid/unpaid month cells.** A month with a nonzero value is clickable (keyboard-accessible:
`tabIndex=0`, `role="button"`, Enter/Space also open the dropdown). Paid → green `#D6E7B3`
background (`title="Paid Cost"` native tooltip, Bug 13284), darker `#A8C676` while its dropdown
is open; unpaid → white with a gray `#DCDCDC` hover/active wash. Clicking toggles a dropdown
whose single action is the **opposite** of the current state (paid → "Set as unpaid", unpaid →
"Set as paid") plus a "Comments" item that fires the **same** `CommentTriggered` output as the
three-dot menu's Comments item. `SelectedCostPaid` is always the **target** state, not the
current one. A contract row's **Total Costs** cell additionally turns a darker green
(`pcf-cell-total-paid`, `#a3c068`) when `totalCost > 0 && |totalCost - actualCost| < 0.005`
(Bug 13453 — "fully paid" across all years, epsilon-compared).

**Add dropdown (subaccount Add row).** Always offers "Add New Cost" (fires `AddTriggered`).
Standard-contract behavior depends on `subaccount.standardContractOptions.length`: `0` → no
"Add Standard Contract" item at all (an earlier disabled-item design was explicitly **not**
implemented — do not "restore" it without a new decision); `1` → a single direct item (fires
`AddStandardContractTriggered` immediately, no submenu); `>1` → a parent item with a
hover-revealed submenu, one entry per option.

**Contract three-dot menu.** Edit / Comments (with an inline red dot when `hasComments`) /
Delete — see `ActionDropdown.ts`. One shared DOM instance for the whole grid, appended to
`document.body` so the table's `overflow` scroll container cannot clip it, repositioned per
click and clamped/flipped to stay inside the viewport.

**Comment indicators.** Contract-level: red dot beside the name
(`hasComments = HasComments column OR non-empty CommentTooltip`), hover/focus shows a
`document.body`-floated tooltip (name cell clips overflow for its ellipsis, so a CSS-only
tooltip would be cut off). Month-level: a red dot pinned to the cell's top-right corner
(`monthHasComments[i] OR non-empty monthCommentTooltips[i]`), using a cheaper pure-CSS
`[data-tooltip]::after` tooltip (month cells don't clip). The three-dot button also carries a
small red corner badge when the contract has **any** comment (general or any month).

**Cluster timeline header.** A row of pills ("Cluster N") plus a connecting horizontal track and
short vertical boundary ticks, drawn above the 12 month columns from `StartYear` +
`Cluster1Date..6Date`. Algorithm (`DatasetParser.calculateClusterTimeline`): each configured
cluster maps to a 0-based month index in the selected year (before-year → month 0, during-year →
its actual month, after-year → filtered out); months are then swept Jan→Dec assigning the
latest-starting cluster so far, and the result is run-length-encoded into `spans[]` for
colspanned header cells. With zero visible clusters the whole year is a single unlabeled span.

**Locale-aware currency formatting.** All cost figures (month cells, Total/Planned/Actual,
Grand Total — **not** headers, account numbers, or names) go through
`Intl.NumberFormat(navigator.languages, { maximumFractionDigits: 3 })` — an explicit requirement
for a mixed-locale (English/German) customer base, so `1000` renders `1,000` or `1.000`
depending on the viewer's browser language. Zero/null/NaN render as a styled em-dash `"-"`.

**Row tree connector lines** (the Account→Subaccount→Contract indentation lines with T/L
branches) are pure presentation (CSS pseudo-elements keyed to row-height-tuned pixel offsets) and
carry no business logic; a native `DataGrid` grouping/tree-row feature does not need to replicate
this pixel-level connector-line drawing, only the expand/collapse and visual nesting it conveys.

### Lifecycle notes relevant to migration

- `updateView` pages through the **entire** dataset itself
  (`if (!summaryDataset.loading && summaryDataset.paging.hasNextPage) summaryDataset.paging.loadNextPage()`)
  because a Canvas-bound PCF dataset otherwise silently truncates to page 1, dropping trailing
  accounts. A native `useQuery`-based fetch replacing this must itself fetch/aggregate the full
  result set (per `01-global-architecture.md` §4 "never materialize to filter" — but note here
  the constraint is the opposite risk, under-fetching, not over-fetching).
- Expand/collapse does **not** re-render synchronously inside its own click handler; it mutates
  the shared `_expandedRowIds` set and dispatches a custom `PCF_RE_RENDER` window event so
  `index.ts` can re-render outside the handler's call stack (rebuilding the DOM that dispatched
  the event, from inside that same event, was a defined regression). In React this concern
  disappears — it's an artifact of imperative DOM mutation, not a rule to port.
- `CollapseResetKey` changing clears all expand/collapse state — this is the one input whose
  **change**, not its value, matters; a native prop for the same purpose should be documented as
  "pass a new value to force a collapse", not as a persisted setting.

### Target migration approach

Confirms `01-global-architecture.md` §15: recreate as a Dataverse-bound tree/summary grid using
the shared `DataGrid` (`src/components`) plus `capex-costs/rules.ts`, not an embedded PCF.
Concrete `DataGrid` feature requirements surfaced by this inventory:

- **Grouping/tree rows**, 3 levels deep (account → subaccount → contract), with per-row
  expand/collapse state that resets on an external signal (the `CollapseResetKey` equivalent —
  e.g. a `collapseAll` prop bumped by the screen on tab-switch/mount) but otherwise persists
  across re-renders (server refetches must not force a re-collapse).
- **A pinned/sticky summary row** at the bottom (Grand Total) and a **sticky header** — including
  a second header sub-row for the cluster timeline, which is more naturally a bespoke header
  slot passed into `DataGrid` than a built-in feature.
- **Row-level actions** (three-dot menu: Edit/Comments/Delete) and **cell-level actions** (click
  a month cell to open a paid/unpaid + Comments mini-menu, disabled with an explanatory message
  for auto-distributed contracts) — i.e. `DataGrid` needs both a row-action-menu slot and a
  clickable/interactive-cell mode, not just static cell rendering.
- **Client-side, UI-only filtering with re-aggregation** (DevCo/SPV, empty-account hiding) that
  recomputes visible subaccount/account/grand totals from the filtered set — this belongs in
  `rules.ts` as pure functions over the already-fetched tree, not as a server refetch (the data
  itself is unfiltered; only the view changes), consistent with keeping `rules.ts` pure and
  `DataGrid` a dumb renderer.
- **Locale-aware number formatting** and the "0/null renders as a dash" convention should become
  a shared `DataGrid`/`NumericInput`-family formatting helper, not re-implemented per screen.

### Reusable source files (worth transcribing directly, not re-deriving)

- `services/DatasetParser.ts` — `calculateClusterTimeline()` (cluster→month-index assignment +
  run-length span encoding) is a self-contained, well-specified algorithm with no PCF/DOM
  dependency; port its logic near-verbatim into `capex-costs/rules.ts`.
- `ui/GridRenderer.ts` — `recalculateAccount`/`recalculateSubaccount`/`sumMonths`/
  `hasAnyCost`/`removeEmptyAccounts`/`applyCostPaidByFilter`/`contractMatchesCostPaidBy`/
  `isContractFullyPaid`/`isEqualDistribution` are pure functions (despite living in a DOM-heavy
  file) and are the exact business rules to carry into `rules.ts` — the summary/total
  recalculation algorithm in particular, since a copy-paste transcription error here would
  silently show wrong totals under a filter.
- `models/GridModels.ts` — the `AccountData`/`SubaccountData`/`ContractData`/
  `StandardContractOption`/`ClusterSpan`/`ClusterTimeline` shapes are a good starting point for
  the native TypeScript view-model types (rename freely; the field semantics and the
  selected-year-vs-all-years distinction on each must be preserved exactly).
- The **field-alias tolerance** in `DatasetParser.ts` (case/punctuation-insensitive matching,
  dozens of alias spellings per field) is a PCF-era workaround for an unstable Canvas collection
  shape and should generally **not** be ported wholesale — the native Code App will read directly
  from typed Dataverse repositories (`01-global-architecture.md` §4) with one canonical column
  name per field. `REQUIRES_INVESTIGATION`: which Dataverse logical names back each of `RowId`/
  `ParentId`/`Type`/`TotalCost`/`PlannedCost`/`ActualCost`/`CostPaidBy`/`DistributionType`/
  `IsStandardContract` — the Canvas formulas quoted above reference `vsb_capexaccountlistid`,
  `'CAPEX Project Contract'`, `'Cost Type'`, `Distribution`, `'Linked Cluster'`, `'Is Standard
  Contract?'` and similar Dataverse display names, but the authoritative logical-name mapping
  must come from `02-global-state-and-data.md`/the entities reference, not be re-derived here.

### Proposed React contract

Derived strictly from the manifest properties and the Canvas binding/`OnChange` code quoted
above — no invented fields:

```ts
// capex-costs — native replacement for vsb_Dev.DevexCapexSummaryPCF

interface CapexCostGridProps {
  /** Replaces dataset DevexCapexCostSummary (colFinatCostDataOptimized), already
   * fetched+shaped into the tree — fetching/shaping is a hooks.ts/rules.ts concern,
   * not a DataGrid prop. */
  accounts: AccountRow[];

  /** Replaces dataset StandardContractOptions (colStandardContractOptionsForPCF),
   * pre-grouped by subaccount id. */
  standardContractOptionsBySubaccount: Map<string, StandardContractOption[]>;

  // ---- former manifest inputs ----
  showPlannedCost: boolean;         // ShowPlannedCost
  startYear: number;                // StartYear
  showEmptyAccounts: boolean;       // ShowEmptyAccounts (default true)
  costPaidByFilter: "Show All Cost" | "DevCo" | "SPV"; // CostPaidByFilter
  clusterDates: (Date | null)[];    // Cluster1Date..Cluster6Date, index 0..5
  collapseSignal: string;           // CollapseResetKey — a bumped token, not a real setting

  // ---- former output triggers, now direct callbacks (no boolean-pulse/reset dance) ----
  onAdd: (subaccountId: string) => void;                                   // AddTriggered
  onAddStandardContract: (subaccountId: string, standardContractId: string) => void; // AddStandardContractTriggered
  onEdit: (contractId: string) => void;                                    // EditTriggered
  onDelete: (contractId: string) => void;                                  // DeleteTriggered
  onComment: (contractId: string) => void;                                 // CommentTriggered (fired from both the row menu and the month-cell menu)
  onSetCostPaidUnpaid: (
    contractId: string,   // SelectedCostContractId
    year: number,         // SelectedCostYear
    month: number,        // SelectedCostMonth, 1-12
    paid: boolean         // SelectedCostPaid — the DESIRED new state
  ) => void;
}

interface AccountRow {
  id: string; number: string; name: string;
  totalCost: number; plannedCost: number; actualCost: number; // all-years, server-computed
  months: number[]; // length 12, selected year only
  subaccounts: SubaccountRow[];
}

interface SubaccountRow {
  id: string; parentId: string; number: string; name: string;
  totalCost: number; plannedCost: number; actualCost: number;
  months: number[];
  standardContractOptions: StandardContractOption[];
  contracts: ContractRow[];
}

interface ContractRow {
  id: string; parentId: string; number: string; name: string; subLabel: string;
  costPaidBy: "DevCo" | "SPV" | "";
  totalCost: number; plannedCost: number; actualCost: number;
  isStandardContract: boolean;
  distributionType: string; // gates paid/unpaid via an isAutoDistributed(distributionType) rule
  months: number[];
  monthPaid: boolean[];
  hasComments: boolean; commentTooltip: string;
  monthHasComments: boolean[]; monthCommentTooltips: string[];
}

interface StandardContractOption { id: string; name: string; }
```

`REQUIRES_INVESTIGATION`: whether `onComment` should open an inline panel or a route — the
Canvas branch above builds `locAvailebleCapexCosts` and several derived comment-thread columns
inline; the target Code App's comments-panel design (single shared component vs. per-screen) is
a screen-plan decision, not this inventory's.

### Dependencies, risks

- **Depends on the `CAPEX Comments` table** for comment red dots/tooltips — confirmed live in
  Canvas (see the `CommentTriggered` branch above), so the native screen plan can rely on this
  existing rather than treating it as a future gap (correcting the PCF repo's own stale docs).
- **Depends on `SPVDevCo Mapping Capex Devexes`** for the initial DevCo/SPV value seeded into the
  Add-contract panel (`locInitialCostPaidBy`).
- **All-years vs. selected-year total semantics** is the single highest-risk business rule to
  port: `TotalCost`/`PlannedCost`/`ActualCost` must come from server-side aggregation across all
  years, never from summing the 12 displayed months, or the historical "totals look like
  selected-year sums" bug reappears.
- **`dataClient.batch` is not transactional** (`01-global-architecture.md` §4/§12): the
  Add-Standard-Contract flow above does a `Patch` on one `CAPEX Project Contract` plus a
  `ForAll`-distributed set of `CAPEX Costs` rows; a native multi-write must state explicitly
  whether a partial failure here is tolerable or needs a custom API, per §4's requirement — this
  inventory does not decide it, the `capex-costs` screen plan must.
- **Duplicate/dead code in Canvas** (`Self.DeleteTriggered` and `Self.SetCostPaidUnpaidTriggered`
  each appear twice in `OnChange`) should not be reproduced; the screen plan should treat the
  first, complete copy of each as authoritative.
- **`REQUIRES_INVESTIGATION`**: exact Dataverse logical names for every field in the dataset
  contract table above (see "Reusable source files").
- **`REQUIRES_INVESTIGATION`**: whether the known "empty subaccounts filtered out but account
  total unchanged" defect (README §24 item 12) should be ported as-is (with a
  `...CanvasParity` twin per `01-global-architecture.md` §8) or fixed — a business decision, not
  a documentation one.

---

## PCF: vsb_Dev.SpreadSheet

### Repository path

`Existing Solution/PCF Git Repo Clones/vsbcloud-pcf-spreadsheet/SpreadSheet/` (namespace `Dev`,
constructor `SpreadSheet`, `control-type="virtual"` — a React-rendering PCF, manifest version
`1.0.77`). Built on the third-party `react-spreadsheet` library plus platform libraries
`React 16.8.6` and `Fluent 8.29.0` declared in the manifest's `<resources>`. The repo's own
`README.md` is unfilled boilerplate (a generic Azure DevOps template) — it carries no usable
project content, unlike the DevexCapexSummaryPCF repo's docs.

### Canvas control usage

Used on the Cost app's `Add Costs from Table` screen (`Src/Add Costs from Table.pa.yaml`, row 23
of `00-workspace-inventory.md`'s screen table — 23 controls, 224 formula properties, 9 logic
blocks; "no active flow"). Control name
`cmp__PCF_SpreadSheet_Costs_ProjectCosts_TableCommandBar_AddDataTable`, component
`vsb_Dev.SpreadSheet` (source: `Powerapps code/AddCostFromTableScreenCode.txt` lines ~164-181).

**Exact property bindings** (verbatim):

```
AddRow: =lcladdrow
CompletionYear: =locEndingYear
CopyData: =lclCopyTable
DeleteRow: =lcldeleterow
FiscelYear: =lcltglShowCostEnabled
Height: =Parent.Height-con_btns_Spreadsheet_Costs_ProjectCosts_BodyButtons.Height-con_btns_Spreadsheet_Costs_ProjectCosts_TableCommandBar.Y-con_btns_Spreadsheet_Costs_ProjectCosts_TableCommandBar.Height
Items: =colSubaccountMappedCostPaid
SaveData: =locSaveData
StartingYear: =locProjectStartingYear
Width: =Parent.Width*.98
X: =(Parent.Width-Self.Width)/2
Y: =con_btns_Spreadsheet_Costs_ProjectCosts_TableCommandBar.Height
jsonDataIn: =locPCFJsonInput
```

Two child `DataField` bindings under the control declare the `SubaccountDataIN` dataset's
columns explicitly:

```
- Account Number1: FieldName: ="vsb_accountnumber", FieldType: ="s", Order: =1
- DevCo/SPV1:       FieldName: ="vsb_devcospv",      FieldType: ="l", Order: =2
```

As with the CAPEX PCF, Canvas labels the bound dataset property `Items` rather than the
manifest's dataset name `SubaccountDataIN` — same alias behavior, not a different contract.

**Two-way contract — how the screen is driven.** Unlike `DevexCapexSummaryPCF`'s trigger
booleans, `SpreadSheet` is bound through **plain toggled boolean props** (`SaveData`, `CopyData`,
`AddRow`, `DeleteRow`) and one **bound output string** (`jsonDataOut`). Canvas flips a context
variable to request an action; the PCF's React effects watch the corresponding prop and react:

- `AddRow` (`lcladdrow`, flipped by `btn_AddRow_..._AddDataTable.OnSelect:
  =UpdateContext({lcladdrow:!lcladdrow})`) → `SpreadSheet.tsx`'s `useEffect([AddRow])` inserts one
  new blank row after the currently-selected row, pre-filling `Cost Paid By` from
  `SubaccountDataIN` (looked up by the nearest account-header row's Account Number against
  `vsb_devcospv`: `952850002` → `"SPV"`, `952850001` → `"DevCo"`) and `Depreciation`/`Apply VAT`
  to `"Yes"`.
- `DeleteRow` (`lcldeleterow`, `btn_DeleteRow_..._AddDataTable.OnSelect:
  =UpdateContext({lcldeleterow:!lcldeleterow})`) → removes the currently-selected row (or the
  last row if none is tracked).
  `REQUIRES_INVESTIGATION`: `AddCostFromTableScreenCode.txt` OnVisible comments out
  `//lcldeleterow: !lcldeleterow` and the row-count guard in `SpreadSheetComp` only checks
  `data.length > 1` (not "is this the header row") — a delete on `data.length === 1` (header
  only) is a no-op by that guard, but there is no guard preventing deleting down to just the
  header if more than one row remains and index 0 (header) were ever selected; exact selection
  bookkeeping (`selectedRowIndexRef`) is fragile and worth re-verifying against real usage rather
  than assumed safe.
- `CopyData` (`lclCopyTable`, two separate buttons both toggle it) → a `useEffect([onCopy])`
  writes the whole grid, tab/newline-joined, to `navigator.clipboard`.
- `SaveData` (`locSaveData`) → a `useEffect([OnSave])` converts the in-memory grid into the
  `DynamicRow[]` JSON shape (see below) and calls `onDataChange` → `notifyOutputChanged()`,
  publishing the new `jsonDataOut`. **This does not itself save to Dataverse** — it only produces
  the JSON that Canvas's timer-driven handler (next section) reads and processes.
- `jsonDataIn` (`locPCFJsonInput`) → on `init`/whenever it changes, `index.ts` calls
  `prepareInitialData()`, which groups the incoming flat JSON array by `Number_RelatedRowID` into
  one row per contract with per-year/per-month columns, and prepends a fixed 6-column +
  month-column header row.

**The `OnTimerEnd` polling mechanism (`tmr__CheckChanges_Add_Costs_To_Dataverse`, Timer control,
`Duration: =1000`, `AutoStart: =locTimerStart`, `Repeat: =locTimerEnd`,
`AddCostFromTableScreenCode.txt` line ~15-22, one single formula ~1,150 lines long as flagged by
`00-workspace-inventory.md`).**

What problem it solves: a `virtual`/React PCF's bound output (`jsonDataOut`) only updates
**asynchronously**, inside a `React.useEffect` that fires after React re-renders in response to
the `SaveData` prop flip — Canvas has no way to "await" that update from inside the Save button's
own `OnSelect`. The screen's actual save pipeline (validate every row, group by contract, diff
against the previous save, `Patch` `CAPEX Project Contracts` and `CAPEX Costs`, delete removed
contracts, rebuild `colFinatCostDataOptimized`, and navigate back) needs the **settled** JSON, not
whatever `jsonDataOut` happened to hold at the moment the button was clicked. The workaround:

```
Save Data button: UpdateContext({locSaveData: !locSaveData});      // flips the PCF's SaveData prop
                  UpdateContext({locTimerStart:true, locTimerEnd:true}); // arms + starts the poll
OnTimerEnd (fires every 1000ms while locTimerEnd is true):
  UpdateContext({locSaveData: !locSaveData});                       // (re-)flips again each tick
  UpdateContext({locPCFDataChanged: cmp..._AddDataTable.jsonDataOut}); // read the CURRENT output
  If(
      locPCFJsonInput <> locPCFDataChanged,                          // has it actually changed since last known value?
      /* THEN: output has settled/changed — stop polling and run the full
         validate -> group -> diff -> Patch -> delete -> rebuild -> Navigate pipeline */
      UpdateContext({locTimerStart:false}); UpdateContext({locTimerEnd:false}); ...  ,
      /* ELSE: not yet changed — remember the latest value and let Repeat=locTimerEnd
         fire OnTimerEnd again in another 1000ms */
      UpdateContext({locPCFJsonInput: locPCFDataChanged, ...})
  )
```

So the "polling" is not scanning for arbitrary drift — it is a fixed-interval retry loop that
re-triggers the Save prop and re-reads the output every second **until the PCF's asynchronous
output actually reflects the save request**, then runs the (very large) validation+persistence
pipeline exactly once. `01-global-architecture.md` §15 explicitly rejects porting this
timer-polling mechanism into the Code App. The underlying problem it must still be solved
differently for is: **"how does the screen reliably know the grid's current, fully up-to-date
data before it starts validating/saving, given that data-shape conversion happens inside the
child component asynchronously."** In a native React implementation this is not a real problem —
a controlled component (the grid holds no async internal state disconnected from its parent) or a
synchronous `onChange`/`getSnapshot()` callback gives the parent the current grid state
immediately, with no timer needed. Confirming the concrete replacement mechanism is the
`add-costs-from-table` screen plan's job, not this inventory's — but the requirement it must
satisfy is: **the Save action must have access to the fully current, validated grid contents
synchronously (or via an awaited promise), not via a value that might still be one render behind.**

**The full save pipeline gated behind the timer** (paraphrased, since transcribing 1,150 lines of
one formula would not aid a screen plan — the exact source is quoted in full in the
`OnTimerEnd` property above for line-level reference):

1. Parse `locPCFDataChanged` JSON into `colPCFDataOut`, resolving each row's subaccount via
   `LookUp(colCapexSubaccountsNew, Name = ... && Number = ...)` and computing a `CostUniqueID`.
2. Run five validation passes into `colValidationErrors`: duplicate subaccount rows
   (`colDuplicateSubaccounts`), rows entered directly under an Account instead of a Subaccount
   (`colNonExistingSubaccountsPCF` — `IsBlank(SubAccountID)`), two contracts under one subaccount
   sharing the same description, missing `Depreciation`/`ApplyVAT`/`CostPaidBy`, use of the word
   "Standard" in a description for a row that isn't actually system-prefilled
   (`colNewStandardDisallowed`), and a contract with all twelve months blank/zero
   (`colNoCostAllocatedContracts`).
3. If **any** validation error exists, the pipeline stops and re-arms
   (`locPCFJsonInput: locPCFDataChanged`) — errors surface via `locVisibleSubAccountsError`/
   `colValidationErrors` for the screen's error panel, not via a `Notify()`.
4. If clean: removes unchanged rows from a working diff set, `Patch`es
   `'CAPEX Project Contracts'` (one row per distinct Name+Number+Description group, deriving
   `'Apply VAT?'`/`'Depreciation?'`/`'Cost Type'`/`Distribution`/`'Is Edited from PCF?'`/
   `'Initial Contract Source'` from the sheet + the existing contract record), then `Patch`es
   `'CAPEX Costs'` per contract/month (`ForAll` over 12 explicit per-month `Collect` calls, one
   per calendar month — **a write-in-a-loop pattern the target architecture explicitly replaces**
   with `repo.saveMany`/`dataClient.batch`, per `01-global-architecture.md` §4), removes
   `CAPEX Costs` rows whose new value is blank where an existing record was found, deletes
   contracts that ended up with zero cost, rebuilds `colFinatCostDataOptimized`, and finally
   `Navigate`s back to `'Capex Costs Screen'`.

### Manifest inputs (every `<property>`/`<data-set>`, verbatim from `ControlManifest.Input.xml`)

| Name | Type | Usage | Required |
|---|---|---|---|
| `jsonDataIn` | `SingleLine.Text` | input | `true` |
| `SaveData` | `TwoOptions` | bound | `true` |
| `CopyData` | `TwoOptions` | bound | `true` |
| `jsonDataOut` | `SingleLine.Text` | bound | `true` |
| `StartingYear` | `SingleLine.Text` | bound | `true` |
| `CompletionYear` | `SingleLine.Text` | bound | `true` |
| `FiscelYear` | `TwoOptions` | bound | `true` |
| `AddRow` | `TwoOptions` | bound | `true` |
| `DeleteRow` | `TwoOptions` | bound | `true` |
| `SubaccountDataIN` (data-set) | dataset | — | — |

**Note:** `usage="bound"` (not `"input"`/`"output"`) on most properties means Canvas can both
set and read them — this is why the same `SaveData`/`AddRow`/`DeleteRow` variables serve as both
"request" (Canvas sets them) and are read back unmodified; the PCF never writes to them itself,
only to `jsonDataOut`.

**Discrepancy found:** `SpreadSheet/generated/ManifestTypes.d.ts` (the auto-generated typed
contract used by `index.ts`) is **stale relative to the manifest XML** — it lists only
`jsonDataIn`, `SaveData`, `CopyData`, `jsonDataOut`, `StartingYear`, `CompletionYear`, `FiscelYear`
and omits `AddRow`, `DeleteRow`, and the `SubaccountDataIN` dataset entirely, even though
`index.ts` reads `context.parameters.AddRow.raw`, `context.parameters.DeleteRow.raw`, and
`context.parameters.SubaccountDataIN` directly (this compiles only because the file carries a
blanket `no-unsafe-*`/`no-explicit-any` ESLint-disable block and PCF's generated types are not
regenerated automatically on every manifest edit — `npm run refreshTypes` was evidently not re-run
after `AddRow`/`DeleteRow`/`SubaccountDataIN` were added). Treat the **manifest XML** (matching
the packaged solution's `ControlManifest.xml`) as authoritative, not the generated `.d.ts`.

### Manifest outputs

| Name | Type | Meaning |
|---|---|---|
| `jsonDataOut` | `SingleLine.Text` | The full grid, serialized as a JSON array of `DynamicRow` objects (one row per contract **per year** it has data for), published after a `SaveData` prop flip. This is the **only** true output; everything else under "bound" is a two-way echo, not new information from the PCF. |

### Dataset bindings

`SubaccountDataIN` — read via `dataSetToSingleObjectArray(dataset, { keyColumn:
"vsb_accountnumber", includeColumns: ["vsb_accountnumber", "vsb_devcospv"] })` into a
single keyed lookup object (`{ [accountNumber]: { vsb_accountnumber, vsb_devcospv } }`), used only
to prefill a new row's Cost Paid By from the nearest account header's `vsb_devcospv` choice value
(`952850002` = SPV, `952850001` = DevCo — see `cost_paid_by` enum in `SpreadSheet.tsx`). Canvas
supplies this as `Filter('SPVDevCo Mapping Capex Devexes', 'Account Number' in
colCapexSubaccountsInSelectedCategoryNew.Number)`, i.e. one row per subaccount number in scope.

### React/TS component structure

| File | Responsibility |
|---|---|
| `index.ts` | PCF lifecycle for a **virtual/React** control: `init` reads props, computes `maxColumns` (`12 * (completionYear − startYear or currentYear) + 6`), and calls `prepareInitialData()` if `jsonDataIn` is present. `updateView` re-derives everything and returns `React.createElement(SpreadSheetComp, props)`. `getOutputs()` returns only `{ jsonDataOut: this.data }`. Also owns `groupData`/`prepareInitialData`/`generateMonthLabels`/`generateYearRange` — the flat-JSON ⇄ 2D-grid conversion. |
| `SpreadSheet.tsx` | The actual React component (`SpreadSheetComp`), wrapping the third-party `react-spreadsheet` `<Spreadsheet>`. Owns all in-grid state (`useState<data>`), the four `useEffect`s keyed to `AddRow`/`DeleteRow`/`onCopy`/`OnSave`, cell sanitization (`handleChange`), row edit-lock rules (`getRowEditable`), row styling (`getRowClassName`), and the paste-into-full-worksheet special case. |
| `CostPaidBy.tsx` | `DataEditor` for column index 3 (Cost Paid By): a plain `<select>` with options `["DevCo", "SPV"]`. |
| `YesNoDropDown.tsx` | `DataEditor` for column indices 4 and 5 (Depreciation, Apply VAT): a plain `<select>` with options `["Yes", "No"]`. |
| `util_datset.ts` | Generic PCF-dataset→keyed-object helpers (`dataSetToKeyedMap`/`dataSetToKeyedArray`/`dataSetToSingleObjectArray`) plus `findNearestAccountHeaderRow` (walks upward from a row to the nearest row that has both Account Number and Account Name filled, used to resolve which account a newly-inserted detail row belongs to). |
| `MySpreadsheet.css` | Three classes only: `.header` (white/bold), `.filled-row` (gray `#d2d2d2`), `.empty-row` (white) — row-level shading, no per-cell styling. |

### Business behavior

**Grid shape.** Six fixed leading columns — Account Number, Account Name, Cost Description, Cost
Paid By, Depreciation, Apply VAT — followed by one column per month across every year from
`StartingYear` to `CompletionYear` (label `MM/YYYY`, e.g. `01/2026`). `maxColumns = 12 *
(completionYear − (FiscelYear ? startingYear : currentYear)) + 6`; i.e. when `FiscelYear`
(`lcltglShowCostEnabled`) is false the month grid starts from **today's** calendar year instead
of the project's starting year — `REQUIRES_INVESTIGATION`: whether this branch is ever actually
exercised, since Canvas hard-codes `lcltglShowCostEnabled: true` at `Navigate()` time with an
inline comment *"Changed for Hotfix to Prod false was original"*.

**Row grouping on load (`groupData`/`prepareInitialData`).** Incoming flat JSON rows (see field
table below) are grouped by `` `${Number}_${RelatedRowID}` ``; for a "child" row
(`t_parentId` present) the Number/Name cells are blanked so only the first (header) row of a
multi-year contract shows the account identity — this is what produces the visual "one row per
contract, blank leading cells for its continuation years" pattern the user edits. Each group's
month values are bucketed per year into `Fixed[6 + monthIndex]`-keyed columns, then flattened
year-by-year into the row's trailing cells.

**Row editability (business rule, duplicated near-identically in both `index.ts` and
`SpreadSheet.tsx` — port once).** The header row (index 0) is always editable/locked-open for
column identity but not user-data; for data rows: a row whose **Description** contains
`"standard"` (case-insensitive substring) is **non-editable** — standard/system-prefilled
contracts cannot be hand-edited in the bulk table; otherwise a row is editable only once **both**
Account Number and Account Name are non-blank (an "empty"/not-yet-a-real-row placeholder stays
locked). Row background follows the same three-way rule: header → `.header`, both cells filled →
`.filled-row` (gray), otherwise → `.empty-row` (white) — the standard-contract case does **not**
get its own row color, only the read-only behavior.

**Cell-level input sanitization (`handleChange` in `SpreadSheet.tsx`).** Column 3 (Cost Paid By)
snaps typed/pasted text to the nearest case-insensitive match of `"DevCo"`/`"SPV"`, else blanks
it. Columns 4–5 (Depreciation/Apply VAT) snap to `"Yes"`/`"No"`, else blank. Any column past 5
(a month cell) must match `/^[0-9.]*$/` or it is blanked and the whole paste is flagged
`isValid = false` (the flag is currently computed but not surfaced to the user beyond the
blanking — no error message is shown for a rejected numeric paste at the PCF layer; Canvas's own
separate validation pass, described above, is what actually reports problems back to the user).

**Full-worksheet paste special case.** When the current selection is classified as
`"EntireWorksheetSelection"` (full-width selection starting at row 0 or 1 through the last row —
i.e. a paste that could replace the whole grid), rows whose values are unchanged from the prior
`data` are reverted (`valuesEqual` deep-compares stringified cell values) and the grid is trimmed
to the last row that **did** change — this exists so that pasting a shorter block than the current
grid doesn't blank out trailing untouched rows.

**Add Row (`AddRow` prop toggling).** Inserts a single new blank row immediately after
`selectedRowIndexRef.current` (or at the end if nothing was tracked as selected). The new row's
Cost Paid By is pre-filled from `SubaccountDataIN` via `findNearestAccountHeaderRow` (walk
upward to the nearest row with both Account Number and Account Name filled) plus a lookup of that
account number's `vsb_devcospv` choice value; Depreciation and Apply VAT default to `"Yes"`;
Account Number/Account Name/the 7th column (`colIndex===6`, the first month column) are forced
blank. Dropdown `DataEditor`s are (re-)attached to columns 3/4/5 on the new row.

**Delete Row (`DeleteRow` prop toggling).** Removes the row at `selectedRowIndexRef.current` (or
the last row) from the in-memory grid, guarded only by `data.length > 1`.

**Copy (`CopyData` prop toggling).** Serializes the entire visible grid (tab-separated cells,
newline-separated rows, including the header) to the OS clipboard via
`navigator.clipboard.writeText`.

**Output JSON shape on Save (`DynamicRow[]`, what `jsonDataOut` actually contains).** One object
per contract **per year present in that contract's data**:

```ts
type DynamicRow = {
  Number: string; Name: string; Description: string;
  CostPaidBy: string; Depreciation: string; ApplyVAT: string;
  Row_ID: string; Year: string;
  Jan: string; Feb: string; /* … */ Dec: string; // one key per month, string-typed
};
```

### Event callbacks / outputs sent back to Canvas

Only `jsonDataOut` (via `notifyOutputChanged()`, called from `handleDataChange` whenever the
`OnSave`-keyed `useEffect` fires). Unlike `DevexCapexSummaryPCF`, there is no trigger-boolean
protocol — the "was this actually a save" signal is entirely carried by Canvas's own
`locSaveData` toggle plus the polling loop described above, not by anything the PCF outputs
itself.

### Lifecycle notes relevant to migration

- `updateView` **recomputes `initialData` from `jsonDataIn` on every call** where
  `context.parameters.jsonDataIn.raw` is truthy — i.e. any framework-triggered re-render (not
  just an actual `jsonDataIn` value change) re-runs `prepareInitialData()` and could stomp
  in-progress unsaved edits if `jsonDataIn` is re-bound to the same value after some unrelated
  input changes. A native controlled-component replacement must be deliberate about only
  re-seeding from the "source of truth" prop on a genuine data reload, not on every parent
  re-render — this is exactly the class of bug a plain controlled `<DataGrid>` + local edit state
  needs to avoid reproducing.
- `getOutputs()` always returns the **last known** `this.data`, which is only updated inside
  `handleDataChange` — i.e. it reflects the most recent `SaveData` toggle's conversion, not
  necessarily the live in-grid state at the moment `getOutputs` is called by the framework. This
  is the PCF-specific plumbing whose problem statement is described in the timer section above.

### Target migration approach

Confirms `01-global-architecture.md` §15: rebuild as a native editable grid (`DataGrid` plus
per-row `DataEditor`-equivalent cell renderers) with validation/save logic in
`add-costs-from-table/rules.ts`, explicitly **not** a re-embedded PCF and **not** a port of the
`OnTimerEnd` polling mechanism. Concrete requirements:

- **Controlled editable grid state**, not an async output-property round trip: the screen's own
  React state (or a small local reducer) should hold the grid contents directly, so "get current
  grid contents to validate/save" is a synchronous read, not a polled value.
- **Column-typed cell editors**: a Cost-Paid-By dropdown (`DevCo`/`SPV`) and two Yes/No dropdowns
  (Depreciation, Apply VAT) map directly onto `NumericInput`-family/`Combobox`-style cell editors
  per `01-global-architecture.md` §7; free-text month cells need the same `/^[0-9.]*$/`-style
  numeric guard as `NumericInput` already enforces elsewhere.
- **Row-level read-only rule** (standard-contract descriptions; not-yet-a-real-row placeholders)
  needs to be a pure `rules.ts` predicate (`isRowEditable(row): boolean`) evaluated per row,
  mirroring `getRowEditable`.
- **Bulk save as one batched operation**, not 12 per-month `Collect`/`Patch` calls per contract —
  replace with `repo.saveMany`/`dataClient.batch` per `01-global-architecture.md` §4, and the
  screen plan must state explicitly whether a partial mid-batch failure here is tolerable (rows
  half-saved across months) or needs a custom API, exactly as §4 requires for every multi-write.
- **Validation-before-save must stay a client-side pass** (duplicate subaccounts, orphaned
  Account-level rows, duplicate contract names, missing required fields, "Standard" used in a
  non-system row, zero-cost contracts) — port the five checks enumerated above as pure
  `rules.ts` functions returning a structured error list, replacing Canvas's
  `colValidationErrors` collection with a typed `ValidationIssue[]`.
- **Replacing the timer**: not decided here (see the polling section above) — the
  `add-costs-from-table` screen plan must pick a mechanism (controlled state + a `Save` button
  that reads current state directly; or an `onChange` callback keeping a parent-level "current
  grid" ref) that satisfies "synchronous access to current, fully up-to-date grid contents at
  save time," and must not silently reintroduce a fixed-interval poll to work around any
  remaining async boundary.

### Reusable source files

- `util_datset.ts` — `findNearestAccountHeaderRow` and the `dataSetToKeyedMap`/
  `dataSetToSingleObjectArray` family are small, dependency-free, and a fine starting point for
  the equivalent "resolve which account/subaccount this working row belongs to" helper in
  `rules.ts`, adapted to read from a typed row array instead of a PCF dataset.
- `SpreadSheet.tsx`'s `sanitizeSpreadsheetData` (fill-down of Number/Name onto blank detail rows,
  skip `"*Account*"` marker rows) encodes a real business rule (how a multi-year contract's
  continuation rows inherit their header's identity) worth transcribing into `rules.ts`
  functions, not just visually replicating.
- The five Canvas-side validation checks in the `OnTimerEnd` pipeline (quoted in full above) are
  the authoritative validation rule set and should be transcribed into `rules.ts` test cases
  directly from the quoted formula, not re-derived from the UI behavior alone.

### Proposed React contract

Derived strictly from the manifest properties and the two-way Canvas binding described above:

```ts
// add-costs-from-table — native replacement for vsb_Dev.SpreadSheet

interface AddCostsFromTableGridProps {
  /** Replaces jsonDataIn — already parsed into rows, not a raw JSON string. */
  initialRows: SpreadsheetRow[];

  /** Replaces dataset SubaccountDataIN, keyed by vsb_accountnumber. */
  subaccountCostPaidBy: Record<string, { vsb_accountnumber: string; vsb_devcospv: string }>;

  startingYear: string;   // StartingYear
  completionYear: string; // CompletionYear
  fiscalYear: boolean;    // FiscelYear — whether the month range starts at startingYear or at the current calendar year

  /** Replaces the SaveData prop-flip + polled jsonDataOut: a direct, synchronous
   * read of current grid contents, called by the screen's Save action. */
  onSave: () => SpreadsheetRow[];

  /** Replaces AddRow prop-flip. */
  onAddRow: (afterRowIndex: number | null) => void;

  /** Replaces DeleteRow prop-flip. */
  onDeleteRow: (rowIndex: number | null) => void;

  /** Replaces CopyData prop-flip (or becomes a plain onClick handler with no PCF
   * round-trip at all, since clipboard write does not need the grid's approval). */
  onCopyAll: () => void;
}

interface SpreadsheetRow {
  number: string; name: string; description: string;
  costPaidBy: "DevCo" | "SPV" | "";
  depreciation: "Yes" | "No" | "";
  applyVAT: "Yes" | "No" | "";
  rowId: string;
  /** One entry per year in the visible range; replaces the flattened DynamicRow-per-year JSON. */
  months: Record<string /* year */, (number | null)[] /* length 12 */>;
}
```

`REQUIRES_INVESTIGATION`: the exact Dataverse logical names underlying `vsb_devcospv`'s choice
values `952850001`/`952850002` (confirmed as DevCo/SPV by the `cost_paid_by` enum in
`SpreadSheet.tsx`, but the authoritative choice/option-set metadata should come from
`ProjectCosts-CodeApp/reference/dataverse-attributes.json`, not be asserted here) and for
`'CAPEX Project Contracts'`/`'CAPEX Costs'` fields referenced only by Dataverse display name in
the quoted `OnTimerEnd` formula (`'Apply VAT?'`, `'Depreciation?'`, `'Cost Type'`, `Distribution`,
`'Distribution Scheme'`, `'Is Edited from PCF?'`, `'Initial Contract Source'`).

### Dependencies, risks

- **The timer-polling replacement is an open design decision**, not resolved by this inventory —
  flagged explicitly per the task brief; the `add-costs-from-table` screen plan owns it.
- **`ManifestTypes.d.ts` is stale** relative to the manifest XML (see "Discrepancy found" above) —
  a reminder that this PCF's own generated-type tooling was not kept current; do not trust
  generated types over the manifest XML when the two disagree, here or elsewhere in the
  workspace.
- **12-Patch-calls-per-contract write pattern** in the Canvas save pipeline is exactly the
  `ForAll(..., Patch(...))` anti-pattern `01-global-architecture.md` §4 requires replacing with
  batched writes — and per §4/§6, the screen plan must state whether a partial failure across
  months is tolerable.
- **Numeric paste validation currently has no user-facing error surface at the PCF layer**
  (`isValid` is computed and discarded) — the native replacement should decide deliberately
  whether invalid-paste feedback is added (a new, better behavior) or intentionally still relies
  on the separate Canvas-side validation pass; either way this must be a stated, not silent,
  decision per `01-global-architecture.md` §17.
- **`REQUIRES_INVESTIGATION`**: whether the `FiscelYear=false` ("start from current calendar
  year, not project start year") branch is reachable in production, given Canvas hard-codes
  `lcltglShowCostEnabled: true` at navigation time.
- **`REQUIRES_INVESTIGATION`**: exact Dataverse logical/choice-value names, listed above.

---

## Cross-cutting notes

- **Both PCFs enforce a strict client/server responsibility split** that the native
  reimplementation should preserve as a `Screen.tsx`/`rules.ts`/`hooks.ts` split rather than a
  PCF/Canvas split: neither PCF calls Dataverse directly; `DevexCapexSummaryPCF` reports intent
  via trigger outputs, `SpreadSheet` reports intent via a save-flag round trip, and in both cases
  the Canvas screen (soon to be `hooks.ts` mutations + `rules.ts` validation) owns every write.
  This maps cleanly onto the existing architecture's `Screen.tsx` (composition/rendering only) /
  `rules.ts` (pure validation & derived values) / `hooks.ts` (queries & mutations) split.
- **Neither PCF's dataset is the row-level source of truth for "all-years" aggregates** — both
  screens depend on Canvas (soon: repository/query layer) pre-computing totals or grouping
  server-side rather than the grid deriving them from visible cells. Any native replacement must
  keep that computation in `rules.ts`/the data layer, not in the presentational `DataGrid`.
- **Write-in-a-loop is the dominant Canvas pattern in both PCFs' round trips** (per-month
  `Collect`/`Patch` calls, `ForAll(..., Patch(...))` for contracts) — both screen plans must
  apply `01-global-architecture.md` §4's `repo.saveMany`/`dataClient.batch` replacement and
  explicitly record partial-failure tolerance, since `dataClient.batch` is bounded-concurrency,
  not transactional (§4/§12).
- **Choice/option-set field mapping is a shared risk.** Both PCFs receive Dataverse choice
  columns (`Cost Type`/`CostPaidBy`, `Is Standard Contract?`, `Apply VAT?`, `Depreciation?`,
  `vsb_devcospv`) already converted to plain strings/booleans by Canvas formulas
  (`If(x = 'Choice'.Value, "text", ...)` patterns quoted throughout this document) rather than
  reading raw option-set numbers. A native Code App talking to Dataverse directly will receive
  raw choice values (or `@OData.Community.Display.V1.FormattedValue` strings) and must reproduce
  each of these `If`/`Switch` mappings explicitly in `rules.ts` — get one wrong and a filter or a
  styling rule (DevCo/SPV, standard-contract blue, paid/unpaid) silently misfires. Confirming the
  authoritative logical names and option-set values for each is `REQUIRES_INVESTIGATION` against
  `ProjectCosts-CodeApp/reference/dataverse-attributes.json`, not against this document.
- **Shared visual convention**: both grids use a plain, low-chroma palette (whites/grays for row
  hierarchy, a single brand blue `#006EB9` for "special/standard" rows and interactive
  affordances, green for "paid"/settled state) with no other color semantics — a native
  `DataGrid` theme built from `01-global-architecture.md` §2's Fluent UI v9 tokens should treat
  these as the two screens' only real color requirements, everything else is default grid
  chrome.
- **Both Canvas screens rebuild large working collections client-side rather than querying
  Dataverse with a `$filter`/`$select` per need** (`colFinatCostDataOptimized`,
  `colCapexCostsInSelectedContracts`, `colAddCostFromTable`, etc.) — exactly the
  `ClearCollect(col, Filter(Table, ...))` anti-pattern `01-global-architecture.md` §4 replaces
  with scoped `useQuery` + `select`. Neither PCF's own code depends on this being collections
  specifically; both screens' native replacements should query only what each grid needs,
  pre-shaped server-side or in `hooks.ts`, not materialize-then-filter.
