# 07 — Functional: the CAPEX screen and its grid

Gap ID prefix: **GAP-FN**. Requirement IDs: **FR-01 … FR-59**.

Everything here is a source-level comparison, read on 27 Oct 2026. Nothing was exercised against
live `VSBCloud_Dev`. "L" on its own means a line in
`ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`. Code paths are
relative to `ProjectCosts-CodeApp/src/`.

---

## 1. Scope

**In scope:**

- the screen's load sequence (`OnVisible`, and what `App.OnStart` feeds into it);
- every timer;
- every hidden "code" button run through `Select()`, and `fn_Numeric_CC`;
- the category tabs and the year controls;
- the grid region `con_Costs_ContentCostsInMonths`, covering:
  - the PCF inputs and the dispatch of its output events;
  - totals;
  - the paid/unpaid action;
  - deletion;
  - standard contracts;
  - cluster linking as it reaches the grid;
- the Summary region;
- every business rule as an FR, with its code implementation and tests.

**Out of scope, owned by sibling files:**

| Topic | Owner |
|---|---|
| The Add/Edit panel's internals and its save path, including what the two warm-up/enrich timers feed and the cluster-linkage dialog that Save raises | `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md` |
| The comments panel | `09-COMMENTS-PANEL.md` |
| Dialog chrome, sizes, icons and spinner chrome | `06-POPUPS.md` |
| Variable and collection catalogue | `10-COLLECTIONS-VARIABLES.md` |
| Tables, columns, flows and plugins | `11-DATAVERSE-TABLES.md` |
| Round-trips; performance | `12-NETWORK-CALLS.md` and `13-OPTIMIZATION-AREAS.md` |
| PCF renderer internals | `14-PCF-CONTROLS.md` |
| App shell, OnStart in full, header and left navigation | `01-EDIT-COST-MODULE.md` |

**Canvas read:**

| Lines | What |
|---|---|
| L11–301 | screen `Properties`, including `OnVisible` |
| L303–434 | `cmp_PopUp_Confirmation_1`, a dead dialog |
| L435–1013 | `TextCanvas1`, the standard-options builder, the reload subroutine, the initial-load timer, and the two cluster-range buttons |
| L1014–2299 | `btn_Capex_Cost_Refresh_Capex_Cost_Code`, read to the end |
| L2300–3082 | the tab strip and the toolbar |
| L3083–3170 | the hidden command bar `Items`, first part |
| L3579–3610 | the hidden gallery navigation |
| L4288–4330, L4475–4610 | the legacy gallery |
| L6288–6440 | the legacy month summary |
| L7234–7768 | the PCF and `Btn_CodeforSettingCostPaidUnpaid` |
| L7769–8155 | the Summary region, the footer, and the delete dialog |
| L18206–19760 | the loading popup, the standard-contract subroutine, all five timers and `fn_Numeric_CC` |
| L19835–20090 | `Text1`, plus the paid and relink popups (their `OnConfirm` logic only) |

**Also read:**

- `App.pa.yaml` L205, the `OnStart` block (lines 553–968 of the unescaped formula);
- `Components/fn_Numeric.pa.yaml`;
- the PCF manifest `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/ControlManifest.Input.xml` L62–105.

**Code read:**

- `features/cost/capex-costs/`, read in full:
  - `Screen.tsx`, `rules.ts`, `gridRows.ts`, `clusters.ts`, `distribution.ts`;
  - `standardContracts.ts`, `writeSet.ts`, `PcfGrid.tsx`;
  - `panelRules.ts`, only L120–320 and L440–497;
  - `comments.ts`, the grid-indicator functions only;
  - `pcf/ui/GridRenderer.js` L1098–1317 and `pcf/ui/ActionDropdown.js`, the menu and event contract only.
- `features/cost/costing/useCostBook.ts`, in full.
- `data/`:
  - `capexWrites.ts` and `standardContracts.ts`, in full;
  - `costBook.ts` L700–1303;
  - `costRepository.ts` L220–325.
- The test files `rules.test.ts`, `gridRows.test.ts`, `clusters.test.ts`, `distribution.test.ts`, `standardContracts.test.ts`, `writeSet.test.ts`, `Screen.test.tsx`, `panelRules.test.ts`, `data/capexWrites.test.ts`, `data/costBook.test.ts` and `data/costRepository.test.ts`, as id and title lists.

---

## 2. Canvas implementation

### 2.1 What `App.OnStart` hands the screen

These are from `App.pa.yaml` L205, read from the unescaped formula. `01-EDIT-COST-MODULE.md` owns
OnStart itself; these are only the names the screen consumes.

| Name | Built as | Consumed by |
|---|---|---|
| `gblSelectedProject` | `LookUp(Projects, Project = GUID(Param("projectId")))`, falling back to the hard-coded `GUID("33b9cc79-…")` "for testing" | everything |
| `gblRecordSelectedProjectCountry` | `LookUp(Countries_1, Country = gblSelectedProject.Country.Country)` | the Summary currency suffix |
| `gblSelectedProjectYear` | `Year(If('Start Cluster' <> Greenfield, If(Year('Acquisition date') > Year(Today()), 'Acquisition date', Today()), If(Year('Project Start Date') > Year(Today()), 'Project Start Date', Today())))` | the default year (FR-07) |
| `colCapexAccountCategoriesNew` | a synthetic `{ 'CAPEX Account List': Blank(), Name: "DEVEX/CAPEX Summary", Order: 0 }`, then `SortByColumns(Filter('CAPEX Account Lists', 'Parent Account'.Number = "00001"), "vsb_order")` | the tabs |
| `colCapexAccountsNew` | level-2 accounts under those categories, `Status = Active`, sorted by `Order` | Refresh |
| `colCapexSubaccountsNew` | level-3 sub-accounts under those accounts, `Status = Active` | Refresh |
| `colCapexProjectContracts` | `Filter('CAPEX Project Contracts', Project = gblSelectedProject)`, with **no `statecode` filter** | Refresh, Summary |
| `colCapexCosts` | `Defaults('CAPEX Costs')` (one blank row), then every cost row of every contract (an N+1 `ForAll`): `Year, Name, Month, Cost, Contract, 'CAPEX Cost', 'Cost Paid'` | Refresh, Summary |
| `colDevexCapexSummaryView` | per category: `{Id, Name, Sum: Max(Sum(colCapexCosts in that category's sub-account contracts, Cost), 0), ParentId}` | Summary gallery |
| `gblClusterDurations` | six rows. Each takes the Year and Month of two chained project milestone columns: `1-Feasibility studies` → `2-Project development started` → `3-Application submitted` → `4-Legally binding permits` → `5-Construction` → `Operations start date (COD)` → `End Date`. **All six rows are always emitted, even with blank dates.** | year window, PCF cluster dates, standard options, cluster ranges |
| `gblAppStarted` | `true`, set at the very end | the build gates |

### 2.2 The load sequence — `Screen.OnVisible`

Source: `Capex Costs Screen.pa.yaml:L14-301`. Every step runs in order, inside one formula.

| # | Lines | Step | Purpose |
|---|---|---|---|
| 1 | L15–38 | `UpdateContext` | Resets 20 context variables. `locIsVisibleLoadingCostSpinner: true`, `locCapexInitialLoadPending: true` and `locCapexInitialLoadDone: false`. Every dialog and panel flag goes to `false`. `locSelectedSubaccountCommandMode: gblAppConstants.Form.Display`. `locSelectedAccount` and `locSelectedCostRow` go to `Blank()`. `locScreenVisitStamp: GUID()` is a fresh stamp that later collapses the PCF (FR-34). |
| 2 | L40–56 | Re-resolve `gblSelectedProject` | From `Param("projectId")`, else the hard-coded test GUID. This is a duplicate of OnStart's resolution, and canvas bug **A-2**. |
| 3 | L58–82 | `locProjectStartClusterNo` | `Switch(Coalesce('Start Cluster', Greenfield), Greenfield,0, 'Cluster 1',1 … 'Cluster 6',6, 0)` |
| 4 | L84–124 | `locCostAllowedStartYear` / `locCostAllowedStartDate` | See below this table. |
| 5 | L126–205 | `locNavigationMinYear` / `locNavigationMaxYear` | See below this table. |
| 6 | L207–236 | `ClearCollect(colProjectPeriods, …)` | One row per year from min to max: `Sequence(Max(max-min+1, 1), min, 1)`. Each row is `{Year, Month: [12 × {Name: Text(Date(2000,m,1),"mmmm"), Number}]}`. |
| 7 | L238–257 | Safe selected year | `Set(gblSelectedProjectYear, Min(Max(Coalesce(gblSelectedProjectYear, locCostAllowedStartYear, locNavigationMinYear, Year(Today())), min), max))`. Because OnStart always seeds the global, the `Coalesce` never reaches its second argument on a first visit (**D50 / CA-6**). |
| 8 | L259–280 | Category selection | Keeps the current `locSelectedCapexAccountCategory` if it is a real category. Otherwise it takes `First(SortByColumns(Filter(colCapexAccountCategoriesNew, !IsBlank('CAPEX Account List') && Not(Name = "Overleveraging")), "vsb_order"))`, the first real category, not the Summary. It also blanks `locSelectedAccount` and `locSelectedCostRow`. |
| 9 | L282–301 | The build gate | See below this table. |

**Step 4 — the cost-allowed start (L84–124).**

```powerfx
With({ varPreferredStartDate: If(locProjectStartClusterNo > 0, 'Acquisition date', 'Project Start Date'),
       varFallbackStartDate: Coalesce('Acquisition date', 'Project Start Date', Today()) },
  With({ varCostStartDate: If(!IsBlank(varPreferredStartDate) && Year(varPreferredStartDate) > 1900,
                              varPreferredStartDate, varFallbackStartDate) },
    UpdateContext({ locCostAllowedStartYear: If(Year(varCostStartDate) > 1900, Year(varCostStartDate), Year(Today())),
                    locCostAllowedStartDate: Date(<same year>, 1, 1) })))
```

This is January of the first year a cost may be booked in. It takes the acquisition date for a
project that started past Greenfield, and the project start date otherwise. Year-1 sentinels
are ignored.

**Step 5 — the navigation window (L126–205).**

- **Min:** `Coalesce(Min(Filter(Table({Y: acquisitionYear}, {Y: Min(gblClusterDurations.StartYear)}, {Y: locCostAllowedStartYear}), Y > 1900), Y), Year(Today()))`.
- **Max:** the same shape over the COD year, the `End Date` year, `Max(gblClusterDurations.EndYear)` and `gblSelectedProjectYear`.

**Step 9 — the build gate (L282–301).**

