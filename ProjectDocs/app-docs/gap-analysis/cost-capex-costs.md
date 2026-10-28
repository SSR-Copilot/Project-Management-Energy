# Gap analysis — DEVEX/CAPEX Costs Screen (Cost)

- Canvas: `ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml` (20,082 lines,
  355 controls). "L" = line in this file. Also read: `App.pa.yaml` (`AppTheme`,
  `LeftNavigationMenu` L86, `colDistributionFrequency` L161, `OnStart`), and the components
  `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Loading`, `cmp_PopUp_Confirmation_New`,
  `cmp_ReportErrorRightPanel`, `fn_Numeric`.
- Code: `ProjectCosts-CodeApp/src/features/cost/capex-costs/` — `Screen.tsx` (924),
  `rules.ts` (1,024), `panelRules.ts` (335), `clusters.ts` (298), `gridRows.ts` (213),
  `comments.ts` (546), `CommentsPanel.tsx` (800), `standardContracts.ts` (143),
  `distribution.ts` (68), `writeSet.ts` (51), `PcfGrid.tsx` (87), plus the vendored PCF under
  `pcf/`. Writes live in `src/data/capexWrites.ts`; reads in `src/data/costBook.ts`; hooks in
  `src/features/cost/costing/useCostBook.ts`.
- **The canvas source on disk is solution 1.21.709.** Anything that exists only in 1.21.753
  cannot be checked here; those items are carried in `1.21.753-REQUIRED-CHANGES.md` and appear
  below as S17.
- **Written read-only on 23 Oct 2026.** Nothing in this report has been verified against live
  `VSBCloud_Dev` — every row is a source-level comparison. Several of the findings are of the
  class `MIGRATION-STRATEGY.md` step 9 says only a real click-through confirms.
- **Amended 23 Oct 2026**, after the remediation's Phase 2, to reflect that **M-4 is now
  partially implemented** in the working tree (unapproved, uncommitted) and that the implemented
  half introduces a new failure mode. The affected rows are **D4** and **U12** and proposed
  changes **(c) 3** and **(d) 1**; the decision record is **D38 §4**. Every other row still
  describes the code as it stood before any remediation — re-check before acting, as this folder's
  README says.
- **Extended 23 Oct 2026** with **§5, the UI/UX pass** — the popup components' own geometry, fill,
  typography and padding, and what each click renders. §5 carries its own register, **UX-1 … UX-12**
  (the same items D39 and the session transcript call U-1 … U-11), kept separate from this report's
  `U1`–`U15` requirement rows. **§5 covers popups and interactions only**; the screen's own
  container geometry is **UX-11, not yet analysed**. The decision record is **D39**.
- **§5 amended later the same day**, after the agents implementing it reported evidence that
  corrected four of its first characterisations — all four came from enumerating call sites or
  reading a formula rather than reasoning about it: **UX-2** has two per-instance dimensions, not
  one (`TextHeight` as well as `BoxHeight`); **UX-4** was wrong on three edges, not one; **UX-5 /
  UX-6** affect **PM Revenues** as well as CAPEX, so the "ⓘ is CAPEX-only" premise was false;
  **UX-7**'s blast radius was overstated and is in fact **zero visible change**. **UX-8** moved from
  open question to confirmed defect, and **UX-12** was added as a consequence of UX-4.
- **Amended 26 Oct 2026 (the code wins).** Rows **D1** and **B1** are wrong as written:
  - **The gap.** The code never seeded `gblSelectedProjectYear` as `App.OnStart` does (`App.pa.yaml`
    L205): `Year(If('Start Cluster' <> Greenfield, If(Year('Acquisition date') > Year(Today()),
    'Acquisition date', Today()), If(Year('Project Start Date') > Year(Today()),
    'Project Start Date', Today())))`. So `defaultSelectedYear`'s `Coalesce` fell through to
    `locCostAllowedStartYear`, and a 2015 project opened on 2015, where the canvas opens on this year.
  - **The fix.** Commit `4fc8cff` (Sourabh Kumar) adds `panelRules.ts` `onStartSelectedYear`, so
    D1 and B1 are now COVERED in fact. The `defaultSelectedYear` note in B1 is still true: the clamp
    moves a finished project back into its own window.
  - **Records.** CA-6 in `01-BUGS-FOUND.md` and **D50**.
- State: the screen is **built and connected** (reads and writes), unlike the 16 Admin/PM reports
  in this folder, which were written against unconnected screens. Rows therefore judge live
  behaviour as expressed in code, not just a captured requirement.
- Method: `canvas-yaml-to-codeapp` §1–2. Every block scalar was read to its end, and
  commented-out formulas were skipped (rule 10). Line anchors are **control declaration lines**;
  a property's formula runs from there to the next control.

Legend: COVERED / PARTIAL / MISSING / WRONG (WRONG quotes canvas vs code).

## 0. The live screen is much smaller than the control tree

Rule 10 applied to every `Visible` on this screen. These controls exist in the YAML and **do not
render**:

| Control | Live `Visible` | Effect |
|---|---|---|
| `gal_Costs_ProjectCosts` (L4288, the classic cost gallery) | `=//true` — comment only, so the formula is empty and evaluates blank | Does not render |
| `con_Costs_ProjectCosts_TableHeader` (L3717, the 15 month headers) | `=//true` | Does not render |
| `con_Costs_ProjectCostsMonthSummary` (L6288, the Grand Total band) | `=//true` | Does not render |
| `con_Costs_ProjectCosts_TableCommandBar` (L3064) | `=false` | Hidden — see below |
| `con_Costs_ProjectCosts_GalleryNavigation` (L3579, the PCF year arrows) | `=false` | Hidden |
| `tgl_Costs_ProjectCosts_TableCommandBar_ShowInactiveAccounts` (L2820) | `=//true` then `false` | Hidden |
| `tgl_Costs_ProjectCosts_TableCommandBar_FiscalYear` (L2862) | `=//true` then `false` | Hidden |
| `tgl_Costs_ProjectCostsbtn_..._ProjectTimeline` (L2876) | `=false` | Hidden |
| `Btn_CodeforSettingCostPaidUnpaid` (L7656), `btn_Reset_EditCost_Controls` (L17576), `btn_SaveCost_Execute____` | `=false` | Hidden subroutines, invoked by `Select()` |
| `cmp_PopUp_Confirmation_1` (L303) | commented-out condition then `false` | Dead dialog |

So the live screen is **tab strip → toolbar → `DevexCapexSummaryPCF`**, plus the Summary gallery
on the Summary tab. The code app renders exactly that and nothing else — `Screen.tsx:629-695`.
Marked COVERED at B7.

**Why this matters for the next person.** `cmd_Costs_ProjectCosts_TableCommandBar` (L3083) still
carries a complete `Items` table — "Add New Cost", "Add Standard Contract" with a per-assumption
submenu, "Edit", "Delete Cost" — and a 25 KB `OnSelect` that implements all four. It is tempting
to read that list and conclude the screen has a command bar. **It does not.** Its container is
`Visible: =false`, and every one of those four commands reaches the user only through the PCF's
own row action menu (`ActionDropdown`), which raises `AddTriggered` / `EditTriggered` /
`AddStandardContractTriggered` / `DeleteTriggered` on `DevexCapexSummaryPCF.OnChange` (L7234).
Porting the `Items` gates without checking the container would add a toolbar the canvas has not
shown for at least two solution versions. The `ItemEnabled` expressions are still the
authoritative gates for the PCF menu items, which is why they are captured at S14.

