# 01 — The "Edit Costs" module: app shell, OnStart, header, left nav, navigation and the five screens

Gap ID prefix: **GAP-MOD**. Written 27 Oct 2026 from canvas source solution 1.21.709 (`ProjectDocs/_extracted/msapp/`) and the code app at the working-tree state on branch `RounakDev1`.

Sibling files own the detail this one only points at:

| Topic | Owner |
|---|---|
| Layout and the control tree | `02-UI.md` |
| Colours and styles | `03-THEMES.md` |
| Fonts and text formatting | `04-TYPOGRAPHY.md` |
| Interaction and Tosca identities | `05-UX.md` |
| Every dialog, loader and error panel, including `cmp_ReportErrorRightPanel` | `06-POPUPS.md` |
| The CAPEX load sequence, timers, tabs and year | `07-FUNCTIONAL-SCREEN-AND-GRID.md` |
| Every variable and collection | `10-COLLECTIONS-VARIABLES.md` |
| Tables, flows and plugins | `11-DATAVERSE-TABLES.md` |

---

## 1. Scope

This document covers the Project Costs canvas app **as a module**: the shell every Cost screen shares, the start-up sequence, how the user arrives from Project Management ("Edit Costs"), how the five screens hand over to each other, and what each screen is for relative to DEVEX/CAPEX.

The canvas files below were read in full unless a range is given:

| File | Lines read |
|---|---|
| `Src/App.pa.yaml` | 1–207, all of it. `OnStart` is one escaped string on L205. |
| `Src/_EditorState.pa.yaml` | all |
| `Src/Components/cmp_Header.pa.yaml` | 1–706, all |
| `Src/Components/cmp_Left_Navigation.pa.yaml` | 1–183, all |
| `Src/Components/cmp_ReportErrorRightPanel.pa.yaml` | 1–456, all |
| `Src/Capex Costs Screen.pa.yaml` | L9–301 (`OnVisible`), L2300–2560, L2740–2820, L8020–8090 |
| `Src/Contracts Screen.pa.yaml` | L9–430, L2140–2190, L7405–7465, plus a Grep of every write |
| `Src/Opex Costs Screen.pa.yaml` | L9–148, plus a Grep for the shell and the rail |
| `Src/Land Lease Costs Screen.pa.yaml` | L9–16, plus a Grep for the shell, the rail and `gblAreaWithRegion` |
| `Src/Add Costs from Table.pa.yaml` | 1–395, all |
| `Src/Screen1.pa.yaml`, `Screen2.pa.yaml` | Grep only. Neither is referenced by any `Navigate`. |
| `projectmanagement/Src/Project Main Screen.pa.yaml` | L300–549 (command `Items`), L552 (`OnSelect`, the `editCosts` branch), L2325–2671 (the lock pop-up) |
| `projectmanagement/Src/App.pa.yaml` | L670–679 and L784–789 (`gblCostAppLaunchUrl`) |

Screenshots checked:

- `Cost App Landing Screen - Devex Capex Screen.png`
- `Cost App - Left Panel.png`
- `Cost App - Top Bar - Everywhere same in Cost App.png`

The code app files below were read in full unless a range is given (all under `ProjectCosts-CodeApp/src/`):

| Area | Files |
|---|---|
| Routing and session | `app/routes.tsx`, `app/navigation.ts`, `app/deepLinks.ts`, `app/SessionContext.tsx`, `app/CostNavigation.test.tsx`, `app/adminAccess.ts` |
| Bootstrap | `App.tsx`, `domain/session.ts`, `platform/powerClient.ts` L55–152, `data/project.ts` L1–176 |
| Shell components | `components/AppHeader.tsx`, `components/headerRules.ts`, `components/LeftNav.tsx`, `components/AppShell.tsx` |
| Report panel | `features/shared/report-problem/ReportProblemPanel.tsx` L1–139 |
| The five screens, high level | `features/cost/{capex-costs,contracts,opex-costs,land-lease,add-costs-from-table}/Screen.tsx` (headers and the navigation and year code) |
| Project Overview's Edit Costs | `features/pm/project-main/Screen.tsx` L10–39 and L420–590, `rules.ts` L430–460 |

Test names and ids were read from these files: `navigation.test.ts`, `deepLinks.test.ts`, `AppHeader.test.tsx`, `session.test.ts`, `ScreenRoutes.test.tsx`, and the `project-main` tests.

---

## 2. Canvas implementation

### 2.1 The `App` object

| Property | Value | Cite | Meaning |
|---|---|---|---|
| `ConfirmExit` | `=true` | `App.pa.yaml:L11` | The player always asks before the browser tab closes or navigates away, whether or not anything is unsaved. |
| `StartScreen` | `='Capex Costs Screen'` | `App.pa.yaml:L206` | DEVEX/CAPEX is the landing screen. There is no project list in the Cost app. |
| `Theme` | `=PowerAppsTheme` | `App.pa.yaml:L207` | The default modern theme. Real colours come from `AppTheme` (see `03-THEMES.md`). |
| Screen order | Capex, Opex, Contracts, Land Lease, Screen1, Add Costs from Table, Screen2 | `_EditorState.pa.yaml:L10-17` | `Screen1` and `Screen2` are scaffolding. No formula navigates to them (Grep: their names occur only in their own files and in `_EditorState`). |

#### 2.1.1 Named formulas (`App.Formulas`, `App.pa.yaml:L12-187`)

| Name | Lines | Value | Used by (Grep counts) |
|---|---|---|---|
| `AppTheme` | L13–58 | the palette record (`themePrimary: "#006eb9"`, …, `Error: "#B22727"`, `Warning: "#EE940C"`) | Copied into `gblAppTheme` by `OnStart`. Details in `03-THEMES.md`. |
| `EmptyGUID` | L59 | `GUID("00000000-0000-0000-0000-000000000000")` | Contracts (6 uses) |
| `varCurrentUserProfile` | L60–73 | `RenameColumns(LookUp(Users, ThisRecord.'Azure AD Object ID' = User().EntraObjectId), 'Azure AD Object ID', Id, 'Full Name', DisplayName, 'Primary Email', Mail, 'Job Title', CompanyName)` | `OnStart` only |
| `Developers` | L74–85 | a hard-coded list of 10 e-mail addresses | **No live consumer.** Its only reference is inside the commented-out `LeftNavigationMenu` rows at L142–157 (commented-out, not live). |
| `LeftNavigationMenu` | L86–159 | the rail table, see §2.6.1 | `OnStart`, and every screen's rail instance |
| `DefaultProjectCostsMarginValue` | L160 | `10` | **No consumer outside `App`.** |
| `colDistributionFrequency` | L161–187 | five rows: 1, 2, 3, 6 and 12 months, labels `"1 month"` … `"12 months"` | Capex (2), Opex (3), Land Lease (3) |

#### 2.1.2 `App.OnError` (`App.pa.yaml:L188-204`)

```powerfx
Set(
    gblReportError,
    {
        User: User().Email,
        ErrorScreen: App.ActiveScreen.Name,
        ErrorSource: FirstError.Source,
        ErrorMessage: FirstError.Message,
        Timestamp: Now()
    }
);
```

Every *unhandled* error on any screen is stored in `gblReportError`. The default banner is suppressed. The `Notify("An error has occurred! …")` that follows is commented-out, not live (L199–204).

The stored error drives two things:

- the header's warning icon (§2.5);
- the Report Error panel's pre-filled text (§2.7).

#### 2.1.3 `App.OnStart` (`App.pa.yaml:L205`) — the full sequence, in order

`OnStart` is one escaped string. The steps run sequentially, except for the final `Concurrent`. `StartScreen` is reached only when they finish (inferred from default canvas behaviour: `OnStart` blocks before the first `OnVisible`).

