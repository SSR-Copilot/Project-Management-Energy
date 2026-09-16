# Global state and data plan

This document is binding alongside `migration-plans/01-global-architecture.md`. It inventories
every piece of shared/global state and every shared data source the two canvas app shells
(Project Management and Project Costs) establish at app scope — `gbl*` global variables, named
formulas, app-level collections, data sources, roles/permissions, and navigation/launch state —
and maps each one to its Code App equivalent, quoting the actual field or hook where one
already exists in `VSBCloud-Code-App-Skeleton/vsbcode/`. It is written for a screen
implementation chat with no memory of this one: every canvas name is quoted exactly as it
appears in source, every Code App citation names a real file, and anything not resolvable from
the repository is marked `REQUIRES_INVESTIGATION` rather than guessed.

**Sources read for this document:**

- `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App.pa.yaml` (PM app shell —
  `Properties.Formulas`, `OnStart`, `OnError`, `StartScreen`)
- `ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/App.pa.yaml` (Cost app shell — same
  sections)
- `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App Loading Screen.pa.yaml`
  (the PM bootstrap/dispatch screen; `OnVisible`, the two hidden dispatch buttons, the header
  strip formulas, `Timer1.OnTimerEnd`)
- `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/References/DataSources.json` and
  the Project Costs app's equivalent (each ~512 KB; inspected by targeted grep for
  `"Type": "NativeCDSDataSourceInfo"` / `"ServiceInfo"` rather than a full read)