```powerfx
If(gblAppStarted && !IsBlank(gblSelectedProject) && !IsBlank(locSelectedCapexAccountCategory.'CAPEX Account List')
   && CountRows(colCapexAccountCategoriesNew) > 1 && CountRows(colCapexAccountsNew) > 0 && CountRows(colCapexSubaccountsNew) > 0,
   Reset(tab_Costs_ContentAssignableAccountCategories);
   Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
   Select(btn_Capex_Cost_Build_StandardContractOptions_Code);
   UpdateContext({locIsVisibleLoadingCostSpinner: false, locCapexInitialLoadPending: false, locCapexInitialLoadDone: true}),
   UpdateContext({locIsVisibleLoadingCostSpinner: false, locCapexInitialLoadPending: true,  locCapexInitialLoadDone: false}))
```

- **Warm path.** When OnStart's collections are ready, the screen builds immediately, on the
  first real category.
- **Cold path.** When they are not, the spinner is **hidden** and `locCapexInitialLoadPending`
  stays `true`. That flag is what starts `tmr_Capex_Initial_Load` (§2.3). Note that the cold path
  leaves the user with no spinner until the timer fires.

### 2.3 The timers

| Timer (line) | Duration | Repeat | AutoStart | Start | Purpose |
|---|---|---|---|---|---|
| `tmr_Capex_Initial_Load` (L778) | `=500` | `=true` | not set | `=locCapexInitialLoadPending` | Polls every 500 ms until OnStart's data is ready. Used only on the cold path of §2.2 step 9. |
| `tmr_Capex_Cost_Category_SwitchTabs` (L18928) | `=300` | not set | `=locStartCategoryBinding` | not set | Dormant (see below). |
| `tmr_Capex_Cost_Category_SwitchTabs_1` (L19032) | `=100` | not set | `=locStartCategoryBinding1` | not set | Dormant (see below). |
| `tmr_Capex_Cost_Cost_EnrichLoader` (L19136) | `=100` | not set | `=locStartBinding` | `=true` | Fills the Edit panel's per-year month values. |
| `tmr_Load_Contract_Gallery_Warmup` (L19580) | `=1` | not set | `=locWarmupKick` | not set | The panel warm-up that runs before the enrich step. |

**`tmr_Capex_Initial_Load.OnTimerEnd` (L782).** This is one escaped string. In plain language:

- **Guard.**
  `locCapexInitialLoadPending && !locCapexInitialLoadDone && gblAppStarted && !IsBlank(gblSelectedProject) && CountRows(colCapexAccountCategoriesNew) > 1 && CountRows(colCapexAccountsNew) > 0 && CountRows(colCapexSubaccountsNew) > 0 && CountRows(gblClusterDurations) > 0`.
- When the guard holds:
  1. It sets pending to `false` and done to `true`, shows the spinner, and clears both
     `locStartCategoryBinding*` flags.
  2. It selects **`LookUp(colCapexAccountCategoriesNew, Name = "DEVEX/CAPEX Summary")`**. This
     is a different tab from the warm path (canvas bug **D-7**).
  3. It runs `Reset(tab_Costs_ContentAssignableAccountCategories)`.
  4. It branches with
     `If(IsBlank(locSelectedCapexAccountCategory.'CAPEX Account List'), <summary>, Select(Refresh); Select(BuildOptions))`.
     The Summary was just selected, so the summary arm always runs. That arm does
     `Clear(colFinatCostDataOptimized)` and `Clear(colStandardContractOptionsForPCF)`, then
     rebuilds `colCapexSummaryCategories` and `colDevexCapexSummaryView` exactly as the tab
     handler does (FR-25).
  5. It hides both spinners.
- Because it repeats, the timer keeps polling until the guard passes. After that,
  `locCapexInitialLoadPending = false` stops it.

**`tmr_Capex_Cost_Category_SwitchTabs` and `_1` — dormant.**

- Nothing on the screen ever sets `locStartCategoryBinding` to `true`. A grep of `Src/` finds only
  `false` assignments: L2443, the timer at L782, and the timer itself.
- `locStartCategoryBinding1` is set to `true` only by the first timer's own `OnTimerEnd` (L19026).
- **Both timers therefore never fire.**
- Their bodies show what they once did. They rebuilt the category collections with an extra
  `Status = Active` filter. The first timer also had a `Year = gblSelectedProjectYear` filter on
  `colCapexCostsInSelectedContracts`, at L18964. They also rebuilt the Summary view.
- `btn_Capex_Cost_Refresh_Capex_Cost_Code` replaced them. Its own comment says so: "Do not depend
  on timer for this" (L1019–1020).
- There is nothing to port.

**`tmr_Load_Contract_Gallery_Warmup.OnTimerEnd` (L19585–19738).**

The Add and Edit PCF events kick it by setting `locWarmupKick: true` (L7317, L7354). It runs these
steps:

1. Clears the kick and `locStartBinding`.
2. Runs `Select(btn_Reset_EditCost_Controls)`.
3. **Re-derives `locCostAllowedStartYear` / `locCostAllowedStartDate`** with a different formula
   from OnVisible. The start is
   `Coalesce(If(startCluster > 0, 'Acquisition date', 'Project Start Date'), 'Project Start Date', 'Acquisition date', Today())`,
   with **no `> 1900` guard**. It also sets
   `locProjectDuration = Year(costEnd) - Year(costStart) + 4` and
   `locProjectStartyear = Year(costStart) - 1`, where `costEnd` is
   `Coalesce(COD, 'End Date', '5-Construction', Today())`. A `Max(…, 15)` variant is commented out
   (L19623–19626).
4. Inside `Concurrent`:
   - builds a zeroed `colNewEditPanelCost`, with one row per year, UI and Save columns, and totals;
   - runs `Switch(locWarmupMode, …)`:
     - for `"addContract"`, it blanks the contract, cluster, date and total variables and resets
       the frequency dropdown;
     - for `"edit"`, it sets `locAllYearsCost = Coalesce('Total Cost', Sum(contract costs))`,
       sets `locEditSaveButtonEnabled: false`, and parses `'By Cluster JSON'` / `'By Start & End
       Date JSON'` into `locClusterRecord` / `locDistributionDatesRecord`.
5. Sets `locPanelReady: true` and `locStartBinding: true`.

Step 3 matters to this file. Once a user has opened the panel, the **◀ Previous-year floor**
(FR-28) reads the warm-up's value instead of OnVisible's. See GAP-FN-17. Everything else here
belongs to 08.

**`tmr_Capex_Cost_Cost_EnrichLoader.OnTimerEnd` (L19142–19574).**

1. Clears `locStartBinding`.
2. Sets `locAllYearsCost` again.
3. For `Sequence(locProjectDuration)` years, looks up each month's existing cost from `colCapexCosts`
   for `locSelectedCostRow`. It fills the `…UI` columns as `Round(m / 'Total Cost' * 100, 1)` when
   `'Distribution Scheme' = '% Values'`, else `Round(m, 0)`. It fills the `…Save` columns with the
   raw amounts, plus `TotalUI` / `TotalSave`.

`Start: =true` is a constant. Whether this timer re-fires after the warm-up sets
`locStartBinding: true` cannot be read from source; see §5 Q1. The panel content belongs to 08.

### 2.4 Hidden "code" buttons run as subroutines

| Button (line) | Called by | Computes |
|---|---|---|
| `btn_Capex_Cost_Build_StandardContractOptions_Code` (L452) | OnVisible warm path (L286); tab `OnSelect` (L2511); timer at L782 (non-summary arm, unreachable); PCF `AddStandardContractTriggered` (L7412); `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L768) | `colStandardContractOptionsForPCF`, the per-sub-account "Add Standard Contract" menu (FR-46) |
| `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L722) | `Btn_CodeforSettingCostPaidUnpaid` (L7752); delete `OnConfirm` (L8141); the standard-contract subroutine (L18903); and the panel save (08) | Full refresh after any write (FR-45) |
| `btn_…_EqualDistribution_Cost_Calculate_Cluster_Range_Out_Of_LinkedCost` (L788) | The panel's Save path (08) | `colOtherClusterHavingCost` from `colCapexCostDataToPatch` (FR-53) |
| `btn_…_Ind_Distribution_Cost_Calculate_Cluster_Range_Out_Of_LinkedCost` (L839) | The panel's Save path (08) | The same, from `colNewEditPanelCost` (FR-53) |
| `btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1014) | OnVisible (L285); tab `OnSelect` (L2510); the year dropdown, ◀ and ▶ (L2939, L2992, L3058); `AddStandardContractTriggered` (L7411); `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L767); the comments panel (09) | The grid dataset `colFinatCostDataOptimized` (§2.5) |
| `btn_Capex_Cost_Add_Standard_Contract_Code` (L18223) | PCF `AddStandardContractTriggered` (L7402) | Creates one standard contract and its cost rows (§2.9) |
| `Btn_CodeforSettingCostPaidUnpaid` (L7656) | PCF `SetCostPaidUnpaidTriggered` (L7434); the paid popup `OnConfirm` (L19875) | Patches one cost row's `'Cost Paid'` (§2.8) |
| `fn_Numeric_CC` (L19742, a `fn_Numeric` component) | The panel's validation labels (L10942–L17251: `IsInteger`, `InRange`, `IsOneDecimal`) | Numeric predicates (FR-54) |

**`btn_Capex_Cost_Reload_PCF_After_Mutation_Code.OnSelect` (L725–774).** It runs, in order:

1. Shows the spinner.
2. `Refresh('CAPEX Project Contracts')` and `Refresh('CAPEX Costs')`.
3. Re-collects `colCapexProjectContracts`, filtered to the category sub-accounts of
   `colCapexSubaccountsNew` and the project. This is stricter than OnStart's version.
4. Rebuilds `colCapexCosts` with the same N+1 `ForAll` as OnStart.
5. `Select(Refresh)` then `Select(BuildOptions)`.
6. Hides both spinners.

It does **not** rebuild `colDevexCapexSummaryView`. The Summary figures therefore refresh only when
the Summary tab is re-selected (FR-25).

**The two Calculate_Cluster_Range buttons (L788, L839).**

- The **equal** variant iterates **all** `gblClusterDurations`. The filter on the selected cluster
  is commented out at L797–800. It keeps every cluster for which some row of
  `colCapexCostDataToPatch` falls inside `[StartYear/StartMonth, EndYear/EndMonth]`, **inclusive**.
- The **individual** variant excludes the selected `Link_to_Cluster` order. It keeps a cluster
  when any `…Save` month greater than 0 in `colNewEditPanelCost` falls in `[Date(sy,sm,1),
  Date(ey,em,1))`, which is **half-open**.
- Both feed the Save-time relink dialog (08).

**`fn_Numeric_CC` (L19742).**

- `IsInteger(c)` is `IsNumeric(c) && Not(IsMatch(c, "[.,]", Contains))`.
- `InRange(c, min, max)` is `IsNumeric(c) && Value(c) >= min && Value(c) <= max`.
- `IsOneDecimal` is language-aware (`Components/fn_Numeric.pa.yaml` L84–121).

### 2.5 `btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1014–2299), step by step