| # | Statement (verbatim, condensed) | Purpose |
|---|---|---|
| 1 | `Set(gblAppStarted, false)` | Hides `con_Costs_Body` and `con_Costs_Footer` until the end (`Capex Costs Screen.pa.yaml:L2356`, `L8037`). |
| 2 | `Set(gblInfoCenterLaunchUrl, LookUp('Environment Variable Values', 'Environment Variable Definition'.'Schema Name' = "vsb_VSBCloudInfoCenterUrl").Value)` | Help → "VSB Cloud InfoCenter" |
| 3 | `Set(gblProjectApprovalServiceGroupID, … "vsb_VSBcloudControllingApprovalGroup" …)` | Only feeds step 17. |
| 4 | `Set(gblTenantID, … "vsb_TenantID" …)` | Builds `gblPMAppURL`. |
| 5 | `Set(gblEnvironmentID, … "vsb_EnvironmentID" …)` | Builds `gblPMAppURL`. |
| 6 | `Set(gblProjectManagementAppID, … "vsb_ProjectManagementAppID" …)` | Builds `gblPMAppURL`. |
| 7 | `Set(gblPMAppURL, "https://apps.powerapps.com/play/e/" & gblEnvironmentID & "/a/" & gblProjectManagementAppID & "?tenantId=" & gblTenantID)` | The header logo's target (§2.5) |
| 8 | `Set(gblLeftNavigationSelected, First(LeftNavigationMenu))` | The rail selection starts on DEVEX/CAPEX. |
| 9 | `Set(gblAppTheme, AppTheme); Set(gblAppThemeJson, JSON(gblAppTheme, JSONFormat.Compact))` | The theme for classic controls and for PCF `Theme` inputs |
| 10 | `Set(gblCurrentUser, varCurrentUserProfile)` | A provisional user, replaced at step 16. |
| 11 | `Collect(colProjectApprovals, Blank()); Collect(colProjectApprovalsExtended, Blank()); Collect(colProjectCountryApprovals, Blank()); Collect(colDistinctCurrentUserTeamsRoles, Blank())` | Schema priming only |
| 12 | `ClearCollect(colCurrentUserTeamsDirect, LookUp(Users, …).'Teams (teammembership_association)')`; `ClearCollect(colCurrentUserSystemsDirect, LookUp(Users, …).'Security Roles (systemuserroles_association)')`; `Trace(…)` | The user's teams and direct roles |
| 13 | `IfError(…)` block: builds `colCurrentUserRoles` (direct roles, each with `Country: LookUp(Countries_1, 'Business Unit'.'Business Unit' = UR.'Business Unit'.'Business Unit')`) and walks the teams with `colCurrentUserTeamsDirectTemp`. It then builds `colAllCurrentUserRoles = Filter(…, StartsWith(Name, "VSB"))` for both sources, and `colDistinctCurrentUserTeamsRoles = ForAll(Distinct(colAllCurrentUserRoles, ThisRecord), Value)`. The error branch is `Trace(…, TraceSeverity.Critical)`. | The effective VSB roles. A failure is traced, never shown. |
| 14 | `IfError(ClearCollect(colUserCountries, ForAll(Filter(colDistinctCurrentUserTeamsRoles, And(Not(IsBlank(Country)), Name in ["VSB - Project Manager Own Projects", "VSB - Project Data Own Country"])), {id: Country.Country, name: Country.Name})), Trace(…))` | The editable countries. **No de-duplication.** |
| 15 | (inside 13/14) `Trace` statements | Diagnostics |
| 16 | `Set(gblCurrentUser, {Id, DisplayName, Mail, CompanyName: LookUp('Microsoft Entra IDs', 'A unique identifer for Microsoft Entra ID' = varCurrentUserProfile.Id).'Company Name', Language: Language(), Lang: Lower(First(Split(Language(), "-")).Value), IsControlling: false, IsControllerOwnData: …"VSB - Controller Own Data"…, IsProjectDataAllCountries: …"VSB - Project Data All Countries"…, CanEditSelectedProject: false, EditableCounties: colUserCountries, EditableCountiesAsString: Concat(colUserCountries, name & " ; ")})` | The user record. `IsControlling` and `CanEditSelectedProject` are constants that nothing ever changes. |
| 17 | `IfError(ClearCollect(colProjectApprovals, Office365Groups.ListGroupMembers(gblProjectApprovalServiceGroupID, {'$top': 100}).value), Trace(…))` | **Dead in the Cost app.** `colProjectApprovals` has no consumer outside `App` (Grep). |
| 18 | `Set(gblAppSizes, {…})`, `Set(gblLeftNavigationMenuIsExpanded, true)`, `Set(gblAppConstants, {NotifyTimeOut: 500, Form: {New, Edit, Display}})`, `Set(gblAppStyles, {…})`, `Set(gblAppColors, {…})` | The layout and style records (`03-THEMES.md`). `gblAppSizes.LeftNavigation = {ExpandedWidth: 200, DecreasedWidth: 32}`. |
| 19 | the project load: see the formula after this table | **Launch parameter and test fallback** (bug **A-2**) |
| 20 | `Set(gblProjectHeaderData, {ID: gblSelectedProject.Project, Name: gblSelectedProject.'Project Name', Technology: Text(gblSelectedProject.Technology), Approval: Text(gblSelectedProject.'Approval States')})` | The header's `Project` input, set **once** |
| 21 | `Set(gblRecordSelectedProjectCountry, LookUp(Countries_1, Country = gblSelectedProject.Country.Country))` | Country (currency, name) |
| 22 | the `gblSelectedProjectYear` seed: see §2.4 | The CAPEX year (D50, CA-6) |
| 23 | `Set(gblSelectedProjectCODYear, With({varProjectCODYear: Year(gblSelectedProject.'Operations start date (COD)')}, varProjectCODYear))` | **No consumer** (Grep: `App` only). |
| 24 | `ClearCollect(colOpexAccounts, Sort('Opex Accounts', Order, SortOrder.Ascending))`; `ClearCollect(colOpexSubaccounts, AddColumns(Sort('Opex Subaccounts', …), IsFolded, true))`; `ClearCollect(colLandLeaseSubaccounts, Sort('Land Lease Subaccounts', …))` | OPEX and Land Lease master data |
| 25 | `Set(gblAppVersion, … "vsb_AppVersion" …)`; `Set(gblEnvironmentName, … "vsb_EnvironmentName" …)` | Version labels and environment styling (§2.5, §2.9) |
| 26 | `ClearCollect(colCapexAccountCategoriesNew, {'CAPEX Account List': Blank(), Name: "DEVEX/CAPEX Summary", Order: 0})`, then `Collect(… SortByColumns(Filter('CAPEX Account Lists', And(Not(IsBlank('Parent Account')), 'Parent Account'.Number = "00001")), "vsb_order", SortOrder.Ascending))` | The CAPEX tab strip: a synthetic Summary row, then the level-1 categories |
| 27 | `ClearCollect(colCapexAccountsNew, …)` and `ClearCollect(colCapexSubaccountsNew, …)`, each `Status = 'Status (CAPEX Account Lists)'.Active` | The CAPEX account tree |
| 28 | `ClearCollect(colCapexProjectContracts, Filter('CAPEX Project Contracts', Project.Project = gblSelectedProject.Project))` | The project's CAPEX contracts |
| 29 | `ClearCollect(colCapexCosts, Defaults('CAPEX Costs'))`, then `Collect(colCapexCosts, Ungroup(ShowColumns(AddColumns(colCapexProjectContracts As Item, Value, ShowColumns(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = Item.'CAPEX Project Contract'), Year, Name, Month, Cost, Contract, 'CAPEX Cost', 'Cost Paid')), Value), Value))` | Every CAPEX cost row, with **one query per contract** (see `12-NETWORK-CALLS.md`) |
| 30 | `ClearCollect(colContractDistributionTypes, Choices('Distribution Type'))`; `ClearCollect(colContractDistributionScheme, Choices('Distribution Scheme'))`; `ClearCollect(colCostPaidType, LastN(Choices('Cost paid type'), 2))` | Option sets for the CAPEX panel |
| 31 | `ClearCollect(colCapexSummaryCategories, …)`; `ClearCollect(colDevexCapexSummaryView, ForAll(…{Id, Name, Sum: Max(Sum(…, Cost), 0), ParentId}))` | The Summary-tab totals |
| 32 | `Concurrent(Set(gblTableApprovalStateColors, Table({State: "Draft", Color: akzent2}, {"Approving", akzent4}, {"Approved", akzent3}, {"Rejected", akzent5})), Set(gblAppResx, {…}), Set(gblClusterDurations, Table(…6 clusters from the milestone dates…)), If(gblSelectedProject.Country.Name = "Italy", Set(gblAreaWithRegion, Switch(Trim(Coalesce(…'Area/State/Province'.Name, "")), "Lazio", "Italy_Centre - South", …, Blank()))))` | Header colours, Contracts' numeric messages, the CAPEX cluster timeline, and the Italy OPEX and Land Lease zone |
| 33 | `Set(gblAppStarted, true)` | Shows the body and footer. |

Step 19 is the project load:

```powerfx
If(
    Not(IsBlank(Param("projectId"))),
    Set(gblSelectedProject, LookUp(Projects, Project = GUID(Param("projectId")))),
    //Set(gblSelectedProject, Blank())
    Set(gblSelectedProject, LookUp(Projects, Project = GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")
        //'Project ID' = "9999940"
    ))// for testing
);
```

The project lookup has no `statecode` or `Status` condition. An inactive project still loads.

#### 2.1.4 Globals by concern

Per the assignment, the globals are grouped by what they hold. Usage counts come from a Grep across `Src/*.pa.yaml`.

| Concern | Globals | Notes |
|---|---|---|
| User | `gblCurrentUser`, `colUserCountries`, `colCurrentUser*`, `colAllCurrentUser*`, `colDistinctCurrentUserTeamsRoles` | Only `cmp_Header` reads `gblCurrentUser` (8 uses), plus Contracts (`.Language`/`.Lang`, `Contracts Screen.pa.yaml:L2546, L2582, L7402`). No screen gates anything on a role. |
| Project | `gblSelectedProject`, `gblProjectHeaderData`, `gblRecordSelectedProjectCountry`, `gblClusterDurations`, `gblSelectedProjectYear`, `gblSelectedProjectCODYear`, `gblAreaWithRegion` | `gblSelectedProject` is re-read from `Param("projectId")` on every visit to the Capex screen (`Capex Costs Screen.pa.yaml:L40-56`), with the same test fallback. |
| Permissions | none global | The Cost screens call `DataSourceInfo`/`RecordInfo` locally (Capex L3161–3206 on `'CAPEX Costs'`, Contracts 10, Opex 10, Land Lease 8 occurrences). See `07` and `08`. |
| Draft / lock state | **none** | The Cost app has no Draft or approval lock. The only "Draft" gate is in Project Management's Edit Costs command (§2.10). `gblProjectHeaderData.Approval` is display-only: it colours and labels the header bar. |
| Environment | `gblEnvironmentName`, `gblAppVersion`, `gblTenantID`, `gblEnvironmentID`, `gblProjectManagementAppID`, `gblPMAppURL`, `gblInfoCenterLaunchUrl`, `gblProjectApprovalServiceGroupID` | Only the header uses `gblEnvironmentName` (16 uses). |
| Navigation | `gblLeftNavigationSelected`, `gblLeftNavigationMenuIsExpanded` | §2.6 |
| Error | `gblReportError`, `gblShowReportProblemPanel` | §2.7 |
| Style | `gblAppTheme`, `gblAppThemeJson`, `gblAppStyles`, `gblAppColors`, `gblAppSizes`, `gblAppConstants`, `gblTableApprovalStateColors`, `gblAppResx` | `03-THEMES.md` |

### 2.2 Launch parameters

- The **only** parameter the Cost app reads is `Param("projectId")`, with a capital I. It is read in two places:
  - `App.OnStart` step 19;
  - `Capex Costs Screen.OnVisible` (`Capex Costs Screen.pa.yaml:L40-56`, a second copy of the same `If`, test fallback included).
- No other `Param(...)` exists in `projectcosts/Src` (Grep: only those two files).
- There is **no screen parameter.** The canvas Cost app always starts on `'Capex Costs Screen'`; no deep link can open Contracts, OPEX or Land Lease.

### 2.3 The Capex screen re-reads the project on every visit

`Capex Costs Screen.OnVisible` starts by resetting about 20 `loc*` flags (L15–38). It then re-runs the `Param("projectId")` lookup (L40–56) on **every** visit: returning from Contracts, OPEX, Land Lease or Add Costs from Table refetches the project row.

`gblProjectHeaderData` is **not** recomputed, so the header keeps the `OnStart` name and approval state. The rest of `OnVisible` is described in `07-FUNCTIONAL-SCREEN-AND-GRID.md`: it computes the start cluster, the allowed start year, the navigation window, `colProjectPeriods`, the year clamp and the category, then gates the PCF build.

### 2.4 The `gblSelectedProjectYear` seed (D50, CA-6)

`App.pa.yaml:L205`, `OnStart` step 22:

```powerfx
/*Set(gblSelectedProjectYear, Max(Year(gblSelectedProject.'Project Start Date'), Year(Now())));*/
Set(
    gblSelectedProjectYear,
    Year(
        If(
            gblSelectedProject.'Start Cluster' <> 'Cluster States'.Greenfield,
            If(Year(gblSelectedProject.'Acquisition date') > Year(Today()), gblSelectedProject.'Acquisition date', Today()),
            If(Year(gblSelectedProject.'Project Start Date') > Year(Today()), gblSelectedProject.'Project Start Date', Today())
        )
    )
);
```

The first `Set` is commented-out, not live. The live seed works like this:

- A project whose start cluster is past Greenfield opens on the **acquisition year**, if that year is in the future.
- Any other project opens on its **start year**, if that year is in the future.
- Otherwise the project opens on **this year**.

The seed is unconditioned on `Coalesce`. A project with a **blank** `'Start Cluster'` gives `Blank() <> Greenfield`, which Power Fx evaluates as true, so it takes the acquisition-date branch (inferred from Power Fx blank-comparison semantics). The Capex screen's own `locProjectStartClusterNo` does `Coalesce('Start Cluster', Greenfield)` (`Capex Costs Screen.pa.yaml:L60-64`), so the two formulas disagree for a blank start cluster.

The Capex screen then clamps the year on **every** visit:

```powerfx
With({varDefaultYear: Coalesce(gblSelectedProjectYear, locCostAllowedStartYear, locNavigationMinYear, Year(Today()))},
    Set(gblSelectedProjectYear, Min(Max(varDefaultYear, locNavigationMinYear), locNavigationMaxYear)))
```

(`Capex Costs Screen.pa.yaml:L238-257`.) `gblSelectedProjectYear` is used only by `App` (2 uses) and the Capex screen (181 uses). Because it is a global, **the user's chosen year survives** a trip to another screen and back. It is only re-clamped.

### 2.5 `cmp_Header` (`Components/cmp_Header.pa.yaml`)

**Custom properties** (L13–71):

| Property | Kind | Default |
|---|---|---|
| `ApprovalStatesColor` | Table | Draft `#41aab4`, Approving `#f5911e`, Approved `#82a51e`, Rejected `#d20532` |
| `LogoWidth` | Number | 210 |
| `MainScreen` | Screen | `App.ActiveScreen` |
| `OnLogoClick` | Event | `true` |
| `Project` | Record | `{ID, Name: "Project name", Technology: "Wind", Approval: "None"}` |

**The instance on each Cost screen** is the same on all four screens that have a header: Capex L2323–2337, Contracts L322–336, Opex L146–158 and Land Lease L36–48. Add Costs from Table has no header. Each instance sets:

- `ApprovalStatesColor: =gblTableApprovalStateColors`
- `Height: =70`
- `LogoWidth: =210`
- `Project: =gblProjectHeaderData`

and this `OnLogoClick`:

```powerfx
//Navigate('Capex Costs Screen',ScreenTransition.Fade);
Launch(gblPMAppURL)
```

The first line is commented-out, not live. The live `Launch` has no target, so it opens the Project Management app's play URL in a **new tab**, with no project parameter (inferred: `Launch` defaults to `LaunchTarget.New`).

**Every control, with its live `OnSelect`, `Visible` and `DisplayMode`:**

| Control | Lines | Live `OnSelect` / `Items` | `Visible` | `DisplayMode` | Notes |
|---|---|---|---|---|---|
| `con_cmp_Header` | L76–100 | — | always | — | `Fill` is `Switch(gblEnvironmentName, "Hotfix", ColorValue("#9831A850"), "Nightly", ColorValue("#AAAAAA60"), "Budgeting", ColorValue("#85AD3760"), "QA", ColorValue("#E66C3780"), RGBA(255,255,255,1))`: the whole band is tinted per environment. |
| `img_cmp_Header_Logo` | L139–149 | — | always | — | `Image: ='vsb-logo'`, `Tooltip: ="VSB Cloud"` |
| `img_cmp_Header_Logo_Button` | L150–169 | `=cmp_Header.OnLogoClick();` | always | default | A transparent button over the logo. It is the only clickable logo, and on the Cost screens it calls `Launch(gblPMAppURL)`. |
| `con_cmp_Header_Logo_Title` | L170–191 | — | `true` (the `If(gblEnvironmentName = "Prod", …)` is commented-out, not live) | — | |
| `con_cmp_Header_Version` | L193–209 | — | `gblEnvironmentName = "Prod" \|\| gblEnvironmentName = "Dev"` (the `If` above it is commented-out, not live) | — | `Text: ="Version " & gblAppVersion & If(gblEnvironmentName="Dev"," (" & gblEnvironmentName & ")","")`. It sits under "Cloud". |
| `ico_cmp_Header_Info` | L210–219 | — | `=//true`, so the formula body is only a comment and is empty (see §5) | — | `Color: =Switch(gblEnvironmentName, "Dev", gblAppStyles.Error, "Nightly", gblAppStyles.Warning, "QA", gblAppStyles.Success, Color.Transparent)`. There is **no Hotfix branch.** |
| `con_cmp_Header_Title` | L220–230 | — | always | — | `Text: ="Cloud"` |
| `rec_cmp_Header_Project_State` | L251–323 | — | always | — | 4 px wide. `Fill`, `HoverFill`, `PressedFill` and `DisabledFill` are all `LookUp(cmp_Header.ApprovalStatesColor, State = cmp_Header.Project.Approval).Color`, or `#ffffff` when there is no match. `Tooltip: =cmp_Header.Project.Approval`, which is blank when the project has no approval state. |
| `con_cmp_Header_HeaderText` | L324–332 | — | always | — | `Text: =cmp_Header.Project.Name`, Size 20, Semibold |
| `but_Main_Project_Overview_Header_Redirect_4` | L395–404 | `=` (empty) | `false` | — | A dead control |
| `ico_cmp_Header_Info_4` | L405–431 | — | `false` (the `If` is commented-out, not live) | — | Its colour `Switch` **does** have `"Hotfix", gblAppColors.Error`, but the icon never shows. |
| `con_cmp_Header_Title_4` | L432–461 | — | always | — | `Text: =Switch(gblEnvironmentName, "Hotfix", "Hotfix", "Nightly", "Nightly", "Budgeting", "Budgeting", "QA", "Quality Assurance")`. Blank for Dev, Prod and anything else. It is right-aligned in the service area, left of Help. |
| `con_cmp_Header_Version_4` | L462–490 | — | `If(gblEnvironmentName = "Prod" \|\| gblEnvironmentName = "Dev", false, true)` | — | `Text: ="Version " & gblAppVersion`. The `& " (" & …` is commented-out, not live. It shows for every environment **other than** Prod and Dev, including a blank one, under the environment title. |
| `pcf_HeaderContainerReportError_WarningIcon` | L491–506 | none (an icon) | `=!IsBlank(gblReportError)` | — | `cat_PowerCAT.Icon` "Warning", red. `Tooltip` is "An error has occurred!" followed by the "If you encounter any issues, please report them via Help --> Report problem. …" text, verbatim at L500–504. |
| `pcf_HeaderContainerReportError_CommandBar` | L507–549 | see the formula after this table | always | — | `cat_PowerCAT.CommandBar`. `Items`: `help` "Help" (its `ItemIconName` is commented-out), with the children `raiseBug` "Report Problem" (icon `bug`) and `goToInfoCenter` "VSB Cloud InfoCenter" (icon `Info`). |
| `lbl_cmp_In_Header_UserName` | L586–604 | — | always | `View` | `Text: ="Hi " & User().FullName` |
| `pcf_cmpHeader_User_ContextMenu_Info` | L605–667 | no `OnSelect` (rows are informational) | always | — | `AccessibilityLabel: ="User information"`, `Tooltip: ="User"`. `Items`, in order: `$"Hi {User().FullName}"`; `gblCurrentUser.Mail` (icon Mail, `ItemVisible: Not(IsBlank(...))`); `$"{gblCurrentUser.Language}, [{gblCurrentUser.Lang}]"` (LocaleLanguage); `gblCurrentUser.CompanyName` (Home, under `ItemKey` "countries"); `Concat(gblCurrentUser.EditableCounties, $"{name}; ")` (AddHome, under `ItemKey` "company"); "Project Data All Countries" (World, `ItemVisible: gblCurrentUser.IsProjectDataAllCountries`); `$"version {gblAppVersion} ({gblEnvironmentName})"` (Info). There is **no "Application Settings" row** in the Cost app. |
| `img_cmp_In_Header_UserImage` | L693–706 | — | always | — | `Image: =User().Image`, `Tooltip: =User().FullName` |

The command bar's `OnSelect` (L532–548):

```powerfx
Switch(Self.Selected.ItemKey,
    "raiseBug", Set(gblShowReportProblemPanel, true),
    "goToInfoCenter", Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace),
    /* Default action */ false)
```

Selecting "VSB Cloud InfoCenter" **replaces** the app in the current tab.

### 2.6 `cmp_Left_Navigation` (`Components/cmp_Left_Navigation.pa.yaml`)

**Custom properties** (L13–86):

| Property | Kind | Default / value |
|---|---|---|
| `FontSize` | Number | 100 |
| `IsExpanded` | Boolean | `true` |
| `Items` | Table | three placeholder items |
| `OnExpand` | Event | — |
| `OnSelect` | Event | — |
| `Selected` | Record | — |
| `SelectedKey` | Output | `=pcf_Left_Navigation_Menu.SelectedKey` (L88) |

`Width` is 200 (L89).

**Children:**

- `con_Left_Navigation_Header` (L102–149), 45 high, holds:
  - `rec_Left_Navigation_Expanded_Delimiter`, a 2 px line;
  - `lbl_Left_Navigation_Expand` (`Visible: =false`);
  - `icon_Left_Navigation_Expand` (L134–149), with `Icon: =Icon.Hamburger`, `OnSelect: =cmp_Left_Navigation.OnExpand()`, and the verbatim tooltip `Tooltip: =$"{If(cmp_Left_Navigation.IsExpanded, "Decrease", "Expand")} left naviagtion panel"`. "naviagtion" is the canvas spelling.
- `pcf_Left_Navigation_Menu` (L150–183), a `cat_PowerCAT.Nav` with:
  - `AccessibilityLabel: ="Left navigation"`
  - `Tooltip: ="Left navigation"`
  - `SelectedKey: =cmp_Left_Navigation.Selected.ItemKey`
  - `OnChange: =cmp_Left_Navigation.OnSelect();`
  - `OnSelect: =` (empty)
  - `Theme: =gblAppThemeJson`

  Its `Items` formula:

  ```powerfx
  With({varItems: If(Not(cmp_Left_Navigation.IsExpanded),
          ForAll(cmp_Left_Navigation.Items, {ItemKey: ThisRecord.ItemKey, ItemDisplayName: "", ItemIconName: ThisRecord.ItemIconName,
                                             ItemEnabled: ThisRecord.ItemEnabled, TargetScreen: ThisRecord.TargetScreen}),
          cmp_Left_Navigation.Items)}, varItems)
  ```

  **When the rail is collapsed, the items lose their labels *and* their `ItemParentKey` (and `ItemVisible`).** The collapsed rail is therefore a flat list of icons: every OPEX child moves to the root, and the OPEX header becomes an icon-less row.

#### 2.6.1 The rail items — `LeftNavigationMenu` (`App.pa.yaml:L86-159`)

| `ItemKey` | `ItemDisplayName` (verbatim) | Icon | Parent | Enabled | Visible | `TargetScreen` |
|---|---|---|---|---|---|---|
| `DevexCapexCostsKey` | `" DEVEX/CAPEX"` (a **leading space**) | ReadingModeSolid | — | true | (default) | `'Capex Costs Screen'` |
| `OpexCostsKey` | `"OPEX"` | PageEdit | — | true | (default) | **none.** `// ,TargetScreen: 'Opex - Operation & Maintenance'` is commented-out, not live. |
| `O&MKey` | `"Operation & Maintenance"` | PageEdit | OpexCostsKey | true | (default) | `'Opex Costs Screen'` |
| `LandLeaseKey` | `"Land Lease"` | PageEdit | OpexCostsKey | true | true | `'Land Lease Costs Screen'` |
| `OtherOpexCostsKey` | `"Other OPEX Costs"` | PageEdit | OpexCostsKey | true | (default) | `'Opex Costs Screen'` |
| `ContractsKey` | `"Contracts"` | TextDocumentShared | — | true | true | `'Contracts Screen'` |
| `TotalCostsSummary` | `"Total Summary"` | AllCurrency | — | **false** | **false** | none |

L142–157 is a commented-out, not live, older list: an OPEX entry and a `LandLeaseCostsgKey` gated on `gblCurrentUser.Mail in Developers`.

#### 2.6.2 The instance on each screen

The instance is identical on all four rail screens:

| Screen | Container | Component |
|---|---|---|
| Capex | `con_Costs_LeftNavigationMenu` L2359–2370 | `cmp_Costs_Left_Navigation` L2372–2401 |
| Contracts | — | L357–399 |
| Opex | — | L196–222 |
| Land Lease | — | L86–112 |

The container is `Width: =If(gblLeftNavigationMenuIsExpanded, gblAppSizes.LeftNavigation.ExpandedWidth, gblAppSizes.LeftNavigation.DecreasedWidth)` (200 or 32), with `LayoutMinWidth: =200` and `FillPortions: =0`.

The component instance sets:

- `IsExpanded: =gblLeftNavigationMenuIsExpanded`
- `Items: =LeftNavigationMenu`
- `Selected: =gblLeftNavigationSelected`
- `OnExpand: =Set(gblLeftNavigationMenuIsExpanded, Not(gblLeftNavigationMenuIsExpanded));`
- this `OnSelect`:

```powerfx
If(
    Self.SelectedKey <> gblLeftNavigationSelected.ItemKey,
    Set(gblLeftNavigationSelected, LookUp(LeftNavigationMenu, ItemKey = Self.SelectedKey));
    Navigate(gblLeftNavigationSelected.TargetScreen, ScreenTransition.Fade)
);
```

So **the rail navigates between real screens** with `Navigate(...)`. Clicking the item that is already selected does nothing. Clicking "OPEX" sets `gblLeftNavigationSelected` to a record whose `TargetScreen` is blank, then calls `Navigate(Blank(), …)`; what the player does with that is unknown (see §5). Because `gblLeftNavigationMenuIsExpanded` is a global, the collapsed state survives screen changes.