## 1. Data

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| D1 | `App.OnStart`: `gblAppTheme`, `gblCurrentUser` (role walk), `gblSelectedProject`, `gblSelectedProjectYear`, `gblClusterDurations` (6 clusters chained off the project's own milestone columns), `gblAppResx`, `colCapexAccountCategoriesNew` / `…AccountsNew` / `…SubaccountsNew`, `colCapexProjectContracts`, `colCapexCosts`, `colContractDistributionTypes` / `…Scheme`, `colCostPaidType = LastN(Choices('Cost paid type'), 2)`, `colDistributionFrequency` (App L161) | `app/SessionContext.tsx`; `data/costBook.ts`; `theme/tokens.ts`; `clusters.ts` `clusterDurations` | COVERED | The collections become TanStack queries keyed per category rather than one app-wide cache, which is the intended shape (rule 2) |
| D2 | `OnVisible` L40-56 and `App.OnStart`: when `Param("projectId")` is blank, fall back to the hard-coded project `GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")`, commented "for testing" | No fallback; `Landing` shows a project picker | WRONG | Deliberate, and already the registered canvas bug **A-2**. Not re-raised here |
| D3 | Account hierarchy: categories = children of `'Parent Account'.Number = "00001"` sorted by `vsb_order`; accounts and subaccounts filtered to `Status = Active` | `data/costBook.ts` `loadCostAccounts`; hierarchy notes `costBook.ts:186-191` | COVERED | |
| D4 | Tab strip `tab_Costs_ContentAssignableAccountCategories.Items` (L2431): `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name="Overleveraging")), "vsb_order")` — **from Dataverse**, and in the canvas the same collection drives the accounts beneath it | **Amended 23 Oct, Phase 2.** `Screen.tsx:176-180` now calls `useCapexCategories()` and feeds `categoryTabs(...)`, `resolveCategory(raw, count)`, the Summary rows (`:689`) and the comments breadcrumb (`:952`). But `loadCostAccounts` (`data/costBook.ts:806-807`) still derives `CostAccount.category` from `CATEGORIES.indexOf(level1.name)` and `continue`s past an unknown name, dropping that whole subtree | PARTIAL | **M-4, half closed.** The strip is genuinely data-driven; the accounts behind it are not. New failure mode: an admin-added category now gets **a tab and a summary row with no accounts behind them** instead of being absent — an empty category rather than a missing one, which is harder for a user to diagnose. Latent on VSBCloud_Dev (the five names still match). Closing it means re-basing `CostAccount.category` off the loaded list, which touches every consumer of that index at once — **follow-up, see D38 §4** |
| D5 | `btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1014) step 1: narrow accounts → subaccounts → contracts → costs to the selected category | `useCostBook(category)`; `loadCostBook` | COVERED | The code scopes the fetch by category before it runs, which is stricter than the canvas (which materialises then filters) |
| D6 | Refresh step 2: load `Capex Comments` for the category's contracts and costs, then flatten each thread to its latest message (`colCapexCommentsLatest`), resolving `CostYear` / `CostMonthIndex` through a 36-arm `Switch` on the month choice | `useCapexComments`; `comments.ts` `commentThreads`, `commentCosts`, `gridCommentIndicators`; `Screen.tsx:270-275` | COVERED | The month index comes off the cost row the comment links to, with no second query |
| D7 | Refresh step 3: contract rows carry `SubLabel` = `"[" & CostPaidBy & "]"` + `" Link to Cluster N"` + the equal-distribution half, with the `", "` separator emitted inside each branch | `rules.ts` `contractSubLabel`; used at `gridRows.ts:207` | COVERED | Exact, including the missing space after `]` and the `> 2 ? ", " : " & "` join. The PCF parses this string for the payer tag, so the quirk is load-bearing |
| D8 | Refresh step 5-6: map the selected year's costs to `M1..M12`, with `MxPaid`, `MxHasComments` and `MxCommentTooltip` per month | `gridRows.ts` `aggregateLine`, `money`, and the per-month loop `gridRows.ts:216-223` | COVERED | One pass per payment instead of the canvas' 15 |
| D9 | `colContractTotalsForPCF`: `varTotalCost = Coalesce(C.'Total Cost', Sum(costs), 0)`; `PlannedCost = varTotalCost - varPaidCost`; `ActualCost = varPaidCost` | `gridRows.ts:86` `out.total = line.totalCost ?? rowSum`; `money()` derives Planned by subtraction | COVERED | The stored total wins over the sum of rows, and a stored 0 still wins. The two differ in live data; re-deriving showed the wrong number on the grid's most-read column |
| D10 | `btn_Capex_Cost_Build_StandardContractOptions_Code` (L452): standard assumptions for this country + technology + category, excluding ones already created for the project/subaccount, and only where at least one eligible cluster has usable dates | `standardContracts.ts` `buildStandardOptions`; `Screen.tsx:348-362` | COVERED | The start-cluster filter is applied (a real defect was fixed here: `startClusterNo` had been hard-coded to 0) |
| D11 | Individual save `Patch('CAPEX Project Contracts', …)`: Account, Name **and** Description, Distribution, Project, Distribution Scheme, Total Cost, Apply VAT?, Depreciation?, Cost Type, Owning Business Unit, Initial Contract Source, Is Standard Contract?, Capex Standard Assumption Contract, Linked Cluster | `data/capexWrites.ts` `saveCostLine` | COVERED | Both `vsb_name` and `vsb_description` are written. `Linked Cluster` is written on every save including the `null` clear, which is the point of the canvas' `Blank()` arm |
| D12 | Equal save: `RemoveIf('CAPEX Costs', contract)` then re-`Patch` every payment, `RoundDown(total/n, 0)` with the whole remainder on the last; then `Patch` `Average Payment` and `Linked Cluster` | `saveCostLine` + `rules.ts` `reconcilePayments` + `writeSet.ts` `capexWriteSet`; `distribution.ts` `equalDistributionAmounts` | PARTIAL | Arithmetic: COVERED and exact. Two divergences: (a) the code **reconciles** instead of delete-all-then-rewrite, which preserves `vsb_capexcostid`, the paid flag and payment-date comments — marked `DIVERGENCE` in `rules.ts` `reconcilePayments`; (b) the canvas gates the whole recompute on `locChangedByDate ‖ locChangedDistribution ‖ locChangedFrequency ‖ locClusterChanged ‖ loctotalCostChanged`, the code always recomputes — **L-6**, unmarked |
| D13 | `Btn_CodeforSettingCostPaidUnpaid` (L7656): `Patch('CAPEX Costs', row, {'Cost Paid': …})` for the clicked contract/year/month, with a Notify when no row matches | `capexWrites.ts` `setCostPaid`; target resolved by `rules.ts` `resolvePaidTarget`; `Screen.tsx:410-427` | COVERED | The "no monthly cost row found" case is surfaced to the user rather than patched as `undefined` |
| D14 | Delete `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm` (L8088): `RemoveIf('Capex Comments', …)` then `Remove('CAPEX Project Contracts', …)`. **The `RemoveIf('CAPEX Costs', …)` is commented out** — the canvas relies on the Dataverse cascade | `capexWrites.ts` `deleteCostLine`: comments, then each cost row explicitly, then the contract | PARTIAL | **L-7.** Safer and listed in `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §8 as a deliberate "not ported" candidate, but not marked `DIVERGENCE` at the call site |
| D15 | Delete paths must surface an SDK refusal (`CONVENTIONS.md` rule 14; not a canvas requirement) | `capexWrites.ts` calls `Vsb_capexcostsService.delete(...)` and `Vsb_capexprojectcontractsService.delete(...)` **directly** — in `saveCostLine`'s tombstone loop and twice in `deleteCostLine` | WRONG | **H-2.** The generated `delete()` discards the `IOperationResult` and the SDK never throws, so a 403 or a cascade restriction resolves exactly like success. Every admin module routes through `deleteRecord` (`data/client.ts:113`; e.g. `data/adminCapexAccounts.ts:297`). This is the live risk named in `KNOWN-RISKS-AND-DECISIONS.md`, now located |
| D16 | Every create writes `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'` | `capexWrites.ts` binds `owningbusinessunit@odata.bind` on both creates | COVERED | Rule 4 satisfied, write form correct |
| D17 | `drp_AddContract_RightPanel_PaymentFrequency_1.Items` (L11838) = `colDistributionFrequency`, the five-row `App.Formulas` table at App L161: **1, 2, 3, 6, 12 months** | `rules.ts` `FREQUENCY_OPTIONS` declares **four** values `[1, 3, 6, 12]`, with a comment asserting the canvas offers four. Consumed at `Screen.tsx:822` | WRONG | **H-1.** The correct five-row list already exists once, in `data/dataverseNames.ts:621`, and both OPEX (`UT-OPEX-073`) and Land Lease use it. A bi-monthly schedule cannot be created, and a stored `vsb_distributionfrequency = 2` renders a Dropdown `value` absent from its own options. Also a rule 17 violation — a second, diverging definition |
| D18 | Tables used: `vsb_capexaccountlists`, `vsb_capexprojectcontracts`, `vsb_capexcosts`, `vsb_capexcomments`, `vsb_devexcapexstandardassumptions`, `vsb_projectstates`, `vsb_projects` | all registered | COVERED | `check:power` 81 / 0 at the last recorded run |