| Step | Lines | Collection | What it computes |
|---|---|---|---|
| 0 | L1018 | — | Spinner on. |
| 1a | L1021–1031 | `colCapexAccountsInSelectedCategoryNew` | `colCapexAccountsNew` whose parent is the selected category, sorted by `vsb_order`. |
| 1b | L1032–1042 | `colCapexSubaccountsInSelectedCategoryNew` | Sub-accounts of those accounts, sorted by `vsb_order`. |
| 1c | L1043–1049 | `colCapexContractsInSelectedCategory` | `colCapexProjectContracts` whose `Account` is one of **those sub-accounts**. A contract filed on a level-2 account is never included. |
| 1d | L1050–1056 | `colCapexCostsInSelectedContracts` | `colCapexCosts` for those contracts, **all years**. |
| 1e | L1058–1064 | `colCapexCommentsInSelectedContracts` | Live `'Capex Comments'` where `'Capex Contract'` is in the category's contracts, or `'Capex Cost'` is in their costs. |
| 1f | L1067–1190 | `colCapexCommentsLatest` | One row per root comment: `{CommentId, ContractId: Coalesce(comment.contract, cost.contract), CommentTypeText, CostYear, CostMonthIndex (a 36-arm Switch over choice text / lower-case name / "1".."12"), IsResolved, LastActivityOn: Coalesce(latest reply.'Created On', root.'Created On'), LatestText}`. |
| 2 | L1193–1339 | `colCapexContractCostGrouped_V1` | One row per category contract. See the first block below. |
| 3 | L1341–1399 | `colAllGroupedAccounts` | For each account, the account row followed by its sub-account rows. Fields are `vsb_capexaccountlistid, vsb_name, vsb_number, IsAccount, IsContract:false, vsb_parentaccountid, vsb_statusbool, vsb_AccountCategory`, with `SubLabel`, `CostPaidBy` and `DistributionType` left blank. |
| 4 | L1401–1420 | `colFinatCostDataOptimizedTemp` | Each account or sub-account row, followed by `SortByColumns(contracts whose vsb_parentaccountid = row id, "vsb_costdescription", Ascending)`. The sort key is the contract's **`Name`**. Contracts therefore attach only under sub-account rows. |
| 5 | L1423–1529 | `colFlatCostsMapped` | The **selected year's** costs (`IfError(Value(Text(Year)), -1) = Value(gblSelectedProjectYear)`), each as `{ContractId, SubaccountId, AccountId, MonthIndex1 (the same 36-arm Switch), CostAmount, IsPaid}`. |
| 5b | L1530–1568 | `colContractTotalsForPCF` | Per contract. See the second block below. |
| 6 | L1570–2295 | `colFinatCostDataOptimized` | The PCF dataset. See the third block below. |
| 7 | L2296 | — | Spinner off. |

**Step 2 — the contract rows (L1193–1339).**

- `vsb_costdescription: CPC.Name`, which is **Name**, not Description.
- `vsb_parentaccountid` is the sub-account.
- `IsContract: true`.
- `vsb_capexaccountlistid` is the contract id.
- `vsb_year` is the selected year.
- `vsb_statusbool` reflects the account's status.
- `CostPaidBy` is "DevCo" or "SPV", else `Text('Cost Type')`. **No sub-account mapping fallback.**
- `DistributionType` is `Text(Distribution)`.
- `IsStandardContract` is "true" / "false".
- `SubLabel` is `"[" & CostPaidBy & "]"`, then `" Link to Cluster N"`, then the equal-distribution
  half. The separator is conditional, and the `" " & Text(Distribution)` segment is commented out
  (L1235–1238).

**Step 5b — the contract totals (L1530–1568).**

```powerfx
varTotalCost: Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C), Cost), 0),
varPaidCost:  Coalesce(Sum(Filter('CAPEX Costs', Contract = C && 'Cost Paid' = 'Cost Paid (CAPEX Costs)'.Yes), Cost), 0)
→ {ContractId, SubaccountId, AccountId, TotalCostAmount: varTotalCost,
   PlannedCostAmount: varTotalCost - varPaidCost, ActualCostAmount: varPaidCost}
```

This reads `'CAPEX Costs'` **live**, twice per contract, and all years. 12 and 13 own the cost of
that.

**Step 6 — the PCF dataset (L1570–2295).** For every row `R`, a row matches money in
`colFlatCostsMapped` when one of these holds:

- `R.IsAccount && F.AccountId = R.id`;
- `R.IsContract && F.ContractId = R.id`;
- the row is a sub-account and `F.SubaccountId = R.id`.

Each row gets these columns:

- `M1…M12` is the sum of the matching `CostAmount` for that month, `Coalesce`d to 0.
- `Month1Paid…Month12Paid` and the duplicates `M1Paid…M12Paid` are `R.IsContract` and there is a
  paid cost in that month.
- `RowId`, `ParentId`, `Type` ("account" / "contract" / "subaccount"), `Number`, and
  `Name: Coalesce(vsb_name, vsb_costdescription, "")`.
- `HasComments` and `CommentTooltip` come from unresolved **General Comment** threads, with the
  latest by `LastActivityOn`.
- `M{n}HasComments` and `M{n}CommentTooltip` come from unresolved **Comments to payment date**
  threads whose `CostYear` is the selected year and `CostMonthIndex = n`.
- `IsStandard`, `StandardCost` and `StandardContract` (three aliases), `CostPaidByText` and
  `Distribution`.
- `TotalCost`, `PlannedCost` and `ActualCost` are the sums of `colContractTotalsForPCF` over the
  same matching rule.

The two `Coalesce(M1,0)+…+M12` alternatives for Planned and Actual are commented out (L2274–2277,
L2290–2293).

### 2.6 Category tabs and year

**`tab_Costs_ContentAssignableAccountCategories` (L2431).**

- `Items: =SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name="Overleveraging")), "vsb_order")`.
  The Summary row sorts first on `Order: 0`.
- `Default: =locSelectedCapexAccountCategory`, and `ItemDisplayText: =ThisItem.Name`.
- `OnSelect` (L2440–2513):
  1. Clears both `locStartCategoryBinding*` flags.
  2. Sets `locSelectedAccount: Blank()`, `locSelectedCapexAccountCategory: Self.Selected`, spinner
     on, `locSelectedCostRow: Blank()` and `locShowInActive: false`.
  3. **Summary tab** (blank `'CAPEX Account List'`): clears the four per-category collections, then
     rebuilds `colCapexSummaryCategories` and `colDevexCapexSummaryView` from the cached
     `colCapexCosts`. That makes the Summary all-years and sub-account contracts only, floored at 0.
     The spinner then goes off.
  4. **Real tab:** `Select(Refresh)`, `Select(BuildOptions)`, then the spinner goes off.

**Year controls**, which are children of `con_Costs_ProjectCosts_TableCommandBar_Toggles`:

- **`drp_Costs_ProjectCostbtn_ShowSelectedYear`** (L2921).
  - `Items: =SortByColumns(colProjectPeriods, "Year")`.
  - `Default: =LookUp(…, Year = gblSelectedProjectYear)`.
  - `OnChange` runs only when `!IsBlank(Self.Selected.Year)`: spinner on,
    `Set(gblSelectedProjectYear, Value(Self.Selected.Year))`, `locSelectedCostRow: Blank()`,
    `Select(Refresh)`, spinner off.
  - Changing the year does **not** rebuild the standard options.
- **`btn_Costs_ProjectCostbtn_ShowPreviousYear`** (L2946).
  - `DisplayMode` is `If(gblSelectedProjectYear > Coalesce(locCostAllowedStartYear, Min(colProjectPeriods, Year), Year(Today())), Edit, Disabled)`.
  - `OnSelect` sets `Max(year - 1, <same floor>)`, then runs Refresh.
- **`btn_Costs_ProjectCostbtn_ShowNextYear`** (L2998).
  - `DisplayMode` is `If(gblSelectedProjectYear < locNavigationMaxYear, Edit, Disabled)`.
  - The live `OnSelect` (L3055–3059) is `Set(gblSelectedProjectYear, Min(year + 1, locNavigationMaxYear))`,
    followed by Refresh.
  - The block that extended `colProjectPeriods` by one year is commented out (L3009–3051) and is
    not live.

**The default year.** It is OnStart's seed (§2.1), clamped into the window by OnVisible step 7.
That gives this year, or a future acquisition / start year, moved into the project's window.
**D50 / CA-6.**

### 2.7 The grid region `con_Costs_ContentCostsInMonths` (L2517–7768)

**Container gate.** `Visible: =Not(IsBlank(tab_Costs_ContentAssignableAccountCategories.Selected.'CAPEX Account List'))`
(L2536). The grid shows on a real category and never on the Summary.

**Live children:**

1. **The toolbar** (L2539–3063).
   - `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable` (L2558).
   - `tgl_Costs_ProjectCostbtn_ShowEmptyAccounts` (L2886), `Checked: =true`.
   - `tgl_Costs_ProjectCostbtn_ShowPlannedPaid` (L2896), unchecked by default.
   - `drp_Costs_ProjectCostbtn_ShowCostPaidBy` (L2905): `["Show All Cost","DevCo","SPV"]`, defaulting to the first.
   - The three year controls.
2. **`DevexCapexSummaryPCF`** (L7234).
3. **`Btn_CodeforSettingCostPaidUnpaid`** (L7656), hidden, run as a subroutine.

**Dormant children.** Each of these is hidden by a `Visible` that is `false` or only a comment:

| Control | Line | Live `Visible` |
|---|---|---|
| `tgl_…ShowInactiveAccounts` | L2858 | `//true` then `false` |
| `tgl_…FiscalYear` | L2871 | `//true` then `false` |
| `tgl_…ProjectTimeline` | L2882 | `false` |
| `con_Costs_ProjectCosts_TableCommandBar` | L3080 | `false`. It carries `cmd_Costs_ProjectCosts_TableCommandBar` with `DataSourceInfo` permission gates (L3161–3205), none of which are live. |
| `con_Costs_ProjectCosts_GalleryNavigation` | L3595 | `false` |
| `con_Costs_ProjectCosts_TableHeader` | L3730 | `=//true` |
| `gal_Costs_ProjectCosts` | L4323 | `=//true` |
| `con_Costs_ProjectCostsMonthSummary` | L6311 | `=//true` |

A formula that is only a comment evaluates blank, so those controls do not render. That is
inferred, and it agrees with `gap-analysis/cost-capex-costs.md` §0.

The legacy gallery's month labels (for example `lbl_Costs_label_139.Text`, L4508–4605) and its
Grand Total band (`lbl_Costs_label_163.Text`, L6409–6436) compute fiscal-year-aware sums from
`colCapexCostsInSelectedContracts`. They are documented here only so that nobody ports them.

**PCF inputs** (L7238–7277, L7651–7655). The property list is in the manifest, L62–105.