### 2.7 `cmp_ReportErrorRightPanel` (summary only; `06-POPUPS.md` owns the detail)

There is one instance per screen, for example `cmp_ReportErrorRightPanel_CapexCosts` with `Visible: =gblShowReportProblemPanel` (`Capex Costs Screen.pa.yaml:L8081-8087`). The other instances are Contracts L7728, Opex L5375 and Land Lease L6186.

- **Layout.** A 70 % black scrim and a right panel 560 px wide, titled "Report Error" (L72).
- **Title field.** Pre-filled with `"Handled Error from the '" & gblReportError.ErrorScreen & "' screen and the '" & gblReportError.ErrorSource & "' control."` (L150).
- **Description.** A rich-text editor pre-filled with the user, timestamp, screen, source control and message (L264–278).
- **Cancel** closes the panel (L353–354).
- **Save** is enabled when both fields are filled. Its whole `ReportDevOpsBug.Run(...)` call is commented-out, not live. The live code is `Set(gblReportError,Blank()); Set(gblShowReportProblemPanel, false);` (L400–420), so Save files nothing (bug **B-1**).
- **"Clear Warning"** (L428–456) has `Visible: =!IsBlank(gblReportError)` and `OnChange: =Set(gblReportError, Blank())`.

### 2.8 Navigation graph — every `Navigate` / `Launch` in the Cost app

| From | Control / property | Call | Cite |
|---|---|---|---|
| any rail screen | `cmp_*_Left_Navigation.OnSelect` | `Navigate(gblLeftNavigationSelected.TargetScreen, ScreenTransition.Fade)` | Capex L2395–2398, Contracts L393–396, Opex L217–220, Land Lease L107–110 |
| any rail screen | `cmp_*_Header.OnLogoClick` | `Launch(gblPMAppURL)`, a new tab with PM | Capex L2333–2335, Contracts L332–334, Opex L156–158, Land Lease L46–48 |
| any rail screen | the header command bar, `goToInfoCenter` | `Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace)` | `cmp_Header.pa.yaml:L541-545` |
| Capex | `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.OnSelect` | `Navigate('Add Costs from Table', ScreenTransition.None, {lclCopyTable: true, locSaveData: true, lcladdrow: true, locVisibleSubAccountsError: false, locShowErrorsInList: false, locTimerEnd: false, locTimerStart: false, locPCFJsonInput: varPCFInputData, locSpinnerInformationText: "", locIsVisiblePopUpSpinner: false, lcltglShowCostEnabled: true, locProjectStartingYear: Text(locCostAllowedStartYear), locEndingYear: Text(Coalesce(Value(Text(gblSelectedProject.'Operations start date (COD)', "yyyy")) + 3, 2050)), locSelectedTglTab: tab_Costs_ContentAssignableAccountCategories.Selected})` | Capex L2777–2809. The button is `Visible: =true`; its `//…Selected.Name="Development Expenses"` is commented-out, not live (L2811–2814). |
| Add Costs from Table | `ico_PopUpConfirmation_BodyHeader_2.OnSelect` (the X) | `Navigate('Capex Costs Screen',ScreenTransition.None,{ locSelectedAccountCategory:locSelectedTglTab})` | Add Costs from Table L108–111 |
| Add Costs from Table | `pcf_Spreadsheet_Costs_ProjectCosts_BodyButtons_Cancel.OnChange` | the same `Navigate` | L320–327 |
| Add Costs from Table | `tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd`, success path | `Navigate('Capex Costs Screen', ScreenTransition.None, {locSelectedAccountCategory: locSelectedTglTab, locIsVisibleLoadingCostSpinner: true, locIsVisiblePopUpSpinner: false, locSpinnerInformationText: ""})` | L30 (the save path is in `08`/`11`) |

**`locSelectedAccountCategory` is not the variable the Capex tab strip uses.** That variable is `locSelectedCapexAccountCategory`, the tab's `Default` (L2435). `locSelectedAccountCategory` is read only at Capex L6298 and L6330, two margin `Visible` formulas. The tab survives the round trip because `locSelectedCapexAccountCategory` is a Capex context variable, which persists while Add Costs from Table is open, and `OnVisible` keeps it (`Coalesce(If(!IsBlank(locSelectedCapexAccountCategory.'CAPEX Account List'), locSelectedCapexAccountCategory), …)`, L259–276). This is inferred from canvas context-variable lifetime.

### 2.9 What state survives a screen change (canvas)

| State | Survives? | Why / cite |
|---|---|---|
| The project (`gblSelectedProject`), header data, country, cluster durations | Yes | Globals. Capex refetches `gblSelectedProject` on each visit (L40–56). |
| Rail selection and expanded state | Yes | `gblLeftNavigationSelected`, `gblLeftNavigationMenuIsExpanded` |
| CAPEX selected year | **Yes**, re-clamped | `gblSelectedProjectYear` (L238–257) |
| CAPEX selected category tab | **Yes** | `locSelectedCapexAccountCategory` is kept by `OnVisible` (L259–276) and fed to the tab `Default` (L2435) after `Reset(tab_…)` (L284). The first visit picks the first real category, not Summary (see `07`, and D-7 for the timer path that picks Summary). |
| CAPEX toolbar toggles (show inactive, fiscal year, planned/paid, payer filter) | Yes (inferred) | Classic and modern controls keep their value across `Navigate`, and `OnVisible` resets only the tab (L284). |
| CAPEX panels, pop-ups and the selected row | No | `OnVisible` resets every `locIsVisible…` flag and `locSelectedAccount`/`locSelectedCostRow` (L15–38, L277–278). |
| CAPEX collections `colCapexProjectContracts` / `colCapexCosts` | Yes; Add Costs from Table rewrites them | Loaded by `OnStart` steps 28–29, refreshed by the Capex refresh subroutine and by the Add Costs from Table save (L30). |
| OPEX selected account | No; re-derived | `Opex Costs Screen.pa.yaml:L17-22`: `If(gblLeftNavigationSelected.ItemDisplayName = "Operation & Maintenance", First(colOpexAccounts), … = "Other OPEX Costs", Last(colOpexAccounts))` |
| Contracts collections | No | `OnHidden: =Clear(colBoPContracts);` (L15–16). `OnVisible` reloads everything (L17–300). |
| Land Lease collections | No; reloaded | `OnVisible` (L14) |
| Report-error capture | Yes | `gblReportError` |

### 2.10 Footer version label

| Screen | Control | `Text` | Cite |
|---|---|---|---|
| **Capex** | `lbl_Costs_FooterVersion` | `=""`, **blank** | `Capex Costs Screen.pa.yaml:L8053-8080` (Text L8076). The footer has `Visible: =gblAppStarted` (L8037). |
| Contracts | `lbl_Contracts_FooterVersion` | `="Version " & gblAppVersion` | `Contracts Screen.pa.yaml:L2161-2188` (L2184) |
| Opex | `lbl_OpexCosts_FooterVersion` | `="Version " & gblAppVersion` | `Opex Costs Screen.pa.yaml:L5345-5368` |
| Land Lease | `lbl_LandLease_FooterVersion` | `="Version " & gblAppVersion` | `Land Lease Costs Screen.pa.yaml:L1953-1976` |
| Add Costs from Table | — | no footer | |

The screenshots agree:

- `Cost App Landing Screen - Devex Capex Screen.png` shows an empty footer.
- `Cost App - Left Panel.png` (Contracts selected) shows "Version 1.0.0.1".

### 2.11 Entry from the Project Management app ("Edit Costs")

`projectmanagement/Src/Project Main Screen.pa.yaml`, `con_Main_Project_Overview_Header_SuitBar_CommandBar.Items` (L307–549). The `editCosts` item is at L368–406.

- **Label.** `ItemDisplayName: If(IsBlank(locDetailsListRowKey), "Edit Costs", If(varCanEdit, "Edit Costs", "View Costs"))`. The icon is `Edit` or `ReadingMode` on the same test.
- **Rights test.** `varCanEdit = And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(<row>, EditPermission), false))` (L310–334).
- **Enabled.** `ItemEnabled: !IsBlank(locDetailsListRowKey)`. The `ItemIconColor` Draft tint and the `ItemVisible` environment gate are commented-out, not live (L388–405).

`OnSelect` (L552), the `editCosts` branch:

```powerfx
If(!IsBlank(Self.Selected.ItemKey) && Self.Selected.ItemKey = "editCosts",
    If(
        With({varProjectRecord: LookUp(Projects, ThisRecord.Project = GUID(psf_MainScreen_DetailList_Container_FluentDetailsList.Selected.vsb_projectid))},
             varProjectRecord.'Cluster State'.Name = "Draft"),
        UpdateContext({locPreventEditCostPopUp: true}),
        Set(gblRecordSelectedProject, LookUp(Projects, ThisRecord.Project = GUID(…Selected.vsb_projectid)));
        Launch(gblCostAppLaunchUrl, {projectId: GUID(psf_MainScreen_DetailList_Container_FluentDetailsList.Selected.vsb_projectid)})
    )
);
```

- `gblCostAppLaunchUrl` is `"https://apps.powerapps.com/play/e/" & gblEnvironmentID & "/a/" & gblProjectCostsAppID & "?tenantId=" & gblTenantID` (`projectmanagement/Src/App.pa.yaml:L787-788`).
- `gblProjectCostsAppID` comes from the `vsb_ProjectCostsAppID` environment variable (L673–677).
- The launch opens a **new tab** (the default `LaunchTarget`, inferred) with `?projectId=<guid>` only. There is no screen parameter; the Cost app lands on CAPEX.
- **"View Costs" opens the same editable app.** The Cost app has no read-only mode, so only the label changes; Dataverse privileges are the real gate.
- **The Draft lock.** A project whose Cluster State is "Draft" opens the overlay with `Visible: =locPreventEditCostPopUp` (L2329). It reads "Cost module is locked. To unlock it, please complete the following sections:" (L2527) and lists "• Milestones", "• Generator", "• Production" and "• Change the project status from Draft" (L2545–2629). "Close" (L2671) and the X (L2400) clear the flag.
- The gate is the Draft test alone. The four bullets have their own `Visible` conditions (owned by the Project Overview gap analysis).

### 2.12 The five screens in context

