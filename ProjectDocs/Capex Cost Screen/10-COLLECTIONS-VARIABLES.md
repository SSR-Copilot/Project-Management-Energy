# 10 · Collections and variables: DEVEX/CAPEX Costs screen

Gap ID prefix: **GAP-VAR**. Sibling files own the behaviour around each variable. This file owns the inventory of every piece of state: what it is, where it is set, where it is read, how long it lives, and what replaces it in the code app.

- 07-FUNCTIONAL-SCREEN-AND-GRID.md: the load sequence, timers and grid actions.
- 08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md: the panel and its save path.
- 09-COMMENTS-PANEL.md: the comments panel.
- 06-POPUPS.md: the dialogs and loaders.
- 14-PCF-CONTROLS.md: the PCF contract.
- 11-DATAVERSE-TABLES.md: the tables and columns.

---

## 1. Scope

### 1.1 What is inventoried

| Kind | Rule used to find it |
|---|---|
| **Global variable** | Every `Set(...)` target, read or written on the screen, plus the `App.OnStart` globals the screen or its components read. `varPCFInputData` is the one `var*` that is a real global (`Set`, L2773). |
| **Context variable** | Every top-level key of an `UpdateContext({...})` record on the screen, and the keys of the context record that `Navigate(...)` hands to *Add Costs from Table*. |
| **Collection** | Every `col*` target of `ClearCollect`, `Collect`, `Clear`, `Remove`, `RemoveIf`, `UpdateIf` or `Patch(col…)`, and every `col*` the screen reads but another file fills. |
| **Named formula** | The `App.Formulas` entries (`App.pa.yaml:12-187`). |
| **Component / PCF property** | The custom input and output properties of the canvas components and code components on the screen that carry state. |
| **`With`-scoped names** | Many `loc*` and `var*` names on this screen are **not variables**. They are `With({…})` record keys, which exist for one formula evaluation only. They are listed separately in §2.5 so nobody ports them as state. |

### 1.2 Files and line ranges read

- `ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`. It is **20,178 lines**; the shared brief says 20,082. Read in ranges:
  - L1-1017 (OnVisible, the popup, the code buttons, the timers);
  - L1017-2299 (the Refresh button, whole);
  - L2323-2560, L2560-3090, L3225-3610, L3610-3705 (header, navigation, tabs, toolbar, command bar, year icons);
  - L4296-4330, L4505-4545, L6090-6130, L6264-6300 (the legacy gallery);
  - L7160-7168, L7234-7768 (the PCF and the paid/unpaid button);
  - L8081-8170, L8225-8245, L8360-8460, L8519-8535, L8978-9050, L9696-9750, L10092-10226 (the comments panel);
  - L10255-10342, L10476-10500, L10590-10910, L11440-11500, L12225-12295, L13605-13620 (the right panel);
  - L17540-17716, L18155-18186 (the panel footer);
  - L18223-18926 (the standard contract code button);
  - L18926-19140, L19580-19884, L19886-20178 (the timers and popups).
- Formulas stored as escaped YAML strings were decoded and read in full. Each is cited by its YAML line plus *decoded line n*:
  - L782: `tmr_Capex_Initial_Load.OnTimerEnd`, 100 decoded lines.
  - L17574: `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save.OnSelect`, 1,918 decoded lines.
  - L17687: `btn_SaveCost_Execute____.OnChange`, 1,898 decoded lines.
  - L19875: `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation.OnConfirm`.
- `App.pa.yaml`: `Formulas` (L12-187), `OnError` (L188-204), and `OnStart` (L205, 968 decoded lines, read whole).
- `Components/*.pa.yaml`: the custom-property declarations and every `gbl*` reference.
- The other screens were checked for writes to the shared collections. *Add Costs from Table* writes several of them; see §2.4.8.
- `AppCheckerResult.sarif`: the `app-UnusedVariables`, `app-WarnInvalidTypeForVariableDefinition` and `app-CollectingReadOnlyTable` results. These corroborate §2.8.
- The PCF manifest: `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/ControlManifest.Input.xml` L34-105.
- The code app:
  - `features/cost/capex-costs/` (Screen.tsx, CommentsPanel.tsx, PcfGrid.tsx, rules.ts, panelRules.ts, clusters.ts, comments.ts, gridRows.ts, standardContracts.ts, and the test files);
  - `features/cost/costing/useCostBook.ts`;
  - `data/keys.ts`, `data/costBook.ts`, `data/odata.ts`;
  - `app/SessionContext.tsx`, `app/routes.tsx`;
  - `App.tsx`;
  - `components/LeftNav.tsx`, `components/AppHeader.tsx`;
  - `features/cost/contracts/rules.ts` (`ProjectContext`).

### 1.3 Method

Two read-only scripts were run over the screen YAML and over each decoded formula:

- One extracted every write site, with control, property and line, and flagged sites inside `/* */` or `//` comments.
- One extracted every live reference.

The de-duplicated identifier list has **231 names**:

- **17 `gbl*`** names.
- **43 `col*`** names. One of them, `colDistributionFrequency`, is a named formula, not a collection.
- **130 `loc*`** names:
  - **74** are real context variables. Some of these are set only in dead or commented-out code.
  - **56 are not context variables of this screen**:
    - about 45 are `With` keys;
    - 9 are `Navigate`-context keys created on *Add Costs from Table*;
    - 2 (`locSelectedAccountCategory`, `locEditingCommentId`) are never set anywhere.
- **41 `var*`** names. All except `varPCFInputData` are `With` keys.

Counts of "read sites" are live references only, not counting the assignment itself.

### 1.4 Dead zones: code that writes state but can never run

These matter for the "set but never read" and "only ever set to one constant" findings below.

| Zone | Why it is dead | Cite |
|---|---|---|
| `cmd_Costs_ProjectCosts_TableCommandBar` (the whole `OnSelect` L3233-3563 and `Items` L3088-3232) | Its container `con_Costs_ProjectCosts_TableCommandBar` has `Visible: =false`, and so does the control itself | L3080, L3566 |
| `pcf_Costs_ProjectCosts_TableNavigation_NextYear` / `_PreviousYear` | Container `con_Costs_ProjectCosts_GalleryNavigation` has `Visible: =false` | L3595 |
| The legacy gallery `gal_Costs_ProjectCosts`, its header and its month summary (the labels `lbl_Costs_label_139…174`, the margin icon at L7165, the radio images at L6094-6146) | `Visible: =//true`: the whole formula is a comment, so it is blank (inferred: renders hidden) | L3730, L4323, L6311 |
| `cmp_PopUp_Confirmation_1` | `Visible: =//locShowClusterLinkageConfirmation` then `false` | L425-427 |
| `tgl_Costs_ProjectCosts_TableCommandBar_ShowInactiveAccounts`, `tgl_…_FiscalYear` | `Visible: =//true` then `false` | L2858-2860, L2871-2873 |
| `TextCanvas1`, `Text1` | Debug labels, `Visible: =false` | L449, L19861 |

---

## 2. Canvas implementation

### 2.1 Global variables (`Set`)

The table below gives each global, where it is set, its shape, and its read sites. Lifecycle and classification for every global are in §2.1.1.

| # | Name | Set (control.property:line) | Shape | Read (key sites; count) |
|---|---|---|---|---|
| G1 | `gblSelectedProject` | `App.OnStart` decoded L556-572 (`LookUp(Projects, Project = GUID(Param("projectId")))`, else the hard-coded GUID `33b9cc79-…`); `Screen.OnVisible` L42-55 (same formula, re-run on **every** visit); the dead command bar L3275, L3362, L3426, L3494 | Record from `Projects` (all columns; no `ShowColumns`) | 143 live references. Key ones: `btn_Capex_Cost_Build_StandardContractOptions_Code.OnSelect` L468-475 (country, technology, project); `btn_Capex_Cost_Add_Standard_Contract_Code.OnSelect` L18242-18519 (28×); both save formulas (27× each, `'Besitzer (Unternehmenseinheit)'` for Owning BU, decoded L991, L1139); `tmr_Load_Contract_Gallery_Warmup` L19596-19611; `con_Costs_BodyRightSide.Visible` L2412; the add-from-table `Navigate` L2800 |
| G2 | `gblSelectedProjectYear` | `App.OnStart` decoded L595-612 (`Year(...)` of acquisition date or project start, if later than today, else today); `Screen.OnVisible` L247-256 (clamped into `locNavigationMinYear…MaxYear`); `drp_Costs_ProjectCostbtn_ShowSelectedYear.OnChange` L2934-2937; `btn_…ShowPreviousYear.OnSelect` L2983-2989; `btn_…ShowNextYear.OnSelect` L3056; dead: L3618, L3690 (the hidden PCF icons); commented-out, not live: L3042 | Number (a year) | 171 live references. Key ones: the Refresh button L1210, L1431, L1845-2133 (selected-year mapping); `DevexCapexSummaryPCF.StartYear` L7654; `Cluster1..6Date` fallback L7240-7270; `drp_…ShowSelectedYear.Default` L2926; prev/next `DisplayMode` L2965, L3004; the category timers L18964 |
| G3 | `gblClusterDurations` | `App.OnStart` decoded L849-901 only, inside `Concurrent` | Table of 6 records: `{Order, Name, StartMonth, StartYear, EndMonth, EndYear}`, chained off the project's own milestone columns (`'1-Feasibility studies'` → `'2-Project development started'` → … → `'Operations start date (COD)'` → `'End Date'`) | 37 references. `Screen.OnVisible` L154-163 (min/max year); `btn_…Build_StandardContractOptions_Code` L514-674 (10×); `tmr_Capex_Initial_Load` guard (decoded L9); both "other cluster having cost" buttons L796-850; `DevexCapexSummaryPCF.Cluster1..6Date` L7240-7271; both save formulas (5× each) |
| G4 | `gblRecordSelectedProjectCountry` | `App.OnStart` decoded L582-588 (`LookUp(Countries_1, Country = gblSelectedProject.Country.Country)`) | Record from `Countries_1` | 47 references, all in the right panel: total-cost ceiling `Name = "Poland"` L10937, L10949, L11016; currency text L12154; the 12 month-input error labels (2× each, L13222-17238) |
| G5 | `gblProjectHeaderData` | `App.OnStart` decoded L573-581 | Record `{ID, Name, Technology (text), Approval (text)}` | 1: `cmp_Costs_Header.Project` L2336 |
| G6 | `gblTableApprovalStateColors` | `App.OnStart` decoded L818-838 | Table `{State, Color}` × 4 (Draft, Approving, Approved, Rejected) | 1: `cmp_Costs_Header.ApprovalStatesColor` L2327 |
| G7 | `gblPMAppURL` | `App.OnStart` decoded L40-43 (from `gblEnvironmentID`, `gblProjectManagementAppID` and `gblTenantID`) | Text (URL) | 1: `cmp_Costs_Header.OnLogoClick` L2335 (`Launch(gblPMAppURL)`) |
| G8 | `gblAppStarted` | `App.OnStart` decoded L1-4 (`false`) and L964-967 (`true`) | Boolean | 4: `con_Costs_Body.Visible` L2356; `con_Costs_Footer.Visible` L8037; the `OnVisible` readiness guard L283; the `tmr_Capex_Initial_Load` guard (decoded L4) |
| G9 | `gblAppConstants` | `App.OnStart` decoded L339-349 | Record `{NotifyTimeOut: 500, Form: {New, Edit, Display}}` | 9: every `Notify(…, gblAppConstants.NotifyTimeOut)` (L7376, L7388, L7743, L7756, L18634, L18795; dead: L3313, L3401); `locSelectedSubaccountCommandMode` seed L27 |
| G10 | `gblAppTheme` | `App.OnStart` decoded L48-51 (`= AppTheme`, the named formula) | Record `{palette: {...}}`, 50 hex strings | 110 references (colours). Owned by 03-THEMES.md |
| G11 | `gblAppThemeJson` | `App.OnStart` decoded L52-58 (`JSON(gblAppTheme, Compact)`) | Text (JSON) | 6: the `Theme` input of every PowerCAT code component (L3564, L3668, L3699, L10246, L17690, L18203) |
| G12 | `gblAppStyles` | `App.OnStart` decoded L351-445 | Record of style records (`Screen`, `Container`, `Label`, `ButtonTransparent`, `Icon`, `Divider`, `Gallery`) | 1,231 references (styling). Owned by 03 and 04 |
| G13 | `gblAppSizes` | `App.OnStart` decoded L299-334 | Record `{Padding, Form, Font, LeftNavigation, Position, RightPanel}` | 154 references (layout). Owned by 02 |
| G14 | `gblAppColors` | `App.OnStart` decoded L446-552 | Record of colour records | 133 references, right panel only (L10442-13209). Owned by 03 |
| G15 | `gblLeftNavigationMenuIsExpanded` | `App.OnStart` decoded L335-338 (`true`); `cmp_Costs_Left_Navigation.OnExpand` L2381-2384 (toggle); the same on the other three screens | Boolean | 3: `con_Costs_LeftNavigationMenu.Width` L2370; `cmp_Costs_Left_Navigation.IsExpanded` L2378; its own toggle |
| G16 | `gblLeftNavigationSelected` | `App.OnStart` decoded L44-47 (`First(LeftNavigationMenu)`); `cmp_Costs_Left_Navigation.OnSelect` L2388-2394; the same on the other screens | Record of `LeftNavigationMenu` | 3: `cmp_Costs_Left_Navigation.OnSelect` L2387 and L2396 (`Navigate(gblLeftNavigationSelected.TargetScreen, …)`); `.Selected` L2400 |
| G17 | `gblShowReportProblemPanel` | Not set on this screen. Set in `cmp_Header` (`pcf_HeaderContainerReportError_CommandBar.OnSelect`, `cmp_Header.pa.yaml:537`) and cleared in `cmp_ReportErrorRightPanel` (L88, L354, L420) | Boolean | 1: `cmp_ReportErrorRightPanel_CapexCosts.Visible` L8086 |
| G18 | `varPCFInputData` | `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.OnSelect` L2773-2776 (`JSON(colAddCostFromTable)`). Commented `// this is for change and test` | Text (JSON of the whole sheet) | 1: passed on as `locPCFJsonInput` in the `Navigate` context, L2789 |

#### 2.1.1 Lifecycle and class

| # | Name | Lifecycle | Class |
|---|---|---|---|
| G1 | `gblSelectedProject` | Initialised at `App.OnStart` and **re-read on every visit** by `OnVisible`. Never cleared. `gblClusterDurations`, `gblProjectHeaderData` and `gblRecordSelectedProjectCountry` are **not** recomputed when `OnVisible` refreshes it | Cache of server data |
| G2 | `gblSelectedProjectYear` | Seeded at `OnStart`. Clamped by every `OnVisible`. **Survives navigation to the other four screens** (global) | UI state |
| G3 | `gblClusterDurations` | `OnStart` only. Never refreshed, even though `OnVisible` re-reads the project. Always 6 rows, with blank `Start*`/`End*` where a milestone is missing | Derived from server data |
| G4 | `gblRecordSelectedProjectCountry` | `OnStart` only | Cache of server data |
| G5 | `gblProjectHeaderData` | `OnStart` only | Derived |
| G6 | `gblTableApprovalStateColors` | `OnStart` only | Constant (theme-derived) |
| G7 | `gblPMAppURL` | `OnStart` only | Derived from environment variables |
| G8 | `gblAppStarted` | Set to `false` first and to `true` last in `OnStart` | App lifecycle flag |
| G9 | `gblAppConstants` | `OnStart` only | Constant |
| G10 | `gblAppTheme` | `OnStart` only | Constant |
| G11 | `gblAppThemeJson` | `OnStart` only | Derived constant |
| G12 | `gblAppStyles` | `OnStart` only | Constant |
| G13 | `gblAppSizes` | `OnStart` only | Constant |
| G14 | `gblAppColors` | `OnStart` only | Constant |
| G15 | `gblLeftNavigationMenuIsExpanded` | App session | UI state |
| G16 | `gblLeftNavigationSelected` | App session | UI state |
| G17 | `gblShowReportProblemPanel` | Blank (falsy) until the header menu sets it | UI state |
| G18 | `varPCFInputData` | Set on every click and never cleared. Holds the whole JSON until the next click | Derived (serialised collection) |