- `ProjectCosts-CodeApp/reference/dataverse-entities.json` (83-entity schemaName/logicalName/
  entitySetName/primaryIdAttribute ground truth)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/store/appStore.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/domain/session.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/domain/navigation.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/platform/bootstrap.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/platform/errors.ts` (read in full, for
  `ReportErrorRecord`)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/data/entities.ts` (read in full — `ES`, `ES_ADMIN`,
  `ES_COST`, `ES_PROCESS`, `ES_PLANT`, `ES_PRODUCTION`, `ES_FINANCE`, `SELECT`, `CHOICE*`)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/data/queryKeys.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/data/repos.ts` (skimmed for repository names — 109
  `makeRepository(...)` exports confirmed)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/security/matrix.json` (skimmed for shape: role list,
  `kind` taxonomy)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/features/shared/useProjectContext.ts` (read in full)
- `VSBCloud-Code-App-Skeleton/vsbcode/src/theme/tokens.ts` (grepped for `navIconColor`)
- `VSBCloud-Code-App-Skeleton/VSBCloud-Harness-Plan.md` (grepped for `gblRecordSelectedProject`
  /`gblCurrentUser`/`gblAppStarted`/`gblAppSizes`/`gblReportError`/`gblLeftNavigationSelected`
  occurrence counts, not read in full — see the note at the top of "Global variables")
- `migration-plans/00-workspace-inventory.md` and `01-global-architecture.md`

A note on method: canvas apps distinguish **named formulas** (declared under `App.Formulas`
with `Name = expression;` syntax — reactive, recalculated, cannot be `Set()`) from **imperative
global variables** (created by `Set(name, ...)` or `UpdateContext({...})`, typically inside
`OnStart`). Both apps use the `gbl`/`col`/`var` naming prefixes for **both** kinds — e.g.
`gblCommandBarSurfaceThemeJson` is a named formula, while `gblCurrentUser` is an imperative
variable — so the prefix alone does not tell you which section of this document a name belongs
in. Section boundaries below follow the actual declaration mechanism, not the prefix.

---

## Global variables

These are the identifiers the two `OnStart` handlers (or, for `gblShowReportProblemPanel` and
`gblProjectHeaderData`, screen-level formulas reached from the app shell) create with `Set(...)`.
Consumer lists are exhaustive only where `appStore.ts`'s own header comment already states the
mapping (nine names, quoted below); for everything else, a Harness-Plan grep gives an order-of-
magnitude occurrence count (`gblRecordSelectedProject`/`gblRecordSelectedProjectCountry`: 106
hits; `gblCurrentUser`: 51 hits; `gblAppStarted`/`gblAppSizes`/`gblReportError`/
`gblLeftNavigationSelected` combined: 21 hits, across `VSBCloud-Harness-Plan.md`'s 23 per-screen
sections), not a screen-by-screen list — a screen plan must verify its own consumption against
its own Harness-Plan section and canvas source rather than trusting this table for that.

### Session / current user

| Canvas name | Type | Initialization | Mutations | Consumers | Code App equivalent |
|---|---|---|---|---|---|
| `gblCurrentUser` | record | PM: two-stage build. First `Set(gblCurrentUser, varCurrentUserProfile)` (the named-formula profile lookup), then after the role/team collections resolve, fully replaced: `Set(gblCurrentUser, {Language, Lang, IsApplicationAdministrator, IsControlling: false, IsControllerOwnData, IsProjectDataAllCountries, CanEditSelectedProject: false, EditableCounties: colUserCountries, EditableCountiesAsString})`. Cost app: same two-stage pattern, additionally carrying `Id`, `DisplayName`, `Mail`, `CompanyName` (via a `Microsoft Entra IDs` lookup) directly on the record instead of via `RenameColumns`. Neither app sets `IsProjectManagerOwnProjects` or `IsDeveloper` on the object itself (roles are read from `colDistinctCurrentUserTeamsRoles`, not flagged onto `gblCurrentUser`). | `Patch(gblCurrentUser, {CanEditSelectedProject: ...})` on the App Loading Screen's two hidden dispatch buttons, per-project, using `DataSourceInfo(Projects, CreatePermission)` + `RecordInfo(record, EditPermission)`. | Per `appStore.ts` header comment: `gblCurrentUser -> session.user`. Referenced 51 times across the Harness Plan's screen sections — every screen touches it for admin-visibility or edit-permission checks. | `useAppStore.session.user` (`CurrentUser` from `src/domain/session.ts`), read via the `useCurrentUser()` hook exported from `src/store/appStore.ts`. Built by `buildCurrentUser(profile, unionVsbRoles(direct, viaTeams))` in `src/domain/session.ts`, called from `src/platform/bootstrap.ts`'s `bootstrap()`. The per-project `CanEditSelectedProject` patch is `patchUser({canEditSelectedProject})` inside `useProjectContext()` (`src/features/shared/useProjectContext.ts`), driven by `canEditSelectedProject()` in `session.ts`. |
| `gblCurrentUserData` | record | `Set(gblCurrentUserData, LookUp(Users, ThisRecord.'Azure AD Object ID' = User().EntraObjectId))` — PM only; the raw `Users` row behind `varCurrentUserProfile`. | Not mutated after `OnStart`. | `REQUIRES_INVESTIGATION` — not referenced by name in the sections grepped; likely dead once `varCurrentUserProfile`/`gblCurrentUser` are built. | No direct field. `bootstrap.ts`'s `readEnvironment()`/session profile object supersedes it; nothing ports the raw record. |
| `gblFilteredProjectManager` | record | `Set(gblFilteredProjectManager, varCurrentUserPPickerRecord)` immediately followed, in the same `Concurrent(...)` block, by `Set(gblFilteredProjectManager, Blank())` — the canvas sets it and then blanks it in the same statement list, so its effective `OnStart` value is always `Blank()`. Quoted verbatim because a screen plan must not "fix" this into a non-blank default without flagging it as a canvas defect. | Set again wherever Project Main's people-picker filter changes (screen-local, not traced here). | `REQUIRES_INVESTIGATION` (per-screen) — feeds `colFiltersOverview.ProjectManager`'s initial value, so effectively always blank at load. | No store field. Project Main's own filter-panel local state is the Code App equivalent; see the `project-main` screen plan. |
| `gblDefaultProjectManager` | record | `Set(gblDefaultProjectManager, varCurrentUserPPickerRecord)` — PM only. | `REQUIRES_INVESTIGATION`. | `REQUIRES_INVESTIGATION` — likely the default value of a "Project Manager" people-picker on project creation (General Data), not confirmed. | No store field found. Flag for the `general-data` screen plan to confirm against its own canvas source before assuming this default. |
| `gblTextControllingSecurityRoleName` | string | `Set(gblTextControllingSecurityRoleName, "VSB - Functional Approval Confirmation")` — PM only. This role name does **not** appear in `session.ts`'s `VSB_ROLES` (which lists five roles: Application Administrator, Controller Own Data, Project Data All Countries, Project Data Own Country, Project Manager Own Projects). | Not mutated. | `REQUIRES_INVESTIGATION` — likely used by a gate/checklist-approval formula to identify the controlling approver's role; not traced to a specific screen here. | No Code App equivalent found. A screen plan that needs this (most likely `admin-gates-approvals` or `checklist`) must treat it as a sixth, distinct role string and confirm against `matrix.json` before assuming it maps to one of the five `VSB_ROLES`. |

### Selected project and country

See also **Navigation state** below, which covers the launch-parameter contract for this
variable in more depth.

| Canvas name | Type | Initialization | Mutations | Consumers | Code App equivalent |
|---|---|---|---|---|---|
| `gblRecordSelectedProject` (PM) / `gblSelectedProject` (Cost) | record | **Naming divergence between the two apps for the same concept.** PM: `Set(gblRecordSelectedProject, LookUp(Projects, Project = GUID(Param("projectid"))))` in `OnStart`, re-set identically in both App Loading Screen dispatch buttons. Cost: `If(Not(IsBlank(Param("projectId"))), Set(gblSelectedProject, LookUp(Projects, Project = GUID(Param("projectId")))), Set(gblSelectedProject, LookUp(Projects, Project = GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2"))))` — note the Cost app's **hard-coded fallback project GUID** for when no `projectId` is supplied, commented `// for testing`; this must not ship as a silent default. Note also the launch parameter's casing differs: PM reads `Param("projectid")` (lower case), Cost reads `Param("projectId")` (camel case). | Re-`Set()` on every project-scoped screen's `OnVisible` (re-reads the record) and by the two App Loading Screen dispatch buttons. | Per `appStore.ts` header comment: `gblRecordSelectedProject -> project.selected`. 106 combined hits for `gblRecordSelectedProject`/`gblRecordSelectedProjectCountry` across the Harness Plan. | `useAppStore.project.selected` (`SelectedProject` from `src/domain/navigation.ts`), read via `useSelectedProject()`. Refreshed per project-scoped screen by `useProjectContext()` (`src/features/shared/useProjectContext.ts`), which calls `projectFullRepo.getById(id)` and `selectProject(toSelectedProject(record))` — the direct replacement for the canvas's per-`OnVisible` re-`LookUp`. **The Cost app's hard-coded fallback GUID has no Code App equivalent and must not be ported** — `RequireProject`/`SelectProjectPrompt` (see Navigation state) is the intended replacement behavior for "no project selected." |
| `gblSelectedRecordEditProject` | record | `Set(gblSelectedRecordEditProject, LookUp(Projects, Project = GUID(Param("projectid"))))` — App Loading Screen `OnVisible`, PM only. Identical `LookUp` to `gblRecordSelectedProject`, set immediately before it. | Not mutated elsewhere found. | `REQUIRES_INVESTIGATION` — referenced once more in a `Trace(...)` call in the same screen; likely a duplicate/legacy variable rather than a second live value. | No separate store field — `project.selected` already covers this; do not introduce a second field for it. |
| `gblRecordSelectedProjectCountry` | record | PM: `Set(gblRecordSelectedProjectCountry, Blank())` in `OnStart` (never repopulated from `Countries` in PM's `OnStart` itself — only from the two dispatch buttons' `LookUp(Countries, Country = gblRecordSelectedProject.Country.Country)`). Cost: `Set(gblRecordSelectedProjectCountry, LookUp(Countries_1, Country = gblSelectedProject.Country.Country))` — populated directly in `OnStart`. Note the table-name divergence: PM's formula corpus refers to `Countries`, Cost's to `Countries_1` (two logical references to the same conceptual table — PM's own `Formulas`/`OnStart` also shows both spellings depending on context; treat as the same table unless a screen plan finds otherwise). | Re-set by the two dispatch buttons on every project deep-link. | Per `appStore.ts` header comment: `gblRecordSelectedProjectCountry -> project.country`. | `useAppStore.project.country` (`{id, name} \| null`), set via the second argument of `selectProject(selected, country)`. |
| `gblRecordProjectPlanning` | record | `Set(gblRecordProjectPlanning, Blank())` — PM `OnStart` only initializes it to blank. | `REQUIRES_INVESTIGATION` — presumably set by the `planning` screen itself. | `REQUIRES_INVESTIGATION` — defer to the `planning` screen plan. | No store field; project-scoped record state for one screen belongs in that screen's own `hooks.ts`/query, not the global store. |
| `gblSelectedProjectYear` (Cost only) | number | `Set(gblSelectedProjectYear, Year(If(gblSelectedProject.'Start Cluster' <> 'Cluster States'.Greenfield, If(Year(gblSelectedProject.'Acquisition date') > Year(Today()), gblSelectedProject.'Acquisition date', Today()), If(Year(gblSelectedProject.'Project Start Date') > Year(Today()), gblSelectedProject.'Project Start Date', Today()))))` — a cluster-aware "which year does the cost timeline start from" derivation, not a simple `Year(Now())` (a commented-out simpler version is left in the source directly above it). | `REQUIRES_INVESTIGATION` for further mutation sites. | `REQUIRES_INVESTIGATION` — almost certainly consumed by all five Cost screens' year/period pickers. | `appStore.ts` already declares `project.selectedYear` with `setSelectedYear()`, but its default is `new Date().getFullYear()` — **the canvas's cluster-aware derivation above is not yet ported**. A screen plan for `capex-costs` (or whichever cost screen owns the initial year selection) must implement this exact `If`/`If` logic as a pure function in its `rules.ts` and call `setSelectedYear()` with the result; do not assume `appStore`'s current default is equivalent. |
| `gblSelectedProjectCODYear` (Cost only) | number | `Set(gblSelectedProjectCODYear, With({varProjectCODYear: Year(gblSelectedProject.'Operations start date (COD)')}, varProjectCODYear))`. | Not mutated elsewhere found. | `REQUIRES_INVESTIGATION`. | No store field. Propose deriving this in a screen's `rules.ts` from `record.vsb_operationsstartdatecod` (see `SELECT.projectFull` in `entities.ts`) rather than adding a new global — it is a pure function of the already-loaded project record. |
| `gblClusterDurations` (Cost only) | table (6 rows) | A `Table(...)` of six rows (`Cluster 1`…`Cluster 6`), each `{Order, Name, StartMonth, StartYear, EndMonth, EndYear}` derived from consecutive milestone-date pairs on `gblSelectedProject` (`'1-Feasibility studies'` through `'Operations start date (COD)'`/`'End Date'`). | Not mutated after `OnStart`; recomputed only by a fresh app load. | `REQUIRES_INVESTIGATION` — likely feeds a cluster/period picker on one or more of the five Cost screens. | No store field or `domain/` helper found under this name. A screen plan needing this must write it as a pure function (candidate location: `src/domain/` alongside `technology.ts`/`yieldStats.ts`, or a screen-local `rules.ts` if only one screen uses it) rather than reintroducing it as global state. |
| `gblAreaWithRegion` (Cost only) | string \| blank | `If(gblSelectedProject.Country.Name = "Italy", Set(gblAreaWithRegion, Switch(Trim(Coalesce(gblSelectedProject.'Area/State/Province'.Name, "")), "Lazio", "Italy_Centre - South", ... 17-way switch ..., Blank())))` — **only ever set when the selected project's country is Italy**; remains unset/blank for every other country. | Not mutated elsewhere found. | `REQUIRES_INVESTIGATION` — almost certainly a tariff/price-zone key for Italian standard-assumption lookups on Revenues or Finance. | No store field. This is project-derived, not truly global, state; a screen plan (most likely `revenues` or `finance`, whichever reads Italian regional tariff assumptions) should port the 17-way `Switch` as a pure function and flag it as Italy-specific business logic, not general navigation state. |

### App metadata, environment, and external links

| Canvas name(s) | Type | Initialization | Consumers | Code App equivalent |
|---|---|---|---|---|
| `gblProjectManagementAppID` (and the misspelled duplicate `gblProjectManagmentAppID`, PM only — both `Set()` from the same `vsb_ProjectManagementAppID` environment variable value in the same `Concurrent(...)` block; the misspelled one is a source defect, not a second value), `gblProjectCostsAppID`, `gblAppVersion`, `gblEnvironmentName`, `gblTenantID`, `gblEnvironmentID`, `gblPMAppURL`, `gblCostAppLaunchUrl`, `gblAnalyticsAppLaunchUrl`, `gblInfoCenterLaunchUrl` | strings | Read from `'Environment Variable Values'` filtered to a fixed list of `'Environment Variable Definition'.'Schema Name'` values (`vsb_ProjectManagementAppID`, `vsb_AppVersion`, `vsb_EnvironmentName`, `vsb_TenantID`, `vsb_EnvironmentID`, `vsb_ProjectCostsAppID`, `vsb_VSBCloudInfoCenterUrl`, `vsb_AnalyticsAppID`, plus the PowerBI/approval-group ones below), collected once into `gblEnvVarsCollection` and then `LookUp()` per key. The launch-URL variables are then built as string concatenations, e.g. `gblPMAppURL = "https://apps.powerapps.com/play/e/" & gblEnvironmentID & "/a/" & gblProjectManagementAppID & "?tenantId=" & gblTenantID`. | Header/version-badge display (`con_cmp_Header_Version_2`, `ico_cmp_Header_Info_2` on App Loading Screen) and cross-app launch links. | `useAppStore.session.env` (`EnvBadge` — `{appVersion, environmentName, infoCenterUrl, pmAppUrl, costAppUrl}`), set via `setEnv()` after `src/platform/bootstrap.ts`'s `bootstrap()` resolves `readEnvironmentVariables()`. `versionLabel()` and `projectStatusVisible()` in `src/domain/session.ts` reproduce the version-badge and environment-conditional-visibility formulas. **`gblAnalyticsAppLaunchUrl` has no field on `EnvBadge`** — flag as a gap if any of the 23 screens needs it (the Analytics App itself is out of scope per `00-workspace-inventory.md`). |
| `gblPowerBIDashboardLink`, `gblPrimarilyApprovalGroupID`, `gblPowerBIGroupID`, `gblProjectOverviewPowerBIReportID`, `gblPortfolioOverviewPowerBIReportID`, `gblPowerBITenantID`, `gblPowerBIReportSection`, `gblAnalyticsAppID` (PM only) | strings | Same environment-variable pattern as above. | `REQUIRES_INVESTIGATION` — none of these were found referenced by name in the sections grepped; they may back a PowerBI-embed surface not among the 23 production screens, or a feature this document's sources did not cover. | **No `EnvBadge` field for any of these.** Before a screen plan assumes it needs one, confirm which (if any) of the 23 screens actually reads a PowerBI dashboard/report id — `00-workspace-inventory.md`'s screen list does not name a PowerBI screen explicitly. |
| `gblProjectApprovalServiceGroupID` (Cost only) | string | `Set(gblProjectApprovalServiceGroupID, LookUp('Environment Variable Values', ... = "vsb_VSBcloudControllingApprovalGroup").Value)`. | Feeds `Office365Groups.ListGroupMembers(gblProjectApprovalServiceGroupID, {'$top': 100}).value` → `colProjectApprovals`, in the same `OnStart`. | No `EnvBadge` field. See **Data sources** below — `Office365Groups` is a live connector call, and its Code App replacement (a `dataClient`/flow wrapper, or a decision to drop this feature) is `REQUIRES_INVESTIGATION`; it does not appear in `src/flows/flowClient.ts`'s `FLOW_REGISTER` scope as read here. |
| `colAnalyticsAppUsers` (PM only) | table | `ClearCollect(colAnalyticsAppUsers, Split(LookUp(envVars, SchemaName = "vsb_AnalyticsAppUsers").Value, ";"))` — despite the `col` prefix this is populated in the same `Concurrent()` as the `gbl*` env-var reads, so it is app-scope state, not a screen-local working collection. | `REQUIRES_INVESTIGATION`. | No equivalent found; likely out of scope (Analytics App is excluded per `00-workspace-inventory.md`). |

### Theme, sizing, and style constants

| Canvas name(s) | Type | Initialization | Consumers | Code App equivalent |
|---|---|---|---|---|
| `gblAppTheme`, `gblAppThemeJson`, `gblCommandBarThemeJson`, `gblAppSizes`, `gblAppStyles`, `gblAppColors`, `gblAppConstants`, `gblAppResx`, `gblTableApprovalStateColors`, `gblRecordClusterStateAbandoned`, `gblRecordClusterStateInactive` | records / tables | All `Set()` in `OnStart`, derived from the named formulas `varThemePalette`/`AppTheme` and `varCommandBarThemePalette` (see Named formulas below), plus (for the two `gblRecordClusterState*` variables) a `LookUp('Project States', ...)` against literal state names `"Abandoned"` / `"Inactive" in Name`. | Per `appStore.ts` header comment, this whole family maps to `theme/tokens.ts` as **static** design tokens — i.e. these are compile-time constants in the Code App, not runtime state, because the canvas app's theme never actually varies at runtime despite being computed in `OnStart`. 21 combined Harness-Plan hits for the `gblAppStarted`/`gblAppSizes`/`gblReportError`/`gblLeftNavigationSelected` group (see next table) include some of this family's reach. | `src/theme/tokens.ts` (static values) for `gblAppTheme`/`gblAppSizes`/`gblAppStyles`/`gblAppColors`/`gblCommandBarThemeJson`. `navIconColor` in `tokens.ts` (`{incomplete: "#8FBCE4", complete: "#006EB9"}`) is confirmed to carry the completeness-color values used by `LeftNavigationMenu.ItemIconColor` (see Named formulas, and `navItemColor()` in `src/domain/navigation.ts`). **`gblAppConstants`'s numeric option-set values** (`ApprovalState`, `ProjectState`, `ModuleType`, `AquisitionStatus`, `RequestPermission`, `Repowering`, `ApprovalClusterStates`) are ported into `src/data/entities.ts`'s `CHOICE`/`CHOICE_PROCESS`/`CHOICE_PLANT`/etc. objects, not into `tokens.ts` — e.g. `gblAppConstants.ApprovalClusterStates.Abandoned = 952850005` and `.Inactive = 952850006` match `CHOICE_PROCESS.approvalClusterState.abandoned`/`.inactive` in `entities.ts` exactly, so `gblRecordClusterStateAbandoned`/`gblRecordClusterStateInactive` should be looked up by these `CHOICE_PROCESS` values rather than by the literal strings `"Abandoned"`/`"Inactive"` where a screen plan has the choice. **`gblAppResx`'s validation message strings** (`NumericOneDecimals`, `NumericTwoDecimals`, `NumericThreeDecimals`, `Numeric`, `InputBlank`) have no single central home; per §8 of `01-global-architecture.md`, each screen's own `rules.ts` `MSG` object is the correct target — `REQUIRES_INVESTIGATION` on whether `NumericInput`/`PercentageInput`/`CurrencyInput` (`src/components`) already centralize an equivalent, not confirmed by the files read for this document. |

### UI/session flags

| Canvas name | Type | Initialization | Consumers | Code App equivalent |
|---|---|---|---|---|
| `gblAppStarted` | boolean | `Set(gblAppStarted, false)` at the very start of `OnStart`; `Set(gblAppStarted, true)` at the very end (both apps). `Timer1.OnTimerEnd` on the App Loading Screen polls it (`If(gblAppStarted && locLoading, ...)`) to know when to proceed past the loading spinner. | Every screen implicitly depends on it having reached `true` before rendering meaningful data. | Per `appStore.ts` header comment: `gblAppStarted -> bootstrap query isSuccess (not stored)`. There is no store field — `useBootstrap()`'s (`src/platform/bootstrap.ts`) TanStack Query `isSuccess`/`isLoading` state is the replacement, consumed the same way `LoadingOverlay` gates screens per §11 of `01-global-architecture.md`. |
| `gblLeftNavigationSelected` | record | `Set(gblLeftNavigationSelected, First(LeftNavigationMenu))` — both apps, in `OnStart`. Re-set by the App Loading Screen dispatch buttons to `LookUp(LeftNavigationMenu, ItemKey = "GeneralDataCommonKey")` on a project deep-link. | Drives which rail item renders "selected." | Per `appStore.ts` header comment: `gblLeftNavigationSelected -> ui.selectedNavKey`. `useAppStore.ui.selectedNavKey`, set via `setSelectedNavKey()`. |
| `gblLeftNavigationMenuIsExpanded` | boolean | `Set(gblLeftNavigationMenuIsExpanded, true)` — both apps. | Rail collapse/expand toggle. | Per `appStore.ts` header comment: `gblLeftNavigationMenuIsExpanded -> ui.navExpanded`. `useAppStore.ui.navExpanded` (default `true`, matching the canvas), `setNavExpanded()`/`toggleNav()`. |
| `gblShowReportProblemPanel` | boolean | Not initialized in either `OnStart`; first created implicitly by `Set(gblShowReportProblemPanel, true)` inside the header's "Report Problem" `CommandBar.OnSelect` on the App Loading Screen. Canvas allows a global to spring into existence this way; treat its effective default as blank/falsy until first set. | Toggles `cmp_ReportErrorRightPanel`. | Per `appStore.ts` header comment: `gblShowReportProblemPanel -> ui.reportPanelOpen`. `useAppStore.ui.reportPanelOpen` (default `false`), `openReportPanel()`/`closeReportPanel()`. |
| `gblReportError` | record \| blank | `Set(gblReportError, Blank())` in `OnStart` (both apps); rebuilt by `App.OnError`: `Set(gblReportError, {User: User().Email, ErrorScreen: App.ActiveScreen.Name, ErrorSource: FirstError.Source, ErrorMessage: FirstError.Message, Timestamp: Now()})`, guarded so a `"JSON parsing error"` is swallowed (`Blank()`) rather than surfaced (PM only has this guard; Cost's `OnError` has no such guard). The commented-out `Notify(...)` call directly below in both apps' `OnError` confirms `01-global-architecture.md` §11's note that error banners are intentionally not wired. | Drives the warning icon's visibility on the header (`pcf_HeaderContainerReportError_WarningIcon_2.Visible = !IsBlank(gblReportError)`) and the report panel's content. | Per `appStore.ts` header comment: `gblReportError -> ui.lastError`. `useAppStore.ui.lastError` (`ReportErrorRecord \| null` from `src/platform/errors.ts` — `{user, errorScreen, errorSource, errorMessage, timestamp}`, camelCased from the canvas record), set via `setLastError()`/`openReportPanel(e)`. `toReportError(appError, user, screen)` in `errors.ts` is the direct port of the `App.OnError` record-building formula. **The PM `"JSON parsing error"` swallow-guard is not visibly reproduced** in `errors.ts`'s `toAppError()` — flag as `REQUIRES_INVESTIGATION` if a screen plan hits spurious JSON-parse error reports. |
| `gblProjectHeaderData` | record | Not set in PM's `OnStart` at all — only inside the App Loading Screen's two hidden dispatch buttons: `Set(gblProjectHeaderData, {ID, Name, Technology, Capacity, Status, Approval})`. Cost's `OnStart` sets a **narrower** version directly: `{ID, Name, Technology, Approval}` (no `Capacity`/`Status`). This is a real shape divergence between the two apps' initial value, not just a timing difference. | Rebuilt on every project deep-link (PM) / at Cost app load. | Per `appStore.ts` header comment: `gblProjectHeaderData -> derived selector, not stored`. `selectProjectHeader(s)` in `appStore.ts` computes `{id, name, technology, capacity, status, approval}` from `project.selected` on demand (memoized against the source record — see the "one-level structural comparison" note in the file, added specifically to avoid a React #185 infinite-render loop), exposed via `useProjectHeader()`. This is the full, PM-shaped set of fields; Cost screens that only had `{ID, Name, Technology, Approval}` available get the extra two fields for free rather than needing a second, narrower selector. |
| `gblProduction` | boolean | `Set(gblProduction, true \| false)` based on whether `Host.Version` is blank or fails to match `"PowerApps-Studio"` — i.e. "am I running inside Studio (false) or as a published app (true)." PM only. | `REQUIRES_INVESTIGATION` — not found referenced elsewhere in the files read. | No store field. The Code App's equivalent distinction is `VITE_DATA_MODE` (`"mock"` vs `"power"`, `src/platform/powerClient.ts`'s `dataMode`), which is a build/runtime-config concept, not user-facing state; do not port `gblProduction` as a new store field without confirming a screen actually branches on it. |
| `gblTextParamProjectId` | string | `Set(gblTextParamProjectId, Param("projectid"))` — a raw snapshot of the launch parameter, PM only. | See **Navigation state**. | No store field — the Code App reads the route/query parameter directly (`react-router-dom` `useParams`/`useSearchParams`) each time rather than snapshotting it into global state; see Navigation state below. |

---

## Context variables

Nearly every `UpdateContext({loc...})` in both apps is screen-local (a `loc*` variable scoped to
one screen's controls) and is out of scope for this document per the task brief — those are
documented per screen plan (`01-global-architecture.md` §16: "Context variable → local
component state or `rules.ts`-derived value, per screen plan §8").

**One context variable found with app-scope, cross-screen relevance:** the App Loading Screen's
`OnVisible` sets `locLoading` (`UpdateContext({locLoading: false})`, later `true`) and three
Fabric-SQL-batching helpers (`locLastRowGermany`, `locLastRowFrance`, `locBatchSize`,
`locAbsoluteMax`, `locStartPoint`, `locEndPoint`) used to batch-`Collect` `colAssumptionsGermanyTaxSQL`/
`colAssumptionsFranceSQL` in pages of 2,000 rows. `locLoading` is cross-screen in effect because
`Timer1.OnTimerEnd` (same screen) gates the app's loading spinner on `gblAppStarted && locLoading`
— i.e. the loading screen does not dismiss until **both** `App.OnStart` has finished **and** this
screen's own `OnVisible` batch-load has finished. This is a real sequencing dependency a screen
plan for `app-loading` must reproduce (its Code App equivalent is not confirmed in the files read
for this document — `REQUIRES_INVESTIGATION` against `src/features/app-loading/` if that feature
folder exists, since the harness notes app-loading has neither `hooks.ts` nor `rules.ts` per
`01-global-architecture.md` §3).

No other context variable was found to have cross-screen relevance in the sources read. Per-screen
`loc*` variables are the responsibility of each screen's own plan.

---

## Collections

Collections initialized or populated in `OnStart` (via `Collect`/`ClearCollect`), grouped by
purpose. Screen-local working collections created inside a screen's own `OnVisible` (e.g. the
App Loading Screen's `colAssumptionsGermanyTaxSQL`/`colAssumptionsFranceSQL` batching collections
mentioned above) are out of scope here per the task brief and belong to that screen's plan;
they are named above only because their *sequencing* (via `locLoading`) is cross-screen.

### Role and team resolution (both apps, near-identical logic)

`colCurrentUserTeamsDirect`, `colCurrentUserSystemsDirect`, `colCurrentUserTeamsDirectTemp`,
`colAllCurrentUserTeamsRoles`, `colCurrentUserRoles`, `colCurrentUserTeamsRoles`,
`colAllCurrentUserRoles`, `colDistinctCurrentUserTeamsRoles`, `colUserCountries`.

**Initialization:** `colCurrentUserTeamsDirect`/`colCurrentUserSystemsDirect` are `ClearCollect`'d
directly from `LookUp(Users, ...).{'Teams (teammembership_association)', 'Security Roles
(systemuserroles_association)'}`. The rest are built inside an `IfError(...)` block: direct roles
are reshaped to `{BussinessUnit, Name, Country, UniqueID}` (`colCurrentUserRoles`), team roles are
resolved by walking `colCurrentUserTeamsDirect` one team at a time with `ForAll`+`Remove` (an
imperative loop, not a delegatable query) into `colAllCurrentUserTeamsRoles` then reshaped into
`colCurrentUserTeamsRoles`; both are filtered to `StartsWith(Name, "VSB")` and unioned into
`colAllCurrentUserRoles`, then de-duplicated into `colDistinctCurrentUserTeamsRoles`.
`colUserCountries` is filtered from `colDistinctCurrentUserTeamsRoles` to the two country-scoped
role names (`"VSB - Project Manager Own Projects"`, `"VSB - Project Data Own Country"`) with a
non-blank `Country`, projected to `{id, name}`.

**Consumers:** all `gblCurrentUser` role flags and `EditableCounties`/`EditableCountiesAsString`.

**Code App equivalent:** this is the single most directly and completely ported cluster in the
whole document. `src/platform/bootstrap.ts`'s `readRoles(userId)` does the two independent reads
(direct + team-derived) concurrently instead of the canvas's sequential `ForAll`+`Remove` loop;
`unionVsbRoles(direct, viaTeams)` and `deriveCountryScope(roles)` in `src/domain/session.ts` are
the pure, unit-tested replacements for the `StartsWith(Name, "VSB")` filter/union and the
country-scope projection, respectively. No collection survives as such — the union and scope are
computed once per session and folded into `CurrentUser.roles`/`.editableCountries`.

### Reference/lookup collections (unfiltered, unprojected — a delegation anti-pattern per §4)

`colRevenueSubaccounts`, `colCustomChoiceValues`, `colMilestonesAssumptions`,
`colPVModulesSuppliers`, `colInverterSuppliers`, `colSubstructuresSuppliers`, `colCapexAccounts`,
`colCapexAccountCategories`, `colCapexProjectContracts` (**PM's** version —
`ClearCollect(colCapexProjectContracts, 'CAPEX Project Contracts')`, i.e. **every** contract in
the table, unfiltered by project), `colFinancingCategories`, `colDevelopers`, `colMapLocation`,
`colFilterOperators`.

**Code App equivalent:** per `01-global-architecture.md` §4 rule 1, none of these should be
ported as a client-materialized collection — each is a `useQuery` with a server-side `$filter`/
`$select` scoped to what the consuming screen actually needs, via a `repos.ts` repository. Most of
the underlying tables already have one: `milestoneRepo`/`milestoneAssumptionRepo`,
`revenueSubaccountRepo`, `capexAccountRepo`/`capexAccountListRepo`, `financingCategoryRepo`,
`customChoiceValueRepo`/`customChoiceValueFullRepo`, `capexProjectContractRepo` (all confirmed
present in `src/data/repos.ts`). **`colPVModulesSuppliers`/`colInverterSuppliers`/
`colSubstructuresSuppliers`** read the raw catalogue tables `PVModules`/`Inverters`/
`Substructures` (confirmed as `vsb_PVModule`/`vsb_Inverter`/`vsb_Substructure` in
`dataverse-entities.json`) — **`entities.ts`'s `ES`/`ES_PLANT` has no entity-set constant for
these three raw catalogues** (only their `...TypeInProjects` join tables are modeled). A screen
plan needing them (most likely `generators`) must add `ES.pvModules`/`ES.inverters`/
`ES.substructures` per the named exception in `01-global-architecture.md` §4 rule 4. `colDevelopers`
duplicates the `Developers` named formula in the Cost app (see Named formulas) with a different,
overlapping e-mail list — a second hard-coded allow-list; `DEVELOPERS` in `src/domain/session.ts`
already ports the Cost app's `Developers` list, not this PM `colDevelopers` collection, and the
two lists disagree (PM's has 18 entries including `shakti.singh@vsb.energy`, `rounak.mathur@...`,
etc.; Cost's `Developers`/`DEVELOPERS` has 10). **Flag as `REQUIRES_INVESTIGATION`**: confirm which
list (if either, or a union) a given screen plan should treat as authoritative before adding to
`DEVELOPERS`.

### Project Main filter/paging state (seeded at app scope despite Project Main not being either app's start screen)

`colFiltersOverview` (a single-row "settings" collection: `IsApplied`, `ProjectKeyword`,
`ProjectManager`, `Country`, `Area`, `Technology`, `Capacity`, `CapacityOperator`,
`ProjectStatus`, `TotalRows`, `TotalPages`, `PageSize: 200`, `Page: 1`, `GridEvent`, `SortCol:
"vsb_projectname"`, `SortAsc: true`), `colFilteredProjects` (`ClearCollect(colFilteredProjects,
Blank())` — placeholder, populated later by Project Main itself), `colProjectManagers`/
`colProjectManagersPreSelected` (people-picker working collections), `colFormValidation`/
`colProcessingSteps`/`colStepsCompleted` (each seeded with a single `Collect(col, Blank())` —
a canvas idiom for "declare this collection's shape early"; effectively dead until a screen
populates them for real).

**Code App equivalent:** per the task brief's screen-local-collection exclusion, full detail
belongs to the `project-main` screen plan. Noted here only because these are, unusually,
populated at `App.OnStart` rather than the consuming screen's `OnVisible` — a canvas quirk worth
calling out so a screen plan does not miss that this state's *initial* shape is set one level
higher than the screen itself. `src/data/queryKeys.ts`'s `qk.projects.page(filter, sortCol,
sortAsc, page, pageSize)` key shape already mirrors `colFiltersOverview`'s sort/paging fields,
confirming the intended replacement is a `useQuery` keyed the same way, with local component
state (not a global) for the filter form fields themselves.

### Cost app's Capex-Costs-screen bootstrap collections (seeded at app scope because Capex Costs Screen is the Cost app's `StartScreen`)

`colProjectApprovals`, `colProjectApprovalsExtended`, `colProjectCountryApprovals`,
`colOpexAccounts`, `colOpexSubaccounts`, `colLandLeaseSubaccounts`, `colCapexAccountCategoriesNew`,
`colCapexAccountsNew`, `colCapexSubaccountsNew`, `colCapexProjectContracts` (**Cost's** version —
`Filter('CAPEX Project Contracts', Project.Project = gblSelectedProject.Project)`, i.e. scoped to
the selected project only; **note the name collision with PM's unfiltered `colCapexProjectContracts`
above** — the two apps never run in the same execution context so there is no runtime collision,
but a reader cross-referencing both apps' source must not assume the same name means the same
contents), `colCapexCosts`, `colContractDistributionTypes`, `colContractDistributionScheme`,
`colCostPaidType`, `colCapexSummaryCategories`, `colDevexCapexSummaryView`.

**Code App equivalent:** the `Batch F` block of `entities.ts` (`ES_COST`, `CHOICE_COST`) already
models these tables (`capexAccountLists`, `capexProjectContracts`, `capexCosts`, `opexAccounts`,
`opexSubaccounts`, `landLeaseSubaccounts`, etc.), and `costCapexAccountRepo`/`costCapexContractRepo`/
`costCapexCostRepo`/`opexAccountRepo` exist in `repos.ts`. Per §4 rule 1, the Code App must not
reproduce the canvas's app-level unfiltered/broadly-filtered `ClearCollect` — each should become
a project-scoped `useQuery` inside the `capex-costs` screen's own `hooks.ts`, keyed via
`qk.child(table, projectId)`. Full detail belongs to the `capex-costs` screen plan; listed here
only for completeness, since these are technically populated in `App.OnStart`, not in the screen's
own `OnVisible`.

---

## Named formulas

Both apps declare named formulas in `App.Properties.Formulas` (`Name = expression;` syntax, no
`Set`/`Collect`). **These do exist** — a screen plan must not assume this section is empty.

| Canvas name | App | Expression (summary) | Code App equivalent |
|---|---|---|---|
| `varThemePalette` (PM) / `AppTheme` (Cost) | both | A ~35-key Fluent-palette-shaped record (`themePrimary: "#006eb9"`, `akzent1`–`akzent6`, `Grayscale00`–`Grayscale50`, `Error`, `Success`, `Warning`, `Green`/`GreenDark`/`GreenLight`, etc.). Consumed by `gblAppTheme`/`gblAppStyles`/`gblAppColors` in `OnStart`. | `src/theme/tokens.ts` (static design tokens) — see the Theme/style row above. |
| `varCommandBarThemePalette` | PM only | A second, blue-accented palette variant used only to theme the PowerCAT `CommandBar` control (`neutralPrimary: "#0078D4"` = "MAIN TEXT COLOR (blue)", per its own inline comment), fed into `gblCommandBarThemeJson`. | `src/theme/tokens.ts` or the shared `CommandBar` component's own styling (`src/components`) — since the target `CommandBar` is a native Fluent UI v9 component per §7 of `01-global-architecture.md`, this second palette likely collapses into the one design-token set rather than staying a distinct theme. `REQUIRES_INVESTIGATION` if any screen plan finds a visible color mismatch against the reference screenshots. |
| `varCurrentUserProfile` | both | `RenameColumns(LookUp(Users, ...EntraObjectId), 'Azure AD Object ID' -> Id, 'Full Name' -> DisplayName, 'Primary Email' -> Mail, 'Job Title' -> CompanyName)`. | `bootstrap.ts`'s `profile` object (`{id, displayName, mail, companyName, language}`), built from the SDK's `readEnvironment()` context rather than a `Users` lookup (mock mode) / the SDK's own user context (power mode). |
| `varCurrentUserPPickerRecord` | PM only | `RenameColumns(AddColumns(LookUp('Microsoft Entra IDs', ...), PersonaImgUrl, ""), Id -> PersonaKey, 'Display Name' -> PersonaName, Mail -> PersonaRole)` — the people-picker-shaped projection of the current user. | No direct equivalent found; a native people-picker (per §15 of `01-global-architecture.md`, built on Fluent's `Combobox`/`Persona`) would source its "current user" default from `useCurrentUser()` directly rather than a separately-shaped record. |
| `varCurrentUserRoles` | PM only | `(LookUp(Users, ...).'Security Roles (systemuserroles_association)').Name` — a bare list of role names, superseded by the fuller `colCurrentUserRoles`/`colDistinctCurrentUserTeamsRoles` pipeline in `OnStart`. | Superseded the same way in the Code App — `CurrentUser.roles` (`session.ts`) is the union, not this direct-only list. |
| `LeftNavigationMenu` | both | A `Table(...)` of nav-rail rows, each `{ItemKey, ItemDisplayName, ItemIconName, TargetScreen, ItemVisible, ItemEnabled, ItemIconColor}`, where `ItemIconColor` is `If(IsBlank(<prerequisite field on gblRecordSelectedProject/gblSelectedProject>), "#8FBCE4", "#006EB9")` — a **data-completeness** indicator, not a selection indicator. PM has 10 rows (General → Milestones → Generator → Production → Cluster Check List → Project Team → Planning → Grid Operator → Revenue → Finance); Cost has 7 rows (DEVEX/CAPEX, OPEX parent, O&M, Land Lease, Other OPEX, Contracts, Total Summary [disabled/invisible]). | `PM_NAV` and `COST_NAV` in `src/domain/navigation.ts`, verified to match the canvas row order, keys, icons, routes, and — critically — each row's exact prerequisite field (`navItemColor()` reproduces the `#8FBCE4`/`#006EB9` logic via `navIconColor` in `tokens.ts`). A commented-out `ItemVisible: gblEnvironmentName in ["Dev","Nightly","QA"]` on PM's `FinanceKey` row is dead code in the canvas source (commented out) and correctly not reproduced. |
| `LeftAdminNavigationMenu` | PM only | A `Table(...)` of 8 rows for the admin section (`GatesKey`/`GatesSettingKey`/`GatesApprovalsKey`/`CAPEX AccountsKey` under one parent, `StandardAssumptionsKey`/`MilestonesSettingsKey`/`CostSettingKey`/`ContractSettingKey` under another), every row's `ItemVisible` = `Or(gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`. | `PM_ADMIN_NAV` in `navigation.ts`, matching row-for-row; `canSeeAdminSection()` in `session.ts` is the direct port of the `Or(...)` visibility idiom, called out in `01-global-architecture.md` §9 as one of only three legitimate remaining role-flag reads. |
| `varUserCanEditCost` | PM only | A literal 18-entry e-mail allow-list (`alexander.pilevski@vsb.energy`, ..., `shakti.singh@vsb.energy`, ...). | **Not the same list as `DEVELOPERS`** in `session.ts` (see the `colDevelopers` note above) — `REQUIRES_INVESTIGATION` on which screen(s) gate cost-editing on this specific list, since its name suggests a genuine authorization check (distinct from the `Developers`/`colDevelopers` dev-tooling lists) that `01-global-architecture.md` §9's "never derive a privilege from a role name/email list" rule would flag as needing a real Dataverse privilege check instead. |
| `colYearsForDuration`, `colMonthsForDuration`, `colFrequencyInMonths` | PM only | `ForAll(Sequence(100), ...)` / `ForAll(Sequence(12), ...)` generated `{Name, Value}` picklists ("0 years"/"1 year"/"2 years"/...), plus a literal 5-row `{1,2,3,6,12} Months` table. | `DISTRIBUTION_FREQUENCY` in `entities.ts` already ports the 5-row months table exactly (confirmed identical to Cost's `colDistributionFrequency`, see below). The two `Sequence`-generated duration pickers have no confirmed Code App equivalent; likely a small pure generator function in whichever screen plan uses a duration dropdown (`admin-milestones` is the most likely candidate, given `Milestones Standard Assumptions`' `average duration [years]`/`[months]` rows). |
| `varCommentIcon` | PM only | A literal inline SVG string (a chat-bubble icon) used as a control's `Image`/HTML source. | No equivalent needed — the Code App uses `@fluentui/react-icons` components directly (per §7 of `01-global-architecture.md`), not inline SVG strings. |
| `EmptyGUID` | both | `GUID("00000000-0000-0000-0000-000000000000")`. | No named constant confirmed in the files read; a screen plan comparing a lookup field against "no value" should use `null`/`undefined` checks per TypeScript convention rather than a sentinel GUID string, unless a specific Dataverse write path is found to require the literal empty GUID. |
| `gblCommandBarSurfaceThemeJson` | PM only | `JSON(Patch(varThemePalette.palette, {white: "#00000000", neutralLighterAlt: "#00000000", neutralLighter: "#0000000F", neutralLight: "#0000001F", neutralQuaternaryAlt: "#0000001F"}), JSONFormat.IndentFour)` — despite the `gbl` prefix, this is declared under `Formulas:`, not `Set()` in `OnStart`, so it recalculates reactively rather than being a mutable variable. Used to theme the PowerCAT `CommandBar`'s surface so bar chrome reads as transparent/overlay. | Covered by the native Fluent `CommandBar` styling in `src/components`, not a JSON theme string; see the `varCommandBarThemePalette` note above. |
| `Developers` | Cost only | A literal 10-entry e-mail `Table` (`{Mail: "..."}` rows). | `DEVELOPERS` in `src/domain/session.ts`, ported verbatim (10 entries, confirmed identical) — used by `CurrentUser.isDeveloper` (`DEVELOPERS.includes(profile.mail)`). The file's own comment flags moving this to an environment variable before go-live. |
| `DefaultProjectCostsMarginValue` | Cost only | `= 10`. | **Confirmed dead code** — `entities.ts`'s `DEAD_CAPEX_MARGIN` constant documents that this named formula, and the `'Capex Project Cost Margins'` table it implies, are referenced by no control anywhere in the Cost app's `Src/` and must not be re-implemented as a "port"; any CAPEX margin feature is a new requirement, not a migration item. |
| `colDistributionFrequency` | Cost only | A literal 5-row `{ID, Value, Label}` table (`1 month`…`12 months`, note `ID 4 -> 6 months`, `ID 5 -> 12 months` — the `ID` is not the `Value`). | `DISTRIBUTION_FREQUENCY` in `entities.ts`, ported verbatim including the `id`≠`value` gap; the file's own comment notes the Opex screen does not even use this named formula, redeclaring the same 5 rows inline as `locColDistributionFrequency` instead — a screen plan for `opex-costs` should use the one `DISTRIBUTION_FREQUENCY` constant for both, not two divergent copies. |

---

## Data sources

**Dataverse.** Both apps connect to the same Dataverse environment (`DatasetName: "default.cds"`
throughout both `DataSources.json` files) via `NativeCDSDataSourceInfo` entries. Grepping each
file for that marker (rather than reading the ~512 KB files in full) surfaced 82 distinct entity
sets referenced by the PM app and 37 by the Cost app (heavy overlap on the shared master-data and
project tables); `dataverse-entities.json` separately catalogues 83 entities from the solution's
own `customizations.xml` export (`schemaName`/`logicalName`/`entitySetName`/
`primaryIdAttribute`) as the metadata ground truth. The table below lists the tables most tied to
**global** state (session, navigation, environment) rather than every table either screen suite
touches — per-screen data contracts belong in each screen's own plan. Every logical name below
comes from `dataverse-entities.json`, not from de-pluralizing a canvas display name, so none of it
carries the "40 of 85 unverified" caveat `01-global-architecture.md` §12 raises for other tables —
these specific ones are confirmed metadata, though still an export snapshot, not a live-environment
read (§12 applies to the *live-environment* claim regardless).

| Display name (canvas) | Logical name | Entity set | Primary key | Code App entity-set constant | Repository |
|---|---|---|---|---|---|
| Projects | `vsb_project` | `vsb_projects` | `vsb_projectid` | `ES.projects` | `projectRepo` (list projection), `projectFullRepo` (detail projection) |
| Countries | `vsb_country` | `vsb_countries` | `vsb_countryid` | `ES.countries` | `countryRepo` |
| Country Areas | `vsb_countryarea` | `vsb_countryareas` | `vsb_countryareaid` | `ES.countryAreas` | `countryAreaRepo` |
| Users (systemuser) | `systemuser` | `systemusers` | `systemuserid` | `ES.users` | none confirmed by name in `repos.ts`'s skim — read directly via `dataClient.list`/role queries in `bootstrap.ts` |
| Roles | `role` (per `matrix.json`'s `logicalName` for the `roles` row) | `roles` | — (not in `dataverse-entities.json`; it does not catalogue the out-of-box `role` table) | `ES.roles` | read directly in `bootstrap.ts`'s `readRoles()`, not via a named `repos.ts` repository |
| Teams | `team` | `teams` | — (not in `dataverse-entities.json`) | `ES.teams` | read directly in `bootstrap.ts`'s `readRoles()` (team-derived role path) |
| Business Units | — (not in `dataverse-entities.json`; confirmed present as `businessunits` in both apps' `DataSources.json`) | `businessunits` | `businessunitid` (Dataverse convention; `REQUIRES_INVESTIGATION` to confirm against metadata) | no `ES` constant found | none confirmed — the ownership-write contract in `01-global-architecture.md` §9 (`owningbusinessunit@odata.bind`) depends on this table's id, so a screen plan with a `projectData`-kind create path must confirm this entity set directly against a live environment before shipping |
| Environment Variable Definitions | — | `environmentvariabledefinitions` | `environmentvariabledefinitionid` | `ES.environmentVariableDefinitions` | read directly in `bootstrap.ts`'s `readEnvironmentVariables()` (power mode) |
| Environment Variable Values | — | `environmentvariablevalues` | — | `ES.environmentVariableValues` | read directly in `bootstrap.ts`'s `readEnvironmentVariables()` (both modes) |
| Custom Choice Values | `vsb_customchoicevalue` | `vsb_customchoicevalues` | `vsb_customchoicevalueid` | not in the base `ES` block (`REQUIRES_INVESTIGATION` — check `SELECT`/other batches) | `customChoiceValueRepo`, `customChoiceValueFullRepo` |
| Microsoft Entra IDs | — (not in `dataverse-entities.json`; confirmed as a live PM data source only by the `varCurrentUserPPickerRecord` formula, not by a `DataSources.json` grep hit in the excerpt captured) | `vsb_microsoftentraids` (per `entities.ts` comment: "the people-picker source on General Data and Team") | `REQUIRES_INVESTIGATION` | `ES.microsoftEntraIds` | `entraIdRepo`, `adminEntraIdRepo` |
| Milestones Standard Assumptions | `vsb_milestonesstandardassumptions` | `vsb_milestonesstandardassumptionses` | `vsb_milestonesstandardassumptionsid` | `ES.milestonesStandardAssumptions` / `ES_ADMIN.milestonesStandardAssumptions` / `ES_COST.milestonesStandardAssumptions` (same string, three names) | `milestoneAssumptionRepo`, `milestoneStandardAssumptionRepo` |
| Revenue Subaccounts | `vsb_revenuesubaccount` | `vsb_revenuesubaccounts` | `vsb_revenuesubaccountid` | `ES.revenueSubaccounts` | `revenueSubaccountRepo` |
| Project States | `vsb_projectstate` | `vsb_projectstates` | `vsb_projectstateid` | `ES.projectStates` | `projectStateRepo` |
| Cluster States | — (not in `dataverse-entities.json`; confirmed live in both `DataSources.json`s and `matrix.json`) | `vsb_clusterstates` | `REQUIRES_INVESTIGATION` | `ES.clusterStates` / `ES_COST.clusterStates` | `clusterStateRepo` |

**Connectors.** Grepping both apps' `DataSources.json` for `"Type": "ServiceInfo"` (connector/flow
service declarations, distinct from `NativeCDSDataSourceInfo` table sources) surfaces:

- **PM app:** `Office365Users`, `SpatialServices`, plus five `ConnectedWadl` flow services
  (`Requestpermissioncancellation`, `RequestModulePermission`,
  `PerformRequestofGateApprovalCancellation`, `PerformCommonRequestofGateApproval`,
  `PerformCommonRequestofCheckListApproval`, `PerformRequestofCheckListApprovalCancellation` —
  six, not five; recount if a screen plan needs the exact list). These flow-shaped connectors are
  the domain of `04-flow-inventory.md` and `src/flows/flowClient.ts`'s `FLOW_REGISTER`, not this
  document — three of the six (`Requestpermissioncancellation`,
  `PerformRequestofGateApprovalCancellation`, `PerformRequestofCheckListApprovalCancellation`) are
  the ones `01-global-architecture.md` §6 earmarks for replacement by a Dataverse custom API.
  `Office365Users` and `SpatialServices` are true connectors (not flows); no reference to either
  being *called* from a formula was found in the files read for this document —
  `REQUIRES_INVESTIGATION` per-screen if a screen plan finds a live call site.
- **Cost app:** `Office365Groups` only, actively called in `App.OnStart`:
  `Office365Groups.ListGroupMembers(gblProjectApprovalServiceGroupID, {'$top': 100}).value` →
  `colProjectApprovals`. **No Code App equivalent found** — `dataClient`
  (`src/platform/dataClient.ts`) is scoped to Dataverse (`list`/`getById`/`getOne`/`create`/
  `update`/`remove`/`batch`/`callAction`) per §4 of `01-global-architecture.md`, and this is a
  Microsoft Graph-backed Office 365 Groups call, not a Dataverse operation. Flag as
  `REQUIRES_INVESTIGATION`: either a new platform-level wrapper is needed for this one Graph call,
  or the feature it backs (`colProjectApprovals`/`colProjectApprovalsExtended`/
  `colProjectCountryApprovals` — approval-group membership, apparently for a not-yet-located
  approvals feature) needs to be traced to a specific screen before deciding.

**Fabric/SQL "connected" sources.** `entities.ts` documents several table names
(`ES.assumptionsRevenues`, `ES.assumptionsLocalTaxGermanies`/`Frances`,
`ES_FINANCE.assumptionsDebt`/`assumptionsBanks`/`assumptionsKfwTranches`,
`ES_COST.assumptionsBopContracts`) as assumed Dataverse-mirrors of what are, in the canvas apps,
direct Fabric/SQL Server connections (`Assumptions Revenues SQL`, `Assumptions Local Tax
Germanies`/`Frances`, `Assumptions Debt SQL`, `Assumptions Banks SQL`,
`AssumptionsKfWTrancheSQL`, `Assumptions BoP Contracts`) — per `01-global-architecture.md` §12 and
these `entities.ts` comments, this mirror assumption is **not verified** and each name is marked
`REQUIRES_INVESTIGATION` in its own file already; this document does not relax that. `dataverse-
entities.json` does **not** list any of these seven names among its 83 entities, which is
consistent with (but does not prove or disprove) their being genuinely external, un-mirrored SQL
sources rather than Dataverse tables — the classification these `entities.ts` comments assume.

---

## Roles/permissions

Five roles, four enforcement layers — the full model is `01-global-architecture.md` §9 and
`vsbcode/docs/SECURITY.md`; `src/security/matrix.json` (5 roles × 85 tables, `kind` values
confirmed present: `masterData`, `projectData`, `platform`, plus `reference`/`connected` per
§9/§12 of the architecture doc) is the single source of truth for the matrix itself and is not
reproduced here.

**Canvas-side role model, as read from `App.OnStart` in both apps:**

- `gblCurrentUser.IsApplicationAdministrator` — `Not(IsBlankOrError(First(Filter(
  colDistinctCurrentUserTeamsRoles, Name = "VSB - Application Administrator"))))`
- `gblCurrentUser.IsControllerOwnData` — same pattern, `"VSB - Controller Own Data"`
- `gblCurrentUser.IsProjectDataAllCountries` — same pattern, `"VSB - Project Data All Countries"`
- `gblCurrentUser.IsControlling` — hard-coded `false` in both apps' `OnStart`; never computed from
  role data. **Dead/unused field**, not ported (correctly — `session.ts`'s `CurrentUser` has no
  `isControlling` field).
- No `IsProjectDataOwnCountry` or `IsProjectManagerOwnProjects` flag is built onto `gblCurrentUser`
  in either app's `OnStart` — these two roles are only ever consulted via
  `colDistinctCurrentUserTeamsRoles`/`colUserCountries` for the country-scope derivation, not as a
  boolean flag on the user record.
- Nav-hiding idiom, repeated on every `LeftAdminNavigationMenu` row's `ItemVisible`: `Or(
  gblCurrentUser.IsApplicationAdministrator, gblCurrentUser.IsControllerOwnData)`.

**Code App mapping**, all confirmed in `src/domain/session.ts`:

- `VSB_ROLES` names the same five roles verbatim (including the two — `projectDataOwnCountry`,
  `projectManagerOwnProjects` — the canvas never flags onto `gblCurrentUser` directly but does use
  for country scoping).
- `buildCurrentUser()` sets `isApplicationAdministrator`/`isControllerOwnData`/
  `isProjectDataAllCountries`/`isProjectManagerOwnProjects` from the resolved role-name set —
  **the Code App additionally exposes `isProjectManagerOwnProjects` as a flag**, which the canvas
  version of `gblCurrentUser` does not have; this is a superset, not a divergence a screen plan
  needs to reconcile.
- `canSeeAdminSection(u)` = `u.isApplicationAdministrator || u.isControllerOwnData` — the exact
  `Or(...)` port, explicitly documented in `session.ts` as **UI hiding, not security** (SOURCE
  DEFECT reproduced deliberately, per its own comment), consistent with `01-global-architecture.md`
  §9's Layer 1 characterization.
- `canEditCountry(u, countryId)` is the Code App's **new** country-scope check (`u.
  isProjectDataAllCountries || u.isApplicationAdministrator`, else membership in `u.
  editableCountries`) — there is no single canvas formula this was extracted from verbatim; it
  generalizes the `colUserCountries` membership check that canvas screens presumably inline
  per-screen. A screen plan using it should still confirm its own canvas screen's actual country
  check matches this generalization.
- `IsControlling` is correctly **not** ported (see above — dead canvas field).
- Real enforcement is Dataverse role privileges (`matrix.json` → `apply-roles.mjs`) and column
  security (`columnSecurityProfiles` → `apply-columnsecurity.mjs`), neither of which any canvas
  formula read in this document's sources touches directly — that boundary is server-side by
  construction in both the canvas app and the Code App alike.

---

## Navigation state

**The selected-project global.** See the "Selected project and country" table above for the full
initialization/mutation detail of `gblRecordSelectedProject` (PM) / `gblSelectedProject` (Cost).
Restated here because it is also the navigation-state anchor: `useAppStore.project.selected`
(`SelectedProject` in `src/domain/navigation.ts`), refreshed per project-scoped screen by
`useProjectContext()`.

**Launch-parameter contract**, as read from the App Loading Screen and both `App.OnStart`s:

- PM reads `Param("projectid")` (all lower case) in `OnStart`, `gblTextParamProjectId`, and both
  hidden dispatch buttons; the header's redirect button additionally reads `Param("screen")`
  (`Switch(Text(Param("screen")), "general", Navigate('Project General Data Screen', ...),
  "generators", Navigate('Project Generators Screen', ...))`) and `Param("projectId")` (camel
  case) inside its own `Trace(...)` call — **the casing is inconsistent even within one screen's
  formulas** (`projectid` for the `LookUp`, `projectId` inside one `Trace`), which is why
  `resolveLaunchRoute()` (below) should be treated as the authoritative reconciliation, not a
  literal transcription of either casing.
- Cost reads `Param("projectId")` (camel case) once, in `OnStart`, falling back to the hard-coded
  test GUID noted above if blank.
- `01-global-architecture.md` §5 already documents the Code App's route-reconstructibility rule:
  a project-scoped route must accept a `projectId` (path or query parameter) and reload the
  record from it, never relying solely on in-memory `useSelectedProject()` state.

**Code App route/state mapping**, confirmed in `src/domain/navigation.ts`:

- `resolveLaunchRoute(app, params)` reproduces the App Loading Screen's dispatch logic: for
  `app === "cost"` it returns `/costs/capex` unconditionally (matching Cost's `StartScreen:
  'Capex Costs Screen'`); for PM it reads `projectid` and `screen` from `URLSearchParams`, routing
  `"generators"` → `/project/generators`, `"general"`/blank → `/project/general`, anything else
  matched against `PM_NAV`'s route suffixes, and — where no `projectid` is present at all —
  `/projects` (Project Main), matching the canvas's "no `projectid` → clear the project globals
  and go to Project Main Screen" branch in `btn_To_Load_Edit_Project`.
- `RequireProject` (route guard, `src/routes/AppRoutes.tsx` per `01-global-architecture.md` §5)
  blocks a project-scoped route with nothing selected, redirecting to `SelectProjectPrompt` — a
  genuinely new failure mode the canvas has no equivalent of (the canvas simply renders a blank
  form against a blank `gblRecordSelectedProject`).
- `NEW_PROJECT_ROUTE` (`/project/general?new=1`) and `isNewProjectRequest(pathname, search)` are
  the marker-based fix for the one case where `RequireProject`'s new guard would otherwise break a
  working canvas flow: "+ Add Project" navigating to General Data with no project id yet. This is
  new Code App design, not a canvas port — the canvas has no such guard to work around, but the
  guard is judged worth having per `01-global-architecture.md` §5's rationale.
- `useProjectContext()` (`src/features/shared/useProjectContext.ts`) is the shared hook every
  project-scoped screen calls: it resolves `project.selected`, re-fetches the full record via
  `projectFullRepo.getById(id)`, computes `canEdit` via `readPrivileges()` →
  `privileges.forTable(ES.projects)` / `privileges.forRecord(ES.projects, projectId)` (replacing
  `DataSourceInfo(Projects, CreatePermission)` / `RecordInfo(record, EditPermission)`), and
  patches `session.user.canEditSelectedProject` — the direct, single-call replacement for the
  canvas idiom repeated at the top of nearly every project-scoped screen's `OnVisible`.
  **`01-global-architecture.md` §12 point 8 documents a live latent bug in this same file**
  (`readPrivileges`'s `RetrievePrincipalAccess` target used the entity **set** name instead of the
  **logical** name before the current `privileges.forRecord` indirection was introduced) — any
  screen plan touching per-record privileges must reference this and use `privileges.forRecord`,
  not re-implement the call.
- `PM_NAV`/`COST_NAV`/`PM_ADMIN_NAV` and `navItemColor()`/`completionRatio()`/`railTree()` cover
  the rail rendering, completeness coloring, and admin-section tree-flattening — see the
  `LeftNavigationMenu`/`LeftAdminNavigationMenu` rows in Named formulas above for the canvas-side
  detail each of these ports.