| Screen | Purpose | Entry state | Main data | Relation to CAPEX |
|---|---|---|---|---|
| **Capex Costs Screen** (StartScreen, rail `DevexCapexCostsKey`) | Monthly DEVEX/CAPEX cost plan per contract, by category tab, through the `DevexCapexSummaryPCF` grid | `OnVisible` L14–301: resets the panels; re-reads `Param("projectId")`; computes the start cluster, allowed start year, year window and `colProjectPeriods`; clamps `gblSelectedProjectYear`; picks the first non-"Overleveraging" category (or keeps the last one); `Select`s the refresh and standard-contract code buttons once base data is ready, otherwise defers to `tmr_Capex_Initial_Load` | `colCapexAccountCategoriesNew`, `colCapexAccountsNew`, `colCapexSubaccountsNew`, `colCapexProjectContracts`, `colCapexCosts` (`OnStart` 26–31), `'CAPEX Costs'`, `'CAPEX Project Contracts'` | **It is** CAPEX. Every other screen is described relative to it. Details in `07`/`08`/`09`. |
| **Add Costs from Table** (no rail item; reached only from the Capex button) | Bulk entry and editing of one CAPEX category's contracts and monthly costs in a spreadsheet PCF (`vsb_Dev.SpreadSheet`, L172–188) | `OnVisible` L12–21 resets five flags. Everything else arrives through the `Navigate` context from Capex (§2.8), including `locPCFJsonInput` = `JSON(colAddCostFromTable)` and `locSelectedTglTab`. The screen is a full-screen 70 % scrim with a 90 × 90 % panel (L35–58); it has **no header, rail or footer**. Title: `$"{gblSelectedProject.'Project Name'} - {locSelectedTglTab.Name}"` (L94). | `colSubaccountMappedCostPaid` (Capex L2577–2587, `'SPVDevCo Mapping Capex Devexes'`), `colCapexProjectContracts`, `colCapexCosts`, `colCapexSubaccountsNew` | **It writes CAPEX rows directly** (`tmr__CheckChanges_Add_Costs_To_Dataverse.OnTimerEnd`, L30): it validates, then `Patch('CAPEX Project Contracts', …)` (contracts), `RemoveIf('CAPEX Costs', …)` (blank months), `Patch('CAPEX Costs', …)` (monthly costs), `Patch('CAPEX Project Contracts', …'Total Cost'…)`, and `RemoveIf('CAPEX Project Contracts', …ColContractstoDelete…)`, which deletes contracts dropped from the sheet. The past-cost guard is commented-out, not live (bug A-1). Then it rebuilds the CAPEX collections and navigates back. The save path is in `08`/`11`. |
| **Contracts Screen** (rail `ContractsKey`) | BoP (balance-of-plant) project contracts: Development, Construction and Project Rights contracts, their payment targets, and their links to DevCo CAPEX accounts | `OnVisible` L17–300 resets every panel and reloads: `colBoPContracts` (`'BoP Projects Contracts'`); `colBoPCapexProjectContracts` (`'CAPEX Project Contracts'` with `'Cost Type' = 'Cost paid type'.DevCo`); `colBoPStandardContractsFabric` (`'Assumptions BoP Contracts'`); `colSelectedProjectCapexContractsCosts` (`'CAPEX Costs'` of those DevCo contracts, excluding SPV); and the three-level account tree `colCapexAllAccounts` from `'CAPEX Account Lists'` (level 3 `TotalCost` = `Sum(…'Total Cost')` of the DevCo CAPEX contracts, L269–275). `OnHidden` clears `colBoPContracts`. | `'BoP Projects Contracts'`, `'BoP Contracts Payment Targets'`, `'BoP Contracts DevCo Costs'` | **It reads CAPEX and writes none of it.** Every write targets BoP tables: `Patch('BoP Contracts Payment Targets', …)` L3088; `Patch('BoP Projects Contracts', …)` L3744, L7331; `RemoveIf`/`Patch('BoP Contracts DevCo Costs', …)` L7442–7450, which links a BoP contract to level-3 `'CAPEX Account'` rows (L7432–7435); `Remove(…)` L7759, L7795. A BoP contract's DevCo figures come from the CAPEX DevCo contracts' `'Total Cost'` and costs, so **the dependency runs CAPEX → Contracts.** |
| **Opex Costs Screen** (rail `O&MKey` and `OtherOpexCostsKey`; one screen for both) | OPEX cost periods: Operation & Maintenance per device type, and Other OPEX per sub-account | `OnVisible` L14–124: `locSelectedAccount` is `First(colOpexAccounts)` for "Operation & Maintenance" and `Last(colOpexAccounts)` for "Other OPEX Costs", keyed on `gblLeftNavigationSelected.ItemDisplayName`. It reloads `colDeviceTypesInProject` and `colOpexProjectCosts`. The mode-dependent containers are switched by the same `ItemDisplayName` (L318, L344, L2705). | `'Opex Project Costs'`, `colOpexAccounts`/`colOpexSubaccounts` (`OnStart` 24), `DeviceTypesInProjects`, `gblAreaWithRegion` | **None.** Grep for `CAPEX` / `colCapex` in the file finds 0 matches. It shares only the shell, the project and `colDistributionFrequency`. |
| **Land Lease Costs Screen** (rail `LandLeaseKey`) | Land-lease cost headers, periods and their allocation to WTGs | `OnVisible` L14: `Concurrent` reload of `colLandLeaseSubaccounts`, `colLandLeaseProjectCosts`, `colLandLeasePeriods`, `colGeneratorsInProject` and `colAllocatedWtgsInSelectedLandLeaseCost` | `'Land Lease Project Costs'`, `'Land Lease Periods'`, `GeneratorInProjects`, `gblAreaWithRegion` (L1390, L4431, L4727) | **None** (Grep: 0 `CAPEX` matches). |

---

## 3. Code app implementation

### 3.1 Bootstrap: the replacement for `App.OnStart`

| Canvas item | Code app | Tests |
|---|---|---|
| The session (`IContext`) replaces `gblTenantID`, `gblEnvironmentID` and `Param(...)` | `platform/powerClient.ts:74-87` `readSession` returns `environmentId`, `tenantId`, `appUrl` and `launchParams: ctx.app.queryParams` ("the code-app equivalent of `Param(...)`"). It is loaded once in `app/SessionContext.tsx:45-51` (`staleTime: Infinity`). | `CostNavigation.test.tsx` (no UT ids) |
| Env-var lookups (steps 2, 3, 6, 25) | `data/project.ts:28-43` `ENV_VAR_NAMES` (`vsb_AppVersion`, `vsb_EnvironmentName`, `vsb_ProjectManagementAppID`, `vsb_VSBCloudInfoCenterUrl`, `vsb_VSBcloudControllingApprovalGroup`, plus five Overview-only names). Loaded in two queries by `loadEnvironmentVariables` (`:56-94`), which **falls back to the definition's `defaultvalue`** (`:72`). The canvas reads `.Value` only. | — |
| `gblPMAppURL` (step 7) | `app/navigation.ts:222-231` `projectManagementAppUrl`, computed into `AppSession.pmAppUrl` (`SessionContext.tsx:100-104`). **Never consumed:** Grep finds `pmAppUrl` only in `SessionContext.tsx`. | UT-NAV-013, UT-NAV-014, UT-NAV-015 |
| `Param("projectId")` and the test-project fallback (step 19, Capex L40–56) | `readProjectLink` (`powerClient.ts:110-131`) matches `projectid`/`project_id`/`projectguid`/`id` case-insensitively. Priority: the route search, then the launch parameters, then the outer `window.location.search`. Invalid or conflicting ids give `invalid`. **No fallback project** (the comment at `powerClient.ts:89-100` cites A-2). `SessionContext.tsx:65-89` resolves the id on `/`, `/costs` and `/costs/*` and then loads it. | `CostNavigation.test.tsx`: "loads a deep-linked project…", "uses the chosen route project instead of a stale host launch", "does not fetch Cost data for an unusable link" |
| `LookUp(Projects, Project = …)` | `data/project.ts:127-176` `loadProject`, with `$select` of the columns the screens need and `filter: and(vsb_projectid eq …, ACTIVE)` (`:170`). `ACTIVE` = `"statecode eq 0"` (`data/odata.ts:103`), so **an inactive project resolves to "not found"**. | — |
| `gblProjectHeaderData` (step 20) | `App.tsx:64-65` (the page title is `project?.projectName`) and `:76-78` (`approvalState`, from `Vsb_projectsvsb_approvalstates[row.vsb_approvalstates]`, `data/project.ts:192-194`) | — |
| `gblCurrentUser` and the roles (steps 10–16) | `app/useCurrentUser.ts`, `data/currentUser.ts` (systemuser, `aaduser` company name, effective roles via `systemuserroles_association` and `teammembership_association`); `domain/session.ts` (`unionVsbRoles`, `deriveCountryScope`, `buildCurrentUser`). Loaded separately so that it never blocks first paint (`App.tsx:29-34`). | UT-SES-001 to UT-SES-015 |
| `colProjectApprovals` (step 17) | Not loaded. Correct: it is dead in the canvas Cost app. | — |
| `gblSelectedProjectYear` seed (step 22) | `features/cost/capex-costs/panelRules.ts:171-180` `onStartSelectedYear(anchors, startClusterNo, today)`, called with `project?.startClusterNo ?? 0` (`Screen.tsx:203, 222`). A blank start cluster is treated as Greenfield (`(startClusterNo ?? 0) > 0`, `panelRules.ts:176`). Clamped by `defaultSelectedYear` (`:139-156`, called at `Screen.tsx:230-235`). | the `onStartSelectedYear` block in `panelRules.test.ts` (5 cases, no UT ids); `Screen.test.tsx` "opens on today's year…" (D50) |
| `gblClusterDurations`, `gblAreaWithRegion`, `colDistributionFrequency` | `capex-costs/clusters.ts:56` `clusterDurations`; `periods/opexRules.ts` `areaWithRegion` (used by OPEX and, as a `ctx` field, by Land Lease); `data/dataverseNames.ts:621-627` `DISTRIBUTION_FREQUENCY` (the five rows, verbatim) | UT-PROJ-002, UT-LAND-036 |
| `gblAppTheme`/`Styles`/`Sizes` | `theme/tokens.ts` (`layout.railWidth: 200`, `railWidthCollapsed: 56`, `headerHeight: 74`, `footerHeight: 32`, `:70-73`). See `03-THEMES.md`. | — |
| `gblAppStarted` gating | `App.tsx:36`: `if (loading) return <LoadingOverlay mode="blocking" label="Please wait..." />`, and `:112-121`, an "The app could not finish starting" empty state on a session, env-var or project error | — |
| `App.OnError` → `gblReportError` | `platform/telemetry.ts` (`trace`, `lastError` `:35`). `App.tsx:103` `hasError={Boolean(error) \|\| Boolean(lastError())}` reads it at render time; `App` does not `subscribe` (`telemetry.ts:43`). Only errors the code itself traces are captured; there is no global unhandled-error hook equivalent to `App.OnError`. | — |
| `ConfirmExit: true` | No global prompt. `beforeunload` is registered only while a panel is dirty (`components/discardGuard.tsx:26-39`, `UnsavedChangesGuard.tsx:50`). | UT-SETPANEL-008 |
| `StartScreen` | `routes.tsx:54-67` `Landing`: with a valid `projectId` it redirects to `costLocation(launchCostPath(…), projectId)` (default `/costs/capex`); without one it goes to `/projects`, the Project Overview, which is a **code-app-only** landing. A `pmScreen` parameter instead goes to `/project/general`. | "starts on Project Overview when no project was supplied", "boots the requested Cost route from player query parameters…" |

### 3.2 Routes and navigation

- **The route table** (`app/routes.tsx:135-143`) puts every Cost route under `CostProjectGate` (`:70-84`), which shows `LoadingOverlay` or one of the empty states before any Cost screen mounts:
  - "This project link is invalid"
  - "Select a project to open Costs"
  - "The project could not be loaded"
  - "Project unavailable"

  The routes are `/costs/capex`, `/costs/opex/om`, `/costs/opex/other`, `/costs/land-lease`, `/costs/contracts` and `/costs/add-from-table`. The canvas showed `con_Costs_BodyRightSide` only when `Not(IsBlank(gblSelectedProject))` (Capex L2412) and otherwise nothing.
- **Route shape.** The project travels as `?projectId=` on every Cost route (`deepLinks.ts:9-12` `costLocation`, which validates the GUID). The rail appends it (`LeftNav.tsx:300-303`).
- **`costScreen` launch parameter.** `launchCostPath` (`deepLinks.ts:170-177`) accepts only the six `COST_PATHS` (`:3-6`). `costAppUrl` (`:152-167`) writes it. **No production caller uses `costAppUrl`:** Grep finds it only in `deepLinks.test.ts`. Project Overview's Edit Costs uses `appTabUrl` (§3.5).
- **`resolvePlayAppUrl`** (`deepLinks.ts:96-102`):
  - under `import.meta.env.DEV` it uses `localPlayUrl` (the `…/play/e/<env>/app/local?_localAppUrl=…&_localConnectionUrl=…` shape, `:76-83`);
  - otherwise it uses the host's `ctx.app.appUrl`.

  It follows CONVENTIONS rule 12. Tests: the three `resolvePlayAppUrl …` cases in `deepLinks.test.ts` (no UT ids).