#### 2.1.2 Globals read only inside components on this screen

`cmp_Header` reads these directly, not through its properties (`Components/cmp_Header.pa.yaml`). 01-EDIT-COST-MODULE.md owns them; they are listed here so the inventory is complete.

| Name | Set in `App` | Read by | Class |
|---|---|---|---|
| `gblAppVersion` | OnStart decoded L650-656 | `cmp_Header` | Config |
| `gblEnvironmentName` | OnStart decoded L657-663 | `cmp_Header` | Config |
| `gblInfoCenterLaunchUrl` | OnStart decoded L5-11 | `cmp_Header` | Config |
| `gblCurrentUser` | OnStart decoded L59-62 (`varCurrentUserProfile`), overwritten L233-280 with the role record | `cmp_Header` | Server-derived |
| `gblReportError` | `App.OnError` L189-198 | `cmp_Header` (warning icon), `cmp_ReportErrorRightPanel` | Error state |

#### 2.1.3 OnStart globals that no control on this screen or its components reads

`gblTenantID`, `gblEnvironmentID` and `gblProjectManagementAppID` are inputs to `gblPMAppURL` only. The others are:

- `gblProjectApprovalServiceGroupID`;
- `gblAppResx`;
- `gblAreaWithRegion` (Italy only);
- `gblSelectedProjectCODYear`. App Checker flags it `app-UnusedVariables` (`App.gblSelectedProjectCODYear`).

The App-level collections `colProjectApprovals`, `colProjectApprovalsExtended`, `colProjectCountryApprovals`, `colDistinctCurrentUserTeamsRoles`, `colCurrentUser*`, `colAllCurrentUser*`, `colUserCountries`, `colOpexAccounts`, `colOpexSubaccounts` and `colLandLeaseSubaccounts` are also never read on this screen.

### 2.2 Named formulas (`App.Formulas`, `App.pa.yaml:12-187`)

| Name | Definition | Used on this screen | Notes |
|---|---|---|---|
| `AppTheme` | `{palette: {...}}`, 50 colours (L13-58) | Indirectly, via `gblAppTheme` (G10) | Copied into a global at OnStart, so the named formula's reactivity is lost |
| `EmptyGUID` | `GUID("00000000-…")` (L59) | No | — |
| `varCurrentUserProfile` | `RenameColumns(LookUp(Users, 'Azure AD Object ID' = User().EntraObjectId), …)` (L60-73) | No (feeds `gblCurrentUser`) | A *named formula* despite the `var` prefix |
| `Developers` | Table of 10 mail addresses (L74-85) | No | Only referenced in a commented-out `LeftNavigationMenu` row (L155) |
| `LeftNavigationMenu` | Table of 7 nav items (L86-159) | `cmp_Costs_Left_Navigation.Items` L2379; `OnSelect` `LookUp` L2391 | Source of `gblLeftNavigationSelected` |
| `DefaultProjectCostsMarginValue` | `10` (L160) | No | Dead; `migration-plans/02-global-state-and-data.md:281` already calls it confirmed dead |
| `colDistributionFrequency` | Table `{ID, Value, Label}` × 5: 1, 2, 3, 6, 12 months (L161-187) | `drp_AddContract_RightPanel_PaymentFrequency_1.Items` L11855 and `DefaultSelectedItems` L11846 | A *named formula* despite the `col` prefix, so it cannot be `Collect`ed |

### 2.3 Context variables (`UpdateContext`)

Context variables persist for the screen across navigation within the app session. `OnVisible` re-seeds 20 of them (L15-38). In the "Class" column, *UI* means UI state, *Cache* means a server-data cache, and *Derived* means computed from other state.

#### 2.3.1 Load lifecycle

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locCapexInitialLoadPending` | `OnVisible` L18 (`true`), L290 (`false` when the base data is ready), L297 (`true` when it is not); `tmr_Capex_Initial_Load` decoded L13 (`false`) | Boolean | `tmr_Capex_Initial_Load.Start` L784; the timer guard (decoded L2) | Re-armed per visit. The timer repeats every 500 ms (`Repeat: =true`, L783) until the guard passes | UI (timer workaround) |
| `locCapexInitialLoadDone` | `OnVisible` L19, L291, L298; timer decoded L14 | Boolean | Timer guard (decoded L3) | As above | UI (timer workaround) |
| `locIsVisibleLoadingCostSpinner` | `OnVisible` L17, L289, L296; Refresh L1018 (true) and L2296 (false); Reload L726, L771; tab `OnSelect` L2451, L2509, L2512; year controls L2933/L2940, L2974/L2993, L3055/L3059; delete confirm L8108, L8146; the category timers L19025, L19129; initial timer decoded L15, L94; dead toggles L2833-2856 | Boolean | **Only** `spn_LoadingSpinnerCost.Visible` L19754 | Toggled true then false within one synchronous formula in most sites, so it rarely paints (inferred) | UI |
| `locStartCategoryBinding` / `locStartCategoryBinding1` | Tab `OnSelect` L2443-2444 (`false`); `tmr_Capex_Cost_Category_SwitchTabs.OnTimerEnd` L19026 (`false` / `true`, the chain kick); `_1.OnTimerEnd` L19130 (`false`); initial timer decoded L16-17 | Boolean | `tmr_Capex_Cost_Category_SwitchTabs.AutoStart` L18931 and `_1.AutoStart` L19035 | **No live site ever sets `locStartCategoryBinding` to `true`**, so the first timer never auto-starts and the chain to `_1` never fires (inferred from the set sites) | UI (timer workaround), effectively dead |
| `locScreenVisitStamp` | `OnVisible` L36 (`GUID()`) | GUID | `DevexCapexSummaryPCF.CollapseResetKey` L7274 (`category id & "|" & stamp`) | New per visit; forces the PCF to collapse all rows | UI |
| `locBindGallery` | `OnVisible` L30 (`false`) | Boolean | **Never read** | Constant | Dead |

#### 2.3.2 Category, year and navigation window

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locSelectedCapexAccountCategory` | `OnVisible` L259-276 (keeps the previous record if it has a `'CAPEX Account List'`, else the first non-"Overleveraging" category by `vsb_order`); initial timer decoded L23-26 (**"DEVEX/CAPEX Summary"**); tab `OnSelect` L2450 (`Self.Selected`); add-from-table L2572; delete confirm L8107; both save formulas decoded L1173 / L1867 (`tab.Selected`); dead toggles | Record of `colCapexAccountCategoriesNew` | 25 references. Refresh L1026, L1219, L1362, L1388; `CollapseResetKey` L7274; the category timers L18935, L19039; the readiness guard L283; tab `Default` L2435 | Survives navigation (context), restored on return | UI |
| `locProjectStartClusterNo` | `OnVisible` L58-82 (`Switch` on `'Start Cluster'`: Greenfield → 0, Cluster n → n); dead command bar L3278, L3365, L3431, L3499 | Number 0-6 | 31 references. Standard options L691-695; the standard-contract button L18286-18308 (4×); the warm-up timer L19598; `btn_SaveCost_Execute____` decoded L1311, L1647; the cluster check-box `DisplayMode` / `Checked` (L11303 …); the dead command bar `Items` | Per visit | Derived from server data |
| `locCostAllowedStartYear` | `OnVisible` L107-111; warm-up timer L19615; dead command bar L3294, L3381 | Number (year) | 11 references. `OnVisible` L175, L242; prev-year `DisplayMode` / `OnSelect` L2957, L2978; add-from-table `locProjectStartingYear` L2795 | Per visit, and recomputed (with a different fallback order) each time the panel opens | Derived |
| `locCostAllowedStartDate` | `OnVisible` L112-120; warm-up L19616; dead L3295, L3382 | Date (1 Jan of the year above) | `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1.Text` / `Visible` L11598, L11659 | As above | Derived |
| `locNavigationMinYear` | `OnVisible` L169-182 | Number | `OnVisible` L212-252; `DevexCapexSummaryPCF.Cluster1..6Date` fallback L7240-7270 | Per visit | Derived |
| `locNavigationMaxYear` | `OnVisible` L183-202; commented-out, not live: L3015 | Number | `OnVisible` L212, L254; next-year `DisplayMode` L3004 and `OnSelect` L3056 | Per visit, **only ever set in `OnVisible`** | Derived |
| `locShowInActive` | Tab `OnSelect` L2453 (`false`); delete confirm L8110 (`false`); both saves decoded L1175/L1869 (`false`); commented-out, not live: L2835, L2850 | Boolean | `tgl_…ShowInactiveAccounts.Checked` L2824 (a hidden toggle) | **Only ever set to `false`**, and read only by a hidden control | Dead |
| `locSelectedAccount` | `OnVisible` L34, L277; tab `OnSelect` L2449; add-from-table L2571; delete confirm L8106; initial timer decoded L27; dead toggles | Always `Blank()` | **Never read.** App Checker flags it `app-WarnInvalidTypeForVariableDefinition` (8×) because it has no type | Constant Blank | Dead |
| `locSelectedSubaccountCommandMode` | `OnVisible` L27 (`gblAppConstants.Form.Display`) | Text | **Never read** (App Checker `app-UnusedVariables`) | Constant | Dead |