## 2. Behaviour

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| B1 | `Screen.OnVisible` L14-301: reset ~20 `loc*` variables; resolve the project; derive `locProjectStartClusterNo` (Greenfield→0 … Cluster 6→6); `locCostAllowedStartYear` / `locCostAllowedStartDate` (acquisition date when the start cluster > 0, else project start, each guarded by `Year > 1900`); `locNavigationMinYear` / `MaxYear`; build `colProjectPeriods`; clamp `gblSelectedProjectYear`; select the first non-"Overleveraging" category | `clusters.ts` `costAllowedStart`, `navigationWindow`, `projectPeriods`; `panelRules.ts` `defaultSelectedYear`, `previousYearFloor`; `Screen.tsx:193-215` | COVERED | The sentinel-year guard is reproduced (`clusters.ts` `SENTINEL_YEAR`). `defaultSelectedYear` fixes a real defect — defaulting to `Year(Today())` alone opened a 2015-2019 project on a year with no periods |
| B2 | `tmr_Capex_Initial_Load` (L778) retries the load when base data was not ready, and on that path sets `locSelectedCapexAccountCategory` to **"DEVEX/CAPEX Summary"** — a different tab from the one `OnVisible` picks | `Screen.tsx:161` resolves the category from the URL on every entry | PARTIAL | The canvas' two entry paths land on different tabs; the code has one deterministic path. Logged as canvas bug **D-7** (01-BUGS-FOUND) and cross-referenced in D38, not reproduced |
| B3 | `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` and `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)` run as subroutines from `OnVisible`, the tab `OnSelect`, the year controls, and after every mutation via `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L722) | TanStack query invalidation in `useCapexWrites` | COVERED | The hidden-button subroutine pattern maps to cache invalidation; the canvas' `Refresh()` calls have no analogue and correctly have none |
| B4 | Tab `OnSelect` (L2431): clear the selected account and cost row, raise the spinner, and either rebuild the Summary view (blank category) or re-run the two subroutines | `Screen.tsx:297-301` writes `?category=` and lets the query re-run | COVERED | |
| B5 | Year navigation: `btn_…ShowPreviousYear` (L2946) clamps at `Coalesce(locCostAllowedStartYear, Min(colProjectPeriods,Year), Year(Today()))`; `btn_…ShowNextYear` (L2998) clamps at `locNavigationMaxYear` — **the block that extends `colProjectPeriods` is commented out**; `drp_…ShowSelectedYear` (L2921) sets the year and re-runs refresh | `Screen.tsx:675-689`; `clusters.ts` `canGoPreviousYear` / `canGoNextYear`; `panelRules.ts` `previousYearFloor` | COVERED | Rule 10 applied correctly: the live clamp is ported and the dead year-extension is not. The ◀ floor is deliberately **later** than the dropdown's first entry, as the canvas has it |
| B6 | `DevexCapexSummaryPCF.OnChange` (L7234): sets `locSelectedCostRow` from `SelectedRecordId`, resets the three change flags, then branches on `AddTriggered`, `EditTriggered`, `AddStandardContractTriggered`, `DeleteTriggered`, `SetCostPaidUnpaidTriggered`, `CommentTriggered` | `Screen.tsx:399-428` `onAction`, typed as `GridCallback` | COVERED | All six triggers handled; the 13 PCF output properties collapse to one typed callback as `00-ANALYSIS.md` proposed |
| B7 | The four commands are reachable only through the PCF row menu, because `con_Costs_ProjectCosts_TableCommandBar` is `Visible: =false` (§0) | `PcfGrid.tsx` + `pcf/ui/ActionDropdown.js`; no command bar in `Screen.tsx` | COVERED | See §0 for why this is worth stating explicitly |
| B8 | `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable` (L2558): `Visible: =true` (the "Development Expenses only" condition is commented out); navigates to the Add Costs from Table modal | `Screen.tsx:658-662`, carrying `projectId` and `category` | COVERED | |
| B9 | Panel open is two timers: `tmr_Load_Contract_Gallery_Warmup` (L19580) builds the blank year skeleton, sets `locProjectDuration = Year(costEnd) - Year(costStart) + 4` and `locProjectStartyear = Year(costStart) - 1`, and resets the form; then `tmr_Capex_Cost_Cost_EnrichLoader` (L19136) fills the twelve months per year, converting to percent when the scheme is `% Values` | `Screen.tsx:303-319` `open()`; the year list comes from `projectPeriods(window.min, window.max)` (`Screen.tsx:843`) | PARTIAL | Behaviourally equivalent for the panel's content. The canvas' year span is `costStartYear … costEndYear + 3`, derived independently of the grid's navigation window; the code reuses the navigation window for both. On a project whose COD is far from its end date the two lists differ. Not previously recorded; raised as question Q6 |
| B10 | Save raises the spinner and dismisses the panel in **one** `UpdateContext`, then patches | `Screen.tsx:564-605` `persist()` — `setSavingLabel` then `closePanel()` before awaiting the write | COVERED | Deliberate and documented; the client's reference shot is named in the comment |
| B11 | The relink popup's `OnConfirm` (L19884) clears the flags, optionally resets paid rows and payment-date comments, then `Select(…Save)` — re-triggering the same Save | `Screen.tsx:923-929` → `persist()`; the reset is folded into `saveCostLine` via `resetPaidAndPaymentDateComments` | COVERED | Bug 13772's ordering comment in the canvas is honoured: the flag is cleared before the re-run so the popup cannot reopen |
| B12 | `btn_Capex_Cost_Add_Standard_Contract_Code` (L18223): back-computes the cluster chain for an acquired project from `Milestones Standard Assumptions`, then creates the contract and its costs | `Screen.tsx:364-397` `addStandardContract`; `clusters.ts` `synthesiseClusterDates`; `standardContracts.ts` `standardAssumptionAmount` | COVERED | The synthesis is applied **only** on this path, exactly as the canvas does — `clusters.ts` documents why, including that clusters 5 and 6 are never synthesised |
| B13 | `CommentTriggered` loads the contract's comments, assigns sequence numbers, appends the "add" placeholder row and opens the panel | `CommentsPanel.tsx`; `comments.ts` | COVERED | Canvas control names carried on the panel's controls (`CheckboxCanvas1`, `modernDropdown1`, `btn_Add_Comment`, …) |
| B14 | Shell: `cmp_Costs_Header` (logo → `Launch(gblPMAppURL)`), `cmp_Costs_Left_Navigation` (rail → `Navigate(TargetScreen)`), `con_Costs_Footer` | App shell + `app/deepLinks.ts` `resolvePlayAppUrl` | COVERED | Shell-owned; rule 12 governs the new-tab URL |
| B15 | `btn_Right_Panel_Add_Contract_Calculate_Allocated_Cost` (L17698): sanitise-and-round the typed months — blank or non-numeric becomes `Blank()`, absolute months become `Round(·, 0)`, percent months are left raw | `panelRules.ts` `recalculatedPayments`; `Screen.tsx:708-715` | COVERED | It is not a redistribution; nothing moves between months |

## 3. State gates, validation and messages

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| S1 | Save `DisplayMode` (`btn_GeneratorData_…_Buttons_Save` L17506, duplicated on the hidden `btn_SaveCost_Execute____`): description non-blank; no total-cost or description error; a distribution type chosen; then a branch per mode — Individual+% needs a total; Individual+Absolute needs only a scheme; Equal needs a cluster (checked **and** enabled) or both dates with no date error, plus a frequency and a total; and finally `locEditSaveButtonEnabled` | `rules.ts` `canSaveContract` + the inline validators composed at `Screen.tsx:487-490` | COVERED | The `Checked && DisplayMode = Edit` term is honoured through `clusterCheckboxState` |
| S2 | Recalculate `Visible` = Individual only; `DisplayMode` = `Or(total present, Individual+Absolute) && locEditSaveButtonEnabled` | `panelRules.ts` `recalculateVisible`, `recalculateEnabled` | COVERED | The `Or` matters: an absolute individual distribution may be recalculated with the Total Costs box empty |
| S3 | Total Costs: container `con_…_Fields_Label_15` (L10911) `Visible = Not(Individual && Absolute)`; the input itself (L10961) is `DisplayMode.View` for Individual+Absolute | `Screen.tsx:453-458` `showsTotalCost`; rendered only in the percent and equal branches | COVERED | |
| S4 | Cluster checkbox *n* (L11097 …): `Checked = Coalesce(locClusterRecord.ClusterN,false) && startClusterNo <= N`; `DisplayMode` likewise. `By Cluster JSON` serialises `Checked && DisplayMode = Edit`, so a ticked-but-disabled cluster writes `false` | `panelRules.ts` `clusterCheckboxState`, `enabledClusters`; `rules.ts` `byClusterJson`; `Screen.tsx:783-785` | COVERED | The gate is on both properties, and the re-serialisation depends on it |
| S5 | `rad_…DistributionType_1` (L10592) and `rad_…DistributionScheme_1` (L10727) are `DisplayMode.View` on an existing contract. `rad_…DistributionBy_1` (L10846) carries the identical formula **commented out** followed by a bare `DisplayMode.Edit`; Link to Milestone, Cost Paid By, Apply VAT and Depreciation set no `DisplayMode` at all | `panelRules.ts` `distributionLocked`; applied at `Screen.tsx:733` and `:748` only | COVERED | Rule 10 applied correctly — the commented-out lock on By Cluster / By Dates is not ported |
| S6 | Link to Milestone: container (L11345) `Visible = Or(Individual, Equal && By Dates)`; `Items` (L11399) = `Table({vsb_name:"None"}, Filter('Project States', Order in [1..6] && Order > project.'Cluster State'.Order && Order >= Max(1, startClusterNo)))`; `DefaultSelectedItems` is the stored link **independently of that filter** | `rules.ts` `linkToMilestoneVisible`, `milestoneOptions`, `NO_MILESTONE`; `Screen.tsx:552-562` | COVERED | The "a stored link may not be in Items" quirk is reproduced and documented, with live examples named |
| S7 | `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1`: `IsInteger` and `InRange(v, 1, Poland ? 2,250,000,000 : 500,000,000)`; the message says "between 0 and {max}" with the separator following the app language and **no** full stop | `rules.ts` `validateTotalCost`, `totalCostMax` | COVERED | The canvas' own mismatch between the tested lower bound (1) and the stated one (0) is preserved and explained |
| S8 | `lbl_…FirstMonth_ErrorMessage_*` (twelve controls, same formula): Absolute → "Value must be a numeric" / "Value must be between 0 and {max}."; Percent → "Value must be numeric upto one decimal" / "Value must be between 0 and 100." Both range sentences **do** end in a full stop. A blank month is not an error | `rules.ts` `validateMonthAmount`, `monthAmountErrors`, `hasMonthRangeError`; `Screen.tsx:471-473`, `:881-883` | COVERED | Save is not gated on format errors — the canvas' twelve `…Visible` references are layout arithmetic only, and gating would make Recalculate unreachable. The consequence (a % month over 100 can be saved) is recorded as a source defect in `Screen.tsx:475-486` |
| S9 | `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1`: `MM/YYYY` format, then `< locCostAllowedStartDate` → "Start Date must be in or after {mm/yyyy}". `…EndDate_ErrorMessage_1` is a **different** rule — compared against the typed start date with `>=`, message "End Date must take place after Start Date" | `rules.ts` `validateStartMonthYear`, `validateEndMonthYear` | COVERED | The older "must take place after the milestone Project Start" variant sits commented out directly above and is correctly not ported |
| S10 | `lbl_…_ErrorMessage_2`: the description's reserved-word and duplicate guard; editing a standard contract's description strips every "Standard" and clears the flag | `rules.ts` `describeDescriptionError`, `applyDescriptionChange`; `Screen.tsx:292-295` | COVERED | Unchanged-from-its-own-value does not re-trigger, so opening Edit on a standard contract does not flag its own name |
| S11 | Save stops and asks when `Or(And(CountRows(Filter(colOtherClusterHavingCost, Order <> Selected.Order)) > 0, locClusterLinkageChanged), locCostPaidByChanged, locMilestoneRelinkResetNeeded)` | `rules.ts` `needsClusterLinkageConfirmation`, `clustersHavingCost`, `clusterLinkageChanged`, `milestoneRelinkResetNeeded`; `Screen.tsx:507-539` | COVERED | The dialog copy reproduces the canvas' **two different counts of the same collection** — the title and bullets exclude the selected cluster, the confirm-button label does not |
| S12 | `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (L19864): asked only when the contract is Individual **and** has a `Linked Cluster`; confirming clears the link for the whole contract | `rules.ts` `paidToggleNeedsConfirmation`; `panelRules.ts` `PAID_CONFIRM_TITLE` / `…DESCRIPTION`; `Screen.tsx:936-943` | COVERED | |
| S13 | Spinner texts: "Please wait, loading cost ..."; "Please wait, saving the cost..." (Individual) vs "Please wait, saving costs..." (Equal); "Please wait, loading data..."; `$"Please wait, loading standard contract : '{description}' ..."` | `panelRules.ts` `LOADING_COST`, `SAVING_COST`, `SAVING_COSTS`, `savingCostLabel`, `LOADING_DATA`, `standardContractLoadingLabel` | COVERED | Singular/plural per branch is reproduced |
| S14 | PCF-menu gates in `cmd_…TableCommandBar.Items` (L3083): Add New Cost needs a selected **non-contract** row and `DataSourceInfo('CAPEX Costs', CreatePermission)`; Add Standard Contract additionally needs ≥1 available assumption and is `ItemVisible` on the same count; Edit and Delete need a selected **contract** row; the per-assumption submenu is `ItemVisible` only when more than one exists | `standardContracts.ts` `checkStandardContractClick`; the PCF menu decides Add/Edit/Delete from row type | PARTIAL | Row-type gating: COVERED. The `DataSourceInfo` permission terms have no SDK equivalent — **D1** in the decision log. The "more than one" submenu rule is not reproduced explicitly |
| S15 | `cmp_ShowErrorInContract` (L19760) `Visible = And(locEditSaveButtonEnabled, Individual, locShowErrorInContractCost, Len(ErrorTitle) > 0)` — the in-panel error strip shown when an individual distribution fails its 100 % / positive-sum check | No equivalent strip; the Save button simply stays disabled | MISSING | Low impact (Save is already blocked) but the user is told nothing about *why*. Raised as question Q5 |
| S16 | Screen `LoadingSpinner`, `spn_LoadingSpinnerCost` (L19749), `cmp_Costs_PopUpLoading` (L18206) | `LoadingOverlay`; `EmptyState "Cost data is unavailable"` at `Screen.tsx:277-281` | COVERED | Rule 19 satisfied — a failed read does not look like "no rows" |
| S17 | 1.21.753 only: `% Values` months use **`RoundDown`** not `Round` (R2); the shortfall goes to the **latest month carrying a positive amount** (R3); a `% Values` contract opens in percent mode only when `Coalesce('Total Cost',0) <> 0` (R4) | `rules.ts` `individualDistribution` uses `round(·, 0)`; no remainder absorption; scheme-on-open is unconditional | MISSING | **M-5.** Documented as *not applied* in `1.21.753-REQUIRED-CHANGES.md` and still accurate. Cannot be verified against the 1.21.709 source on disk; needs the product owner (Q1) |

