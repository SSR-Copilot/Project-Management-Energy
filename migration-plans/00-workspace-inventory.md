# VSBCloud migration workspace inventory

Inventory date: 2026-09-15. Paths are relative to the workspace root. The inventory was built from file contents, not directory names alone.

## Scope decision

The production migration target is the unified VSBCloud Project application represented by two Canvas apps in the solution:

- **Project Management**, app id `669038ea-7916-4e39-9d2d-21d6f13dab10`: 18 production screens.
- **Project Costs**, app id `5156fb41-43ce-4e95-9a2e-4d77da242d92`: 5 production screens.

Together these are the 23 screens already modeled by `VSBCloud-Code-App-Skeleton/vsbcode/src/app/buildPlan.ts`. The target is one React/TypeScript Power Apps Code App, with project and cost routes sharing session, project context, theme, security, and data services.

Four Canvas screens are deliberately outside the production-screen plan set:

| Canvas app | Screen | Evidence | Disposition |
|---|---|---|---|
| Project Management | `Screen1` | Ad-hoc tables for `Assumptions Revenues SQL` and `Tarrif Price Standard Assumptions`; no `Navigate` target, no behavior event, absent from the production rail and the existing 23-screen build plan. | Developer diagnostic surface. Do not expose in the Code App. Preserve its data-source findings in the Revenues plan. |
| Project Costs | `Screen1` | Scratch controls and collection experiments for OPEX period traversal; no production navigation; absent from the cost rail. | Developer diagnostic surface. Do not migrate as a route. Its period-chain logic is covered by the OPEX plan. |
| Project Costs | `Screen2` | One test button filters `colCapexCostDataToPatch` for cluster 5 and prints JSON; no production navigation. | Developer diagnostic surface. Do not migrate as a route. Its boundary semantics are covered by the CAPEX plan. |
| Gate Concept - Migration Scripts | `Screen1` | Separate app id `b06ca197-5795-411f-a094-6b2019846ea9`; destructive, one-off bulk repair buttons such as deleting invalid projects and converting assumptions. | Operational migration utility, not a user workflow. Keep outside the production Code App. Any future replacement needs a separately authorized, server-side runbook with audit and dry-run controls. |

This exclusion is functional, not based on filenames. All four were inspected. Adding any of them to the product is a new scope decision and must not happen implicitly during a screen implementation chat.

## Workspace classification