#### 2.3.3 Grid selection and the right panel

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locSelectedCostRow` | **The screen's central selection.** `DevexCapexSummaryPCF.OnChange` L7281-7284, on **every** PCF event (`LookUp(colFinatCostDataOptimized, vsb_capexaccountlistid = GUID(Self.SelectedRecordId))`), and L7398 (the standard-contract row). It is mutated in place by `Patch(locSelectedCostRow, {IsStandardContract: false})` in 13 field `OnChange`s (L10490, L10893, L10992, L11132-11330, L11487, L11864, L12272, L12348, L12408). It is cleared by: `OnVisible` L35, L278; tab L2452; the year controls L2938, L2991, L3057; Cancel L10335 and L18179; delete confirm L8142, L8147; both saves (decoded L1174, L1190, L1216); the initial timer. The legacy gallery sets it at L6271 | A row record of `colFinatCostDataOptimized` (§2.4.3) | 192 references. Save formulas (22× each); the delete description L8095-8096; `rad_…CostPaidBy_1.DefaultSelectedItems` L12240, L12251; the Distribution radios L10601, L10736; the standard-flag `FontColor` / `FontItalic` on every field; the Link to Milestone `OnChange` L11475; `tmr_Capex_Cost_Cost_EnrichLoader` L19164, L19172 | Lives until cleared. **Shared by Add, Edit, Delete, Comment, Paid toggle and Add Standard Contract** | UI (selection) |
| `locSelectedProjectContract` | PCF Edit L7350 and Comment L7569 (`LookUp(colCapexProjectContracts, …)`); both saves decoded L953, L1497 (**the result of `Patch('CAPEX Project Contracts', …)`**) and cleared at L1217; standard contract L18638 (Patch result) and cleared at L18618, L18779 (**not** on the success path L18904-18913); warm-up "addContract" L19677 (`Blank()`); Cancel L10335, L18179; dead L3548 | Record of `CAPEX Project Contracts` | 109 references. Save formulas (28×/24×); `drp_…Link_to_Cluster.OnChange` L11458, L11463, L11470; `con_Warning_OnEditFromPCF.Visible` L12446; the comments panel title L8225; comment save `'Capex Contract'` L10180; the enrich timer L19147-19151 | Lives across panel opens, and is **also the comment panel's contract** | Cache plus write result |
| `locSelectedContractDescription` | PCF Add L7319 (`Blank()`), Edit L7351; 13 field `OnChange`s (`Trim(Substitute(…, "Standard", ""))`); Cancel L18179 (`""`); saves decoded L1189, L1215 (`""`); warm-up L19681 | Text | `txt_AddContract_RightPanel_Description_1` L10448, L10508 | Per panel open | UI (form) |
| `locAllYearsCost` | PCF Add L7318 (`Blank()`), Edit L7355 (`'Total Cost'`); enrich timer L19146-19155; warm-up "edit" L19690-19699; Cancel L18179; saves decoded L477 (`Round(Sum(colNewEditPanelCost, TotalSave), 1)`), L1188, L1214; dead L3476, L3553 | Number | `txt_AddContract_RightPanel_TotalCost_1.Value` L11008; save formulas (7×) | Per panel open | Derived from server data |
| `locIsVisibleRightPanelAddContract` | PCF Add L7314, Edit L7325 (`true`); Cancel L10333, L18178; the cluster-link popup confirm L20049; saves decoded L720, L1492 (`false`); dead L3472, L3523 | Boolean | `con_cost_RightPanel_Form_AddContract.Visible` L10263 | Panel open/close | UI |
| `locPanelReady` | `OnVisible` L29; PCF Add L7315, Edit L7352 (`false`); warm-up L19735 (`true`); dead | Boolean | `gal_IndividualCost_Items_1.Visible` L12551 | Per panel open | UI (warm-up workaround) |
| `locWarmupMode` | PCF Add L7316 (`"addContract"`), Edit L7353 (`"edit"`); dead | Text enum | `tmr_Load_Contract_Gallery_Warmup.OnTimerEnd` `Switch` L19673 | Per panel open | UI (timer workaround) |
| `locWarmupKick` | PCF Add/Edit L7317, L7354 (`true`); warm-up L19588 (`false`) | Boolean | `tmr_Load_Contract_Gallery_Warmup.AutoStart` L19583 | One-shot per open | UI (timer workaround) |
| `locStartBinding` | `OnVisible` L31; warm-up L19589 (`false`) and L19736 (`true`); enrich L19143 (`false`) | Boolean | `tmr_Capex_Cost_Cost_EnrichLoader.AutoStart` L19139 | One-shot chain: warm-up then enrich | UI (timer workaround) |
| `locProjectDuration` | Warm-up L19621-19622 (`Year(costEnd) - Year(costStart) + 4`) | Number | `Sequence(locProjectDuration)` at L10640, L10760, L19181, L19635 | Per panel open | Derived |
| `locProjectStartyear` | Warm-up L19627 (`Year(costStart) - 1`) | Number | L10642, L10762, L19183, L19637 | Per panel open | Derived |
| `locClusterRecord` | Warm-up "edit" L19724 (parsed `'By Cluster JSON'` → `{Cluster1..5: Boolean}`); "addContract" L19678 and the DistributionBy `OnChange` L10880 (`Blank()`) | Record `{Cluster1..5}` | 15 references: `rad_…DistributionBy_1.DefaultSelectedItems` L10853-10857; the cluster `Checked` L11103-11302; a label `Visible` L11046-11050 | Per panel open | Derived from server data |
| `locDistributionDatesRecord` | Warm-up "edit" L19725 (`{StartDate, EndDate}` text from `'By Start & End Date JSON'`); L19679, L10881 (`Blank()`) | Record `{StartDate, EndDate}` (text) | L10860; the start/end `Value` L11680, L11766 | Per panel open | Derived |
| `locEditSaveButtonEnabled` | `OnVisible` L33 (`false`); warm-up "edit" L19700 (`false`); `true` in 28 field and month `OnChange` / `OnSelect` sites (L10481 … L17440). **Not reset in the "addContract" warm-up branch** (L19674-19684) nor on Cancel or Save | Boolean (the "dirty" flag) | Save `DisplayMode` L17548; `btn_SaveCost_Execute____.DisplayMode` L17648; Recalculate `DisplayMode` L17712; `cmp_ShowErrorInContract.Visible` L19816 | Set per edit, but **stale on Add** | UI |
| `locShowErrorInContractCost` | Cancel L10334, L18179 (`false`); saves decoded L721, L1187, L1228 (`true` when validation fails) | Boolean | `cmp_ShowErrorInContract.Visible` L19819 | Per save attempt | UI |
| `locStandardContractChanged` | 13 field handlers (L10482, L10884, L10985, L11122-11320, L11455, L11857, L12264, L12340, L12400) | Boolean, **always `true`** | The same handler, immediately after (e.g. L10486): `If(locStandardContractChanged && locSelectedCostRow.IsStandardContract, …)` | Never reset | Derived, effectively the constant `true` |
| `locIsStandardContractOriginal` | The same 13 handlers (L10489 …) | Boolean | **Never read** (App Checker `app-UnusedVariables`) | — | Dead |
| `locChangedByDate`, `locChangedDistribution`, `locChangedFrequency`, `locClusterChanged` | `true` in the start/end date L11676/L11762, DistributionBy L10883, Link-to-Cluster L11453, frequency L11857 and cluster check-box handlers L11121-11319; `false` in both saves (decoded L1176-1179, L1870-1873) | Boolean | The equal-distribution recompute gate in both saves (decoded L1581-1584) | Reset after a successful save, **not** on Cancel or on panel open | UI (change tracking) |
| `loctotalCostChanged` | `txt_AddContract_RightPanel_TotalCost_1.OnChange` L10985 (`true`) | Boolean | The save gate (decoded L1585) | **Only ever set to `true`, never reset** for the screen's lifetime | UI (change tracking) |
| `locAveragePaymentCost` | DistributionBy `OnChange` L10884 (`Blank()`) | Blank | **Never read** (App Checker `WarnInvalidTypeForVariableDefinition`) | Constant | Dead |
| `locRangeValidation` | Month 24 input `OnChange` L13613 (`Blank()`) | Blank | **Never read** (App Checker `WarnInvalidTypeForVariableDefinition`) | Constant | Dead |
| `locValidCostInContract` | Save decoded L489-503 (`% Values` sums to 100, or `Absolute` sum > 0) | Boolean | The save branch decoded L693 | Per save | Derived |
| `locSelectedSubAccount` | Saves decoded L28, L722, L1239 (`Coalesce(LookUp(colCapexSubaccountsNew, …), LookUp(colCapexProjectContracts, …).Account)`) | Record of `CAPEX Account Lists` | The contract `Patch` `Account:` (decoded L964, L1508) | Per save | Derived |
| `locDistributionSchemeByPercentage` | Saves decoded L1008, L1576 | Boolean | **Never read** (App Checker `app-UnusedVariables`) | — | Dead |
| `locNumPayments`, `locLastCost` | Save decoded L1768, L1772 | Number; a record of `colCapexCostDataToPatch` | Save decoded L1791-1854 (the last payment takes the remainder) | Per save | Derived |
| `locTotalCost` | Save decoded L1773 (`UpdateContext`). **The same name is also a `With` key** at decoded L1374 and L743, and in `txt_AddContract_RightPanel_AverageAmountPerPayment_1.Value` L12040 | Number | The context variable is never read; every read resolves to the `With` key (App Checker `app-UnusedVariables` for `locTotalCost`) | — | Dead (shadowed) |
| `locCostInLinkedCluster` | Commented-out, not live (save decoded L505) | — | — | — | Dead |

#### 2.3.4 Cost-paid-by and cluster-link confirmation

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locInitialCostPaidBy` | PCF Add L7303-7309 and Edit L7339-7345: `Coalesce(<contract>.'Cost Type', LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)'.'CAPEX Account List' = locSelectedCostRow.vsb_capexaccountlistid).'DevCo/SPV')`. **On Add, the contract it reads is `locSelectedProjectContract`, which the warm-up timer blanks only after this runs**; dead L3461, L3537 | Option-set value (`Cost paid type`) | `rad_…CostPaidBy_1.OnChange` L12289-12290 | Per panel open | Cache of server data |
| `locCostPaidByChanged` | `rad_…CostPaidBy_1.OnChange` L12289 (`locInitialCostPaidBy <> Self.Selected.Value`); reset to `false` at PCF L7287, L7302, L7338 and at the popup confirms L383, L20047 | Boolean | Save branch decoded L705; popup `Title` / `Description` / `BoxHeight` / `TextHeight` / `WidthConfirmButton` L19909-20175 | Per panel open | Derived |
| `locClusterLinkageChanged` | `drp_…Link_to_Cluster.OnChange` L11456-11459; `false` at PCF L7286, L7300, L7336, at `btn_Reset_EditCost_Controls` L17602 and at the popup confirms L382, L20046 | Boolean | Save decoded L703; popup texts L19913, L20136, L20158, L20175 | Per panel open | Derived |
| `locMilestoneRelinkResetNeeded` | `drp_…Link_to_Cluster.OnChange` L11468-11479 (**a live `CountRows(Filter('CAPEX Costs', … 'Cost Paid' = true))` server query**); `false` at PCF L7285 and after the popup reset L20069 ("Bug 13772" comment) | Boolean | Save decoded L706; popup `OnConfirm` L20053 (`UpdateIf('CAPEX Costs', …, {'Cost Paid': false})`); `Description` / `Title` / `BoxHeight` / `TextHeight` | Per change | Derived from server data |
| `locShowClusterLinkageConfirmation` | Saves decoded L712, L1484 (`true`); popup cancel/confirm L20034, L20043; PCF L7299, L7335, L7396 (`false`); dead | Boolean | `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup.Visible` L20171 | Per save attempt | UI |
| `locContinueToSavelinkedCluster` | 24 sites: the Link-to-Cluster `OnChange` L11460, the payer `OnChange` L12290, the 12 month inputs L13614-17441, the popups L373/L384 and L20037/L20048, PCF L7301/L7337/L7397 | Boolean | **Only `btn_SaveCost_Execute____.OnChange`** (decoded L683, L1455). The Save button the popups re-trigger (`btn_GeneratorData_…_Save`) never reads it | Per change | UI |
| `locConfirmCostPaidByChange`, `locConfirmClusterLinkChange` | Both popups' `OnCancel` / `OnConfirm` (L371-372, L380-381, L20035-20036, L20044-20045), always `false`; the only `true` assignment is commented-out, not live (save decoded L3, L10) | Boolean | **Never read** (App Checker `app-UnusedVariables`) | Constant `false` | Dead |

#### 2.3.5 Standard contract

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locGUIDforLoadingStandardContract` | PCF L7399 (`varSelectedStandardGuid`); cleared at L18617, L18778, L18910; dead L3322, L3410 | GUID | `btn_Capex_Cost_Add_Standard_Contract_Code` L18232 | Per add | UI (parameter passing to the hidden button) |
| `locStandardContractAssumption` | Standard button L18239; cleared L18615, L18776, L18908 | Record of `Devex/Capex Standard Assumptions` | 19 references: L18537-18593 (the cluster flags), L18649-18666 (the contract `Patch`), L18720, L18886 | Per add | Cache |
| `locTotalCostToDistribute` | L18240-18279 (`Switch` on `Unit`: EUR / PLN, × WTG count, × MW capacity); cleared L18616, L18777, L18909 | Number | L18654, L18811-18815 | Per add | Derived |
| `locIsAddingStandardContract` | `OnVisible` L28 and the standard button L18619, L18780, L18911 (always `false`). **The only `true` sites are in the dead command bar** (L3317, L3405) | Boolean | Only the dead command bar (L3156, L3221, L3307, L3395) | On live paths, constant `false` | Dead (a guard that cannot fire) |

#### 2.3.6 Dialogs, spinners and the comments panel

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `locIsVisiblePopUpSpinner` | `OnVisible` L23; add-from-table L2573 and the `Navigate` context L2791; paid toggle L7664, L7764; comment save L10140, L10219; the standard button L18238, L18614, L18775, L18907; Reload L772; both saves (9× each); the paid popup decoded L4; initial timer decoded L95 | Boolean | `cmp_Costs_PopUpLoading.Visible` L18217; dead command bar `ItemEnabled` L3159, L3224 | Per operation | UI |
| `locSpinnerInformationText` | The same sites as above, with the message text | Text | `cmp_Costs_PopUpLoading.InformationText` L18214 (overridden by "Please wait, loading data..." while `colFinatCostDataOptimized` is empty, L18213) | Per operation | UI |
| `locIsVisibleSubaccountCostsDeletionDialog` | `OnVisible` L20; PCF `DeleteTriggered` L7420 **and again** L7440 (duplicated block); popup cancel L8102 and confirm L8111; dead L3561 | Boolean | `cmp_PopUp_SubaccountCostsDeletion_Confirmation.Visible` L8153 | Per delete | UI |
| `locIsVisibleSetPaidCost` | PCF `SetCostPaidUnpaidTriggered` L7433 **and again** L7453 (duplicated block); popup cancel L19874 and confirm (decoded L3) | Boolean | `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation.Visible` L19881 | Per toggle | UI |
| `locIsVisibleCapexComments` | `OnVisible` L32; PCF `CommentTriggered` L7633; `Icon2.OnSelect` L8238; comment save L10208 | Boolean | `con_Capex_Comments_Right_Panel.Visible` L8167 | Per comments open | UI |
| `locPinGeneralComments` | PCF L7634 (`true`); `CheckboxCanvas1` L8369/L8371 | Boolean | `CheckboxCanvas1.Checked` L8364. The gallery sort reads the check box itself (L8445) | Reset to `true` per open | UI |
| `locShowResolvedComments` | PCF L7635 (`false`); `CheckboxCanvas1_1` L8383/L8385 | Boolean | `CheckboxCanvas1_1.Checked` L8379. The gallery filter reads the check box (L8433) | Reset to `false` per open | UI |
| `locAvailebleCapexCosts` (sic) | PCF L7636-7646: `ShowColumns(Filter('CAPEX Costs', Contract = locSelectedProjectContract), Year, Month, 'CAPEX Cost', Contract, Cost)` | Table, server snapshot | The comment year/month dropdowns: `drp_Draft_Edit_Year_Value.Items` / `Default` L9243, L9225; `drp_Draft_Edit_Month_Value.Items` L9317 | Per comments open | Cache |
| `locSelectedCapexComments` | PCF L7570 (the sorted comment table) | Table | **Never read** (App Checker `app-UnusedVariables`) | — | Dead |
| `locEditingCommentId` | Never set | — | Only in a commented-out, not live, formula (L9064) | — | Dead |
| `locIsVisibleProjectCostsMargin` | `OnVisible` L22; the legacy margin icon L7165 (both `false`) | Boolean | Only in commented-out formulas (L6298, L6331) | Constant `false` | Dead |
| `locIsVisibleRightPanelEditMargin`, `locIsVisibleRightPanelSubaccountCostsEdit` | `OnVisible` L26, L24 (`false`) | Boolean | **Never read** | Constant | Dead |
| `locIsVisibleRightPanelSubaccountCostsDistributeEqually` | `OnVisible` L25 (`false`); dead command bar L3559 (`true`) | Boolean | **Never read** | Constant on live paths | Dead |
| `locSelectedProjectCostsMargin` | Commented-out, not live, only (L2840, L2855, L8145, L19024, L19128) | — | — | — | Dead |
| `locPCFSelectedContract` | Commented-out, not live, only (L7289) | — | — | — | Dead |
| `locSelectedAccountCategory` | **Never set** | — | Only in commented-out formulas (L6298, L6330-6331). App Checker `app-UnusedVariables` | — | Dead |

#### 2.3.7 `Navigate` context sent to *Add Costs from Table*

`btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.OnSelect` L2777-2809 creates **these context variables on the target screen**, not on this one. The target screen owns them; they are listed for completeness.

| Key | Value |
|---|---|
| `lclCopyTable`, `locSaveData`, `lcladdrow` | `true` |
| `lcldeleterow` | Commented-out, not live (L2784) |
| `locVisibleSubAccountsError`, `locShowErrorsInList`, `locTimerEnd`, `locTimerStart`, `locIsVisiblePopUpSpinner` | `false` |
| `locPCFJsonInput` | `varPCFInputData` |
| `locSpinnerInformationText` | `""` |
| `lcltglShowCostEnabled` | `true` ("Changed for Hotfix to Prod false was original") |
| `locProjectStartingYear` | `Text(locCostAllowedStartYear)` |
| `locEndingYear` | `Text(Coalesce(Value(Text(COD, "yyyy")) + 3, 2050))` |
| `locSelectedTglTab` | `tab_Costs_ContentAssignableAccountCategories.Selected` |

### 2.4 Collections

Collections are app-wide. Nothing on this screen clears most of them on exit.

#### 2.4.1 Master data seeded at `App.OnStart`

| Name | Set | Shape (columns · source) | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colCapexAccountCategoriesNew` | OnStart decoded L665-686: a fake first row `{'CAPEX Account List': Blank(), Name: "DEVEX/CAPEX Summary", Order: 0}`, then `Collect(SortByColumns(Filter('CAPEX Account Lists', Not(IsBlank('Parent Account')) && 'Parent Account'.Number = "00001"), "vsb_order"))` | `CAPEX Account Lists` full rows (no `ShowColumns`), plus one synthetic Summary row | 10 references: tab `Items` L2439; `OnVisible` L269, L283 (`CountRows > 1`); initial timer guard and Summary lookup (decoded L6, L24, L43); `colCapexSummaryCategories` builders L2465, L18976, L19080; `TextCanvas1` L447 (debug) | OnStart only; never refreshed | Cache (all columns) |
| `colCapexAccountsNew` | OnStart decoded L687-701: `Filter('CAPEX Account Lists', 'Parent Account'.'CAPEX Account List' in <categories>, Status = Active)` | `CAPEX Account Lists` full rows (level 2) | 10: Refresh L1025, L1200; tab L2478; category timers L18939, L18989, L19043, L19093; guards | OnStart only | Cache |
| `colCapexSubaccountsNew` | OnStart decoded L702-713: the same, one level down | `CAPEX Account Lists` full rows (level 3) | 16: Refresh L1036; Reload L733; tab L2476; timers; both saves (decoded L30, L724, L1241) | OnStart only | Cache |
| `colCapexProjectContracts` | OnStart decoded L714-720: `Filter('CAPEX Project Contracts', Project.Project = gblSelectedProject.Project)`. **Re-filled** by `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` L729-736, which adds `Account.'CAPEX Account List' in colCapexSubaccountsNew.'CAPEX Account List'`. *Add Costs from Table* also writes it (`ClearCollect` / `Collect`) | `CAPEX Project Contracts` full rows; no `statecode` filter | 42 references: Refresh L1046, L1436; `DevexCapexSummaryPCF.OnChange` L7329, L7463; delete L8096, L8118; the radios' defaults L10600, L10735, L12239; both saves (7×); enrich L19171; standard L474, L18644 | Two definitions: before the first mutation the collection holds **every** contract of the project; after it, only those on active sub-accounts | Cache |
| `colCapexCosts` | OnStart decoded L721-750: a `Defaults('CAPEX Costs')` priming row, then `Ungroup(ShowColumns(AddColumns(colCapexProjectContracts As Item, Value, ShowColumns(Filter('CAPEX Costs', Contract = Item…), Year, Name, Month, Cost, Contract, 'CAPEX Cost', 'Cost Paid')), Value), Value)`. Re-filled by Reload L737-766. *Add Costs from Table* also writes it | `{Year, Name, Month, Cost, Contract, 'CAPEX Cost', 'Cost Paid'}` · `CAPEX Costs`, all years, **one query per contract**, plus one blank `Defaults` row | 12: Refresh L1053; the category timers L18962, L19066 (with `Year = gblSelectedProjectYear`); Summary sums L2496, L19007; enrich L19163; save decoded L1101 (`lclCostRecordID`) | Reloaded after every mutation | Cache |
| `colContractDistributionTypes` | OnStart decoded L751-754 `Choices('Distribution Type')` | Option set | `rad_…DistributionType_1.Items` L10617 | Static | Constant |
| `colContractDistributionScheme` | OnStart decoded L755-758 `Choices('Distribution Scheme')` | Option set; **order matters**: `First` means "% Values" and `Last` means "Absolute Values" (L10743, L10745, L10749) | `rad_…DistributionScheme_1.Items` / `DefaultSelectedItems` L10754, L10743-10749 | Static | Constant |
| `colCostPaidType` | OnStart decoded L759-765 `LastN(Choices('Cost paid type'), 2)` | Option set (2 values) | `rad_…CostPaidBy_1.Items` L12258 | Static | Constant |