- **The rail data.** `app/navigation.ts:42-114` `NAV_ITEMS` transcribes the seven canvas entries:
  - keys verbatim;
  - "DEVEX/CAPEX" **without** the leading space (`:10-12`, a recorded divergence);
  - OPEX as a group with no path;
  - Total Summary `enabled: false, visible: false`.

  It adds a hidden `ProjectsKey`. Two further functions support it:
  - `activeNavKey` (`:174-182`) highlights by path and attributes `/costs/add-from-table` to DEVEX/CAPEX;
  - `parentOf` (`:185-187`) keeps OPEX open.

  Tests: UT-NAV-001 to UT-NAV-012.

### 3.3 Shell components

#### `components/AppShell.tsx`

- The shell is header + rail + `<main>` + footer.
- The rail and footer render on any `/costs/*`, `/project/*` or `/admin/*` route (`App.tsx:48-55`), **including `/costs/add-from-table`**.
- The footer text is always `` `Version ${header.appVersion ?? ""}` `` (`AppShell.tsx:86-88`); the comment cites `lbl_Contracts_FooterVersion`.

#### `components/AppHeader.tsx` (with `headerRules.ts`)

| Canvas control | Code | Cite |
|---|---|---|
| "Cloud" | `Text` "Cloud" | `AppHeader.tsx:244` |
| `con_cmp_Header_Version` | `versionLabel()`: `Version X (Dev)` for Dev, else `Version X`. Rendered **for every environment** under the logo. | `:116-119`, `:254` |
| `con_cmp_Header_Title_4` | `environmentBadge()`, the same `Switch` values, rendered as a Fluent `Badge` beside the brand. | `:122-130`, `:257` |
| `con_cmp_Header_Version_4` | No separate right-side version label. | — |
| `ico_cmp_Header_Info` | `environmentInfoColor()`: Dev and Hotfix give Error, Nightly gives Warning, QA gives Success. The icon renders when a colour exists. Marked DIVERGENCE (product owner, X5). | `headerRules.ts:14-21`; `AppHeader.tsx:246-253` |
| `con_cmp_Header` env-tinted `Fill` | Not implemented. The background is always `tokens.colorNeutralBackground1`. | `AppHeader.tsx:40`. Grep: no `9831A8`/`E66C37` in `src` |
| `img_cmp_Header_Logo_Button` → `OnLogoClick` → `Launch(gblPMAppURL)` | The logo is a button **only when `onBack` is passed**. `App.tsx:75` passes `onBack` for PM and admin routes only, so **on the Cost screens the logo does nothing**. | `AppHeader.tsx:229-242` |
| `rec_cmp_Header_Project_State` | `APPROVAL_STATE_COLOUR` (Draft akzent2, Approving akzent4, Approved akzent3, Rejected akzent5, else white). The tooltip is `approvalState ?? "No approval state"`. | `AppHeader.tsx:137-146`, `:286-293` |
| `con_cmp_Header_HeaderText` | `pageTitle` = `project?.projectName` | `App.tsx:64-65`; `AppHeader.tsx:312` |
| `pcf_HeaderContainerReportError_WarningIcon` | A transparent **button** with `WarningFilled`, tooltip `ERROR_TOOLTIP` (verbatim), `onClick={onReportProblem}`, `data-testid="header-error"`, `aria-label="An error has occurred"` | `AppHeader.tsx:149-153`, `:320-330` |
| `pcf_HeaderContainerReportError_CommandBar` | A Fluent `Menu` "Help" (`data-testid="header-help"`) with "Report Problem" (opens `ReportProblemPanel`) and "VSB Cloud InfoCenter" (`window.open(url, "_blank")`, marked as D8) | `AppHeader.tsx:332-367` |
| `lbl_cmp_In_Header_UserName` / user image | The pill `"Hi " + userName` (`"User"` before load); the avatar is the photo or a `PersonRegular` fallback; `aria-label="User"`, `data-testid="header-user"` | `AppHeader.tsx:369-391` |
| `pcf_cmpHeader_User_ContextMenu_Info` rows | Mail, Language (`languageLabel` = `en-US, [en]`, `data/currentUser.ts:132-137`), Business unit (`companyName`), Countries, Data scope ("Project Data All Countries"), Version (`version X (Env)`). Rows with no value are omitted. **Plus "Application Settings" as the first row** whenever `adminEntriesVisible` is true (`App.tsx:109`; `adminAccess.ts:21-27`: always true under `npm run dev`). | `AppHeader.tsx:411-438` |

Tests: UT-HEADER-001 to UT-HEADER-009 (`AppHeader.test.tsx`), covering the Application Settings row, the info-icon colour switch, the PM status line and the back arrow.

#### `components/LeftNav.tsx`

- **Expanded state.** `expanded` is held in `useState(true)` (`:138`). The rail lives in `AppShell`, which stays mounted across Cost routes, so the state survives Cost-to-Cost navigation, as `gblLeftNavigationMenuIsExpanded` did. A reload resets it, which also happens in the canvas.
- **Cost rail toggle.** It has a hamburger (`NavigationRegular`) and `data-testid="icon_Left_Navigation_Expand"`. Its tooltip and `aria-label` are **"Collapse menu" / "Expand menu"** (`:178`, `:189`), not the canvas tooltip.
- **Groups.** OPEX is a chevron button (`data-testid="rail-group-OpexCostsKey"`) that only toggles the group (`:215-251`).
- **Items.** Each item is a `NavLink` (`data-testid="rail-<ItemKey>"`, `aria-label` = label, `aria-current="page"` when active) whose `to` keeps `projectId` and **drops every other search parameter** (`:300-303`).
- **Collapsed Cost rail.** It keeps the grouped tree, labels hidden; the flat canvas list is reproduced only for the PM and admin rails (`:197-209`, `pmRail`). The collapsed width is `layout.railWidthCollapsed` = 56 (`:163`; `tokens.ts:71`). The `<nav>` `aria-label` is "Cost sections" (`:79`, `:168`).

Tests:

- `CostNavigation.test.tsx` "keeps projectId on every rail destination, including after a click";
- UT-NAV-008 to UT-NAV-012 (`activeNavKey`/`parentOf`).

#### `features/shared/report-problem/ReportProblemPanel.tsx` (summary; `06` owns the detail)

- A `FormPanel` titled **"Report a problem"** (`:84`).
- Empty Title and Description fields, plus a read-only technical-details block (user, path, project, version, environment, timestamp, last error, the last 15 traces).
- Cancel and a **"Copy report"** button that copies the text to the clipboard (`:89-104`).
- A warning explains that nothing is filed. This is marked SOURCE DEFECT B-1 (`:4-21`).
- There is no "Clear Warning" button, and no pre-filled title or description.

### 3.4 State that survives a screen change (code app)

| State | Where it lives | Survives? |
|---|---|---|
| Project, env vars, user | TanStack Query (`SessionContext.tsx:45-89`, project `staleTime` 5 min; `Providers.tsx:21` default `staleTime` 30 s, `:24` `refetchOnWindowFocus`) | Yes |
| Rail expanded and open groups | `LeftNav` state in the persistent `AppShell` | Yes (between `/costs/*` routes) |
| CAPEX category | URL `?category=` (`capex-costs/Screen.tsx:182`, `:323`) | **Only** across the Add Costs from Table round trip, which carries `category` (`Screen.tsx:713-714`, `add-costs-from-table/Screen.tsx:161`). Rail links and `costLocation` drop it, so the tab returns to **Summary**, the code default (`rules.ts:92-100` `resolveCategory`). |
| CAPEX year | `useState` `pickedYear` (`capex-costs/Screen.tsx:220`) | **No.** Every remount re-seeds `onStartSelectedYear`. |
| CAPEX toggles and payer filter | `useState` (`Screen.tsx:240-242`) | **No** |
| CAPEX panels and pop-ups | `useState` | No (matches the canvas `OnVisible` reset) |
| Cross-screen freshness | CAPEX writes invalidate the Contracts DevCo queries (`costing/useCostBook.ts:388-394`, `:458-463` invalidate `qk.devCoCapexContracts` / `qk.devCoCapexCosts`) | — |

### 3.5 Entry from Project Overview ("Edit Costs")

Project Management's overview is now this app's `/projects` route (`features/pm/project-main`).

- **Label.** `rules.ts:559-560`: `canEditSelected ? "Edit Costs" : "View Costs"`, enabled by selection alone. Tests: UT-OV-046, UT-OV-047, UT-OV-048.
- **Lock gate.** `rules.ts:447` `isCostModuleLocked = statusName === "Draft"`; `costModuleLock` lists the four bullets (`:430-436`); the intro text is verbatim (`:733`). Tests: UT-OV-043, UT-OV-044, UT-OV-045, UT-OVUI-010.
- **Handler.** `Screen.tsx:573-576` checks `blockedByCostLock(selected)` (`:437-447`) and then calls `openInNewTab("/costs/capex", selected.id)` (`:462-485`).
- **The new tab.** It is `appTabUrl({currentUrl, appUrl: resolvePlayAppUrl(…), path, projectId})` opened with `window.open(url, "_blank", "noopener,noreferrer")` (`:450-453`). The tab carries `projectId` as a query parameter **and** in the hash; it does **not** carry `costScreen`, which works only because `/costs/capex` is the default. Test: UT-OVUI-023.

### 3.6 The five screens (high level)

| Route | Component | Notes |
|---|---|---|
| `/costs/capex` | `features/cost/capex-costs/Screen.tsx` (1,017 lines) | The vendored PCF renderer, the tabs, the year, the panels and comments. Detail in `07`–`09`, `14`. The Add Cost from Table button navigates to `costLocation("/costs/add-from-table", projectId)` + `&category=` (`:713-714`). |
| `/costs/add-from-table` | `features/cost/add-costs-from-table/Screen.tsx` | A `position: fixed` full-viewport scrim `rgba(0,0,0,0.7)` with a 90 × 90 % panel (`:271-282`) over the `AppShell`, which still renders header, rail and footer underneath. `CANVAS_PARITY_DELETION = true` (`:55`). Cancel, the X and a successful save call `back()` = `navigate({pathname: "/costs/capex", search: `?category=${category}`})` (`:161`), which **drops `projectId` from the route**; the project is then re-resolved from the launch parameters or the outer query string (`SessionContext.tsx:70-74`). |
| `/costs/contracts` | `features/cost/contracts/Screen.tsx` (1,458 lines) | BoP contracts, payment targets and DevCo links; reads CAPEX DevCo contracts and costs (`useDevCoCapexContracts`, `useCapexCostRows`). |
| `/costs/opex/om`, `/costs/opex/other` | `features/cost/opex-costs/Screen.tsx` → `periods/OpexScreen.tsx` with `mode` | The route mode replaces `gblLeftNavigationSelected.ItemDisplayName`. |
| `/costs/land-lease` | `features/cost/land-lease/Screen.tsx` → `periods/LandLeaseScreen.tsx` | A separate screen and rules file (`periods/landLeaseRules.ts`). |

---

## 4. Gaps: Code app vs Canvas