| Path | Classification | Evidence and role |
|---|---|---|
| `Existing Solution/VSBCloud (3).zip` | POWER PLATFORM SOLUTION | Unmanaged VSBCloud export containing Canvas apps, 17 workflow definitions, tables, roles, environment variables, plug-in assemblies, connection references, and custom-control dependencies. |
| `ProjectCosts-CodeApp/_extracted/VSBCloud/` | POWER PLATFORM SOLUTION / POWER AUTOMATE / DATAVERSE METADATA | Extracted form of the solution. `customizations.xml`, `solution.xml`, `Workflows/*.json`, `environmentvariabledefinitions/`, `PluginAssemblies/`, and `CanvasApps/` are the primary inspection sources. |
| `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/` | CANVAS APP SOURCE | Extracted Project Management `.msapp`; `Src/App.pa.yaml`, 19 screen YAML files, 16 reusable component/function YAML files, and `References/DataSources.json`. Eighteen screens are production scope. |
| `ProjectCosts-CodeApp/_extracted/msapp/projectcosts/` | CANVAS APP SOURCE | Extracted Project Costs `.msapp`; `Src/App.pa.yaml`, 7 screen YAML files, 11 reusable component/function YAML files, and `References/DataSources.json`. Five screens are production scope. |
| `ProjectCosts-CodeApp/_extracted/VSBCloud/CanvasApps/vsbdev_gateconceptmigrationscripts_6f8b3_DocumentUri.msapp` | OTHER SUPPORTING CANVAS APP | One-screen data-migration/repair utility. Inspected directly as a ZIP; excluded from runtime migration. |
| `Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/` | PCF REPOSITORY / PCF TEST SOLUTION | Source for `vsb_Dev.DevexCapexSummaryPCF`; manifest, TypeScript renderer/parser, CSS, CSV fixture, a solution project, Canvas snippets, and visual/usage guides. |
| `Existing Solution/PCF Git Repo Clones/vsbcloud-pcf-spreadsheet/` | PCF REPOSITORY | Source for `vsb_Dev.SpreadSheet`; React spreadsheet editor, manifest, generated types, CSS, solution packages, and build pipelines. |
| `ProjectCosts-CodeApp/_extracted/VSBCustomComponents/` | POWER PLATFORM SOLUTION / PCF PACKAGE | Extracted managed custom-control solution. Useful for packaged versions and dependencies; source-of-truth behavior is the two Git clones when available. |
| `Existing Solution/UI Screenshots/` | DOCUMENTATION / UI EVIDENCE | PNG screenshots used for visual hierarchy and parity. Some screens have no recording; those plans say so. |
| `ProjectCosts-CodeApp/app/` | CODE APP / REACT APP | Newer Project-Costs-focused Code App. React 19, TypeScript, Fluent UI v9, TanStack Query, generated Power Apps data sources. It is valuable current evidence for the five cost screens but explicitly leaves Project Management on Canvas in its README. |
| `VSBCloud-Code-App-Skeleton/vsbcode/` | CANONICAL UNIFIED CODE APP ARCHITECTURE | Existing 23-screen unified React/TypeScript architecture. Its phase folders, routes, state, repositories, security matrix, flow wrappers, pure rules, and tests define the target conventions for these plans. Existing code is evidence, not permission to skip Canvas-source traceability. |
| `VSBCloud-Code-App-Skeleton/VSBCloud-Harness-Plan.md` | DOCUMENTATION | Measured 23-screen source-to-TypeScript concordance, build order, risks, security findings, key original Power Fx excerpts, and exit gates. |
| `VSBCloud-Code-App-Skeleton/vsbcode/docs/guide*-ui-notes-*.md` | DOCUMENTATION | Screen-recording observations and detailed UI parity notes. |
| `ProjectCosts-CodeApp/reference/dataverse-entities.json` | DATAVERSE METADATA | Display-name/logical-name/entity-set/primary-key inventory. |
| `ProjectCosts-CodeApp/reference/dataverse-attributes.json` | DATAVERSE METADATA | Canvas display-name to Dataverse logical-column map; 717 attributes in the focused repository snapshot. |
| `VSBCloud-Code-App-Skeleton/vsbcode/src/security/matrix.json` | SECURITY / DATAVERSE PLAN | Five roles and the client/server privilege model for 85 tables. It is the proposed single source of truth, but live privileges still require environment verification. |
| `MONDAY-DEMO-IMPLEMENTATION-PLAN.md` | DOCUMENTATION | Supporting delivery plan; not authoritative over current Canvas formulas or metadata. |

## Solution contents

- Canvas app packages: Project Management, Project Costs, and Gate Concept - Migration Scripts.
- Power Automate: 17 JSON workflow definitions in `ProjectCosts-CodeApp/_extracted/VSBCloud/Workflows/`.
- Dataverse: `customizations.xml`, plus normalized entity and attribute references under `ProjectCosts-CodeApp/reference/`.
- Environment variables: app ids, tenant/environment identity, app version, information-center URL, Power BI ids, approval group ids, Fabric SQL server/database/table names, and sync delay.
- Connection references: Dataverse primary, Dataverse, Power Automate management, HTTP with Entra preauthorization, Approvals, Outlook, Office 365 Groups, Office 365 Users, Mail, Teams, Azure DevOps, and Fabric SQL.
- Plug-ins/custom APIs: extracted assemblies in the solution; proposed definitions and handler skeletons under `VSBCloud-Code-App-Skeleton/vsbcode/solution/`.

## Canvas application files

### Project Management

- App definition: `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/App.pa.yaml`.
- Metadata: `Properties.json`, `Header.json`, `References/DataSources.json`, `References/QualifiedValues.json`, and `Resources/PublishInfo.json`.
- Design: 1366 x 768 landscape; scale-to-fit off; Canvas data-row ceiling 2,000; third-party PCFs enabled.
- Start screen: `App Loading Screen` (resolved through app bootstrap and launch parameters).
- Shared Canvas units: `cmp_Header`, `cmp_Left_Navigation`, `cmp_User_Badge`, confirmation/information/loading/error panels, country picker, project-state display, and four behavior components (`fn_Common`, `fn_Numeric`, `fn_Numeric_With_Separtors`, `fn_Calculate_P75_P90`).

### Project Costs

- App definition: `ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/App.pa.yaml`.
- Metadata: `Properties.json`, `Header.json`, `References/DataSources.json`, `References/QualifiedValues.json`, and `Resources/PublishInfo.json`.
- Design: 1366 x 768 landscape; scale-to-fit off; Canvas data-row ceiling 2,000; third-party PCFs enabled.
- Start screen: `Capex Costs Screen`.
- Shared Canvas units: header/left navigation, confirmation/loading/error/information panels, and `fn_Numeric`/`fn_Percentage` behavior components.