#### 2.4.2 Category build (`btn_Capex_Cost_Refresh_Capex_Cost_Code`, and the timers that duplicate it)

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colCapexAccountsInSelectedCategoryNew` | Refresh L1021-1031 (sorted by `vsb_order`); tab `Clear` L2458 (Summary); category timers L18936-18943 and L19040 (with an extra `Status = Active`, **unsorted**); *Add Costs from Table* | `CAPEX Account Lists` rows | Refresh L1037, L1345 | Per category, per refresh | Derived |
| `colCapexSubaccountsInSelectedCategoryNew` | Refresh L1032-1042; tab `Clear` L2459; timers L18944, L19048; *Add Costs from Table* | `CAPEX Account Lists` rows | 37: Refresh L1047, L1370; standard options L466; add-from-table L2582; the legacy gallery labels (L6414-7114) and `Items` L4311 | As above | Derived |
| `colCapexContractsInSelectedCategory` | Refresh L1043-1049; tab `Clear` L2460; timers L18952, L19056; *Add Costs from Table* | `CAPEX Project Contracts` rows | 52: Refresh L1054, L1062, L1196, L1533; add-from-table L2645-2754; the legacy labels | As above | Derived |
| `colCapexCostsInSelectedContracts` | Refresh L1050-1056 (all years); tab `Clear` L2461; timers L18959-18970 (**selected year only**); commented-out, not live: L2590, L3656; *Add Costs from Table* | `colCapexCosts` rows | 102: Refresh L1062, L1077, L1427; add-from-table L2643; enrich L19150; warm-up L19694; both saves (`allYearsCost`, decoded L54) | As above. The two writers disagree on whether it is all-years or one year | Derived |
| `colCapexCommentsInSelectedContracts` | Refresh L1058-1064: `Filter('Capex Comments', 'Capex Contract' in <contracts> \|\| 'Capex Cost' in <costs>)` | `Capex Comments` full rows | Refresh L1071, L1083 | Per refresh | Cache |
| `colCapexCommentsLatest` | Refresh L1067-1190 | `{CommentId, ContractId, CommentTypeText, CostYear, CostMonthIndex (36-arm Switch), IsResolved, LastActivityOn, LatestText}` · one row per root comment | Refresh L1819-2130 (26×: `HasComments`, `CommentTooltip`, `M1..12HasComments`, `M1..12CommentTooltip`) | Per refresh | Derived |
| `colCapexContractCostGrouped_V1` | Refresh L1193-1339 | `{vsb_costdescription, vsb_parentaccountid, IsAccount: false, IsContract: true, vsb_capexaccountlistid (= contract id), vsb_year, vsb_statusbool, vsb_CreatedOn, vsb_AccountCategory, CostPaidBy, DistributionType, SubLabel, IsStandardContract ("true"/"false" **text**)}`; *Add Costs from Table* also writes it | Refresh L1410 | Per refresh | Derived |
| `colAllGroupedAccounts` | Refresh L1341-1399 | `{vsb_capexaccountlistid, vsb_name, vsb_number, vsb_costdescription: "", IsAccount, IsContract: false, vsb_parentaccountid, vsb_statusbool, vsb_AccountCategory, IsStandardContract: false (**boolean**), SubLabel: Blank(), CostPaidBy: "", DistributionType: ""}` | Refresh L1405; add-from-table L2604 | Per refresh | Derived |
| `colFinatCostDataOptimizedTemp` | Refresh L1401-1420 (accounts, each followed by its contracts sorted by description) | Union of the two shapes above | Refresh L1574 | Per refresh | Derived |
| `colFlatCostsMapped` | Refresh L1423-1529 (selected year only) | `{ContractId, SubaccountId, AccountId, MonthIndex1 (36-arm Switch), CostAmount, IsPaid}` | Refresh L1579-2221 (37×) | Per refresh | Derived |
| `colContractTotalsForPCF` | Refresh L1530-1568: per contract `varTotalCost = Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', …), Cost), 0)` and `varPaidCost = Sum(Filter('CAPEX Costs', … 'Cost Paid' = Yes), Cost)`. **Two server aggregates per contract** | `{ContractId, SubaccountId, AccountId, TotalCostAmount, PlannedCostAmount, ActualCostAmount}` | Refresh L2255-2285 | Per refresh | Cache plus derived |
| `colFinatCostDataOptimized` | Refresh L1570-2295; `Clear` in the initial timer (decoded L37) on the Summary path; *Add Costs from Table* (`Clear` / `ClearCollect`) | The `colFinatCostDataOptimizedTemp` columns plus `M1..M12`, `Month1Paid..Month12Paid`, `RowId`, `ParentId`, `Type` ("account" / "contract" / "subaccount"), `Number`, `Name`, `HasComments`, `CommentTooltip`, `M1..12HasComments`, `M1..12CommentTooltip`, `M1..12Paid`, `IsStandard`, `StandardCost`, `StandardContract` (the same value three times), `CostPaidByText`, `Distribution`, `TotalCost`, `PlannedCost`, `ActualCost` | `DevexCapexSummaryPCF.Items` L7277; PCF `OnChange` `LookUp` L7282, L7367; `cmp_Costs_PopUpLoading.InformationText` L18213; legacy gallery `Items` L4305; `Text1` L19843 (debug) | Per refresh | Derived (the PCF dataset) |
| `colCapexSummaryCategories` | Tab `OnSelect` L2462-2468; category timers L18973-18979, L19077; initial timer (decoded L40-46) | `colCapexAccountCategoriesNew` rows minus the Summary row | The Summary builder | Per Summary selection | Derived |
| `colDevexCapexSummaryView` | Tab L2469-2508; timers L18980-19020, L19084; initial timer (decoded L48-87); also at OnStart decoded L774-815 | `{Id, Name, Sum = Max(Sum(colCapexCosts in category), 0), ParentId}` | `gal_Costs_ContentCostsSummary.Items` L7793 | Per Summary selection | Derived |
| `colProjectPeriods` | `OnVisible` L207-236 | `{Year, Month: Table{Name, Number} × 12}` for `locNavigationMinYear … MaxYear`. The extending `Collect` at L3634 is dead; the one at L3020 is commented-out, not live | `drp_…ShowSelectedYear.Items` / `Default` L2929, L2926; prev-year floor L2959, L2979 | Per visit | Derived |

#### 2.4.3 Standard contract (`btn_Capex_Cost_Build_StandardContractOptions_Code`, `btn_Capex_Cost_Add_Standard_Contract_Code`)

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colStandardContractOptionsForPCF` | Build button L457-718: `Refresh('CAPEX Project Contracts')`, then `SortByColumns(Filter(ForAll(ShowColumns(Filter('Devex/Capex Standard Assumptions', <subaccount in category> && country && technology && not already created)), …), ShowOption), "AutoId")`. `Clear` in the initial timer (decoded L38). `RemoveIf` optimistically at PCF L7390-7393, L7405-7408 | `{StandardContractId, SubaccountId, Name, AutoId, ShowOption}` | `DevexCapexSummaryPCF.StandardContractOptions_Items` L7653 | Per refresh | Cache plus derived |
| `colStandardCostAllSelectedClusters` | Standard button L18521-18598 | `{Cluster, Start, End, IsChecked}` × ≤ 5, with dates back-computed from `Milestones Standard Assumptions` | L18602; `locClustersForFullDistribution` L18705 | Cleared at L18787 and L18918. The `Clear` at L18626 is commented-out, not live, so it **survives the "no applicable period" path** | Derived |
| `colEligibleStandardCostClusters` | L18599-18605 (`Cluster >= varApplicableStartCostClusterNo`) | The same columns | L18610, L18676-18693, L18763, L18844 | Cleared at L18627, L18788 and L18919 | Derived |
| `colCapexCostDataAllPayments` | L18706-18756 | `{'CAPEX Cost': Defaults(...), Contract, Cluster, Year, Month (1-12)}` | L18759-18806 | Cleared after use | Derived |
| `colCapexCostDataAllPaymentsWithCost` | L18821-18838 | The same plus `Cost` (`avgPay`; the last row takes `lastPay`) | L18842 | Cleared after use | Derived |
| `colCapexCostDataToPatch` | Standard button L18839-18848; **also** both saves (decoded L1360, L1696, L1757) | Payment rows | `Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch …))` L18849-18900; `btn_Capex_Cost_Add_New_EqualDistribution_Cost_Calculate_Cluster_Range_Out_Of_LinkedCost` L805; the saves | Cleared by the standard path only; **left populated after a panel save** | Derived (write plan) |

#### 2.4.4 Add/Edit panel and save path

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colNewEditPanelCost` | Warm-up L19632-19671 (skeleton); enrich L19178 (filled); DistributionType / Scheme `OnChange` L10637, L10757 (reset, with **a different column set**: `Jan..Dec`, not `JanUI` / `JanSave`); Recalculate L18149; saves decoded L469, L880; month buttons `UpdateIf` L12706, L13134; `Clear` on Cancel L10338, L18182 | `{Year, IsFolded, IsValid, JanUI..DecUI, JanSave..DecSave, TotalUI, TotalSave}` per year | `gal_IndividualCost_Items_1.Items` L12542; `cmp_ShowErrorInContract.ErrorTitle` L19771-19792; L870; both saves | Per panel open | UI (form model) |
| `colNewEditPanelCostProcessed` | Recalculate L17722 (`Clear`), L17756; saves decoded L42, L76 | The same schema | Copied back into `colNewEditPanelCost` | Per recalculation | Derived |
| `colOtherClusterHavingCost` | The two hidden buttons L792 (from `colCapexCostDataToPatch`) and L843 (from `colNewEditPanelCost`); saves decoded L523, L1422; `Clear` at PCF L7362, the dead command bar L3235, and the saves | `gblClusterDurations` rows that carry cost | Save decision decoded L699; popup texts L339, L19961-20175 | Per save attempt | Derived |
| `colSelectedClusters` | Saves decoded L1254, L1351, L1590, L1687 | `{Cluster, Start "mm/yyyy", End "mm/yyyy"}` | Saves decoded L1363 | Per save; never cleared | Derived |
| `colCapexEditContract`, `colCapexFinalDataToPatch`, `colCapexToDelete` | Save decoded L1012, L1095, L1158 | `{Contract, Cost, Year, Month}` · `{Contract, 'CAPEX Cost', Cost, Month, Year}` · subset to delete | `Patch` / `Remove('CAPEX Costs', …)` decoded L1120-1170 | Per save; never cleared | Derived (write plan) |

08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md owns the meaning of these collections.

#### 2.4.5 Comments panel