### 4.1 Covered (grouped)

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-MOD-C1 | Session bootstrap | `OnStart` steps 2–7, 10–16, 25 (`App.pa.yaml:L205`) | `readSession` (`powerClient.ts:74-87`), `loadEnvironmentVariables` (`data/project.ts:56-94`), `useCurrentUser` and `domain/session.ts` | Data | Covered | Low | UT-SES-001 to UT-SES-015. Roles load without blocking first paint. |
| GAP-MOD-C2 | Rail items | `LeftNavigationMenu` (`App.pa.yaml:L86-141`); rail `OnSelect` → `Navigate(TargetScreen)` (Capex L2385–2399) | `NAV_ITEMS` (`navigation.ts:42-114`), `NavLink`s carrying `projectId` (`LeftNav.tsx:290-328`) | Functional | Covered | Low | UT-NAV-001 to UT-NAV-012; the `CostNavigation.test.tsx` rail case |
| GAP-MOD-C3 | Rail selection and expanded state across screens | `gblLeftNavigationSelected`, `gblLeftNavigationMenuIsExpanded` (globals) | `activeNavKey` from the path; `LeftNav` `useState` in the persistent `AppShell` (`LeftNav.tsx:138-148`) | UX | Covered | Low | |
| GAP-MOD-C4 | Header text pieces | "Cloud", version, env title, approval colours, project name, "Hi " pill, Help items (`cmp_Header.pa.yaml:L199, L228, L270-285, L330, L448-459, L513-531, L600`) | `AppHeader.tsx:116-146, :244-257, :286-312, :332-391` | UI | Covered | Low | UT-HEADER-003, UT-HEADER-004 |
| GAP-MOD-C5 | PM Edit Costs entry | Draft gate, lock pop-up, `Launch(gblCostAppLaunchUrl, {projectId})`, "View Costs" label (`Project Main Screen.pa.yaml:L368-406, L552, L2329-2671`) | `rules.ts:430-447, :559-560, :733`; `Screen.tsx:437-485, :573-576` | Functional | Covered | Low | UT-OV-043 to UT-OV-048, UT-OVUI-010, UT-OVUI-023 |
| GAP-MOD-C6 | Screen identity | OPEX screen mode from the rail key (`Opex Costs Screen.pa.yaml:L17-22`); Land Lease a separate screen; Capex → Add Costs from Table (Capex L2777–2809) | `routes.tsx:137-142` (`mode="om"`/`"other"`); `capex-costs/Screen.tsx:713-714` | Functional | Covered | Low | UT-NAV-006, UT-NAV-009, UT-NAV-011 |
| GAP-MOD-C7 | Shared named data | `colDistributionFrequency`, `gblClusterDurations`, `gblAreaWithRegion` (`App.pa.yaml:L161-187, L205`) | `dataverseNames.ts:621-627`; `clusters.ts:56`; `opexRules.areaWithRegion` | Data | Covered | Low | UT-PROJ-002, UT-LAND-036 |
| GAP-MOD-C8 | CAPEX → Contracts freshness | Contracts `OnVisible` reloads the DevCo CAPEX data on each visit (L70–133) | The CAPEX save invalidates the DevCo queries (`useCostBook.ts:388-394, :458-463`) | Data | Covered | Low | |

### 4.2 Not covered (one row each)

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-MOD-01 | Header logo | `OnLogoClick: Launch(gblPMAppURL)` on all four Cost headers (Capex L2333–2335, Contracts L332–334, Opex L156–158, Land Lease L46–48) opens Project Management in a new tab | The logo is clickable only when `onBack` is passed (`AppHeader.tsx:229-242`); `App.tsx:75` passes it only for `/project/*` and `/admin/*`. `pmAppUrl` (`SessionContext.tsx:100-104`) has no consumer. | Functional | Missing | Med | Prior gap report B14 marks it COVERED (§6). Decide whether the logo should open `/projects` (same app) or the external PM URL. |
| GAP-MOD-02 | No-project start | `Param("projectId")` blank → test project `33b9cc79-…` (`App.pa.yaml:L205` step 19; Capex L49–55) | No fallback; `Landing` → `/projects`, `CostProjectGate` → "Select a project to open Costs" (`routes.tsx:54-84`; `powerClient.ts:97-100`) | Functional | Divergent-marked | Low | Bug **A-2** |
| GAP-MOD-03 | Inactive project | `LookUp(Projects, Project = GUID(Param("projectId")))` has no state condition (`App.pa.yaml:L205`; Capex L44–47), so an inactive project opens and its costs are editable | `loadProject` filters `statecode eq 0` (`data/project.ts:170`), so an inactive project shows "Project unavailable" (`routes.tsx:81-82`) | Data | Divergent-unmarked | Med | The same question as **D45 G2** (the Overview), but no marker or D-entry covers the deep-link load. |
| GAP-MOD-04 | CAPEX year across screens | `gblSelectedProjectYear` is global; Capex `OnVisible` only re-clamps it (L238–257), so a picked year survives Contracts/OPEX/Land Lease/Add Costs from Table and back | `pickedYear` is component state (`capex-costs/Screen.tsx:220`), re-seeded by `onStartSelectedYear` on every remount (`:222`), including the Add Costs from Table round trip | UX | Divergent-unmarked | Med | Testers comparing years after a round trip will see the year jump back. Could ride in the URL like `category`. |
| GAP-MOD-05 | CAPEX first-entry tab | `OnVisible` selects the first real category, not "DEVEX/CAPEX Summary" (L259–276); the timer path picks Summary (D-7) | `resolveCategory(null)` → Summary (`rules.ts:96`) | UX | Divergent-marked | Low | **D-7** / **D38 §8**. No `SOURCE DEFECT` marker in code (D38 §8 proposed one). The live screenshot lands on Summary. |
| GAP-MOD-06 | CAPEX tab across screens | `locSelectedCapexAccountCategory` kept by `OnVisible` (L259–276) → tab `Default` (L2435) after `Reset` (L284) | `?category=` is dropped by rail links (`LeftNav.tsx:300-303`) and by `costLocation`; even re-clicking DEVEX/CAPEX resets to Summary | UX | Divergent-unmarked | Low | The canvas also ignores a re-click on the selected item (`Self.SelectedKey <> gblLeftNavigationSelected.ItemKey`). |
| GAP-MOD-07 | CAPEX toolbar state across screens | Toggles and the payer dropdown keep their values across `Navigate`; `OnVisible` does not reset them (L15–38, L284) (inferred) | `useState` defaults on each mount (`Screen.tsx:240-242`) | UX | Divergent-unmarked | Low | (inferred) — needs a live canvas check (§5) |
| GAP-MOD-08 | Add Costs from Table return | `Navigate('Capex Costs Screen', …)` keeps the global project (Add Costs from Table L110, L321–327, L30) | `back()` navigates to `/costs/capex?category=…` **without `projectId`** (`add-costs-from-table/Screen.tsx:161`); the project then depends on the launch parameters or the outer query string (`SessionContext.tsx:70-74`) | Functional | Divergent-unmarked | Low | Works in a tab opened by Edit Costs, which carries `projectId` as a launch parameter. A tab whose route alone carried the id would land on "Select a project to open Costs". Fix: `costLocation("/costs/capex", projectId)` + `&category=`. |
| GAP-MOD-09 | Footer on Capex | `lbl_Costs_FooterVersion.Text: =""` (Capex L8076); the screenshot shows an empty footer | `AppShell.tsx:86-88` renders `Version X` on every rail screen, Capex included | UI | Divergent-unmarked | Low | Contracts, Opex and Land Lease do show `"Version " & gblAppVersion`. Prior report U15 calls it COVERED (§6). |
| GAP-MOD-10 | Header version / env title placement | `con_cmp_Header_Version` only for Prod/Dev (L200–206); for other environments `con_cmp_Header_Version_4` + `con_cmp_Header_Title_4` sit right-aligned left of Help (L432–490) | The version is always under the logo (`AppHeader.tsx:254`); the env title is a `Badge` beside the brand (`:257`) | UI | Divergent-unmarked | Low | Visible only in Hotfix/Nightly/QA/Budgeting. See `02-UI.md`. |
| GAP-MOD-11 | Header environment tint | `con_cmp_Header.Fill` `Switch(gblEnvironmentName, "Hotfix" #9831A850, "Nightly" #AAAAAA60, "Budgeting" #85AD3760, "QA" #E66C3780, white)` (L80–97) | Always `tokens.colorNeutralBackground1` (`AppHeader.tsx:40`) | UI | Missing | Low | A non-production safety cue. See `03-THEMES.md`. |
| GAP-MOD-12 | Header info icon | `ico_cmp_Header_Info`: colour `Switch` Dev/Nightly/QA only, transparent otherwise; `Visible: =//true` (L210–219). `_4`, the Hotfix-aware one, is hidden (L422–428). | `environmentInfoColor` adds `"Hotfix"` → Error (`headerRules.ts:16`) | UI | Partial | Low | `headerRules.ts` marks the icon's *visibility* as DIVERGENCE (X5) but attributes the Hotfix branch to the wrong control (§6). |
| GAP-MOD-13 | Approval bar tooltip | `Tooltip: =cmp_Header.Project.Approval`, blank when the project has none (L322) | `approvalState ?? "No approval state"` (`AppHeader.tsx:288`), a string not in the canvas | UX | Divergent-unmarked | Low | CONVENTIONS rule 7 |
| GAP-MOD-14 | Help → InfoCenter | `Launch(gblInfoCenterLaunchUrl, Blank(), LaunchTarget.Replace)` (L541–545) | `window.open(url, "_blank", "noopener")` (`AppHeader.tsx:356-361`) | UX | Divergent-marked | Low | **D8** |
| GAP-MOD-15 | Warning icon | A non-interactive icon, `Visible: =!IsBlank(gblReportError)` (L491–506) | A button that opens the report panel (`AppHeader.tsx:320-330`); `hasError` reads `lastError()` at render without subscribing (`App.tsx:103`), so it can lag a new error until the next re-render (inferred) | UX | Partial | Low | `06-POPUPS.md` |
| GAP-MOD-16 | Global error capture | `App.OnError` stores every unhandled error with screen, source and message (`App.pa.yaml:L188-198`) | Only errors passed to `trace()` reach `lastError()`; there is no app-wide handler | Functional | Partial | Low | `06-POPUPS.md` |
| GAP-MOD-17 | Report panel Save | Save's `ReportDevOpsBug.Run` is commented out; Save only clears the flags (`cmp_ReportErrorRightPanel.pa.yaml:L400-420`) | "Copy report" to the clipboard, with a warning (`ReportProblemPanel.tsx:4-21, :89-115`) | Functional | Divergent-marked | Low | Bug **B-1** |
| GAP-MOD-18 | Report panel content | Title "Report Error" (L72); title and description pre-filled from `gblReportError` (L150, L264–278); "Clear Warning" (L428–456) | Title "Report a problem" (`:84`); empty fields; no Clear Warning; extra technical block | UI | Divergent-unmarked | Low | Strings fall under CONVENTIONS rule 7. Detail in `06-POPUPS.md`. |
| GAP-MOD-19 | User menu | The Cost `cmp_Header` context menu has no Application Settings row (L616–661) | "Application Settings" is the first row whenever `adminEntriesVisible` (`App.tsx:109`, `AppHeader.tsx:415-420`); always under `npm run dev` | Functional | Code-app-only | Low | Borrowed from the PM header (UT-HEADER-001, UT-HEADER-002) |
| GAP-MOD-20 | Header Tosca identities | `pcf_HeaderContainerReportError_CommandBar` (L507); `pcf_cmpHeader_User_ContextMenu_Info` `AccessibilityLabel: ="User information"` (L605–609); `img_cmp_Header_Logo_Button` (L150) | `data-testid` `header-help` / `header-user` / `header-error`; `aria-label="User"` (`AppHeader.tsx:335-341, :371`) | UX | Divergent-unmarked | Low | CONVENTIONS rule 16 (canvas name and `AccessibleLabel` where they exist). See `05-UX.md`. |
| GAP-MOD-21 | Rail toggle text | `Tooltip: =$"{If(IsExpanded, "Decrease", "Expand")} left naviagtion panel"` (`cmp_Left_Navigation.pa.yaml:L148`) | Cost rail: "Collapse menu" / "Expand menu" for both tooltip and `aria-label` (`LeftNav.tsx:178, :189`); the PM rail uses the verbatim text (`:74`) | UX | Divergent-unmarked | Low | Rule 7 and rule 16 |
| GAP-MOD-22 | Rail accessible name | `pcf_Left_Navigation_Menu.AccessibilityLabel: ="Left navigation"`, `Tooltip: ="Left navigation"` (L154, L180) | `<nav aria-label="Cost sections">` (`LeftNav.tsx:79, :168`) | UX | Divergent-unmarked | Low | Tosca |
| GAP-MOD-23 | Collapsed Cost rail | Collapsed `Items` drop `ItemDisplayName` **and `ItemParentKey`**, giving a flat icon list (L156–175); container width `DecreasedWidth` 32 (`App.pa.yaml:L205` `gblAppSizes`; Capex L2370) | The Cost rail keeps the grouped tree with chevrons (flattening is `pmRail`-only, `LeftNav.tsx:197-209`); width 56 (`tokens.ts:71`) | UI | Divergent-unmarked | Low | `tokens.ts:60-61` says the screenshots show about 125 px. Effective canvas width is uncertain because of `LayoutMinWidth: =200` (§5). |
| GAP-MOD-24 | "DEVEX/CAPEX" label | `ItemDisplayName: " DEVEX/CAPEX"`, with a leading space (`App.pa.yaml:L89`) | `"DEVEX/CAPEX"` (`navigation.ts:57`), recorded in the comment `:10-12` | UI | Divergent-marked | Low | UT-NAV-004. No D-entry in `02-OPEN-DECISIONS.md` (Grep "leading space": 0). |
| GAP-MOD-25 | Landing | `StartScreen: 'Capex Costs Screen'`; the Cost app has no project list (`App.pa.yaml:L206`) | `/` → `/projects` (Project Overview) without a project; with `projectId` → `/costs/capex` (`routes.tsx:54-67`) | Functional | Code-app-only | Low | One app now (D25–D34) |
| GAP-MOD-26 | Screen launch parameter | No screen parameter exists; the app always starts on CAPEX | `costScreen` / `pmScreen` parameters (`deepLinks.ts:115-177`); Edit Costs itself does not set `costScreen` (`project-main/Screen.tsx:575` → `appTabUrl`) | Functional | Code-app-only | Low | `costAppUrl` is test-only |
| GAP-MOD-27 | Exit prompt | `ConfirmExit: =true`, unconditional (`App.pa.yaml:L11`) | `beforeunload` only while a panel is dirty (`discardGuard.tsx:26-39`) | UX | Divergent-unmarked | Low | Arguably better; it needs a decision line. |
| GAP-MOD-28 | Add Costs from Table chrome | A screen with no header, rail or footer; the scrim covers the screen fill only (Add Costs from Table L35–58) | Rendered inside `AppShell`; the header, rail and "Version X" footer stay mounted under the fixed scrim (`App.tsx:48-55`; `add-costs-from-table/Screen.tsx:271-276`) | UI | Divergent-unmarked | Low | Visible through the 70 % scrim |
| GAP-MOD-29 | Env-var default value | `LookUp('Environment Variable Values', …).Value`: blank when only a default exists (`App.pa.yaml:L205` steps 2–6, 25) | Falls back to `environmentvariabledefinition.defaultvalue` (`data/project.ts:72`) | Data | Code-app-only | Low | It can show a version or InfoCenter URL where the canvas showed none. |
| GAP-MOD-30 | Year seed, blank start cluster | `If('Start Cluster' <> Greenfield, <acquisition>, <start date>)`: blank ≠ Greenfield, so the acquisition branch (`App.pa.yaml:L205` step 22) (inferred) | `(startClusterNo ?? 0) > 0` treats blank as Greenfield, so the start-date branch (`panelRules.ts:176`) | Functional | Divergent-unmarked | Low | (inferred). It only matters for a project with a blank `vsb_startcluster` and a future acquisition or start date. |