| Input | Canvas formula | Meaning |
|---|---|---|
| `Items` | `=colFinatCostDataOptimized` | The grid dataset (§2.5) |
| `StandardContractOptions_Items` | `=colStandardContractOptionsForPCF` | Per-sub-account standard menu |
| `StartYear` | `=gblSelectedProjectYear` | The 12 month columns' year |
| `ShowEmptyAccounts` | `=tgl_…ShowEmptyAccounts.Checked` | Hide empty accounts and sub-accounts |
| `ShowPlannedCost` | `=tgl_…ShowPlannedPaid.Checked` | Show the Planned and Actual columns |
| `CostPaidByFilter` | `=Coalesce(drp_…ShowCostPaidBy.Selected.Value, "Show All Cost")` | DevCo / SPV filter |
| `Cluster1Date` … `Cluster6Date` | `=Date(Coalesce(LookUp(gblClusterDurations, Order = n, StartYear), locNavigationMinYear, gblSelectedProjectYear), Coalesce(…StartMonth, 1), 1)` | The cluster-band start dates. A missing milestone falls back to **January of the navigation minimum**; it is never blank. |
| `CollapseResetKey` | `=locSelectedCapexAccountCategory.'CAPEX Account List' & "|" & Text(locScreenVisitStamp)` | Collapses every node on a tab switch or a screen visit (Bug 13472) |

**PCF outputs and the `OnChange` dispatch** (L7278–7650). The outputs are `AddTriggered`,
`EditTriggered`, `AddStandardContractTriggered`, `DeleteTriggered`, `SetCostPaidUnpaidTriggered`,
`CommentTriggered`, `SelectedRecordId`, `SelectedStandardContractId`, `SelectedCostContractId`,
`SelectedCostYear`, `SelectedCostMonth` and `SelectedCostPaid`.

There is **no "expand" or "cluster-link" event**. Expand and collapse are internal to the PCF, and
the reset arrives through `CollapseResetKey`. Cluster linking reaches the grid only through the
paid toggle (§2.8).

`OnChange` is a sequence of independent `If`s, not a `Switch`:

```text
0. UpdateContext({locSelectedCostRow: LookUp(colFinatCostDataOptimized, vsb_capexaccountlistid = GUID(Self.SelectedRecordId)),
                  locMilestoneRelinkResetNeeded:false, locClusterLinkageChanged:false, locCostPaidByChanged:false})
1. If(Self.AddTriggered, …)                    L7295-7322
2. If(Self.EditTriggered, …)                   L7323-7359
3. If(Self.AddStandardContractTriggered, …)    L7360-7417
4. If(Self.DeleteTriggered, …)                 L7418-7421   (repeated, identically, at L7438-7441)
5. If(Self.SetCostPaidUnpaidTriggered, …)      L7422-7437   (repeated at L7442-7456, without the else arm)
6. If(Self.CommentTriggered, …)                L7457-7650
```