09-COMMENTS-PANEL.md owns the behaviour.

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colCapexComments` | PCF `CommentTriggered` L7573-7630: `ClearCollect` of the sorted `Capex Comments` plus `AddColumns(Resolver, RelatedCost, IsRoot, LocalID, SelectedYear, IsGeneralComment, SelectedMonth, ParentCommentID, IsModified, IsEdit, IsNew, IsButton)`, then `UpdateIf` `SequenceNumber`, then a placeholder "button" row. Edited by about 20 sites (L8694-10002: `Patch`, `Remove`, `RemoveIf`, `UpdateIf`, `Collect`). `Clear` on close L8239 and after save L10209 | `Capex Comments` row plus 13 UI columns | 49 references: the galleries L8431, L8525-8530; Save `DisplayMode` L10116 and `OnSelect` L10160 | Per panel open | UI (working copy) |
| `colDeletedComments` | `Collect` at L8766, L8850, L9444, L9704; `Clear` L8240, L10210 | `colCapexComments` rows | Save `DisplayMode` L10113 and `OnSelect` L10146-10148 | Per panel open | UI (staged deletes) |
| `colTempRoots` | PCF L7582-7592; the delete handlers L9466, L9726 | Root comments sorted for renumbering | `Index(colTempRoots, Value)` L7600, L9744 | **Never cleared** | Derived (scratch) |

#### 2.4.6 Add Cost from Table hand-off

| Name | Set | Shape | Read | Lifecycle | Class |
|---|---|---|---|---|---|
| `colSubaccountMappedCostPaid` | L2577-2587: `ShowColumns(Filter('SPVDevCo Mapping Capex Devexes', 'Account Number' in <subaccounts>.Number), 'Account Number', 'DevCo/SPV')` | 2 columns | **Not read on this screen** (inferred: read by *Add Costs from Table*) | Per click | Cache |
| `colCombinedCostAccounts` | L2598-2628 | `{a_Number, b_Name, c_Description, r_RelatedRowID, s_Year}` | L2633 | Per click | Derived |
| `colAddCostFromTable` | L2629-2771; `Clear` on *Add Costs from Table* | Sheet rows `{a_Number … w_isStandardContract}` (Jan-Dec as `g_Jan` … `r_Dec`) | `JSON(colAddCostFromTable)` L2775 | Per click | Derived |

#### 2.4.7 Debug and legacy readers

These are read-only: `TextCanvas1.Text` (L447) and `Text1.Text` (L19843-19858), both hidden.

#### 2.4.8 Collections other screens also write

*Add Costs from Table* writes `colCapexProjectContracts`, `colCapexCosts`, `colCapexAccountsInSelectedCategoryNew`, `colCapexSubaccountsInSelectedCategoryNew`, `colCapexContractsInSelectedCategory`, `colCapexCostsInSelectedContracts`, `colCapexContractCostGrouped_V1`, `colFinatCostDataOptimized` and `colAddCostFromTable`, plus its own `colCapexToDeletePCF`. Coming back to this screen therefore shows whatever that screen left in them until the next Refresh. *Contracts Screen* reads `colCapexAccountCategoriesNew` and `colCapexCostsInSelectedContracts`.

### 2.5 `With`-scoped names that look like variables

These exist for one evaluation only. **None is state.** In the code app they are local `const`s or function parameters. They are listed so a reader of the YAML does not mistake them for context variables.

| Area | Names (control.property:line) |
|---|---|
| `OnVisible` | `varPreferredStartDate` L86, `varFallbackStartDate` L91, `varCostStartDate` L99, `varAcquisitionYear` L128, `varCODYear` L136, `varProjectEndYear` L144, `varMinClusterYear` L152, `varMaxClusterYear` L159, `varDefaultYear` L240 |
| Refresh button | `locCost` L1076, `locLatestReply` L1080, `locMainAccount` L1199, `locClusters` L1245, `locDistributionDates` L1246, `locClusterRecord1` L1250, `locDistributionDatesRecord1` L1257, `locSelectedClusters` L1272, `locContract` L1435, `locMonthText` L1439, `varTotalCost` L1536, `varPaidCost` L1547 |
| Standard options / standard contract | `varEligibleClusterCount` L506; `varStandardContractAssumption` L18230, `locTotalCapacity` L18242, `locNumberOfActiveWTGs` L18243, `varStartClusterNo` L18285, `varApplicableStartCostClusterNo` L18289, `varMilestoneDurations` L18300, `varStartReferenceDate` L18304, `varC1Date`…`varC6Date` L18374-18515, `locClustersForFullDistribution` L18705, `locStartMonth` / `locStartYear` / `locEndMonth` / `locEndYear` / `locFrequency` L18715-18719, `locTotalNumberOfAllPayments` L18799, `locSortedAllPayments` L18800 |
| PCF and paid toggle | `locTempContract` L7328, L7462; `varSelectedStandardGuid` L7365; `varSelectedRow` L7366; `varPCFSelectedContract` L7426, L7446; `varSelectedMonthChoice` L7670; `varCostInSelectedContract` L7697 (a live `Filter('CAPEX Costs', …)`); `varCostRecord` L7704; `varGetContract` (L19875, decoded L10) |
| Year buttons | `varMinSelectableYear` L2956, L2977, L3683, L3704 |
| Add from table | `locCostGroupedByContracts` L2638, `locContract` L2673 |
| Delete | `locContractToDelete` L8117 |
| Right panel | `locDistributionType` L10599; `locContract` L10734; `varStartClusterNo` L11415; `varStartParts` / `varEnteredDate` L11576-11650; `locSelectedClusters` L11955, `locAllMonths` L12021, `locStartDateParts` / `locEndDateParts` L12026-12033, `locTotalCost` L12040, `locStartMonth` … `locFrequencyItem` L12044-12123, `locNumPayments` L12076, `locStartDateForDistribution` / `locEndDateForDistribution` L12107-12111 (all in `txt_AddContract_RightPanel_AverageAmountPerPayment_1.Value`); the save formulas' `locStartDateParts`, `locEndDateParts`, `locTotalCost`, `locStartMonth`, `locStartYear`, `locEndMonth`, `locEndYear`, `locFrequency` (decoded L1366-1382, L1702-1718) |
| Timers | `locFilteredCostData` L19161, `locContract` L19170 (enrich); `varCostStartDate` L19596, `varCostEndDate` L19606, `locClusters` / `locDistributionDates` / `locClusterRecord1` / `locDistributionDatesRecord1` L19705-19717 (warm-up) |
| Popups | `locShowC1..C3`, `locClusterItems`, `locCount`, `locMsg1..3`, `locCountOfMessages` (L336-343, L19908-20150) |
| Legacy gallery (hidden) | `locContractInAccount`, `locContractInSubaccount`, `locContractInSubaccountForSubaccountRow` (L4514-7211); `varSvgImageRecord` / `varImageData` L6101-6146 |
| Dead command bar | `varApplicableStandardContracts` L3091, `varAvailableStandardContracts` L3135, `varLatestProject`, `varLatestStartClusterNo`, `varCostStartDate` L3241-3368 |

**Shadowing smell:** `locTotalCost`, `locStartMonth`, `locContract`, `locClusterRecord1` and others reuse the `loc` prefix of real context variables. `locTotalCost` is both: an `UpdateContext` key (save decoded L1773, never read) and a `With` key.

### 2.6 Component and PCF properties that carry state

| Control (component) | Inputs bound to state | Outputs / events that write state | Cite |
|---|---|---|---|
| `DevexCapexSummaryPCF` (`vsb_Dev.DevexCapexSummaryPCF`) | `Items` = `colFinatCostDataOptimized`; `StandardContractOptions_Items` = `colStandardContractOptionsForPCF`; `StartYear` = `gblSelectedProjectYear`; `CollapseResetKey` = category & `locScreenVisitStamp`; `CostPaidByFilter` = `drp_…ShowCostPaidBy.Selected.Value`; `ShowEmptyAccounts` / `ShowPlannedCost` = the two toggles; `Cluster1Date..Cluster6Date` = `Date(Coalesce(StartYear, locNavigationMinYear, gblSelectedProjectYear), Coalesce(StartMonth, 1), 1)` | Outputs (manifest L94-105): `EditTriggered`, `CommentTriggered`, `DeleteTriggered`, `AddTriggered`, `AddStandardContractTriggered`, `SetCostPaidUnpaidTriggered` (Booleans); `SelectedRecordId`, `SelectedStandardContractId`, `SelectedCostContractId` (Text); `SelectedCostYear`, `SelectedCostMonth` (Whole); `SelectedCostPaid` (Boolean). `OnChange` L7278-7650 turns them into the context variables above. `Btn_CodeforSettingCostPaidUnpaid` reads `SelectedCost*` directly (L7671-7749) | L7234-7655 |
| `cmp_Costs_Header` (`cmp_Header`) | `Project` = `gblProjectHeaderData`; `ApprovalStatesColor` = `gblTableApprovalStateColors`; `MainScreen`; `LogoWidth`; reads `gblAppVersion`, `gblEnvironmentName`, `gblInfoCenterLaunchUrl`, `gblCurrentUser` and `gblReportError` directly | `OnLogoClick` → `Launch(gblPMAppURL)`; internally sets `gblShowReportProblemPanel` | L2323-2337 |
| `cmp_Costs_Left_Navigation` (`cmp_Left_Navigation`) | `Items` = `LeftNavigationMenu`; `IsExpanded` = `gblLeftNavigationMenuIsExpanded`; `Selected` = `gblLeftNavigationSelected` | Output `SelectedKey`; `OnExpand` and `OnSelect` set the two globals | L2372-2401 |
| `cmp_PopUp_SubaccountCostsDeletion_Confirmation` (`cmp_PopUp_Confirmation`) | `Visible` = `locIsVisibleSubaccountCostsDeletionDialog`; `Description` from `locSelectedCostRow` and `colCapexProjectContracts` | `OnCancel` / `OnConfirm` | L8088-8155 |
| `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (`cmp_PopUp_Confirmation_New`) | `Visible` = `locShowClusterLinkageConfirmation`; `Title`, `Description`, `BoxHeight`, `TextHeight`, `TextConfirmButton` and `WidthConfirmButton` all computed from `locCostPaidByChanged`, `locClusterLinkageChanged`, `locMilestoneRelinkResetNeeded` and `colOtherClusterHavingCost` | `OnCancel` / `OnConfirm` | L19884-20178 |
| `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (`cmp_PopUp_Confirmation_New`) | `Visible` = `locIsVisibleSetPaidCost` | `OnConfirm` (L19875) | L19864-19883 |
| `cmp_PopUp_Confirmation_1` | All inputs computed, but `Visible: =false` | Dead | L303-434 |
| `cmp_Costs_PopUpLoading` (`cmp_PopUp_Loading`) | `Visible` = `locIsVisiblePopUpSpinner`; `InformationText` = `locSpinnerInformationText` or the empty-dataset text | — | L18206-18222 |
| `cmp_ShowErrorInContract` (`cmp_Information_Button_PCF`) | `Visible` = `locEditSaveButtonEnabled && Individual && locShowErrorInContractCost && Len(ErrorTitle) > 0`; `ErrorTitle` from `colNewEditPanelCost` | `ToolTipVisibility` read by its own `Height` (L19795) and by Save L17512, L17612 | L19760-19834 |
| `cmp_ReportErrorRightPanel_CapexCosts` | `Visible` = `gblShowReportProblemPanel` | Sets and clears `gblShowReportProblemPanel` and `gblReportError` internally | L8081-8087 |
| `fn_Numeric_CC` (`fn_Numeric`) | None | Output **functions** (`IsInteger`, `IsOneDecimal`, `InRange`, …) called by the right-panel validators, e.g. L10942, L13347. Stateless | L19742-19748 |

### 2.7 Smells

#### 2.7.1 Collections that materialise whole tables (CONVENTIONS rule 2)

| Collection | What it pulls | Why it is a smell |
|---|---|---|
| `colCapexAccountCategoriesNew`, `colCapexAccountsNew`, `colCapexSubaccountsNew` | Full rows (no `ShowColumns`) of `CAPEX Account Lists`, filtered by a lookup's `.Number` and by `in <local collection>` | Whether `'Parent Account'.Number = "00001"` and `in` against a collection delegate to Dataverse cannot be verified from source. App Checker raised no delegation warning, only `app-DataSourceDefaultMaxRowsLimit` at App level. Either way every column of the chart of accounts is held app-wide (inferred cap: the app's data row limit) |
| `colCapexProjectContracts` | Every contract of the project, all columns, no `statecode` filter. After a mutation the filter gains `Account in colCapexSubaccountsNew` (L733) | Subject to the data row limit per query. The definition changes silently after the first save |
| `colCapexCosts` | Every cost row of every contract of the project, all years, built by **one `Filter('CAPEX Costs', …)` per contract** (N+1), plus a `Defaults()` priming row | The whole project's cost history is held in memory, and reloaded after every mutation (L737-766) |
| `colCapexCommentsInSelectedContracts` | Every comment on the category's contracts and costs, all columns | Re-read on every refresh |
| `colContractTotalsForPCF` | Two server `Sum(Filter('CAPEX Costs', …))` aggregates per contract on every refresh | Round-trip cost (12/13 own it) |
| `colStandardContractOptionsForPCF` | `Filter('Devex/Capex Standard Assumptions', <subaccount in collection> && country && Lower(Text(Technology)) = …)` | App Checker `app-SuggestRemoteExecutionHint` for `Lower` and `Filter` on this button: the `Lower(Text(...))` clause cannot delegate |
| `locAvailebleCapexCosts` (a context table) | Every cost row of the contract | Snapshot at comment open |

#### 2.7.2 Variables set but never read

These are corroborated by App Checker `app-UnusedVariables` where marked †:

- `locBindGallery`†
- `locSelectedSubaccountCommandMode`†
- `locIsVisibleRightPanelEditMargin`†
- `locIsVisibleRightPanelSubaccountCostsEdit`†
- `locIsVisibleRightPanelSubaccountCostsDistributeEqually`†
- `locIsVisibleProjectCostsMargin`† (read only in comments)
- `locSelectedAccount` (App Checker flags it as untyped instead)
- `locIsStandardContractOriginal`†
- `locDistributionSchemeByPercentage`†
- `locConfirmCostPaidByChange`†
- `locConfirmClusterLinkChange`†
- `locSelectedCapexComments`†
- `locAveragePaymentCost`
- `locRangeValidation`
- `locTotalCost`† (the context key; the `With` key shadows it)
- `colSubaccountMappedCostPaid` (on this screen)
- `colTempRoots` (read only within the formula that fills it)
- `colSelectedClusters`, `colCapexEditContract`, `colCapexFinalDataToPatch`, `colCapexToDelete`, and `colCapexCostDataToPatch` after a panel save (write-plan scratch, never cleared)

#### 2.7.3 Variables read but never set on this screen

| Name | Where it is set instead |
|---|---|
| `colCapexAccountCategoriesNew`, `colCapexAccountsNew`, `colCapexSubaccountsNew`, `colContractDistributionTypes`, `colContractDistributionScheme`, `colCostPaidType` | `App.OnStart` |
| `colDistributionFrequency`, `LeftNavigationMenu` | Named formulas |
| `gblClusterDurations`, `gblRecordSelectedProjectCountry`, `gblProjectHeaderData`, `gblTableApprovalStateColors`, `gblPMAppURL`, `gblAppStarted`, `gblAppConstants` and the theme globals | `App.OnStart` |
| `gblShowReportProblemPanel` | Components |
| `locSelectedAccountCategory`, `locEditingCommentId` | **Set nowhere**; read only in commented-out code |

#### 2.7.4 Variables only ever set to one constant (on live paths)

| Name | Constant |
|---|---|
| `locSelectedAccount`, `locAveragePaymentCost`, `locRangeValidation` | `Blank()` |
| `locShowInActive`, `locIsAddingStandardContract`, `locConfirmCostPaidByChange`, `locConfirmClusterLinkChange`, `locIsVisibleProjectCostsMargin`, `locIsVisibleRightPanelEditMargin`, `locIsVisibleRightPanelSubaccountCostsEdit`, `locBindGallery` | `false` |
| `locStandardContractChanged`, `loctotalCostChanged` | `true` |
| `locSelectedSubaccountCommandMode` | `"Display"` |
| `locStartCategoryBinding` | Never `true` on a live path, so its timer cannot start |

#### 2.7.5 Other state smells

1. **One selection variable for six actions.** `locSelectedCostRow` is overwritten by every PCF event, even a comment click, and patched in place to flip `IsStandardContract`.
2. **Mixed types in one column.** `IsStandardContract` is the text `"true"`/`"false"` on contract rows (L1331-1335) and Boolean `false` on account rows (L1363). The two are then unioned in `colFinatCostDataOptimizedTemp` (L1401-1420). Save writes `'Is Standard Contract?': locSelectedCostRow.IsStandardContract` (save decoded L996). Whether the runtime coerces this is not verifiable from source; see §5.
3. **Stale flags.** These are never reset:
   - `loctotalCostChanged`;
   - `locEditSaveButtonEnabled` on Add (not reset in the "addContract" warm-up branch);
   - `locChanged*` on Cancel;
   - `locSelectedProjectContract` after a successful standard add (L18904-18913). The PCF block at L7403 then reads it as a success signal.
4. **Duplicated PCF branches.** `DeleteTriggered` and `SetCostPaidUnpaidTriggered` are each handled twice (L7418-7456).
5. **Two meanings for `colCapexCostsInSelectedContracts`.** It holds all years when filled by Refresh, and the selected year only when filled by the category timers.
6. **Shared write-plan scratch.** `colCapexCostDataToPatch` is shared between the standard path and the panel save, and also feeds `btn_…_EqualDistribution_…_Out_Of_LinkedCost`.

---

## 3. Code app implementation

### 3.1 Where the state lives

| Canvas mechanism | Code-app mechanism | Cite |
|---|---|---|
| `App.OnStart` globals (project, environment variables, user) | `SessionProvider`: `qk.session` (`staleTime: Infinity`), `qk.environmentVariables` (15 min), `qk.project(projectId)` (5 min) | `app/SessionContext.tsx:45-57, 83-89` |
| `Screen.OnVisible` derived context variables | Recomputed on every render from `project` by pure functions | `Screen.tsx:203-239`; `clusters.ts:56-153`; `panelRules.ts:139-193` |
| Server-data collections | TanStack Query caches, **scoped per category and server-filtered** | `useCostBook.ts:54-61` (`["cost-book", projectId, category]`), `:365-373` (`["capex-totals", projectId]`), `:488-511` (`["capex-standard-assumptions", ids]`, `["active-wtg-count", projectId]`), `:520-526` (`["capex-project-states"]`), `:539-545` (`["capex-categories"]`), `:554-564` (`["capex-milestone-durations", country, tech]`), `:581-588` (`["capex-comments", ids]`); prefix names in `data/keys.ts:81-93` |
| Derived collections (the PCF dataset, comment flags, options) | `useMemo` or a rules call per render | `PcfGrid.tsx:58-61` (`gridRows`); `Screen.tsx:294-299` (`commentFlags`), `:366-386` (standard options) |
| UI context variables | `useState` in `Screen.tsx` (lines 220-268) and `CommentsPanel.tsx` (lines 225-258) | — |
| "Select the hidden button, then Refresh" | Mutation `onSuccess` → `invalidateQueries` | `useCostBook.ts:382-396` (`useCapexWrites.invalidate`), `:590-614` (`useCommentWrites`) |
| Timers and warm-up flags | Not needed: rendering is synchronous after data arrives | — |

### 3.2 Per-item mapping

#### Globals

| Canvas | Code-app equivalent |
|---|---|
| `gblSelectedProject` | `useSession().project` (`ProjectContext`, `features/cost/contracts/rules.ts:208-297`), loaded by `loadProject` (`data/project.ts:127`), key `qk.project` (`keys.ts:18`). **No hard-coded fallback project** (bug A-2) |
| `gblSelectedProjectYear` | `pickedYear` `useState` (`Screen.tsx:220`), seeded by `onStartSelectedYear` (`panelRules.ts:171`) and clamped by `defaultSelectedYear` (`panelRules.ts:139`) at `Screen.tsx:222, 230-235`. D50 / CA-6. Tests: the `onStartSelectedYear` block in `panelRules.test.ts` (no UT ids) and `Screen.test.tsx` "opens on today's year…". **Component-local, so lost when the route unmounts** (GAP-VAR-01) |
| `gblClusterDurations` | `clusterDurations(project.milestones)` (`clusters.ts:56`) and `clusterBoundaries` (`:85`) at `Screen.tsx:214-215`. UT-CLU-001…007. Clusters with a missing boundary are omitted rather than kept blank |
| `gblRecordSelectedProjectCountry` | `project.countryName` and `project.isoCurrencyCode` (`contracts/rules.ts:226, 285`); `currencyCode(...)` `Screen.tsx:201`; `countryName` `Screen.tsx:478` |
| `gblProjectHeaderData`, `gblTableApprovalStateColors` | `AppHeader` from the session project; `APPROVAL_STATE_COLOUR` (`components/AppHeader.tsx:137`). Owned by 01 |
| `gblPMAppURL` | `pmAppUrl` (`SessionContext.tsx:100-104`) |
| `gblAppStarted` | `loading` (`SessionContext.tsx:105-108`) plus the query `isLoading` at `Screen.tsx:301` |
| `gblAppConstants` | Not needed. The `Notify` timeout is a toaster concern, and `Form.*` was only used by the dead `locSelectedSubaccountCommandMode` |
| `gblAppTheme`, `gblAppStyles`, `gblAppSizes`, `gblAppColors`, `gblAppThemeJson` | `theme/tokens.ts:12` (`palette`) and `theme/fluent.ts`. Owned by 03 |
| `gblLeftNavigationMenuIsExpanded` | `expanded` `useState` (`components/LeftNav.tsx:138`) |
| `gblLeftNavigationSelected` | Derived from the route (`NavLink`); `NAV_ITEMS` (`app/navigation.ts:42`) transcribes `LeftNavigationMenu` (UT-NAV-030) |
| `gblShowReportProblemPanel` / `gblReportError` | `reportOpen` `useState` (`App.tsx:28`); `lastError()` (`App.tsx:103`) |
| `varPCFInputData` and the `Navigate` context | Not needed. Navigation carries `projectId` and `category` in the URL (`Screen.tsx:711-715`), and *Add Costs from Table* loads its own sheet (`useAddCostSheet`, `useCostBook.ts:434-442`) |

#### Named formulas

| Canvas | Code-app equivalent |
|---|---|
| `LeftNavigationMenu` | `NAV_ITEMS` (`navigation.ts:42`) |
| `colDistributionFrequency` | `DISTRIBUTION_FREQUENCY` (`data/dataverseNames.ts:621`) → `FREQUENCY_OPTIONS` (`rules.ts:60`); UT-CAPEXR-114/115 |
| `AppTheme` | `palette` (`theme/tokens.ts:12`) |
| `EmptyGUID`, `Developers`, `DefaultProjectCostsMarginValue` | Not needed on this screen. `DEVELOPERS` exists in `domain/session.ts:72` for other uses |

#### Context variables

| Canvas | Code-app equivalent |
|---|---|
| `locCapexInitialLoadPending` / `Done`, `locStartCategoryBinding` / `1`, `locPanelReady`, `locWarmupMode`, `locWarmupKick`, `locStartBinding`, `locBindGallery` | **Not needed.** Timer workarounds; queries resolve before render (`Screen.tsx:301-305`), and `open()` builds the panel model synchronously (`Screen.tsx:327-343`) |
| `locIsVisibleLoadingCostSpinner` | `isLoading` → `<LoadingOverlay mode="inline">` (`Screen.tsx:301`); Summary `totals.isLoading` (`:692`) |
| `locScreenVisitStamp` (`CollapseResetKey`) | `<PcfGrid key={category}>` (`Screen.tsx:744`) remounts the grid per category, and per route mount |
| `locSelectedCapexAccountCategory` | `category` from `?category=` via `resolveCategory` (`rules.ts:92`) at `Screen.tsx:182`; tabs from `useCapexCategories` and `categoryTabs` (`Screen.tsx:178-181`). UT-CAPEXR-001… ("category tabs") |
| `locProjectStartClusterNo` | `project.startClusterNo` (`Screen.tsx:203`; `contracts/rules.ts:262`) |
| `locCostAllowedStartYear` / `Date` | `costAllowedStart` (`clusters.ts:108`) at `Screen.tsx:219`. UT-CLU-008…012 |
| `locNavigationMinYear` / `MaxYear` | `navigationWindow` (`clusters.ts:127`) at `Screen.tsx:223`. UT-CLU-013…016 |
| `colProjectPeriods` | `projectPeriods(window.min, window.max)` (`clusters.ts:318`) at `Screen.tsx:736`. UT-CLU-017…020 |
| `locShowInActive`, `locSelectedAccount`, `locSelectedSubaccountCommandMode`, `locIsVisibleProjectCostsMargin`, `locIsVisibleRightPanelEditMargin` / `SubaccountCostsEdit` / `DistributeEqually`, `locSelectedProjectCostsMargin`, `locSelectedAccountCategory`, `locPCFSelectedContract`, `locEditingCommentId` | **Not needed** (dead in the canvas) |
| `locSelectedCostRow` | Split by purpose: `edit` (`CostLine`, `Screen.tsx:243`) for Add and Edit; `deleting` (`:245`); `commentFor` (`:246`); `paidRequest` (`:254`); the standard-contract arguments `(subaccountId, assumptionId)` (`:388`). All dispatched by `onAction` (`:423-452`) |
| `locSelectedProjectContract` | `storedLine` derived from `book.lines` (`Screen.tsx:521`); the comments panel takes `contractId` (`:953-961`) |
| `locSelectedContractDescription` | `edit.description` plus `originalDescription` (`Screen.tsx:253`) |
| `locAllYearsCost` | `costValue` (`Screen.tsx:244`), seeded by `initialCostValue` (`rules.ts:142`) |
| `locIsVisibleRightPanelAddContract` | `open={!!edit}` (`Screen.tsx:750`) |
| `locProjectDuration` / `locProjectStartyear` | **Not reproduced**: the panel year list uses the navigation window (`Screen.tsx:902`) (GAP-VAR-06) |
| `locClusterRecord` / `locDistributionDatesRecord` | `edit.clusters`, `edit.equalMode`, `edit.startDate` / `edit.endDate` plus `startText` / `endText` (`Screen.tsx:250-251`), parsed by `parseByClusterJson` / `parseStartEndJson` (UT-CAPEXR-049…072) |
| `colNewEditPanelCost` / `colNewEditPanelCostProcessed` | `edit.payments` plus `rawProposed` / `proposed` (`proposedPayments` `rules.ts:228`, `resolvedPayments` `rules.ts:290`) at `Screen.tsx:454-458`; `openYear` (`:248`) replaces `IsFolded` |
| `locEditSaveButtonEnabled` | **Not reproduced** as a dirty flag. `valid` (`Screen.tsx:513-516`) gates Save (`:753`); `panelRules.ts:362-364` says validity "plays that role" (GAP-VAR-03) |
| `locShowErrorInContractCost` | **Missing** (GAP-VAR-08) |
| `locStandardContractChanged` / `locIsStandardContractOriginal` | `applyDescriptionChange` (`rules.ts:578`) via `clearStandardFlag` (`Screen.tsx:316-319`); UT-CAPEXR-047/048 |
| `locChangedByDate` / `Distribution` / `Frequency`, `locClusterChanged`, `loctotalCostChanged` | Not reproduced. Every save recomputes and reconciles (`Screen.tsx:614-628`, marked `DIVERGENCE`, D38 §6); `reconcilePayments` (`rules.ts:358`) UT-CAPEXR-076…079 |
| `locValidCostInContract` | `canSaveContract` (`rules.ts:260`) UT-CAPEXR-024…029 |
| `locSelectedSubAccount`, `locNumPayments`, `locLastCost` | Inside `saveCostLine` (`data/capexWrites.ts`) and `distribution.ts` (UT-DIST-007…012). Owned by 08 |
| `locInitialCostPaidBy` | `storedLine?.payer` (`Screen.tsx:536`); the loaded `payer` uses `resolvePayer` with the SPVDevCo mapping (`costBook.ts:1118`, `:155`). **New lines default to "SPV"** (`rules.ts:113`) (GAP-VAR-04) |
| `locCostPaidByChanged` | `costPaidByChanged` (`Screen.tsx:536`), **Edit only** (GAP-VAR-05) |
| `locClusterLinkageChanged` | `linkageChanged` = `clusterLinkageChanged` (`rules.ts:947`) at `Screen.tsx:533` |
| `locMilestoneRelinkResetNeeded` | `relinkResetNeeded` = `milestoneRelinkResetNeeded` (`rules.ts:970`) at `Screen.tsx:537-544`, computed from the loaded payments, not a fresh server count. UT-CAPEXR-098…104 |
| `locShowClusterLinkageConfirmation` | `linkConfirmOpen` (`Screen.tsx:260`), opened in `commit` (`:667-671`) |
| `locContinueToSavelinkedCluster`, `locConfirmCostPaidByChange`, `locConfirmClusterLinkChange` | **Not needed.** `commit` → dialog → `persist` (`Screen.tsx:590-671, 1016`) |
| `colOtherClusterHavingCost` | `clustersWithCost` = `clustersHavingCost` (`rules.ts:994`) at `Screen.tsx:546`; `needsClusterLinkageConfirmation` (`rules.ts:1023`) UT-CAPEXR-105…108; copy `clusterLinkageConfirmation` (`rules.ts:1093`) UT-CAPEXR-109…119 |
| `locGUIDforLoadingStandardContract`, `locStandardContractAssumption`, `locTotalCostToDistribute` | Function locals in `addStandardContract` (`Screen.tsx:388-421`): `assumptionId`, `assumption`, `amt` (`standardAssumptionAmount`, `standardContracts.ts:45`, UT-STD-001…004) |
| `locIsAddingStandardContract` | `busy` (`Screen.tsx:205`) shows the blocking overlay (`:1045-1049`); `standardName` (`:258`) |
| `locIsVisiblePopUpSpinner` / `locSpinnerInformationText` | `busy` plus `standardName` / `savingLabel` (`Screen.tsx:258, 268, 1045-1049`; `savingCostLabel` `panelRules.ts:239`); `CommentsPanel` `saving` (`CommentsPanel.tsx:258`) |
| `locIsVisibleSubaccountCostsDeletionDialog` | `deleting` (`Screen.tsx:245, 977-987`) |
| `locIsVisibleSetPaidCost` | `paidRequest` (`Screen.tsx:254, 1028-1036`); `paidToggleNeedsConfirmation` (`rules.ts:839`) UT-CAPEXR-058 |
| `locIsVisibleCapexComments` | `commentFor` (`Screen.tsx:246`) |
| `locPinGeneralComments` | `pinGeneral` (`CommentsPanel.tsx:247`, default `true`, as at L7634) |
| `locShowResolvedComments` | `showResolved` (`CommentsPanel.tsx:248`, default `false`, as at L7635) |
| `locAvailebleCapexCosts` | `costOptions` from `payments` (`CommentsPanel.tsx:295-301`) |
| `locSelectedCapexComments` | Not needed (never read) |

#### Collections

| Canvas | Code-app equivalent |
|---|---|
| `colCapexAccountCategoriesNew` | `useCapexCategories` → `loadCapexCategories` (`costBook.ts:744`), key `["capex-categories"]`, 30 min. The Summary tab is not a fake data row but `SUMMARY_CATEGORY = -1` (`rules.ts:45`) |
| `colCapexAccountsNew` / `colCapexSubaccountsNew` | `book.accounts` from `loadCostAccounts` (`costBook.ts:767`) |
| `colCapexAccountsInSelectedCategoryNew` / `colCapexSubaccountsInSelectedCategoryNew` | `accountsInCategory(book.accounts, category)` (`rules.ts:317`) → `categoryAccounts` / `subaccountIds` (`Screen.tsx:275-276`) |
| `colCapexProjectContracts` / `colCapexContractsInSelectedCategory` | `book.lines` from `loadCostLines` (`costBook.ts:1013`), **this category only, `statecode eq 0`** |
| `colCapexCosts` / `colCapexCostsInSelectedContracts` | `CostLine.payments` from `loadPayments` (`costBook.ts:1130-1166`): all years, chunked `lookupIn`, `ACTIVE` |
| `colCapexCommentsInSelectedContracts` / `colCapexCommentsLatest` | `useCapexComments(contractIds)` (`useCostBook.ts:581`) → `loadComments` (`data/comments.ts:64`); `commentThreads` / `commentCosts` / `gridCommentIndicators` (`comments.ts:268, 568, 339`) memoised at `Screen.tsx:294-299`. UT-CMT-003…006, 031…041 |
| `colCapexContractCostGrouped_V1`, `colAllGroupedAccounts`, `colFinatCostDataOptimizedTemp`, `colFlatCostsMapped`, `colContractTotalsForPCF`, `colFinatCostDataOptimized` | One pure function, `gridRows` (`gridRows.ts:127`), memoised in `PcfGrid.tsx:58-61`. UT-GRID-001…020 |
| `colCapexSummaryCategories` / `colDevexCapexSummaryView` | `useCapexTotals` → `loadCapexTotals` (`costBook.ts:1270`): sums of cost rows, `Max(…, 0)`; rendered at `Screen.tsx:691-708` |
| `colStandardContractOptionsForPCF` | `buildStandardOptions` (`standardContracts.ts:108`, UT-STD-016…020) → `pcfStandardOptions` (`Screen.tsx:372-386`). The optimistic `RemoveIf` is replaced by invalidation |
| `colStandardCostAllSelectedClusters` / `colEligibleStandardCostClusters` | `standardClusters` (`Screen.tsx:366-368`, via `synthesiseClusterDates` `clusters.ts:269`, UT-CLU-021…030) and `option.eligible` (`:396`; UT-STD-010…013) |
| `colCapexCostDataAllPayments` / `WithCost` / `ToPatch` | `clusterMoneyPayments(...)` (`Screen.tsx:403-405`), passed as `payments` to `saveLine` |
| `colSelectedClusters`, `colCapexEditContract`, `colCapexFinalDataToPatch`, `colCapexToDelete` | `reconcilePayments` plus `capexWriteSet` (`writeSet.ts`, UT-CWS-001…009) inside `saveCostLine`. Owned by 08 |
| `colCapexComments` | `working` (`CommentsPanel.tsx:225`), seeded once per opening (`:266-276`) |
| `colDeletedComments` | `deletedIds` (`:226`); `planDeleteRoot` UT-CMT-014/015 |
| `colTempRoots` | `renumberThreads` (`comments.ts:291`, UT-CMT-007) |
| `IsEdit` / `IsModified` / `SelectedYear` columns | `editingIds` / `touchedIds` / `yearById` (`CommentsPanel.tsx:227, 236, 246`) |
| `colContractDistributionTypes` / `Scheme`, `colCostPaidType` | Literal option lists at `Screen.tsx:788, 803, 888` |
| `colSubaccountMappedCostPaid`, `colCombinedCostAccounts`, `colAddCostFromTable` | Not needed here. *Add Costs from Table* has its own query (`useCostBook.ts:434`) |

#### Component and PCF properties

| Canvas property | Code-app equivalent |
|---|---|
| `Items` | `gridRows` |
| `StandardContractOptions_Items` | `standardOptions` |
| `StartYear` | `year` |
| `ShowEmptyAccounts` / `ShowPlannedCost` / `CostPaidByFilter` | `showEmpty` / `showPlanned` / `payer` (`Screen.tsx:240-242`) |
| `Cluster1..6Date` | `clusterDates` = `boundaries` (`PcfGrid.tsx:79-84`) |
| The 13 PCF outputs | One typed `GridCallback`, `onAction` (`Screen.tsx:423-452`) |

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-VAR-01 | Selected year | `gblSelectedProjectYear` is a global. Each `OnVisible` re-clamps it (L238-257), but it **survives navigation** to Contracts, OPEX, Land Lease and Add Costs from Table and back | `pickedYear` is `useState` in the route component (`Screen.tsx:220`); `/costs/capex` is its own route (`routes.tsx:137`). On remount it falls back to the OnStart seed. The back navigation from *Add Costs from Table* carries only `?category=` (`add-costs-from-table/Screen.tsx:161`) | UX / Functional | Divergent-unmarked | Med | No D-entry. D50 covers only the seed. A user editing 2027 loses the year after every Add-from-Table round trip |
| GAP-VAR-02 | Grid filters | `tgl_…ShowEmptyAccounts`, `tgl_…ShowPlannedPaid` and `drp_…ShowCostPaidBy` are controls, so they keep their values across navigation until reset (inferred, standard canvas behaviour; L2886-2920) | `showEmpty`, `showPlanned` and `payer` are `useState` (`Screen.tsx:240-242`) and reset on remount | UX | Divergent-unmarked | Low | — |
| GAP-VAR-03 | Save "dirty" gate | `locEditSaveButtonEnabled` is the last clause of Save `DisplayMode` (L17548), `btn_SaveCost_Execute____` (L17648), Recalculate (L17712) and the error strip (L19816). It is reset to `false` at `OnVisible` (L33) and in the Edit warm-up (L19700), so Edit opens with Save disabled until a field changes. It is *not* reset on Add (L19674-19684), a canvas inconsistency | Save is `disabled={!valid \|\| busy}` (`Screen.tsx:753`), enabled as soon as the form is valid. `panelRules.ts:362-364` substitutes validity for the flag without a `DIVERGENCE` marker | UX | Divergent-unmarked | Med | Not in `02-OPEN-DECISIONS.md` (the "Save stayed enabled" item at :717 is the Admin Cost DEVEX screen, not this one) |
| GAP-VAR-04 | Default payer on Add | `rad_AddContract_RightPanel_CostPaidBy_1.DefaultSelectedItems` (L12234-12254) and `locInitialCostPaidBy` (L7303-7309) default a new contract to the sub-account's `SPVDevCo Mapping Capex Devexes` value | `newCostLine` hard-codes `payer: "SPV"` (`rules.ts:113`), used by `open()` (`Screen.tsx:333`). The mapping is loaded (`loadPayerDefaults`, `costBook.ts:155`) but used only for existing lines (`resolvePayer`, `:1118`) | Functional / Data | Divergent-unmarked | High | A DevCo-mapped sub-account saves `vsb_costtype = SPV` unless the user notices. This feeds liquidity planning and BoP |
| GAP-VAR-05 | Payer-change confirmation on Add | `locCostPaidByChanged = locInitialCostPaidBy <> Self.Selected.Value` (L12289) runs on Add too, so switching a new contract away from the mapped payer raises "Change Cost Paid By" on Save (save decoded L705-713) | `costPaidByChanged = Boolean(storedLine) && …` (`Screen.tsx:536`) is always `false` for a new line | Functional | Divergent-unmarked | Med | Follows from GAP-VAR-04. Decide both together |
| GAP-VAR-06 | Panel year range | `locProjectStartyear = Year(costStart) - 1` and `locProjectDuration = Year(costEnd) - Year(costStart) + 4` (L19621-19627), with `costEnd = Coalesce(COD, 'End Date', '5-Construction', Today())`. Years run from cost start to cost end + 3 (L19635-19637, L10640-10642) | The panel lists `projectPeriods(window.min, window.max)` (`Screen.tsx:902`), the grid's navigation window | Functional | Divergent-unmarked | Med | Already raised as `gap-analysis/cost-capex-costs.md` B9 / Q6; still unmarked in code |
| GAP-VAR-07 | Equal-distribution recompute gate | `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged, loctotalCostChanged)` (save decoded L1579-1586). `loctotalCostChanged` is never reset after L10985, so once set it forces a recompute on every later save in the visit | Every save recomputes and reconciles (`Screen.tsx:614-628`, `DIVERGENCE`) | Functional | Divergent-marked | Low | D38 §6; gap-analysis L-6. The never-reset flag is a canvas defect that the code app sidesteps |
| GAP-VAR-08 | Error strip flag | `locShowErrorInContractCost` (`true` after a failed individual save, decoded L1228) shows `cmp_ShowErrorInContract` (L19814-19831) | No equivalent | UX | Missing | Low | gap-analysis S15 / UX-9; 06 owns the popup |
| GAP-VAR-09 | Inactive rows in the caches | `colCapexProjectContracts` / `colCapexCosts` filter only by project and contract (OnStart decoded L714-750; Reload L729-766), so inactive (`statecode = 1`) rows are included | Every CAPEX read filters `ACTIVE` = `statecode eq 0` (`odata.ts:103`; `costBook.ts:1141, 1280`) | Data | Divergent-unmarked | Low | Same class as D45 G2 (Project Overview). Whether inactive CAPEX rows exist live is not verifiable from source |
| GAP-VAR-10 | PCF cluster band fallback | `Cluster{n}Date = Date(Coalesce(StartYear, locNavigationMinYear, gblSelectedProjectYear), Coalesce(StartMonth, 1), 1)` (L7238-7273): always a date | `clusterDates[i]` is `null` for a missing milestone, so the PCF omits the band (`PcfGrid.tsx:79-84`) | UI | Divergent-unmarked | Low | Commented in code but with no marker. 14 owns the PCF contract |
| GAP-VAR-11 | Category on entry | `OnVisible` keeps the previous `locSelectedCapexAccountCategory` when it has an account id, else picks the first real category (L259-276). The not-ready path picks "DEVEX/CAPEX Summary" (L782 decoded L23-26) | `resolveCategory(null)` → Summary (`rules.ts:96`). The tab is remembered only if the URL carries `?category=`, so entering from the left nav always opens Summary | UX | Partial | Low | Canvas bug D-7; gap-analysis B2 |
| GAP-VAR-12 | Double-add guard | `locIsAddingStandardContract` is set `true` only in the dead command bar (L3317, L3405). On the live PCF path (L7360-7417) nothing guards a second click | The `busy` overlay (`Screen.tsx:205, 1045-1049`) blocks the UI while `saveLine` is pending | Functional | Code-app-only | Low | An improvement; no D-entry needed beyond noting it |
| GAP-VAR-13 | Project freshness | `OnVisible` re-`LookUp`s `gblSelectedProject` on every visit (L40-56). `gblClusterDurations` and `gblRecordSelectedProjectCountry` are *not* recomputed (OnStart only) | `qk.project` has `staleTime` 5 min (`SessionContext.tsx:88`). Milestones, start cluster and country are all re-read together when it refetches | Data | Partial | Low | The canvas is half-fresh, the code app is consistently cached. An edit made in the PM app within 5 minutes may not show (inferred) |
| GAP-VAR-14 | Master and category data | `colCapexAccountCategoriesNew`, `…AccountsNew`, `…SubaccountsNew`, `…InSelectedCategoryNew`, `colCapexProjectContracts`, `colCapexContractsInSelectedCategory`, `colCapexCosts`, `colCapexCostsInSelectedContracts`, `colProjectPeriods`, `gblClusterDurations`, `locCostAllowedStart*`, `locNavigation*Year`, `locProjectStartClusterNo` (§2.3.2, §2.4.1-2) | `useCapexCategories`, `useCostBook(category)`, `accountsInCategory`, `clusterDurations`, `costAllowedStart`, `navigationWindow`, `projectPeriods` (§3.2) | Data | Covered | Low | Server-filtered per category, which satisfies rule 2. UT-CLU-*, UT-CAPEXR-001… |
| GAP-VAR-15 | PCF dataset and comment flags | The Refresh chain `colCapexContractCostGrouped_V1` → … → `colFinatCostDataOptimized`; `colContractTotalsForPCF`; `colCapexCommentsLatest`; `colStandardContractOptionsForPCF` | `gridRows` (`PcfGrid.tsx:58-61`), `gridCommentIndicators` (`Screen.tsx:294-299`), `buildStandardOptions` (`:372-386`) | Data | Covered | Low | UT-GRID-001…020, UT-CMT-031…036, UT-STD-016…020. The column-level PCF contract is in 14 |
| GAP-VAR-16 | Panel and confirmation flags | `locSelectedCostRow`, `locSelectedProjectContract`, `locAllYearsCost`, `locClusterRecord`, `locDistributionDatesRecord`, `colNewEditPanelCost*`, `locClusterLinkageChanged`, `locMilestoneRelinkResetNeeded`, `colOtherClusterHavingCost`, `locShowClusterLinkageConfirmation`, `locStandardContractChanged`, `locValidCostInContract` | `edit`, `storedLine`, `costValue`, `proposed`, `linkageChanged`, `relinkResetNeeded`, `clustersWithCost`, `linkConfirmOpen`, `applyDescriptionChange`, `canSaveContract` (§3.2) | Functional | Covered | Low | Derived per render, so they cannot go stale (`Screen.tsx:527-532`). UT-CAPEXR-024…029, 047-048, 098…119 |
| GAP-VAR-17 | Dialogs and spinners | `locIsVisibleSubaccountCostsDeletionDialog`, `locIsVisibleSetPaidCost`, `locIsVisibleCapexComments`, `locIsVisibleRightPanelAddContract`, `locIsVisiblePopUpSpinner`, `locSpinnerInformationText`, `locIsVisibleLoadingCostSpinner` | `deleting`, `paidRequest`, `commentFor`, `!!edit`, `busy` + `standardName` / `savingLabel`, `isLoading` (`Screen.tsx:245-268, 301, 692, 1045-1049`) | UX | Covered | Low | Wording and sizing are owned by 06 |
| GAP-VAR-18 | Comments working state | `colCapexComments`, `colDeletedComments`, `colTempRoots`, `locPinGeneralComments`, `locShowResolvedComments`, `locAvailebleCapexCosts` | `working`, `deletedIds`, `renumberThreads`, `pinGeneral`, `showResolved`, `costOptions` (`CommentsPanel.tsx:225-301`) | Functional | Covered | Low | Defaults match L7634-7635. UT-CMT-007, 014-019, 051…078. Behaviour is owned by 09 |
| GAP-VAR-19 | Standard-contract scratch | `locGUIDforLoadingStandardContract`, `locStandardContractAssumption`, `locTotalCostToDistribute`, `colStandardCostAllSelectedClusters`, `colEligibleStandardCostClusters`, `colCapexCostDataAllPayments*`, `colCapexCostDataToPatch` | Function locals and `clusterMoneyPayments` in `addStandardContract` (`Screen.tsx:388-421`) | Functional | Covered | Low | The code app also avoids the canvas leak of `locSelectedProjectContract` after success (L18904-18913). UT-STD-*, UT-CLU-021…030 |
| GAP-VAR-20 | Globals and shell | `gblLeftNavigation*`, `gblShowReportProblemPanel`, `gblPMAppURL`, `gblAppStarted`, `gblRecordSelectedProjectCountry`, the theme globals, `LeftNavigationMenu`, `colDistributionFrequency` | `LeftNav.tsx:138`, `App.tsx:28`, `SessionContext.tsx:100-108`, `ProjectContext`, `theme/tokens.ts:12`, `navigation.ts:42`, `dataverseNames.ts:621` | UI | Covered | Low | UT-NAV-030, UT-CAPEXR-114/115 |
| GAP-VAR-21 | Dead and workaround state | The timer flags (`locCapexInitialLoad*`, `locStartCategoryBinding*`, `locWarmup*`, `locStartBinding`, `locPanelReady`) and the 20+ dead variables of §2.7.2-2.7.4 | Not ported | Perf | Covered | Low | Correctly omitted: every one is either a timer workaround or never read on a live path (rule 10) |

**Counts.**

| Status | Count | Rows |
|---|---|---|
| Divergent-unmarked | 8 | 01, 02, 03, 04, 05, 06, 09, 10 |
| Divergent-marked | 1 | 07 |
| Missing | 1 | 08 |
| Partial | 2 | 11, 13 |
| Code-app-only | 1 | 12 |
| Covered (row groups) | 8 | 14–21 |

**By severity:** High 1 (04); Med 4 (01, 03, 05, 06); Low 16 (eight non-Covered rows and eight Covered groups).

---

## 5. Open questions / not verifiable from source

1. **The `IsStandardContract` type mix.** It is text `"true"`/`"false"` on contract rows (L1331-1335) and Boolean on account rows (L1363), unioned at L1401-1420. Save writes it to the `Is Standard Contract?` two-option column (save decoded L996). How the canvas runtime coerces this, and whether a contract opened from the PCF ever saves "Ja", needs a live check. The code app uses one Boolean, `line.standard` (`gridRows.ts:209`).
2. **Delegation of the OnStart account filters.** Do `'Parent Account'.Number = "00001"` and `'Parent Account'.'CAPEX Account List' in <collection>` (OnStart decoded L677-708) delegate to Dataverse, or do they silently cap at the data row limit? App Checker reports only the generic `app-DataSourceDefaultMaxRowsLimit`. This needs Studio's delegation warnings or a live row count of `vsb_capexaccountlists`.
3. **`colContractDistributionScheme` order.** The canvas depends on `First` = "% Values" (L10743, L10749). `dataverseNames.ts:551` lists `percentValues: 952850000` before `absoluteValues`, which is consistent. The code app's radio lists "Absolute Values" first (`Screen.tsx:803`). Whether `Choices()` really returns metadata order on this environment is not verifiable here. 02 and 08 own the radio.
4. **The legacy gallery's hidden state.** `Visible: =//true` (L3730, L4323, L6311) is a comment-only formula. Whether the runtime renders it as hidden (assumed here) or as the default `true` needs a live look. If it rendered, `locSelectedCostRow` would also be settable from L6271.
5. **`locStartCategoryBinding`.** It is never set `true` on a live path, so `tmr_Capex_Cost_Category_SwitchTabs` should never fire. A live run should confirm that the timers are dead and not triggered some other way. 07 owns the timers.
6. **`btn_SaveCost_Execute____`.** It is the only reader of `locContinueToSavelinkedCluster`. Whether it is still reachable (it is a PowerCAT icon in the footer, L17605-17690), and which of the two near-identical save formulas users actually run, is for 08 to establish.
7. **GAP-VAR-01 and GAP-VAR-02.** These depend on canvas runtime state retention across `Navigate`. That is standard platform behaviour, but it has not been observed on this app.