## Definitive production screen inventory

Counts are measured from the extracted `.pa.yaml`. “Formula properties” includes all `=`-bearing properties, including layout and style; “logic blocks” is the existing concordance's count of formulas with at least three nonblank lines. The latter is the review unit used by the screen plans.

| Order | App | Screen and source | Purpose | Controls | Formula properties | Logic blocks | Main PCF/flow dependencies |
|---:|---|---|---|---:|---:|---:|---|
| 1 | PM | `Admin Project Default Checklists Screen` — `Src/Admin Project Default Checklists Screen.pa.yaml` | Maintain default checklist tasks by country, technology, and gate. | 75 | 896 | 44 | CommandBar, Icon, PowerDragDrop; no flow. |
| 2 | PM | `Admin CAPEX Accounts` — `Src/Admin CAPEX Accounts.pa.yaml` | Maintain the hierarchical CAPEX chart of accounts and ordering/status. | 90 | 1,234 | 68 | CommandBar, FluentDetailsList, Icon, PowerDragDrop; no flow. |
| 3 | PM | `Admin Milestones Screen` — `Src/Admin Milestones Screen.pa.yaml` | Maintain country/technology milestone duration and success assumptions. | 102 | 1,207 | 72 | CommandBar/Icon; missing Fabric recalculation flow call. |
| 4 | PM | `Admin Project Gates Approvals Screen` — `Src/Admin Project Gates Approvals Screen.pa.yaml` | Configure gate/checklist approvers and notifications per country/technology. | 114 | 1,745 | 89 | CommandBar, PeoplePicker, Icon; no flow. |
| 5 | PM | `Admin Contract Screen` — `Src/Admin Contract Screen.pa.yaml` | Maintain standard BoP contract templates, DevCo costs, margin, and apply tracking. | 145 | 2,123 | 88 | Icon; missing standard-assumption synchronization flow call. |
| 6 | PM | `Admin Cost Screen` — `Src/Admin Cost Screen.pa.yaml` | Maintain DEVEX/CAPEX, O&M, Other OPEX, and land-lease standard assumptions. | 352 | 5,939 | 193 | CommandBar/Icon; missing standard-assumption synchronization flow call. |
| 7 | PM | `App Loading Screen` — `Src/App Loading Screen.pa.yaml` | Bootstrap user, roles, environment, launch project, shared data, and route. | 21 | 256 | 10 | CommandBar/Icon hotfix; no direct user flow. |
| 8 | PM | `Project Main Screen` — `Src/Project Main Screen.pa.yaml` | Search/filter/select projects, create a project, and enter PM or Cost workflows. | 101 | 1,175 | 54 | CommandBar, FluentDetailsList, PeoplePicker, Icon, hotfix. |
| 9 | PM | `Project General Data Screen` — `Src/Project General Data Screen.pa.yaml` | Create/edit core project identity, country, technology, ownership, and locations. | 311 | 3,809 | 177 | CommandBar, PeoplePicker, Icon; gate-cancel flow on state change. |
| 10 | PM | `Project General Milestones Screen` — `Src/Project General Milestones Screen.pa.yaml` | Edit milestone chain and standard-derived dates. | 137 | 1,635 | 85 | Icon; missing per-project Fabric recalculation flow. |
| 11 | PM | `Project Generators Screen` — `Src/Project Generators Screen.pa.yaml` | Maintain generator/equipment types, individual units, permissions, rollups, and costs. | 642 | 7,406 | 359 | 33 PCF instances across CommandBar/DetailsList/Icon; module permission and cancellation flows. |
| 12 | PM | `Project Production Screen` — `Src/Project Production Screen.pa.yaml` | Maintain energy-yield, losses, seasonality, negative prices, and derived P-values. | 299 | 3,763 | 150 | CommandBar/Icon; dormant missing CAPEX recalculation call. |
| 13 | PM | `Project General CheckList Screen` — `Src/Project General CheckList Screen.pa.yaml` | Execute project checklist/gate approvals, tracking, notes, and state changes. | 141 | 2,136 | 115 | CommandBar/Icon; checklist/gate request and cancellation flows. |
| 14 | PM | `Project General Team Screen` — `Src/Project General Team Screen.pa.yaml` | Assign manager, deputy, members, and descriptions. | 66 | 946 | 29 | CommandBar, PeoplePicker, Icon; no flow. |
| 15 | PM | `Project Planning Screen` — `Src/Project Planning Screen.pa.yaml` | Maintain acquisition, permitting, repowering, and planning data. | 178 | 2,050 | 84 | CommandBar/Icon; no flow. |
| 16 | PM | `Grid Operator Screen` — `Src/Grid Operator Screen.pa.yaml` | Maintain grid-operator contact and connection data. | 68 | 743 | 47 | Icon; no flow. |
| 17 | PM | `Project Revenues Screen` — `Src/Project Revenues Screen.pa.yaml` | Maintain tariff/balancing/hedge revenues, inflation, and P50/P90 values. | 289 | 4,689 | 216 | CommandBar/Icon; no flow. |
| 18 | PM | `Project Finance Screen` — `Src/Project Finance Screen.pa.yaml` | Maintain equity, senior debt, VAT financing, DSRA/DSRF, decommissioning, tranches, fees, and repayment profiles. | 604 | 6,973 | 321 | CommandBar/Icon; no flow. |
| 19 | Cost | `Capex Costs Screen` — `Src/Capex Costs Screen.pa.yaml` | Browse/edit monthly DEVEX/CAPEX costs, contracts, distributions, paid state, comments, and summaries. | 355 | 5,027 | 294 | DevexCapexSummaryPCF, CommandBar/Icon, hotfix; no active flow. |
| 20 | Cost | `Contracts Screen` — `Src/Contracts Screen.pa.yaml` | Maintain BoP project contracts, payment targets, DevCo costs, margins, and total-cost calculation. | 243 | 3,942 | 149 | CommandBar/Icon; no active flow. |
| 21 | Cost | `Opex Costs Screen` — `Src/Opex Costs Screen.pa.yaml` | Shared O&M/Other OPEX screen for contract-period chains and standard assumptions. | 230 | 4,268 | 163 | CommandBar/Icon; no active flow. |
| 22 | Cost | `Land Lease Costs Screen` — `Src/Land Lease Costs Screen.pa.yaml` | Maintain land-lease contracts, periods, indexed cost, and WTG allocations. | 201 | 3,653 | 156 | CommandBar/Icon; no active flow. |
| 23 | Cost | `Add Costs from Table` — `Src/Add Costs from Table.pa.yaml` | Bulk edit/import CAPEX contracts and monthly cost rows through a spreadsheet surface. | 23 | 224 | 9 | `vsb_Dev.SpreadSheet`, Icon; no active flow. |