**Counts (rows GAP-MOD-01 to 30, the covered group rows excluded):**

| By status | Count |
|---|---|
| Missing | 2 |
| Partial | 3 |
| Divergent-marked | 5 |
| Divergent-unmarked | 16 |
| Code-app-only | 4 |

The severity split is High 0, Med 3 (GAP-MOD-01, 03, 04) and Low 27. Eight covered group rows (C1–C8) come in addition.

---

## 5. Open questions / not verifiable from source

1. **`ico_cmp_Header_Info.Visible: =//true`** (`cmp_Header.pa.yaml:L216`). The formula is only a comment, so the property has no expression. The two screenshots disagree:
   - `Cost App Landing Screen - Devex Capex Screen.png` shows a red (i) before "Version 1.0.0.1 (Dev)";
   - `Cost App - Top Bar…png` shows none.

   A live Dev run is needed to tell which is current, and whether the icon reproduces in Nightly or QA.
2. **Clicking "OPEX" in the canvas rail.** `OnSelect` sets `gblLeftNavigationSelected` to the OPEX record, whose `TargetScreen` is blank, and calls `Navigate(Blank(), …)`. Whether the PowerCAT Nav fires `OnChange` for a parent item, and what `Navigate(Blank())` does, needs a live check. If it fires, the rail would then highlight "OPEX" with the previous screen still showing, and the Opex screen's `ItemDisplayName` switch would match neither mode on the next visit.
3. **Collapsed rail width.** The container width is 32 when collapsed, but the container has `LayoutMinWidth: =200` (Capex L2369) with `FillPortions: =0`. Whether the auto-layout honours 32 or keeps 200 cannot be told from YAML; `tokens.ts:60-61` reports about 125 px from screenshots. `con_Costs_BodyRightSide.Width: =App.Width-205` (L2413) is also fixed, so the content may not grow when the rail collapses.
4. **Toolbar state persistence (GAP-MOD-07).** Confirm in the player that `tgl_Costs_*` and `drp_Costs_ProjectCostbtn_ShowCostPaidBy` keep their values after Capex → Contracts → Capex.
5. **`Launch(gblPMAppURL)` target.** The new tab is inferred from the `Launch` default. It is also unconfirmed whether PM, opened without `projectid`, lands on Project Main.
6. **Blank `'Start Cluster'` (GAP-MOD-30).** Confirm the Power Fx result of `Blank() <> 'Cluster States'.Greenfield` in a live app, and whether any real project has a blank `vsb_startcluster`.
7. **The PowerCAT ContextMenu's first item** (`$"Hi {User().FullName}"`, L618–621). Whether it is a row or the trigger label is not visible from YAML; the code treats it as the pill label (`AppHeader.tsx:407-409`).
8. **`gblProjectHeaderData` staleness.** The canvas never recomputes it after `OnStart`, so a project renamed in another tab keeps its old header name until reload. The code's project query has a 5-minute `staleTime`. Not worth a gap unless a tester reports it.

---

## 6. Doc disagreements

| # | Prior doc / comment | What it says | What the source shows |
|---|---|---|---|
| 1 | `ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md:130` (B14) | Shell "(logo → `Launch(gblPMAppURL)`) … COVERED" | The Cost-screen logo has no action (`AppHeader.tsx:229-242`, `App.tsx:75`); `pmAppUrl` is unused. See GAP-MOD-01. |
| 2 | `cost-capex-costs.md:173` (U15) | "`lbl_Costs_FooterVersion.Text = ""` … Shell footer … COVERED, Empty in the canvas too" | The code footer renders `Version X` on Capex (`AppShell.tsx:86-88`). See GAP-MOD-09. |
| 3 | `cost-capex-costs.md:117` (B1) | "…select the first non-'Overleveraging' category … COVERED" | The code opens on Summary when `?category=` is absent (`rules.ts:96`), as `01-BUGS-FOUND.md` D-7 itself records. B1 and B2 contradict each other. |
| 4 | `ProjectCosts-CodeApp/src/app/routes.tsx:4-6`, `components/LeftNav.tsx:5-6` | The canvas "moved between its five screens by toggling container visibility from the rail's `SelectedKey`, with only `Navigate('Capex Costs Screen')` ever called" | Every rail instance calls `Navigate(gblLeftNavigationSelected.TargetScreen, ScreenTransition.Fade)` (Capex L2395–2398, Contracts L393–396, Opex L217–220, Land Lease L107–110). Only the Opex screen toggles containers, on `ItemDisplayName`. |
| 5 | `routes.tsx:27, :39` | PM and admin screens are "UI built, not connected to Dataverse yet" | `PROJECT-MAP.md` and D18–D36 record them as connected. These comments are stale. |
| 6 | `features/pm/project-main/Screen.tsx:19` | "Edit Costs → `/costs/capex?projectId=…`, internal" | The handler opens a **new tab** (`:567-576`, `openInNewTab`); UT-OVUI-023 pins that. |
| 7 | `ProjectDocs/instructions/CONVENTIONS.md` rule 12 | The target screen "must also travel as a launch parameter … `costScreen` for Edit Costs" | Edit Costs uses `appTabUrl`, which sets no `costScreen` (`project-main/Screen.tsx:462-485`). `costAppUrl`, the only writer of `costScreen`, is called only from `deepLinks.test.ts`. |
| 8 | `ProjectDocs/app-docs/05-SCREEN-TRACKER.md:33-34, :44-47` | Add Cost from Table (items 9–10) and the Comments panel (items 20–23) are "stub" | Both are built: `add-costs-from-table/Screen.tsx` (339 lines, spreadsheet port, `CANVAS_PARITY_DELETION`) and `capex-costs/CommentsPanel.tsx` (800 lines). The tracker's own banner calls it historical. |
| 9 | `05-SCREEN-TRACKER.md:56-73`; `data/costRepository.ts:4-13` | A `demoCostRepository` in `src/demo/costRepository.ts` | No `src/demo/` exists (Glob). CONVENTIONS says the app has no mock mode. |
| 10 | `components/headerRules.ts:7-12` | Attributes `Switch(…, "Hotfix", Error, …)` and "`Visible` set to `false`" to `ico_cmp_Header_Info` | In the Cost app those belong to `ico_cmp_Header_Info_4` (`cmp_Header.pa.yaml:L405-431`). `ico_cmp_Header_Info` (L210–219) has no Hotfix branch and `Visible: =//true`. |
| 11 | `components/AppHeader.tsx:15, :334` | Cites `pcf_HeaderContainerReportError_CommandBar_1` | That name is the PM Project Main Screen's own header (`Project Main Screen.pa.yaml:L747`). The Cost `cmp_Header` control is `pcf_HeaderContainerReportError_CommandBar` (L507). |
| 12 | `ProjectDocs/migration-plans/screens/019-capex-costs.md:16, :39` | The route is `/costs/:projectId/capex` | The code uses `/costs/capex?projectId=` (`deepLinks.ts:9-12`, `routes.tsx:137`). The plan targets the skeleton. |
| 13 | This analysis brief ("Contracts feed CAPEX contract rows") | Contracts writes CAPEX contract rows | `Contracts Screen` writes only BoP tables (L3088, L3744, L7331, L7426–7450, L7759, L7795). It **reads** DevCo CAPEX contracts and costs (L70–133, L269–275). CAPEX standard contracts and costs are created server-side by `InitialP50StandardCapexContractCreate` / `InitialCapexCostsCreate` on `vsb_project` updates (`04-flow-inventory.md:56-58`). See `11-DATAVERSE-TABLES.md`. |
| 14 | `features/cost/add-costs-from-table/Screen.tsx:1-15` vs the canvas | "laid out exactly like `Add Costs from Table.pa.yaml`" | The canvas screen has no header, rail or footer; the code keeps the app shell under the scrim (GAP-MOD-28). The header bar fallback colour `#0f6cbd` (`:286`) is not `themePrimary` `#006eb9` (see `03-THEMES.md`). |