## 4. UI

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| U1 | Tab strip: Summary plus the categories, `AccessibleLabel: =" "` | `Screen.tsx:630-636`, `role="tablist"`, per-tab `data-testid="tab_Costs_ContentAssignableAccountCategories-{i}"` | COVERED | Content is D4 |
| U2 | Toolbar: "Add Cost from Table"; `Show Empty Accounts` (`Checked: =true`); `Show Total Planned/Paid` (no `Checked`, so false); Cost-paid-by dropdown `["Show All Cost","DevCo","SPV"]` defaulting to the first; year ◀ / dropdown / ▶ | `Screen.tsx:657-690`; `showEmpty` initialised `true`, `showPlanned` `false`; `PAYER_FILTERS` | COVERED | Both toggle defaults match the canvas exactly |
| U3 | `AccessibleLabel` on 32 controls; on this screen almost every one is the control's own name, and the twelve month inputs use their month label's text | `aria-label` + `data-testid` on every control; `check:canvas` reports **38 canvas-named ids, all verified, 0 findings C1–C5** for this folder | COVERED | Rule 16 satisfied |
| U4 | `lbl_GeneratorData_…_Fields_Label_17` (L11684) = **"Start Date Distribution"**; `…_Label_18` (L11770) = **"End Date Distribution"** | `Screen.tsx:810` `label="Start Date"`; `Screen.tsx:814` `label="End Date"` | WRONG | **M-3.** Rule 7. Note the mechanism: the two inputs' `AccessibleLabel` is their own control name, so the code's `aria-label` matches and the canvas-identity gate passes while the visible caption is wrong — exactly the G-LABEL blind spot `TESTING-AND-HARNESS.md` describes |
| U5 | Other panel captions: "Description", "Distribution", "Distribution Scheme", "Equal Distribution", `"Total Costs [" & ISO & "]"`, "Select Cluster", "Link to Milestone", "Distribution Frequency", `"Average Amount per Payment [" & ISO & "]"`, "Cost Paid By", "Apply VAT", "Depreciation" | `Screen.tsx:720-838`; currency suffix via `contracts/rules.ts` `costLabel` | COVERED | All verbatim, currency interpolation included |
| U6 | Month row label `="January "&ThisItem.Year` (full month name and year, not "Jan") | `panelRules.ts` `monthYearLabel`; `Screen.tsx:863` | COVERED | |
| U7 | `lbl_Production_CardHeader_LabelWithDescription_4` (L13188): `$"Allocated Cost: {percent ? Round(TotalUI,1) & " %" : Round(TotalSave,0) & " " & ISO}"` — the percent branch reads the **typed** total, the money branch the **resolved** one | `panelRules.ts` `allocatedCostLabel`; `Screen.tsx:620-627` picks `rawProposed` vs `proposed` accordingly | COVERED | The two-total distinction is the whole reason the canvas keeps `TotalUI` and `TotalSave` |
| U8 | `btn_Right_Panel_…_Calculate_Allocated_Cost.Text = "Recalculate Allocated Cost "` (trailing space) | `panelRules.ts` `RECALCULATE_ALLOCATED_COST` without it | COVERED | Documented deliberate trim; it would only show up in the accessible name |
| U9 | Delete dialog (L8088): Title **"Delete Contract"**; Description `$"Are you sure you want to delete the costs for ""{locSelectedCostRow.vsb_costdescription}"" of the selected Subaccount ""{…Account.Name}""?"`; Confirm **"Confirm"**; Cancel "Cancel"; `WidthConfirmButton: =96` | `Screen.tsx:904-905`: title "Delete Cost", description "Delete this cost and its monthly values?", confirm "Delete", `destructive` | WRONG | **M-3.** All four strings diverge, and the red `destructive` styling has no canvas counterpart |
| U10 | Relink dialog `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (L19884): the live one, with `IconConfirmButton: ="Text"` / `IconCancelButton: ="CheckMark"` and a width that follows the Confirm label | `rules.ts` `clusterLinkageConfirmation`; `panelRules.ts` `confirmButtonWidth`; `Screen.tsx:923-929` | COVERED | The dead `cmp_PopUp_Confirmation_1` (L303) is correctly ignored, and `rules.ts` says why |
| U11 | Paid-toggle dialog (L19864) with the same icon pair and `WidthConfirmButton: =96` | `Screen.tsx:936-943` | COVERED | |
| U12 | Summary tab: `con_Costs_ContentCostsSummary` (L7769) visible when the selected tab has a blank category id; `gal_Costs_ContentCostsSummary` (L7786) `Items = Filter(colDevexCapexSummaryView, Not(Name="Overleveraging"))`; total row "Total CAPEX" | **Amended 23 Oct, Phase 2.** `Screen.tsx:689` now maps `categoryNames` from `useCapexCategories()` rather than the literal `CATEGORY_LABELS`; `useCapexTotals` supplies the figures | PARTIAL | Visibility, the Overleveraging exclusion, the "Total CAPEX" caption and now the row **labels**: COVERED. The figures behind them are still keyed on `CapexCategoryTotal.category`, the same hard-coded index as D4, so an admin-added category shows a row with no total — **M-4 follow-up, D38 §4** |
| U13 | Standard-assumption values render in `themePrimary` and italic while the condition holds (`CONVENTIONS.md` rule 20) | `useStandardValueClass(edit.standard)` on the cluster labels, `Screen.tsx:789` | COVERED | |
| U14 | The grid itself is `DevexCapexSummaryPCF` — Account → Subaccount → Contract hierarchy, sticky header and Grand Total, month columns, cluster timeline band, row action menu | `PcfGrid.tsx` hosting the vendored `pcf/ui/GridRenderer.js` + `ActionDropdown.js` and the 1,270-line stylesheet, fed by `gridRows.ts` | COVERED | The renderer is outside both label gates by design; its identities are maintained by hand per `migration-plans/09-tosca-automation-conventions.md` |
| U15 | `lbl_Costs_FooterVersion.Text = ""` | Shell footer | COVERED | Empty in the canvas too |

## 5. UI/UX — popups, dialog chrome and interaction appearance

*Added 23 Oct 2026. §1–§4 compared data, behaviour, gates and captions. This section compares what
the user actually **sees**: the popup components' own geometry, fill, typography and padding.*

> **Scope, stated plainly so nothing is inferred.** This pass covered the **popup and interaction
> layer only** — the two confirmation components, the loading popup, and the dialogs raised by each
> click. It did **not** cover the screen's own container geometry: the toolbar, the tab strip, the
> grid host and the right panel's layout, measured against `src/styles/canvas.css` and the vendored
> PCF stylesheet. That is **UX-11 below, NOT YET ANALYSED**, and it is a comparable amount of work
> again. **The UI of this screen is not fully audited.**

Ids here are **UX-1 … UX-11**, deliberately distinct from this report's own `U1`–`U15` requirement
rows in §4. The session transcript and **D39** call them U-1 … U-11; they are the same items.

### 5.1 Which component backs each popup

Resolved by reading each instance's `ComponentName` and then that definition under
`Src/Components/`. Instance declaration lines in `Capex Costs Screen.pa.yaml`:

| Instance | L | Definition | Live? |
|---|---|---|---|
| `cmp_PopUp_SubaccountCostsDeletion_Confirmation` | 8088 | `cmp_PopUp_Confirmation` | **Yes** — the Delete confirmation |
| `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` | 19864 | `cmp_PopUp_Confirmation_New` | **Yes** — the paid-toggle confirmation |
| `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` | 19884 | `cmp_PopUp_Confirmation_New` | **Yes** — the relink confirmation |
| `cmp_Costs_PopUpLoading` | 18206 | `cmp_PopUp_Loading` | **Yes** — the save spinner |
| `cmp_ShowErrorInContract` | 19760 | `cmp_Information_Button_PCF` | Yes, conditional — see `S15` |
| `cmp_ReportErrorRightPanel_CapexCosts` | 8081 | `cmp_ReportErrorRightPanel` | Yes — shell-owned |
| `cmp_PopUp_Confirmation_1` | 303 | `cmp_PopUp_Confirmation` | **No** — `Visible: =false` (§0) |

`cmp_PopUp_Confirmation_2` and `cmp_PopUp_Loading_1` exist in `Src/Components/` but are **never
instantiated on this screen**. `ConfirmDialog`'s doc comment names all four confirmation
components because it serves the whole app; only two of them reach this screen.

### 5.2 The shared chrome — measured, and already correct

Both confirmation components share their chrome exactly. **`src/components/ConfirmDialog.tsx`
transcribes every row below correctly**, with citations in its own header comment. This table is
evidence of parity, not a gap list.

| Element | Canvas | Line |
|---|---|---|
| Scrim | `Fill: =RGBA(0, 0, 0, 0.1)` — 10 % black, not Fluent's 40 % | `:74` / `_New:89` |
| Card | `Fill: =Color.White`, `Width: =Min(450, Parent.Width)`, centred on both axes | `:87-92` |
| Header band | `Fill: =ColorValue(AppTheme.palette.themePrimary)`, `Height: =42` | `:100-102` |
| Title | Open Sans Semibold, `Size: =11` (→ 14.7 px), `Color: =Color.White`, `X: =20` | `:117-127` |
| Close ✕ | `Icon: =Icon.Cancel`, 20 × 20, white, `X: =Parent.Width-Self.Width-15`, fires `OnCancel()` | `:136-144` |
| Button row | `Height: =60`, transparent | `:191` |
| Confirm | filled `themePrimary` / white text, `Width: =WidthConfirmButton`, `Height: =32`, at `Cancel.X - Self.Width - 20` | `:206-227` |
| Cancel | white fill, `themePrimary` border and text, **fixed `Width: =96`**, `X: =Parent.Width-Self.Width-20` | `:232-255` |
| Hover | `HoverFillColor: =AppTheme.palette.hoverButton` (#CCE2F1), `HoverFontColor: =themePrimary` | `:209-211` |

Two consequences worth keeping in mind when reading screenshots: **Confirm sits to the LEFT of
Cancel**, both right-aligned; and the card height is **fixed, not content-driven**, so a short
description leaves a tall gap above the buttons.

### 5.3 The UX gap register

| Id | Sev | Area | Canvas | Code | Evidence |
|---|---|---|---|---|---|
| **UX-1** | **High** | Relink dialog copy | `Description` branches on the bullet count: `If(locCount > 1, header + one bullet per condition, <a tailored single sentence>)`. The one-condition arm uses **three different sentences** — e.g. `Are you sure you want to switch the 'Cost Paid by' to {payer}? This will influence the liquidity planning and BoP.` (single quotes, lower-case "by", "influence the") against the bulleted `• Switch the "Cost Paid By" to {payer}. This will impact liquidity planning and BoP.` | `rules.ts` `clusterLinkageConfirmation` always emits header + bullets | instance `Description`, live `With(...)` after two commented-out drafts |
| **UX-2** | **High** | Info-dialog height **and band height** | **Two** live per-instance dimensions. `BoxHeight` → the card (`_New:104`); `TextHeight` → the description band and its label (`_New:167`, `:205`). The paid dialog passes `BoxHeight: =200` / `TextHeight: =75` (L19868, L19878); the relink dialog computes both from the bullet count — `BoxHeight = Switch(locCount, 1, 200, 2, 250, 3, 280)` (`:19906-19936`), `TextHeight = Switch(locCount, 1, 60, 2, 120, 3, 150)` (`:20096-20126`). Each has two commented-out predecessors (rule 10); **neither `Switch` has a default arm**, so `locCount = 0` is `Blank()` — unreachable, as the dialog cannot open with no conditions | `surfaceInfo: { height: "320px" }`, fixed for every ⓘ dialog, and no notion of a band height | `_New:104`, `:14-19`, `:62-67`, `:167`, `:205`; instance props |
| **UX-3** | **Med** | Paid-confirm body | `:19869` — "Setting the **milestone-linked** cost to ‘Paid’ will remove the **milestone link** for all costs in the contract. Do you want to proceed?" (‘ ’ are U+2018 / U+2019) — while `:19879` `Title: ="Cluster-linked Costs"`. **Which half is stale is answerable**: the same instance's `OnConfirm` (`:19875`) patches `'CAPEX Project Contracts'` with `{'Linked Cluster': Blank()}`, i.e. it clears the **cluster** link, so the behaviour agrees with the title and the body is the canvas' own stale wording | had "cluster-linked" / "cluster link", silently reconciling the inconsistency | instance `Description` / `Title` / `OnConfirm` vs `panelRules.ts` `PAID_CONFIRM_DESCRIPTION` |
| **UX-4** | **Med** | Plain-variant band — **wrong on three edges** | The padding is split. The band `con_PopUpConfirmation_BodyDescription` sets **only** `PaddingTop: =16` (`:155`); the **label** sets `PaddingBottom: =0`, `PaddingLeft: =20`, `PaddingRight: =20`, `PaddingTop: =0` (`:176-179`). Effective: **top 16, left/right 20, bottom 0** | the **container** was padded **16 / 10 / 16 / 10** for both variants — too narrow left and right, plus 16 px of bottom padding the canvas does not have. The ⓘ variant's own band (`PaddingTop/Bottom: =16`, `PaddingLeft/Right: =10`, `_New:172-175`) **already matched and was deliberately not changed** | `:155`, `:176-179` |
| **UX-12** | **Med** | Application Settings error bar | *No canvas counterpart* — `ConfirmDialog`'s optional `error` MessageBar is this app's own addition | A **consequence of UX-4**, not an independent defect: with the band's bottom padding faithfully `0`, the bar (`marginTop: 12px`, no bottom margin) sits flush against the 60 px actions row on the **7 admin screens** that pass `error`. Deliberately left alone — any spacing would be invented (rule 6); where it sits today is pinned by `UT-CONFIRM-S-006`. Reverts with UX-4 | — |
| **UX-5** | Low | ⓘ block corners | `con_PopUpConfirmation_BodyDescription_Inside_2` sets **no** `Radius*` → square | had `borderRadius: "4px"` | `_New:182-193` |
| **UX-6** | Low | ⓘ block padding | only `PaddingLeft: =10`, `PaddingRight: =5` — **no vertical padding**; the outer band carries `PaddingTop/Bottom: =16` | added `paddingTop/Bottom: "10px"` on top of the band's 16 | `_New:172-175`, `:191-192` |
| **UX-7** | Low | Save spinner | `Height: =If(InformationText = "", 120, 90)` — 120 px with no text, 90 px with | `spinnerBox: { height: "90px" }`, fixed | `cmp_PopUp_Loading:48-55` |
| **UX-8** | **High** *(was an open question; now resolved — a defect)* | Relink dialog title | `Title` (`:20127-20170`) is `With({locCountOfMessages: C1 + C2filtered + C3}, If(count >= 2, "Confirm Changes", C1, "Change Cost Paid By", C2filtered, "Change Cluster Link", C3, "Cluster-linked Costs"))` — **four** arms, keyed on the count | Wrong **twice**: (1) keyed on `showC1 && showC2`, not the count, so the two-message cases **C1+C3** and **C2+C3** were mis-titled and must read "Confirm Changes"; (2) the **fourth arm was missing entirely** — a milestone-relink reset alone titles the dialog "Cluster-linked Costs", where the code said "Change Cluster Link". Note that is the **same title as the paid dialog** (L19879), more of the cluster/milestone confusion behind UX-3. Four existing tests (`UT-CAPEXR-109`, `-110`, `-111`, `-113`) had been **pinning the defect** and were corrected | instance `Title` `:20127-20170` |
| **UX-9** | **Open question** | In-panel error strip | `cmp_ShowErrorInContract` (`Visible` = `locEditSaveButtonEnabled && Individual && locShowErrorInContractCost && Len(ErrorTitle) > 0`) | no equivalent; Save is simply disabled | same as `S15` — listed here for completeness of the popup inventory |
| **UX-10** | **Open question** | Report-a-problem panel | `cmp_ReportErrorRightPanel_CapexCosts` (L8081) | `features/shared/report-problem` exists; its appearance was **not compared** | — |
| **UX-11** | **NOT YET ANALYSED** | Toolbar, tab strip, grid host, right-panel layout | container geometry, `FillPortions`, `LayoutGap`, paddings, the cluster-timeline band | `src/styles/canvas.css`, `PcfGrid.tsx`, the 1,270-line vendored stylesheet | — |

**Blast radius — corrected 23 Oct 2026.** Two of these were first characterised wrongly, and both
corrections came from enumerating call sites rather than reasoning about them:

- **UX-5 and UX-6 are not CAPEX-only.** An exhaustive grep finds exactly **three** `variant="info"`
  call sites: the two CAPEX confirmations, **and `features/pm/revenues/Screen.tsx:1302`, the
  hedge-over-100 dialog**. So squaring the ⓘ block and removing its 20 px of vertical padding
  changes a **Project Management** screen as well. **PM Revenues belongs in the smoke test.**
- **UX-7 is the opposite — zero visible change.** All 42 `<LoadingOverlay>` sites across 27 files
  were read: exactly four pass no `label`, and **all four are `mode="inline"`**
  (`pm/revenues:620`, `pm/grid-operator:142`, `pm/production:666`, `pm/generators:1649`), which is
  this app's own addition with no canvas counterpart. **No `mode="blocking"` site renders without a
  label today**, so the canvas' 120 px branch is unreachable in production. It is a latent-parity
  fix: `FormPanel.tsx:132-133` gate on `!== undefined` rather than truthiness and would pass `""`
  through, and `UT-LOADOVL-007` now pins that case to the 120 px branch.

**One detail that a future tidy-up would destroy.** The **trailing space on `locMsg3`** (`:19989`) is
load-bearing: the single-condition branch concatenates `locMsg3 & "Do you want to continue?"` with
no separator, so that space is what parts the two sentences, while the multi-condition branch uses
`locMsg3` as-is and its bullet genuinely ends in a space. The previous code dropped it; it is
restored and pinned by `UT-CAPEXR-119`.

### 5.4 Per-popup interaction appearance

What each click should produce, as the canvas renders it:

| Click | Opens | Appearance |
|---|---|---|
| Grid row menu → **Delete** | `cmp_PopUp_Confirmation` | 450 × **260**, plain description inset 20 px at `Size: =11`, Confirm ✓ (`IconConfirmButton: ="CheckMark"`) and Cancel ✕ (`="Cancel"`), both 96 px |
| Grid month cell → **paid toggle** on an Individual + cluster-linked contract | `cmp_PopUp_Confirmation_New` | 450 × **200**, description in the pale ⓘ block at `Size: =9`, `TextHeight: =75`, Confirm with **no icon** (`IconConfirmButton: ="Text"`) and Cancel with a **✓** (`="CheckMark"`) |
| Panel **Save** when the relink gate trips | `cmp_PopUp_Confirmation_New` | 450 × **200 / 250 / 280** by bullet count, same ⓘ block and icon pair, Confirm label "Confirm" or "Confirm All" with `WidthConfirmButton` following it |
| Panel **Save** (proceeding) | `cmp_PopUp_Loading` | 240 px card, `Radius*: =5`, `DropShadow.None`, spinner at `Y: =50`, label 10 px beneath in Segoe UI Semibold 11 pt centred |
| Panel open / tab switch / year change | screen spinner | `spn_LoadingSpinnerCost`, `locIsVisibleLoadingCostSpinner` |

Note the **icon pairs differ between the two live ⓘ dialogs and the plain one**, and that
`IconConfirmButton: ="Text"` is not a PowerCAT icon name at all — it renders nothing, which is why
`ConfirmDialog` models it as `confirmIcon="none"`.

### 5.5 Remediation state

Phase 1 of the UI remediation ran in the working tree while this section was written, so the
statements below are what was **verified present at the time of writing** — all of it
**uncommitted and unapproved**:

- **UX-3** corrected in `panelRules.ts`, with a `SOURCE DEFECT` note on the canvas' title/body
  inconsistency.
- **UX-7** corrected in `LoadingOverlay.tsx` (`spinnerBoxNoLabel` / `spinnerBoxWithLabel`), plus
  `UT-LOADOVL-007`.
- **UX-2**: a `boxHeight` prop added to `ConfirmDialog.tsx`, with the ⓘ default deliberately left
  at 320 so no existing caller moves. `textHeight` follows the same additive pattern.
- **UX-4 / UX-5 / UX-6** applied to `ConfirmDialog.tsx`, with the plain band's values moved into
  their own class so the fix cannot leak into the ⓘ variant — which already matched.
- **UX-8** fixed in `rules.ts`, including the four tests (`UT-CAPEXR-109`, `-110`, `-111`, `-113`)
  that had been asserting the defective titles, and `UT-CAPEXR-119` for the `locMsg3` trailing
  space.
- **UX-12** deliberately **not** acted on — see its row; the value cannot be sourced from the canvas.

**Being in the tree is not approval** — every item is *proposed* in D39, and the CAPEX wiring that
passes the canvas `BoxHeight` / `TextHeight` values is Phase 2, not Phase 1.

## Counts

*Counts as amended 23 Oct 2026 — D4 moved from WRONG to PARTIAL when Phase 2 closed half of M-4.*

The 65 rows below are the §1–§4 requirement rows only. The **UX-1 … UX-12** register in §5 is a
separate taxonomy and is deliberately not folded into these totals — §5 compares rendered
appearance, §1–§4 compare requirements. As amended 23 Oct 2026 it holds **12 ids: 9 findings
(UX-1 … UX-8, UX-12), 2 open questions (UX-9, UX-10), and 1 area not yet analysed (UX-11)**.
UX-8 moved from open question to finding when the canvas `Title` formula was read; UX-12 was added
as a consequence of UX-4.

| Status | Count |
|---|---|
| COVERED | 51 |
| PARTIAL | 7 |
| MISSING | 2 |
| WRONG | 5 |
| **Total** | 65 |

For a screen of this size that is a high parity rate, and the `rules.ts` / `panelRules.ts` /
`clusters.ts` comments carry canvas line citations throughout.

The backlog is not simply "the WRONG rows". Reading the two columns together:

- **WRONG (5).** `D15` (H-2, deletes bypass `deleteRecord`), `D17` (H-1, the missing "2 months"),
  and `U4` + `U9` (M-3, four verbatim strings — two rows, one decision) are work. `D2` is **not**:
  it is the hard-coded test-project fallback, already registered as canvas bug **A-2** and
  deliberately not reproduced, listed only for completeness.
- **PARTIAL (7).** `D4` and `U12` are the half-closed **M-4** and carry the follow-up in (f) 1.
  `D12` (L-6), `D14` (L-7) and `B2` are marker-only. `B9` and `S14` are open questions, not
  defects.
- **MISSING (2).** `S15` is a question; `S17` is **M-5**, pending the product owner.

## Proposed changes

Severity letters match D38. **S** = small, **M** = medium.

### (a) `rules.ts` (+ tests)

1. **S — H-1 (D17).** Replace the four-element `FREQUENCY_OPTIONS` with the five canvas values,
   derived from `DISTRIBUTION_FREQUENCY` (`data/dataverseNames.ts:621`) rather than re-declared
   (rule 17). Keep the export name and shape so `Screen.tsx` needs no edit. Correct the comment,
   which currently asserts the canvas offers four. Add tests pinning `[1,2,3,6,12]` and
   `frequencyLabel(2) === "2 months"`, alongside the existing `UT-OPEX-073`.

### (b) `data/capexWrites.ts` (+ tests)

1. **S — H-2 (D15).** Route all three deletes through `deleteRecord` (`data/client.ts:113`),
   following `data/adminCapexAccounts.ts:297` and its refusal test `UT-ADCAPEX-019`. Entity sets
   are `vsb_capexcosts` and `vsb_capexprojectcontracts`. Add tests that a refused delete rejects
   rather than resolving, and that the order stays comments → costs → contract.
2. **S — L-7 (D14).** Add the `DIVERGENCE:` comment recording that the canvas'
   `RemoveIf('CAPEX Costs', …)` is commented out and it relies on the cascade, while this app
   deletes the cost rows explicitly.

### (c) `Screen.tsx` (+ `Screen.test.tsx`)

1. **S — M-3 (U4).** Restore "Start Date Distribution" and "End Date Distribution". Put both in a
   `MSG` object with their `Control.Property` citation rather than inline (rule 7). The
   `aria-label` values must **not** change, or `check:canvas` C4 fires.
2. **S — M-3 (U9).** Restore the delete dialog's four strings, including the interpolated
   description — the account name is already in scope through `book.accounts`. Reconsider
   `destructive`; the canvas uses the standard confirm styling. **Needs product sign-off.**
3. **M — M-4 (D4, U12). DONE in the tree, awaiting approval.** `Screen.tsx` calls
   `useCapexCategories()` and passes the result into `categoryTabs(...)`,
   `resolveCategory(raw, count)`, the Summary rows and the comments breadcrumb; the existing
   `rules.ts` fallback to `CATEGORY_LABELS` was reused rather than re-implemented. **This closes
   only half of M-4** — see (f) 1 for the remaining half and the new failure mode it leaves
   behind, which a reviewer should read before approving this change.
4. **S — L-6 (D12), L-8.** Comments only: record that the canvas gates its equal-distribution
   recompute on the five `locChanged*` flags while this app always recomputes-and-reconciles; and
   that the code writes `Average Payment` / `Linked Cluster` on create where the canvas' blank
   `LookUp` silently skips both (canvas bug C-7).

### (d) `costing/useCostBook.ts`

1. **S — M-4. DONE in the tree, awaiting approval.** `useCapexCategories()` added over
   `loadCapexCategories()` (`data/costBook.ts:742`, already tested as `UT-BOOK-047`), mirroring
   `useProjectStates` with a long `staleTime`.

### (e) Not proposed — needs a decision first

- **M-5 / S17.** The three 1.21.753 arithmetic changes (R2, R3, R4). Behaviour changes against a
  solution newer than the YAML on disk.
- **S15.** Whether to add the in-panel error strip.
- **B9.** Whether the panel's year list should follow the canvas' own `costStart … costEnd + 3`
  span rather than the grid's navigation window.

### (f) Follow-ups — no decision needed, deliberately out of scope here

*Added 23 Oct 2026 after Phase 2. Neither item is a product question; both are scoped out so they
are not lost.*

1. **M-4, the remaining half — re-base `CostAccount.category`.** `loadCostAccounts`
   (`data/costBook.ts:806-807`) still does `CATEGORIES.indexOf(level1.name)` and `continue`s past
   an unrecognised name, dropping that category's whole subtree. With the tab strip now
   data-driven, an admin-added category renders **a tab and a summary row with nothing behind
   them**. Closing it means deriving the index from the loaded category list instead, which moves
   every consumer of that numeric index at once — `accountsInCategory`, the per-category fetch
   scoping in `useCostBook`, `CapexCategoryTotal.category`, and the `?category=` URL contract —
   plus a decision about behaviour while the list is still loading. Wider blast radius than the
   Phase 2 change, hence separate. The doc comment at `data/costBook.ts:718-724` describes the old
   behaviour and should be corrected in the same pass. **D38 §4.**
2. **Move the C-7 `SOURCE DEFECT` marker to the write site.** It was written into
   `features/cost/capex-costs/Screen.tsx`, where the defect was found, but the create that
   actually writes `vsb_averagepayment` and `vsb_LinkedCluster@odata.bind` is `saveCostLine` in
   `data/capexWrites.ts`. Someone auditing the write path would not see it there. Comment-only;
   leave at most a pointer behind. **D38 §8.**

## Open questions for the product owner

1. **1.21.753 arithmetic (S17).** Apply R2 (`RoundDown` for `% Values`), R3 (shortfall to the
   latest positive month) and R4 (percent mode on open only when the total is non-zero)? All three
   change stored figures.
2. **Delete dialog styling (U9).** Keep the red `destructive` confirm, or revert to the canvas'
   plain Confirm? The four strings should be restored either way.
3. **Delete semantics (D14).** Keep this app's explicit cost-row deletes, or adopt the canvas'
   reliance on the Dataverse cascade (contract → costs is Cascade in VSBCloud_Dev, per
   `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §8)?
4. **New-contract `Average Payment` (canvas bug C-7).** The canvas never writes it, or the cluster
   link, when an equal-distribution contract is *created*. This app writes both. Keep the fix, or
   revert to canvas parity?
5. **In-panel error strip (S15).** The canvas tells an individual-distribution user why Save is
   blocked; this app only disables the button. Add it?
6. **Panel year span (B9).** The canvas' Add/Edit panel lists `costStartYear … costEndYear + 3`;
   this app reuses the grid's navigation window. On projects where COD and End Date are far apart
   the two differ. Which is intended?
7. **Permission gates (S14).** `DataSourceInfo('CAPEX Costs', CreatePermission/DeletePermission)`
   has no SDK equivalent (decision **D1**). Confirm the provisional answer — the server refuses
   and a 403 becomes a message — still stands for this screen.