Production totals: **23 screens, 4,787 controls, 65,839 formula-bearing properties, 2,972 multi-line logic blocks, and 1,583 substantive (10+ line) blocks**. The two app shells and 27 shared Canvas components bring the full inspected formula corpus to 69,071 properties and 152,774 lines.

## Navigation model

- PM launch enters `App Loading Screen`, reads `projectid`/`screen` launch values, and routes to Project Main or a reconstructable project route.
- Project Main owns project selection. Project-scoped routes must accept a `projectId` query or path contract and reload the record; they must not depend only on in-memory selection.
- PM left-rail sequence is General → Milestones → Generator → Production → Cluster Check List → Project Team → Planning → Grid Operator → Revenues → Finance. Rail colors express prerequisite completeness; server permissions separately determine editability.
- Admin routes are independent of selected-project state and require both a client route guard and Dataverse enforcement.
- Project Costs launches at CAPEX for the same selected project. OPEX has O&M and Other modes on distinct URLs; Land Lease, Contracts, and Add-from-table retain `projectId`.
- Header logo/project actions return to Project Main. Unsaved form/panel state must be guarded before route changes.

## Inventory limits and required verification

- The extracted solution is authoritative for source behavior, but it is an export snapshot, not proof of live environment configuration.
- Forty logical names in the unified skeleton security matrix remain derived rather than live-verified; seven tables have competing plural forms. Run metadata-backed `pac code add-data-source` before implementation claims live completeness.
- Four flows referenced by Canvas formulas are absent from the solution export. Their plans are marked `REQUIRES_INVESTIGATION`; do not invent request/response contracts.
- Creator Kit/PowerCAT/Hotfix source repositories are absent. Their observable Canvas properties are inventoried, and the migration strategy is native Fluent UI replacement rather than carrying an opaque PCF into the Code App.
- OPEX, Land Lease, Add-from-table, App Loading, and Grid Operator lack full screen-recording evidence; their UI specifications are source-inferred and require manual parity capture.