1. **Add** (from a sub-account row's "Add New Cost").
   - Clears the relink flags.
   - Sets `locContinueToSavelinkedCluster: true` and `locInitialCostPaidBy: Coalesce(locSelectedProjectContract.'Cost Type', LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)' = row).'DevCo/SPV')`.
     Note that `locSelectedProjectContract` is still the **previously** edited contract here.
   - Opens the panel: `locIsVisibleRightPanelAddContract: true`, `locWarmupMode: "addContract"`,
     `locWarmupKick: true`.
2. **Edit** (from a contract row).
   - Opens the panel.
   - `locTempContract` is a lookup in `colCapexProjectContracts`, which sets `locInitialCostPaidBy`,
     `locSelectedProjectContract`, `locSelectedContractDescription`, `locWarmupMode: "edit"`,
     `locWarmupKick: true` and `locAllYearsCost: 'Total Cost'`.
3. **Add Standard Contract**: see §2.9.
4. **Delete** sets `locIsVisibleSubaccountCostsDeletionDialog: true`; see §2.10.
5. **Paid / unpaid**: see §2.8.
6. **Comment** loads the contract's comments, numbers the threads and opens the comments panel.
   That belongs to 09.

**Gates.** The live grid has **no `DisplayMode`, permission, Draft or lock gate of its own**. The
PCF exposes no such input, and the only `DataSourceInfo` checks sit in the hidden command bar
(L3161–3205). The live gates are visibility gates:

| Control | Line | Live `Visible` | Business meaning |
|---|---|---|---|
| `con_Costs_Body` | L2356 | `gblAppStarted` | Hide the body until OnStart finishes |
| `con_Costs_BodyRightSide` | L2412 | `Not(IsBlank(gblSelectedProject))` | No project, no content |
| the grid region | L2536 | see above | Real category only |
| `con_Costs_ContentCostsSummary` | L7783 | `IsBlank(tab.Selected.'CAPEX Account List')` | Summary tab only |

The PCF's own month menu adds one functional gate: an equal-distribution contract's month cells
offer neither paid nor comments. That is `GridRenderer.js` L1266–1279, and 14 owns it.

### 2.8 Paid / unpaid and cluster linking

**`SetCostPaidUnpaidTriggered`** (L7422–7437):

```powerfx
With({varPCFSelectedContract: LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(Self.SelectedCostContractId))},
  If(varPCFSelectedContract.Distribution = 'Distribution Type'.'Individual Distribution'
       && Not(IsBlank(varPCFSelectedContract.'Linked Cluster')),
     UpdateContext({locIsVisibleSetPaidCost: true}),     // ask first
     Select(Btn_CodeforSettingCostPaidUnpaid)))          // write straight away
```

This is a live Dataverse lookup. The copy at L7442–7456 shows the popup again for the same
condition and has no else arm, so it is harmless.

**`Btn_CodeforSettingCostPaidUnpaid.OnSelect`** (L7661–7767) runs these steps:

1. Shows the popup spinner with `"Please wait, saving..."`.
2. Looks up the cost row **live**, as
   `LookUp(Filter('CAPEX Costs', Contract = GUID(SelectedCostContractId)), Year = Value(SelectedCostYear) && Month = <choice for SelectedCostMonth>)`.
3. If nothing is found, it shows
   `Notify("No monthly cost row found for selected contract/month/year.", Warning)`.
4. Otherwise it runs
   `IfError(Patch('CAPEX Costs', row, {'Cost Paid': DevexCapexSummaryPCF.SelectedCostPaid}); Refresh('CAPEX Costs'); Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code), Notify("Could not update paid status. Please refresh and try again.", Error))`.
5. Hides the spinner.

**`cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation`** (L19864):

- `Title` is "Cluster-linked Costs".
- `Description` (L19869) says "milestone-linked" and "milestone link". This is a canvas
  inconsistency.
- `OnCancel` hides the popup.
- `OnConfirm` (L19875):

```powerfx
UpdateContext({locIsVisibleSetPaidCost: false, locIsVisiblePopUpSpinner: true, locSpinnerInformationText: "Please wait..."});
With({varGetContract: LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(DevexCapexSummaryPCF.SelectedCostContractId))},
     Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()}));
Select(Btn_CodeforSettingCostPaidUnpaid);
true
```

**That is the grid's only cluster-linking write.** Confirming a paid toggle on a cluster-linked,
individually distributed contract **removes the contract's `Linked Cluster`**, and then sets the
month paid.

The other cluster-link machinery lives in the panel's Save path, and 08 owns it:

- `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (L19884), whose `OnConfirm` is
  `UpdateIf('CAPEX Costs', … 'Cost Paid' = true, {'Cost Paid': false})` and then re-`Select`s Save;
- the two Calculate_Cluster_Range buttons;
- the dead `cmp_PopUp_Confirmation_1` (L303, with `Visible` `//…` then `false`).

### 2.9 Add Standard Contract (`AddStandardContractTriggered` and `btn_Capex_Cost_Add_Standard_Contract_Code`)

**The event** (L7360–7417):

1. `Clear(colOtherClusterHavingCost)`.
2. `varSelectedRow` is a lookup by `RowId` or the id.
3. If the row is blank, it runs
   `Notify("Please select a valid subaccount before adding a standard contract.", Warning)`.
4. If a **live**
   `LookUp('CAPEX Project Contracts', Project && Account = row && 'Capex Standard Assumption Contract' = varSelectedStandardGuid)`
   exists, it runs
   `Notify("This standard contract is already created for this project and subaccount.", Information)`
   and removes the option from `colStandardContractOptionsForPCF`.
5. Otherwise it sets `locSelectedCostRow` and `locGUIDforLoadingStandardContract`, and runs
   `Select(btn_Capex_Cost_Add_Standard_Contract_Code)`.
6. Then, if `!IsBlank(locSelectedProjectContract)`, it removes the option, runs
   `Refresh('CAPEX Project Contracts')` and `Refresh('CAPEX Costs')`, then
   `Select(Refresh)` and `Select(BuildOptions)`.

**The subroutine** (L18227–18923):

1. **Amount** (L18228–18282). The spinner text is
   `$"Please wait, loading standard contract : '{Description}' ..."`.
   `locTotalCostToDistribute = Switch(Unit, EUR|PLN → Value('Cost Amount'), EUR/WTG|PLN/WTG → Round(activeWTGs * amount, 0), EUR/MW(p)|PLN/MW(p) → Round('Total Capacity' * amount, 0))`.
   The `Switch` has **no default arm**. `activeWTGs` is the sum of `'Number of Generators'` over
   active `GeneratorTypeInProjects` rows.
2. **Cluster dates** (L18283–18520).
   - `varStartReferenceDate` is the milestone of the start cluster, coalesced to `'Acquisition
     date'`. For Greenfield it is `'Project Start Date'`, coalesced the same way.
   - `varMilestoneDurations` is
     `LookUp('Milestones Standard Assumptions', Name = "average duration [months]" && Country && Technology)`.
   - `varC1Date … varC4Date` are back-computed with `DateAdd(ref, -Σ durations, Months)` when the
     project started later than that cluster. FID is folded into the 4→5 step.
   - **`varC5Date` and `varC6Date` are never synthesised.** The canvas comments say "Use actual
     project value only", L18506–18519.
3. **`colStandardCostAllSelectedClusters`** (L18521–18598). This holds the clusters ticked on the
   assumption that have a non-blank, non-inverted window, where `End = (first of next cluster's
   month) - 1 day`.
4. **`colEligibleStandardCostClusters`** (L18599–18605). This is the subset with
   `varApplicableStartCostClusterNo = 0 || Cluster >= varApplicableStartCostClusterNo`, where the
   start cluster is **floored at 5** (L18289–18299).
5. **No eligible cluster** (L18609–18635). It resets the state, clears the collections and runs
   `Notify("Standard cost was not created because no applicable cost period was found for the project's Start Cluster.", Information)`.
6. **Otherwise, the contract `Patch`** (L18636–18703). It patches a new contract, or the existing
   one when the selected row is already a contract, with these fields:
   - `Account` (the assumption's sub-account);
   - `Name` and `Description` (both the assumption's `Description`);
   - `Distribution: 'Equal Distribution'`;
   - `Project`;
   - `'Total Cost': locTotalCostToDistribute`;
   - `'Apply VAT?'` and `'Depreciation?'`, mapped from the assumption;
   - `'Cost Type': 'Cost Paid By'`;
   - `'Distribution Frequency'`;
   - `'Owning Business Unit'`;
   - **`'Initial Contract Source': Coalesce(…, Powerapps)`**;
   - `'By Cluster JSON'`, from the **eligible** clusters;
   - `'Is Standard Contract?': Ja`;
   - `'Capex Standard Assumption Contract'`.
7. **Payments** (L18704–18757). The schedule covers **every selected cluster**
   (`locClustersForFullDistribution: colStandardCostAllSelectedClusters`, which is not just the
   eligible ones). For each cluster, `numPayments = RoundDown(((ey-sy)*12 + (em-sm)) / freq, 0) + 1`,
   with `Year` / `Month` stepping by `freq`. The result is `Distinct`-ed on the whole record,
   including `Cluster`.
8. **Roll-back** (L18758–18796). If no payment falls in an eligible cluster, it runs
   `Remove('CAPEX Project Contracts', locSelectedProjectContract)` and the same Notify.
9. **Money** (L18797–18901).
   - `avgPay = RoundDown(total / CountRows(all payments), 0)`.
   - `lastPay` is the total minus `avgPay * (n - 1)`, and is placed on the last payment by
     Year and Month.
   - `colCapexCostDataToPatch` keeps **only the eligible clusters' rows**.
   - Then `Patch('CAPEX Costs', ForAll(…, {Contract, Name: Contract.Name, Year, Month, Cost, 'Owning Business Unit', 'Capex Contract Standard Assumption': locStandardContractAssumption}))`.
   - Then `Patch(contract, {'Average Payment': Value(avgPay), 'Total Cost': Sum(colCapexCostDataToPatch, Cost)})`.
   - For an acquired project, the stored total is therefore **only the eligible clusters' share**
     of the assumption amount, because the money for non-eligible clusters is computed and then
     dropped.
10. **Clean-up** (L18903–18922). `Select(Reload)`, reset the state, clear the collections.

**The option list, `btn_Capex_Cost_Build_StandardContractOptions_Code`** (L455–718):

1. Runs `Refresh('CAPEX Project Contracts')`.
2. Filters `'Devex/Capex Standard Assumptions'` on four conditions:
   - the sub-account is one of the category's sub-accounts;
   - the country matches;
   - `Lower(Text(Technology))` matches;
   - the assumption is not already used. That check reads **`colCapexProjectContracts`** (the
     cache), because the live-table version is commented out at L478–485.
3. For each assumption, computes `varEligibleClusterCount`. That counts the clusters ticked on the
   assumption whose **raw `gblClusterDurations`** dates are non-blank and non-inverted, under
   `Coalesce(locProjectStartClusterNo,0) = 0 || Cluster >= locProjectStartClusterNo`. Here there
   is **no floor at 5**, unlike the subroutine.
4. Emits
   `{StandardContractId, SubaccountId, Name: Coalesce(vsb_description, vsb_descriptioninput, "Standard Contract " & autoid), AutoId, ShowOption: count > 0}`.
5. Keeps the rows where `ShowOption` holds and sorts them by `AutoId` ascending.

### 2.10 Deletion

`DeleteTriggered` makes `cmp_PopUp_SubaccountCostsDeletion_Confirmation` visible (L8088).

- **Description.** For a contract row:
  `$"Are you sure you want to delete the costs for "{vsb_costdescription}" of the selected Subaccount "{contract.Account.Name}"?"`.
- **`OnConfirm`** (L8103–8149):
  1. Resets the selection, shows the screen spinner (`locIsVisibleLoadingCostSpinner`, which has no
     text) and hides the dialog.
  2. Runs `IfError(With({locContractToDelete: LookUp(colCapexProjectContracts, …)}, RemoveIf('Capex Comments', 'Capex Contract' = it); Remove('CAPEX Project Contracts', it)), Notify("Error: Costs could not be deleted. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse, Error))`.
  3. Runs `Select(Reload)`.
  4. Clears the selection.
- `RemoveIf('CAPEX Costs', …)` is **commented out** (L8122–8126). The cost rows are left to the
  Dataverse relationship cascade.

There is no separate "sub-account cost deletion" flow. The control's name says sub-account, but it
deletes one contract.

### 2.11 The Summary region (L7769–8024)

| Control | Line | Formula |
|---|---|---|
| `con_Costs_ContentCostsSummary` | L7783 | `Visible: =IsBlank(tab.Selected.'CAPEX Account List')` |
| `gal_Costs_ContentCostsSummary` | L7793 | `Items: =Filter(colDevexCapexSummaryView, Not(Name="Overleveraging"))` |
| `lbl_…_AccountCategory_Name` | L7914 | `Text: =ThisItem.Name` |
| `lbl_…_AccountCategory_Sum` | L7864–7872 | `Text(ThisItem.Sum, "###,###,###,##0") & " " & Coalesce-ish(ISO Currency Code, "EUR")` |
| `lbl_con_…_TotalSummary_Name` | L8005 | `"Total CAPEX"` |
| `lbl_con_…_TotalSummary_Sum` | L7969–7973 | `Text(Max(Sum(gal_Costs_ContentCostsSummary.AllItems, Sum), 0), "###,###,###,##0") & " " & <ISO or "EUR">` |

Where `ThisItem.Sum` comes from:

- It is `Max(Sum(colCapexCosts for contracts under the category's sub-accounts, Cost), 0)`, built by
  OnStart, by the tab `OnSelect` and by the initial-load timer.
- It covers **all years**.
- It is **cost-row based, not `'Total Cost'`**. That is a deliberate difference from the grid's
  `TotalCost`.
- It excludes contracts filed directly on level-2 accounts.

---

## 3. Code app implementation, per requirement

The Status column uses the gap statuses of §4. A **Covered** row has no gap row of its own beyond
the grouped covered rows (GAP-FN-C1…C9).

### 3.1 Load sequence, tabs and year

| FR | Requirement (canvas) | Code | Tests | Status |
|---|---|---|---|---|
| FR-01 | OnVisible resets about 20 context variables (L15–38) | Component state initialisers, `Screen.tsx:220-268`; panels and dialogs start closed | — | Covered |
| FR-02 | Project from `Param("projectId")`, else a hard-coded GUID (L40–56) | `useSession()` `Screen.tsx:198`; there is no fallback (01 owns this; A-2) | — | Covered (A-2 deliberately not reproduced) |
| FR-03 | `locProjectStartClusterNo` switch (L58–82) | `project.startClusterNo ?? 0`, `Screen.tsx:203` | — | Covered |
| FR-04 | Cost-allowed start year and date, with the `>1900` guard (L84–124) | `clusters.ts:108-118` `costAllowedStart`; `Screen.tsx:219` | UT-CLU-008…012 | Covered |
| FR-05 | Navigation min and max (L126–205) | `clusters.ts:127-153` `navigationWindow`; `Screen.tsx:223` | UT-CLU-013…016 | Covered (the code drops clusters with missing dates, `clusters.ts:56-77`, where the canvas keeps the rows but filters `>1900` — the same min and max) |
| FR-06 | `colProjectPeriods` (L207–236) | `clusters.ts:318-321` `projectPeriods`; the dropdown at `Screen.tsx:736-738` | UT-CLU-019, UT-CLU-020 | Covered |
| FR-07 | Default year: OnStart seed, then the OnVisible clamp (App L205; L238–257) | `panelRules.ts:171-180` `onStartSelectedYear`; `panelRules.ts:139-156` `defaultSelectedYear`; `Screen.tsx:222-235` | `panelRules.test.ts` "defaultSelectedYear" and "onStartSelectedYear" blocks (**no UT ids**); `Screen.test.tsx:211` | Covered — D50 / CA-6 |
| FR-08 | Initial tab: first real category on the warm path, Summary on the cold path (L259–280; L782) | `resolveCategory(search.get("category"), n)`, `rules.ts:92-100`, `Screen.tsx:182`. No `?category` means Summary. | UT-CAPEXR-002, -003, -097 | GAP-FN-16 |
| FR-09 | The build gate and its spinner (L282–301) | `Screen.tsx:301-305`: `LoadingOverlay` while loading, `EmptyState "Cost data is unavailable"` on error | — | Covered |
| FR-10 | `tmr_Capex_Initial_Load` polling (L778–787) | TanStack Query (`useCostBook`, `useCostBook.ts:54-61`) waits on its own; no timer | — | Covered (not ported by design) |
| FR-24 | Tabs: `Items` sorted by `vsb_order` with Overleveraging excluded; `OnSelect` resets the selection (L2431–2513) | `useCapexCategories` `useCostBook.ts:539-545` → `loadCapexCategories` `costBook.ts:744-765`; `categoryTabs` `rules.ts:81-83`; strip at `Screen.tsx:683-689`; `chooseCategory` `Screen.tsx:321-325`; the grid remounts per tab (`key={category}`, `Screen.tsx:744`) | UT-CAPEXR-001, -095, -096; UT-BOOK-047…049; UT-CAPEXS-003, -004 | GAP-FN-18 (accounts still indexed on `CATEGORIES`) |
| FR-27 | Year dropdown `OnChange` (L2921–2945) | `Screen.tsx:732-739` `setYear` | `Screen.test.tsx:195-210` (no UT ids) | Covered |
| FR-28 | ◀ floor `Coalesce(locCostAllowedStartYear, Min(periods), Today)` (L2946–2997) | `panelRules.ts:193-204` `previousYearFloor`; `clusters.ts:314` `canGoPreviousYear`; `Screen.tsx:728-731` | `panelRules.test.ts` "previousYearFloor" (no ids); UT-CLU-018; `Screen.test.tsx:220` | Covered, except GAP-FN-17 |
| FR-29 | ▶ is `Min(year+1, max)`; the extension block is commented out (L2998–3063) | `clusters.ts:315` `canGoNextYear`; `Screen.tsx:740-742` | UT-CLU-018 | Covered |
| FR-57 | The SwitchTabs timers are dormant (L18928–19135) | Not ported | — | Covered (correctly not ported) |

### 3.2 Grid data (the Refresh subroutine)

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-11 | Category scoping: accounts → sub-accounts → contracts → costs (L1021–1056) | `useCostBook(category)` → `loadCostBook` `costBook.ts:1181-1195` → `loadCostAccounts` (`:767-822`), `loadCostLines` (`:1013-1115`, server `$filter` on project and account ids), `loadPayments` (`:1130-1166`); `accountsInCategory` `rules.ts:317-320` | UT-CAPEXR-032; UT-BOOK-001…007 | Covered — stricter than the canvas (rule 2); see GAP-FN-12 and GAP-FN-13 |
| FR-12 | Comments for the category, flattened to the latest per thread (L1058–1190) | `useCapexComments(contractIds)` `useCostBook.ts:581-588`; `commentThreads` `comments.ts:268`; `commentCosts` `comments.ts:568`; `gridCommentIndicators` `comments.ts:339`; wired at `Screen.tsx:294-299` | UT-GRID-008b…008f; comments tests (09) | Covered |
| FR-13 | Contract row fields and `SubLabel` (L1193–1339) | `gridRows.ts:198-224`; `contractSubLabel` `rules.ts:764-787` | UT-CAPEXR-082…094; UT-GRID-008, -019, -020 | Covered, except the label source (GAP-FN-11) and the payer tag (GAP-FN-24) |
| FR-14 | Account and sub-account rows (L1341–1399) | `gridRows.ts:171-190` | UT-GRID-001 | Covered |
| FR-15 | Contracts under their sub-account, sorted by `vsb_costdescription` (= Name) (L1401–1420) | `sortedByDescription` `gridRows.ts:110-112` (sorts on `CostLine.description`) | UT-GRID-018 | GAP-FN-11 |
| FR-16 | Selected-year month mapping (L1423–1529) | `aggregateLine` `gridRows.ts:72-88`; the month comes from `numberOf(vsb_month)`, `costBook.ts:1156` | UT-GRID-005, -009 | Covered |
| FR-17 | `TotalCost = Coalesce('Total Cost', Sum(costs), 0)`; Actual = paid; Planned = Total − paid (L1530–1568, L2251–2289) | `aggregateLine` `gridRows.ts:86`; `money` `gridRows.ts:115-125` | UT-GRID-004, -012…-017 | Covered |
| FR-18 | `M1…M12` roll-up to sub-account and account (L1576–1706) | `addInto` / `ownAggregate` `gridRows.ts:90-96`, `:162-181` | UT-GRID-002, -007 | Covered, except GAP-FN-12 |
| FR-19 | `MxPaid` / `MonthxPaid` on contract rows (L1707–1790, L2141–2224) | `paidMonths` → `M{n}Paid`, `gridRows.ts:216-217` (no `Month{n}Paid` alias, which the vendored parser does not need) | UT-GRID-006 | Covered |
| FR-20 | `HasComments`, `CommentTooltip` and the per-month equivalents (L1816–2140) | `gridRows.ts:212-223` | UT-GRID-008b…008f | Covered |
| FR-21 | `RowId`, `ParentId`, `Type`, `Number`, `Name` (L1791–1815) | `gridRows.ts:183-190`, `:198-203` | UT-GRID-001 | Covered |
| FR-22 | `IsStandard*` aliases, `CostPaidByText`, `Distribution` (L2225–2249) | `IsStandardContract`, `CostPaidBy`, `DistributionType`, `gridRows.ts:207-211`; `DatasetParser.js:195-243` accepts either name | UT-GRID-008 | Covered |
| FR-23 | Totals read `'CAPEX Costs'` live per contract (L1536–1556) | Computed from the already-loaded payments, `gridRows.ts:75-86` | UT-GRID-010, -011 | Covered (perf: see 12 and 13) |

### 3.3 Toolbar and PCF

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-30 | Show Empty Accounts, default checked (L2886) | `showEmpty` `useState(true)`, `Screen.tsx:240`, `:716-718` → `ShowEmptyAccounts` (`PcfGrid.tsx:78`) | — | Covered |
| FR-31 | Show Total Planned/Paid, default unchecked (L2896) | `Screen.tsx:241`, `:719-721` → `ShowPlannedCost` | — | Covered |
| FR-32 | Cost-paid-by filter (L2905) | `PAYER_FILTERS` `rules.ts:62`; `Screen.tsx:722-727` → `CostPaidByFilter` | `Screen.test.tsx:204` | Covered |
| FR-33 | Add Cost from Table navigation, with year bounds `locCostAllowedStartYear … COD+3` or 2050 (L2568–2809) | `Screen.tsx:711-715` navigates with `category`; the target screen rebuilds the bounds (`add-costs-from-table/rules.ts:107-113`) | UT-ADDCOST-002, -003 | Covered |
| FR-34 | PCF inputs (L7238–7277, L7651–7655) | `PcfGrid.tsx:58-85`: dataset, standard dataset, `StartYear`, toggles, payer, `Cluster{n}Date`. `CollapseResetKey` is not passed; collapse is reset by remount (`key={category}`, `Screen.tsx:744`, and route unmount) | — | Covered, except GAP-FN-14 |
| FR-35 | `OnChange` preamble: select the row and reset three flags (L7279–7294) | `onAction` `Screen.tsx:423-452`; the flags are derived, not latched (`Screen.tsx:533-544`) | — | Covered |
| FR-36 | `AddTriggered` → open the Add panel (L7295–7322) | `onAction("Add")` → `open(id)` `Screen.tsx:327-343` | `Screen.test.tsx:229-327` (no ids) | Covered (panel: 08) |
| FR-37 | `EditTriggered` → open the Edit panel (L7323–7359) | `Screen.tsx:427-431` | `Screen.test.tsx:703-734` | Covered (panel: 08) |
| FR-41 | `CommentTriggered` → comments panel (L7457–7650) | `setCommentFor`, `Screen.tsx:433`, `:953-961` | 09 | Covered (09) |
| FR-58 | Gates: no live permission, Draft or lock gate; visibility gates only (L2356, L2412, L2536, L7783) | `Screen.tsx:301-305`, `:691`, `:709`; none in the grid; PCF month-menu gate `GridRenderer.js:1266-1279` | — | Covered (D1 for permissions) |
| FR-59 | The legacy gallery, headers, month summary, command bar and gallery navigation are dormant (L2858–6440, L3080, L3595) | Not ported | — | Covered (correctly not ported) |

### 3.4 Paid / unpaid and cluster linking

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-40 | Confirm first only for Individual distribution with a `Linked Cluster` (L7422–7437) | `paidToggleNeedsConfirmation` `rules.ts:839-843`; `Screen.tsx:434-451` | UT-CAPEXR-058 | Covered |
| FR-42 | Resolve the cost row; Notify when it is missing; patch `'Cost Paid'`; reload; Notify on error (L7661–7767) | `resolvePaidTarget` `rules.ts:846-855`; `writes.setPaid` `useCostBook.ts:398-402` → `costRepository.ts:317-322` → `setCostPaid` `capexWrites.ts:53-58` (with `unwrap`); invalidation at `useCostBook.ts:386-396` | UT-CAPEXR-059, -060 | Covered, except GAP-FN-07 and GAP-FN-09 |
| FR-43 | Paid popup `OnConfirm`: **clear `'Linked Cluster'`**, then set paid (L19875) | `Screen.tsx:1033-1035` calls `writes.setPaid` only | `Screen.test.tsx:882` (dimensions only, UT-CAPEXS-007); copy in `panelRules.test.ts:234-276` | **GAP-FN-01** |

### 3.5 Delete

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-39 | `DeleteTriggered` → dialog (L7418–7421) | `setDeleting(id)` `Screen.tsx:432`; `ConfirmDialog` `Screen.tsx:977-987`; `MSG` and `deleteContractDescription` `panelRules.ts:454-497` | UT-CAPEXS-002, -008 | Covered |
| FR-44 | `OnConfirm`: delete the comments, then the contract; cascade the costs; Notify on error; reload (L8103–8149) | `writes.deleteLine` `useCostBook.ts:418-421` → `deleteCostLine` `capexWrites.ts:329-343`: comments, then each cost row, then the contract, all through `deleteRecord` (rule 14); `planDeleteContract` `rules.ts:1220-1228` | UT-CAPEXW-001…003; UT-BOOK-039…041; UT-CAPEXR-061 (first of two) | GAP-FN-10 (marked), GAP-FN-08 |

### 3.6 Standard contracts

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-38 | Click-time checks: subaccount selected, not already created (live lookup) (L7360–7417) | `checkStandardContractClick` `standardContracts.ts:139-153`, checked against the computed option list; `Screen.tsx:388-395` (`globalThis.alert`) | UT-STD-022…024 | GAP-FN-05, GAP-FN-06 |
| FR-46 | Option list: category, country, technology, not used, and at least one eligible cluster on the **raw** durations, **no 5-floor**; name fallback; sorted by `AutoId` (L455–718) | `buildStandardOptions` `standardContracts.ts:108-128` over `synthesiseClusterDates` (`clusters.ts:269-309`) and `eligibleClusters` (`:81-94`, floor at 5); `Screen.tsx:366-386`; loader `data/standardContracts.ts:19-56` | UT-STD-016…020; UT-CLU-021…030 | GAP-FN-03 |
| FR-47 | Amount by unit; `Switch` with no default (L18228–18282) | `standardAssumptionAmount` `standardContracts.ts:45-60`; `loadActiveWtgCount` `data/standardContracts.ts:59-69`; `totalCapacity` from the session | UT-STD-001…006 | Covered, except GAP-FN-22 |
| FR-48 | Back-computed cluster dates, with C5 and C6 never synthesised (L18283–18520) | `synthesiseClusterDates` `clusters.ts:269-309`; `useMilestoneDurations` `useCostBook.ts:554-564` → `loadMilestoneDurations` `costBook.ts:912` | UT-CLU-021…030; UT-BOOK-050…053 | Covered |
| FR-49 | Selected and eligible clusters, start cluster floored at 5 (L18521–18608) | `applicableStartCluster` / `eligibleClusters` `standardContracts.ts:71-94` | UT-STD-007…013 | Covered |
| FR-50 | Contract `Patch` fields, including `Initial Contract Source` (L18636–18703) | `newLine` `Screen.tsx:406-414` → `saveCostLine` `capexWrites.ts:107-240`; `vsb_CapexStandardAssumptionContract@odata.bind` on create (`:187-189`); `owningbusinessunit@odata.bind` (`:233-235`) | UT-BOOK-025…031 | GAP-FN-04 |
| FR-51 | Payments over **all** selected clusters, only the eligible rows written, `Total Cost = Σ written`, Average over all (L18704–18901) | `clusterPayments(amt, eligible…)` `rules.ts:198-225`; `Screen.tsx:403-419` | UT-CAPEXR-015, -019, -020, -080, -081 | **GAP-FN-02** |
| FR-52 | No-eligible refusal Notify and contract roll-back (L18609–18635, L18758–18796) | No equivalent path; `standardContractRefusal` `standardContracts.ts:97-101` exists but nothing calls it | UT-STD-014, -015 (helper only) | GAP-FN-19 |

### 3.7 Subroutines consumed by the panel, and helpers

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-45 | Reload after mutation (L725–774) | `invalidate` in `useCapexWrites` `useCostBook.ts:386-396`: cost-book, capex-totals, DevCo keys, capex-comments | — | Covered (the Summary also refreshes, which is stricter than the canvas) |
| FR-53 | Cluster-range collections (L788–1013) | `clustersHavingCost` `rules.ts:994-1006` (inclusive form) | UT-CAPEXR-105, -106 | Covered (08 owns the consumer; the half-open variant is noted in the code comment) |
| FR-54 | `fn_Numeric_CC` predicates (L19742) | `domain/numeric.ts:111` `isInteger`, `:118` `inRange`, `:159` `isOneDecimalCanvasParity` | 08 | Covered |
| FR-55 | Warm-up timer (L19580–19741) | `open()` `Screen.tsx:327-343` | 08 | Covered (panel: 08), except GAP-FN-17 |
| FR-56 | Enrich-loader timer (L19136–19579) | `initialCostValue` and the line's stored payments; 08 | 08 | 08 |

### 3.8 Summary

| FR | Requirement | Code | Tests | Status |
|---|---|---|---|---|
| FR-25 | Summary view: `Max(Σ cost rows, 0)` per category, sub-account contracts only, all years (OnStart; L2462–2508) | `useCapexTotals` `useCostBook.ts:365-373` → `loadCapexTotals` `costBook.ts:1270-1303` → `loadContractCostSums` (`:1216-1243`) | UT-BOOK-032…038 | Covered, except GAP-FN-12 |
| FR-26 | Summary rendering, "Total CAPEX", `###,###,###,##0` plus ISO or EUR (L7769–8024) | `Screen.tsx:691-708`; `formatSummaryAmount` `rules.ts:103-106`; `currencyCode` (`contracts/rules`) | UT-CAPEXR-005 | Covered, except GAP-FN-15 |

### 3.9 Divergence markers in this scope

| Marker | Where | What | CanvasParity twin | Test | D-entry |
|---|---|---|---|---|---|
| `DIVERGENCE:` | `data/capexWrites.ts:315` | Explicit cost-row deletes instead of cascade reliance | No (no figure differs) | UT-CAPEXW-003, UT-BOOK-039 | D38 §7 (L-7) |
| `DIVERGENCE:` | `Screen.tsx:615` | The equal save always recomputes and reconciles. This is panel scope (08) and is listed for completeness. | No | none specific | D38 §6 (L-6) |
| `SOURCE DEFECT (canvas), fixed here:` | `Screen.tsx:630` | C-7: Average Payment and Linked Cluster written on create. The write is in `capexWrites.ts`, which has **no marker**. | No | UT-BOOK-029, UT-BOOK-057 | D38 §8, bug C-7 |
| `SOURCE DEFECT:` | `panelRules.ts:270` | The paid dialog title says "Cluster-linked" while its body says "milestone-linked". Reproduced verbatim, not fixed. | n/a (copy) | `panelRules.test.ts:234-276` (no UT ids) | D38 / D39 (cited) |
| (none) | `Screen.tsx:184-193`, `rules.ts:92-100` | D-7 landing tab. Recorded in bugs and in D38 §8, but **no `SOURCE DEFECT:` marker** in the code. | — | UT-CAPEXR-003 | D38 §8, bug D-7 |

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-FN-01 | Paid toggle, cluster link | Confirming the paid popup **patches `'Linked Cluster': Blank()`** on the contract, then sets the month paid (`Capex Costs Screen.pa.yaml:L19875`) | `onConfirm` runs `writes.setPaid.mutate` only (`Screen.tsx:1033-1035` → `costRepository.ts:317-322` → `capexWrites.ts:53-58`). The link is never cleared, although the dialog promises it. | Functional / Data | Missing | High | No D-entry. `gap-analysis/cost-capex-costs.md` S12 calls it COVERED (§6). No test. |
| GAP-FN-02 | Standard contract money | The schedule is over **all** ticked clusters, `avgPay` / `lastPay` are over all payments, only the **eligible** clusters' rows are written, and `Total Cost = Σ written`, so an acquired project stores a pro-rated share (`L18704-18901`) | The full `standardAssumptionAmount` is distributed over the eligible clusters only, and `totalCost: amt` is stored (`Screen.tsx:396-420`, `rules.ts:198-225`) | Functional / Data | Divergent-unmarked | High | The money differs whenever the start cluster is past a ticked cluster. No marker, no twin, no D-entry. |
| GAP-FN-03 | Standard option list | Eligibility uses **raw `gblClusterDurations`** with `Cluster >= startClusterNo`, **not floored at 5**. The name falls back to `descriptioninput` / "Standard Contract {autoid}", and the list is sorted by `AutoId` (`L455-718`). | `buildStandardOptions` uses the **synthesised** clusters and `eligibleClusters`, **floored at 5**. The name is `assumption.description`, with no sort (`Screen.tsx:366-386`, `standardContracts.ts:81-128`). | Functional | Divergent-unmarked | Med | A COD-stage (cluster 6) project is offered options the canvas never shows. The option set also differs where a raw milestone is blank but the synthesis fills it. |
| GAP-FN-04 | Standard contract columns | Writes `'Initial Contract Source': Powerapps` on the contract (`L18668-18671`) and `'Capex Contract Standard Assumption'` on **every cost row** (`L18886`) | `saveCostLine` writes neither (`capexWrites.ts:115-190`, `:270-279`). The lookup exists in `generated/models/Vsb_capexcostsModel.ts:41`. | Data | Missing | Med | Plugin `VSB_CapexAssumptionDeletion` (`04-flow-inventory.md`, row "Capex assumption deletion") deletes the cost rows built from an assumption. Whether it finds rows written by the code depends on that lookup (inferred). |
| GAP-FN-05 | Standard "already created" check | Click-time **live** `LookUp('CAPEX Project Contracts', …)`, then `RemoveIf` the option (`L7379-7393`) | Checked against the option list derived from the cached book (`Screen.tsx:389-395`). The code comment calls it a click-time re-check. | Functional | Divergent-unmarked | Low | A second user's creation is not seen until a refetch, so a duplicate standard contract is possible. |
| GAP-FN-06 | Standard click messages | `Notify(…, Warning)` / `Notify(…, Information)` toasts (`L7373-7389`) | `globalThis.alert(check.message)`, a blocking browser dialog (`Screen.tsx:395`) | UX | Divergent-unmarked | Low | The texts match (`standardContracts.ts:144-150`). |
| GAP-FN-07 | Paid toggle messages | `"No monthly cost row found for selected contract/month/year."` as a Warning toast (`L7741`); on a Patch error, `"Could not update paid status. Please refresh and try again."` as an Error (`L7754`) | The text adds "**the**": `"…for the selected contract/month/year."` (`rules.ts:854`), shown as an inline banner (`Screen.tsx:442`, `:1050`). A write error shows the raw `Error.message` (`Screen.tsx:1051-1053`). | UX | Divergent-unmarked | Low | A rule 7 wording drift |
| GAP-FN-08 | Delete error message | `Notify("Error: Costs could not be deleted. Internal error: originated on " & FirstError.Source & ". Message: " & …, Error)` (`L8137`) | The raw `Error.message` from `deleteRecord` / `unwrap`, in the shared banner (`Screen.tsx:1051-1053`) | UX | Divergent-unmarked | Low | |
| GAP-FN-09 | Spinner text, paid and delete | Paid: `"Please wait, saving..."` (`L7665`), with `"Please wait..."` first on confirm (`L19875`). Delete: the screen spinner, no text (`L8108`). | Any pending write shows `LoadingOverlay` with `savingLabel ?? SAVING_COSTS`, i.e. "Please wait, saving costs..." (`Screen.tsx:1045-1049`) | UX | Divergent-unmarked | Low | 06 owns the spinner chrome |
| GAP-FN-10 | Delete cost rows | `RemoveIf('CAPEX Costs', …)` is commented out, so the rows are left to the cascade (`L8122-8126`) | Deletes comments, then each cost row, then the contract (`capexWrites.ts:329-343`) | Data | Divergent-marked | Low | `DIVERGENCE:` at `capexWrites.ts:315`; D38 §7; UT-CAPEXW-003 |
| GAP-FN-11 | Contract label and sort key | The grid row name and the sort key are `CPC.Name` (`L1205`, `L1413`, `L1811`) | `contractLabel(description, name)`, which prefers `vsb_description` (`costBook.ts:993-1000`, `:1088`); sorted on it (`gridRows.ts:110-112`) | Data / UI | Divergent-unmarked | Low | The comment at `gridRows.ts:105-106` claims `vsb_costdescription` is `Coalesce(Description, Name)`; the source says `CPC.Name`. It only differs when the two columns differ. |
| GAP-FN-12 | Level-2-account contracts | Excluded from the grid and the Summary: contracts are filtered to the category's **sub-accounts** (`L1043-1048`, `L2475-2488`) | Counted in the account row's totals (`gridRows.ts:162-181`, pinned by UT-GRID-003 "counts a cost filed directly on the account") and in the Summary (`costBook.ts:1285-1292`) | Data | Divergent-unmarked | Low | The `gridRows.ts:192-193` comment says "which is what the canvas grid shows", which is not what L1043 shows |
| GAP-FN-13 | Inactive contracts and costs | `colCapexProjectContracts` and `colCapexCosts` have **no statecode filter** (OnStart; `L729-736`) | `ACTIVE` is applied to contracts and costs (`costBook.ts:1036`, `:1141`, `:1227`, `:1280`) | Data | Divergent-unmarked | Low | Only matters if deactivated rows exist (inferred) |
| GAP-FN-14 | PCF cluster dates | `Cluster{n}Date` falls back to `Date(navMinYear or selectedYear, StartMonth or 1, 1)`, never blank (`L7238-7273`) | Sends `null` for a missing boundary, and the band is omitted (`PcfGrid.tsx:81-84`) | UI / Functional | Divergent-unmarked | Low | 14 owns the rendering |
| GAP-FN-15 | Summary load error | n/a (collections) | `totals.isLoading ? overlay : table`, with no `error` branch. A failed `useCapexTotals` renders blank rows and a "Total CAPEX" of `0` (`Screen.tsx:691-708`). | Functional | Missing | Med | Breaks CONVENTIONS rule 19: "a failed read must never look like no rows" |
| GAP-FN-16 | Landing tab | The warm path picks the first real category (`L259-280`); the cold path picks the Summary (`L782`). | Always the Summary unless `?category=` is set (`rules.ts:92-100`, `Screen.tsx:182`) | UX | Divergent-unmarked | Med | Bug D-7 and D38 §8 record it; the `SOURCE DEFECT:` marker D38 §8 proposed is absent. Tosca landings differ. |
| GAP-FN-17 | ◀ floor after the panel opens | The warm-up timer re-derives `locCostAllowedStartYear` with another fallback order and no `>1900` guard (`L19595-19629`), which moves the ◀ floor (`L2952-2969`) for the rest of the visit | Computed once from `costAllowedStart` (`Screen.tsx:219`, `:237-239`) | Functional | Divergent-unmarked | Low | A canvas quirk not reproduced. It differs only when the preferred date is blank or a sentinel. |
| GAP-FN-18 | Data-driven categories | The tabs and the accounts come from one live collection (`L2439`, `L1021-1031`) | The strip is live (`useCapexCategories`), but `loadCostAccounts` indexes on `CATEGORIES` (`costBook.ts:808-809`) | Functional | Partial | Med | D38 §4 (M-4), proposed |
| GAP-FN-19 | Standard: no eligible period | Notify "Standard cost was not created …", and roll back the created contract (`L18609-18635`, `L18758-18796`) | No path: options without eligible clusters are filtered out; `standardContractRefusal` is unused (`standardContracts.ts:97-101`) | Functional | Missing | Low | Mostly unreachable in the code, because eligibility is computed once. A dead helper: see knip. |
| GAP-FN-20 | Test-ID hygiene | n/a | Duplicate ids in `rules.test.ts`: UT-CAPEXR-042…049 (L358–401 and again L409–437) and UT-CAPEXR-060…070 (L649–661 and again L1124–1204). `panelRules.test.ts` and most of `Screen.test.tsx` carry no `UT-` ids. | Functional (test traceability) | Code-app-only | Low | CONVENTIONS rule 13 |
| GAP-FN-21 | Standard-assumption read | Filtered by sub-account in the data source (`L463-466`) | `loadStandardAssumptions` fetches **every** active assumption and filters client-side (`data/standardContracts.ts:23-38`) | Perf | Code-app-only | Low | Rule 2. 12 and 13 cover the cost. |
| GAP-FN-22 | Unknown cost unit | `Switch(Unit, …)` has no default, so an unknown unit gives a blank total (`L18252-18278`) | `default: return costAmount` (`standardContracts.ts:57-58`) | Functional | Divergent-unmarked | Low | Only six units exist (`COST_UNIT`) |
| GAP-FN-23 | C-7 marker location | n/a | The `SOURCE DEFECT` note sits in `Screen.tsx:630`, while the write that answers it is `capexWrites.ts:174-189`, which has none | Functional | Divergent-marked | Low | D38 §8 follow-up |
| GAP-FN-24 | Grid payer tag | `CostPaidBy` is "DevCo" / "SPV", else `Text('Cost Type')`, **without** the sub-account mapping (`L1220-1234`). A blank Cost Type renders `[]` and matches neither filter. | `resolvePayer(costType, mapping)` falls back to `SPVDevCo Mapping`, then SPV (`costBook.ts:1091`, `:1118-1127`) | Data / UI | Divergent-unmarked | Low | The mapping fallback is the **panel's** `locInitialCostPaidBy` rule (`L7303-7309`), applied to the grid. It affects `SubLabel` and `CostPaidByFilter`. UT-BOOK-012…015 pin the code's rule. |

**Covered groups** (verified in both sources):

| ID | Area | Canvas | Code | Status |
|---|---|---|---|---|
| GAP-FN-C1 | Load sequence and year window | L14–301; App L205 | `clusters.ts`, `panelRules.ts`, `Screen.tsx:214-239` | Covered |
| GAP-FN-C2 | Tabs and Summary/grid switch | L2431–2536, L7783 | `Screen.tsx:683-748` | Covered |
| GAP-FN-C3 | Grid rows, months, totals and paid flags | L1014–2299 | `gridRows.ts` | Covered |
| GAP-FN-C4 | PCF event dispatch (Add, Edit, Delete, Comment, Paid, Standard) | L7278–7650 | `Screen.tsx:423-452`, `GridRenderer.js:1112-1310` | Covered |
| GAP-FN-C5 | Delete dialog copy and flow | L8088–8155 | `Screen.tsx:977-987`, `panelRules.ts:454-497`, `capexWrites.ts:329-343` | Covered (with GAP-FN-08 and -10) |
| GAP-FN-C6 | Paid gating (Individual + linked asks) and row resolution | L7422–7437, L7661–7737 | `rules.ts:839-855` | Covered (with GAP-FN-01, -07 and -09) |
| GAP-FN-C7 | Summary formulas | L7769–8024; OnStart | `costBook.ts:1270-1303`, `Screen.tsx:691-708` | Covered |
| GAP-FN-C8 | Dormant timers and legacy controls not ported | L18928–19135, L2858–6440 | none | Covered |
| GAP-FN-C9 | Refresh after mutation | L722–777 | `useCostBook.ts:386-396` | Covered |

**Counts**, for the 24 non-Covered rows:

| By status | Count |
|---|---|
| Missing | 4 (GAP-FN-01, -04, -15, -19) |
| Divergent-unmarked | 15 (GAP-FN-02, -03, -05, -06, -07, -08, -09, -11, -12, -13, -14, -16, -17, -22, -24) |
| Divergent-marked | 2 (GAP-FN-10, -23) |
| Partial | 1 (GAP-FN-18) |
| Code-app-only | 2 (GAP-FN-20, -21) |

| By severity | Count |
|---|---|
| High | 2 (GAP-FN-01, -02) |
| Med | 5 (GAP-FN-03, -04, -15, -16, -18) |
| Low | 17 |

There are also 9 Covered groups (GAP-FN-C1…C9).

---

## 5. Open questions / not verifiable from source

1. **Does `tmr_Capex_Cost_Cost_EnrichLoader` re-fire after the warm-up?**
   - Its `Start: =true` is constant, and `AutoStart: =locStartBinding` only applies on screen
     entry, according to the documented timer semantics.
   - If it does not re-fire, the canvas Edit panel would never load existing month values through
     this timer. A live canvas run is needed.
   - The same question applies to `tmr_Load_Contract_Gallery_Warmup`, whose only start is
     `AutoStart: =locWarmupKick`.
   - This affects 08 more than this file.
2. **Is the `vsb_Contract` relationship's cascade on delete set to Cascade?** The canvas relies on
   it (GAP-FN-10). This needs the solution metadata or a live check.
3. **GAP-FN-04.** Does `VSB_CapexAssumptionDeletion` locate cost rows by
   `vsb_capexcontractstandardassumption`, or through the contract? The plugin DLL logic is
   summarised in `04-flow-inventory.md` only.
4. **GAP-FN-02.** Is the canvas pro-rating (money for passed clusters is computed and dropped)
   intended by the business, or a defect? Either way it needs a decision before the code is changed,
   and a `…CanvasParity` twin if it diverges.
5. **Cold path.** Does the cold path (`tmr_Capex_Initial_Load` → Summary) actually occur in
   production launches? D-7 says yes, depending on timing; that is not measurable from source.
6. **Summary number format.** Does `Text(…, "###,###,###,##0")` render language-dependent
   separators in the canvas? The code always formats en-GB (`rules.ts:103-106`). 04 owns this.
7. **Add-path payer comparison.** On Add, the canvas seeds `locInitialCostPaidBy` from the
   *previously edited* contract (`L7303-7309`). Whether that makes "Change Cost Paid By" appear
   spuriously on an Add needs a live run. The code never flags a payer change on Add
   (`Screen.tsx:536`). See 08.

---

## 6. Doc disagreements

| Doc | Claim | Source says |
|---|---|---|
| `gap-analysis/cost-capex-costs.md` S12 | The paid confirmation is "COVERED … confirming clears the link for the whole contract" | The code never clears `Linked Cluster` (`Screen.tsx:1033-1035`; `capexWrites.ts:53-58`). This is GAP-FN-01. |
| `gap-analysis/cost-capex-costs.md` D10 / B12 | The standard options and the creation are COVERED | Eligibility differs (raw durations and no 5-floor, against synthesised and floored), and so does the money split (all selected clusters, pro-rated, against eligible only). These are GAP-FN-02 and -03. |
| `gap-analysis/cost-capex-costs.md` D11 | `saveCostLine` writes `Initial Contract Source` | It does not (`capexWrites.ts:115-190`). The standard-contract half is GAP-FN-04; the panel half is for 08. |
| `gap-analysis/cost-capex-costs.md` D15 / D38 §2 (H-2) | CAPEX deletes bypass `deleteRecord` | Fixed: every delete goes through `deleteRecord` (`capexWrites.ts:290`, `:338`, `:340`), with UT-CAPEXW-001…003. `11-CAPEX-PARITY-CHANGE-RECORD-2026-10-23.md` §2.2 records the fix. |
| `gap-analysis/cost-capex-costs.md` D14 / D38 §7 | The L-7 delete divergence is "not marked at the call site" | It is now marked `DIVERGENCE:` at `capexWrites.ts:315`. |
| `gap-analysis/cost-capex-costs.md` D17 / D38 §1 | `FREQUENCY_OPTIONS` is `[1,3,6,12]` | It is derived from `DISTRIBUTION_FREQUENCY` (`rules.ts:60`); UT-CAPEXR-114, -115 |
| `gap-analysis/cost-capex-costs.md` U9 / D38 §3 | The delete dialog says "Delete Cost" / "Delete" / "Delete this cost…" and is destructive | It uses the verbatim canvas strings (`panelRules.ts:454-497`, `Screen.tsx:977-987`); UT-CAPEXS-002, -008 |
| `gap-analysis/cost-capex-costs.md` §0 and S14 | The hidden command bar's `ItemEnabled` "are still the authoritative gates for the PCF menu items" | Its container is `Visible: =false` (L3080), so those gates are never evaluated. The PCF's own menu decides (`GridRenderer.js:1112-1157`, `:1266-1279`). |
| `gap-analysis/cost-capex-costs.md` B3 | Reload also covers the Summary | The canvas Reload button (L725–774) does **not** rebuild `colDevexCapexSummaryView`; only a tab re-select does. The code also invalidates `capex-totals`, which is stricter. |
| `gridRows.ts:105-106` (code comment) | `vsb_costdescription` is `Coalesce(Description, Name)` | `vsb_costdescription: CPC.Name` (L1205) |
| `gridRows.ts:192-193` (code comment) | Costs on a level-2 account are "counted in its totals …, which is what the canvas grid shows" | The canvas excludes those contracts entirely (L1043–1048) |
| `costBook.ts:1089-1091` (code comment) | `Coalesce(contract.'Cost Type', mapping.'DevCo/SPV')` is "the canvas rule" for the grid | That is the panel's `locInitialCostPaidBy` rule (L7303–7309). The grid uses `Text('Cost Type')` with no mapping (L1220–1234). |
| `panelRules.ts:483-486` (`deleteContractDescription` doc) | Delete is only enabled on contract rows "(`cmd_Costs_ProjectCosts_TableCommandBar.Items`)" | That command bar is hidden. The contract-only rule comes from the PCF's row menu (`ActionDropdown.js`, shown for contract rows). The conclusion is right; the cited source is not. |
| `standardContracts.ts:136-138` (code comment) | The click check is "checked again at the moment of the click rather than trusted from the menu build" | It is checked against the same computed option list (`Screen.tsx:389-393`), not a fresh read |
| `migration-plans/screens/019-capex-costs.md` L96 | "not a mandate to embed PCF code … rebuild … with Fluent UI" | The code vendors the PCF renderer (`features/cost/capex-costs/pcf/`, hosted by `PcfGrid.tsx`). That is a deliberate later decision (`PCF-RENDERER-PORT.md`), so the plan is stale. |
| `02-OPEN-DECISIONS.md` D50 / `01-BUGS-FOUND.md` CA-6 | The `onStartSelectedYear` tests carry no `UT-` ids | Still true; see GAP-FN-20 |