## 6. Doc disagreements

1. **Line count.** The shared brief gives `Capex Costs Screen.pa.yaml` as 20,082 lines. The file on disk has 20,178.
2. **`gap-analysis/cost-capex-costs.md` D1** (L94) lists `gblAppResx` among the screen's OnStart requirements, with `COVERED`. No control on this screen or its components reads `gblAppResx` (§2.1.3).
3. **`gap-analysis/cost-capex-costs.md` B1** (L117) says `OnVisible` resets "~20 `loc*` variables". It resets exactly 20 at L15-38, which is consistent. But B1 also says it selects "the first non-'Overleveraging' category". Per L261-265 it first keeps the previous selection when that has an account id.
4. **`migration-plans/02-global-state-and-data.md:241-247`** says the Cost app's `colCapexProjectContracts` is "scoped to the selected project only". That is true for the OnStart definition. The Reload button (L729-736) narrows it further, to active sub-accounts, so the collection has two definitions over a session.
5. **`migration-plans/screens/019-capex-costs.md` §8** (L55-57) says canvas state "must be reset when the route identity changes". The canvas does **not** reset `gblSelectedProjectYear` or the toggles across navigation (GAP-VAR-01/02). The code app follows 019, not the canvas, and no decision records this. 019 also contains no variable inventory, so it cannot be checked item by item.
6. **`02-OPEN-DECISIONS.md:717`**: "DEVEX `locEditSaveButtonEnabled` was never reset when Add Cost or Edit opened the panel. The panel now opens clean." It reads like the CAPEX panel, but it is in the Admin Cost (Application Settings) block. On this screen the canvas does reset it on Edit (L19700) and not on Add, and the code app does not model the flag at all (GAP-VAR-03).

---

## 7. Summary table

"Status" uses the gap statuses of §4. *Not needed* means correctly omitted: dead in the canvas, or a timer workaround.

| Canvas name | Kind | Purpose | Code-app equivalent (file:line) | Status |
|---|---|---|---|---|
| `gblSelectedProject` | Global | The current project record | `app/SessionContext.tsx:83-89` (`qk.project`) | Covered (freshness: Partial, GAP-VAR-13) |
| `gblSelectedProjectYear` | Global | Selected grid year | `capex-costs/Screen.tsx:220-235`; `panelRules.ts:139, 171` | Divergent-unmarked (GAP-VAR-01) |
| `gblClusterDurations` | Global | Six cluster spans | `capex-costs/clusters.ts:56, 85`; `Screen.tsx:214-215` | Covered |
| `gblRecordSelectedProjectCountry` | Global | Country (currency, Poland ceiling) | `contracts/rules.ts:226, 285`; `Screen.tsx:201, 478` | Covered |
| `gblProjectHeaderData` | Global | Header record | `components/AppHeader.tsx` (01) | Covered |
| `gblTableApprovalStateColors` | Global | Approval colours | `components/AppHeader.tsx:137` | Covered |
| `gblPMAppURL` | Global | Logo link to the PM app | `app/SessionContext.tsx:100-104` | Covered |
| `gblAppStarted` | Global | OnStart done | `app/SessionContext.tsx:105-108`; `Screen.tsx:301` | Covered |
| `gblAppConstants` | Global | Notify timeout, form modes | — | Not needed |
| `gblAppTheme` / `gblAppThemeJson` / `gblAppStyles` / `gblAppSizes` / `gblAppColors` | Global | Theme | `theme/tokens.ts:12`, `theme/fluent.ts` (03) | Covered |
| `gblLeftNavigationMenuIsExpanded` | Global | Rail collapsed | `components/LeftNav.tsx:138` | Covered |
| `gblLeftNavigationSelected` | Global | Active nav item | Route plus `app/navigation.ts:42` | Covered |
| `gblShowReportProblemPanel` | Global | Report panel open | `App.tsx:28` | Covered |
| `varPCFInputData` | Global | Sheet JSON for Add from Table | URL + `useCostBook.ts:434-442` | Not needed |
| `AppTheme` | Named formula | Palette | `theme/tokens.ts:12` | Covered |
| `LeftNavigationMenu` | Named formula | Nav items | `app/navigation.ts:42` | Covered |
| `colDistributionFrequency` | Named formula | Frequencies 1/2/3/6/12 | `data/dataverseNames.ts:621`; `capex-costs/rules.ts:60` | Covered |
| `EmptyGUID`, `Developers`, `DefaultProjectCostsMarginValue`, `varCurrentUserProfile` | Named formula | Unused on this screen | — | Not needed |
| `locCapexInitialLoadPending` / `Done` | Context | Initial-load retry timer | `Screen.tsx:301` (query state) | Not needed |
| `locIsVisibleLoadingCostSpinner` | Context | Grid spinner | `Screen.tsx:301, 692` | Covered |
| `locStartCategoryBinding` / `1` | Context | Category timer chain (never fires) | — | Not needed |
| `locScreenVisitStamp` | Context | PCF collapse reset | `Screen.tsx:744` (`key={category}`) | Covered |
| `locSelectedCapexAccountCategory` | Context | Open tab | `Screen.tsx:178-182`; `rules.ts:81, 92` | Partial (GAP-VAR-11) |
| `locProjectStartClusterNo` | Context | Start cluster 0-6 | `Screen.tsx:203` | Covered |
| `locCostAllowedStartYear` / `Date` | Context | First bookable year | `clusters.ts:108`; `Screen.tsx:219` | Covered |
| `locNavigationMinYear` / `MaxYear` | Context | Year window | `clusters.ts:127`; `Screen.tsx:223` | Covered |
| `locSelectedCostRow` | Context | Selected grid row (all actions) | `Screen.tsx:243-254` (`edit`, `deleting`, `commentFor`, `paidRequest`), `:423-452` | Covered |
| `locSelectedProjectContract` | Context | Selected contract / save result | `Screen.tsx:521` (`storedLine`) | Covered |
| `locSelectedContractDescription` | Context | Panel description | `Screen.tsx:253` + `edit.description` | Covered |
| `locAllYearsCost` | Context | Total cost box | `Screen.tsx:244`; `rules.ts:142` | Covered |
| `locIsVisibleRightPanelAddContract` | Context | Panel open | `Screen.tsx:750` | Covered |
| `locPanelReady`, `locWarmupMode`, `locWarmupKick`, `locStartBinding` | Context | Panel warm-up timers | `Screen.tsx:327-343` (`open()`) | Not needed |
| `locProjectDuration` / `locProjectStartyear` | Context | Panel year range | `Screen.tsx:902` (navigation window) | Divergent-unmarked (GAP-VAR-06) |
| `locClusterRecord` / `locDistributionDatesRecord` | Context | Stored cluster / date selection | `Screen.tsx:250-251` + `edit.clusters` / `startDate` / `endDate` | Covered |
| `locEditSaveButtonEnabled` | Context | Dirty gate for Save / Recalculate | `Screen.tsx:513-516, 753`; `panelRules.ts:362-364` | Divergent-unmarked (GAP-VAR-03) |
| `locShowErrorInContractCost` | Context | Error strip | — | Missing (GAP-VAR-08) |
| `locStandardContractChanged` / `locIsStandardContractOriginal` | Context | Clear the standard flag on edit | `rules.ts:578`; `Screen.tsx:316-319` | Covered |
| `locChangedByDate` / `Distribution` / `Frequency`, `locClusterChanged`, `loctotalCostChanged` | Context | Equal recompute gate | `Screen.tsx:614-628` | Divergent-marked (GAP-VAR-07) |
| `locValidCostInContract` | Context | Individual save validity | `rules.ts:260` | Covered |
| `locSelectedSubAccount`, `locNumPayments`, `locLastCost` | Context | Save scratch | `data/capexWrites.ts`, `distribution.ts` (08) | Covered |
| `locInitialCostPaidBy` | Context | Payer the panel opened with | `Screen.tsx:536`; `rules.ts:113` | Divergent-unmarked (GAP-VAR-04) |
| `locCostPaidByChanged` | Context | Payer switched | `Screen.tsx:536` (Edit only) | Divergent-unmarked (GAP-VAR-05) |
| `locClusterLinkageChanged` | Context | Milestone link changed | `rules.ts:947`; `Screen.tsx:533` | Covered |
| `locMilestoneRelinkResetNeeded` | Context | Relink resets paid flags | `rules.ts:970`; `Screen.tsx:537-544` | Covered |
| `locShowClusterLinkageConfirmation` | Context | Relink dialog open | `Screen.tsx:260, 667-671, 999-1016` | Covered |
| `locContinueToSavelinkedCluster`, `locConfirmCostPaidByChange`, `locConfirmClusterLinkChange` | Context | Confirm plumbing (mostly unread) | `Screen.tsx:667-671` | Not needed |
| `locGUIDforLoadingStandardContract`, `locStandardContractAssumption`, `locTotalCostToDistribute` | Context | Standard add parameters | `Screen.tsx:388-421`; `standardContracts.ts:45` | Covered |
| `locIsAddingStandardContract` | Context | Double-add guard (dead) | `Screen.tsx:205, 1045-1049` | Code-app-only (GAP-VAR-12) |
| `locIsVisiblePopUpSpinner` / `locSpinnerInformationText` | Context | Blocking loader and text | `Screen.tsx:258, 268, 1045-1049`; `CommentsPanel.tsx:258` | Covered |
| `locIsVisibleSubaccountCostsDeletionDialog` | Context | Delete dialog | `Screen.tsx:245, 977-987` | Covered |
| `locIsVisibleSetPaidCost` | Context | Paid confirm dialog | `Screen.tsx:254, 1028-1036` | Covered |
| `locIsVisibleCapexComments` | Context | Comments panel open | `Screen.tsx:246, 953-961` | Covered |
| `locPinGeneralComments` / `locShowResolvedComments` | Context | Comment list options | `CommentsPanel.tsx:247-248` | Covered |
| `locAvailebleCapexCosts` | Context | Cost rows for comment dates | `CommentsPanel.tsx:295-301` | Covered |
| `locShowInActive`, `locSelectedAccount`, `locSelectedSubaccountCommandMode`, `locBindGallery`, `locIsVisibleProjectCostsMargin`, `locIsVisibleRightPanelEditMargin`, `locIsVisibleRightPanelSubaccountCostsEdit`, `locIsVisibleRightPanelSubaccountCostsDistributeEqually`, `locSelectedCapexComments`, `locAveragePaymentCost`, `locRangeValidation`, `locDistributionSchemeByPercentage`, `locTotalCost` (context), `locSelectedAccountCategory`, `locEditingCommentId`, `locSelectedProjectCostsMargin`, `locPCFSelectedContract`, `locCostInLinkedCluster` | Context | Dead (§2.7.2-2.7.4) | — | Not needed |
| `colCapexAccountCategoriesNew` | Collection | Categories + Summary row | `useCostBook.ts:539-545`; `data/costBook.ts:744`; `rules.ts:45` | Covered |
| `colCapexAccountsNew` / `colCapexSubaccountsNew` | Collection | Account tree | `data/costBook.ts:767` | Covered |
| `colCapexAccountsInSelectedCategoryNew` / `colCapexSubaccountsInSelectedCategoryNew` | Collection | Tab's accounts | `rules.ts:317`; `Screen.tsx:275-276` | Covered |
| `colCapexProjectContracts` / `colCapexContractsInSelectedCategory` | Collection | Contracts | `data/costBook.ts:1013` (`book.lines`); `useCostBook.ts:54-61` | Covered (inactive rows: GAP-VAR-09) |
| `colCapexCosts` / `colCapexCostsInSelectedContracts` | Collection | Monthly cost rows | `data/costBook.ts:1130-1166` (`CostLine.payments`) | Covered (inactive rows: GAP-VAR-09) |
| `colCapexCommentsInSelectedContracts` / `colCapexCommentsLatest` | Collection | Grid red dots | `useCostBook.ts:581-588`; `comments.ts:268, 339, 568`; `Screen.tsx:294-299` | Covered |
| `colCapexContractCostGrouped_V1`, `colAllGroupedAccounts`, `colFinatCostDataOptimizedTemp`, `colFlatCostsMapped`, `colContractTotalsForPCF`, `colFinatCostDataOptimized` | Collection | The PCF dataset | `gridRows.ts:127`; `PcfGrid.tsx:58-61` | Covered |
| `colCapexSummaryCategories` / `colDevexCapexSummaryView` | Collection | Summary tab | `useCostBook.ts:365-373`; `data/costBook.ts:1270`; `Screen.tsx:691-708` | Covered |
| `colProjectPeriods` | Collection | Year dropdown | `clusters.ts:318`; `Screen.tsx:736` | Covered |
| `colStandardContractOptionsForPCF` | Collection | Standard menu options | `standardContracts.ts:108`; `Screen.tsx:372-386` | Covered |
| `colStandardCostAllSelectedClusters` / `colEligibleStandardCostClusters` | Collection | Standard cluster timeline | `clusters.ts:269`; `Screen.tsx:366-368, 396` | Covered |
| `colCapexCostDataAllPayments` / `…WithCost` / `colCapexCostDataToPatch` | Collection | Standard payments | `Screen.tsx:403-405, 417-420` | Covered |
| `colNewEditPanelCost` / `colNewEditPanelCostProcessed` | Collection | Panel month grid | `Screen.tsx:248, 454-458`; `rules.ts:228, 290` | Covered |
| `colOtherClusterHavingCost` | Collection | Clusters with cost | `rules.ts:994`; `Screen.tsx:546` | Covered |
| `colSelectedClusters`, `colCapexEditContract`, `colCapexFinalDataToPatch`, `colCapexToDelete` | Collection | Save write plan | `rules.ts:358`; `writeSet.ts` (08) | Covered |
| `colCapexComments` | Collection | Comment working copy | `CommentsPanel.tsx:225, 266-276` | Covered |
| `colDeletedComments` | Collection | Staged deletes | `CommentsPanel.tsx:226` | Covered |
| `colTempRoots` | Collection | Renumber scratch | `comments.ts:291` | Covered |
| `colContractDistributionTypes` / `Scheme`, `colCostPaidType` | Collection | Radio options | `Screen.tsx:788, 803, 888` | Covered (order: §5 item 3) |
| `colSubaccountMappedCostPaid`, `colCombinedCostAccounts`, `colAddCostFromTable` | Collection | Add-from-Table hand-off | `useCostBook.ts:434-442` | Not needed |
| `DevexCapexSummaryPCF` inputs / outputs | PCF properties | Grid data in, actions out | `PcfGrid.tsx:33-93`; `Screen.tsx:423-452, 744-747` | Covered (cluster fallback: GAP-VAR-10) |
| `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_*`, `cmp_Information_Button_PCF`, `cmp_ReportErrorRightPanel`, `fn_Numeric` | Component properties | Shell, dialogs, loader, validators | `AppHeader.tsx`, `LeftNav.tsx`, `ConfirmDialog`, `LoadingOverlay`, `rules.ts` validators | Covered (error strip: Missing, GAP-VAR-08) |
