# Project Costs — Canvas → Code App: analysis of what exists

Date: 2026-09-09
Scope: **Project Costs app only.** Project Management stays on canvas for now.

---

## 1. What was read

| Input | Where | State |
|---|---|---|
| `VSBCloud (3).zip` | unmanaged solution export | unpacked to `_extracted/VSBCloud/` |
| `VSBCustomComponents_1_0_115_managed.zip` | the two PCFs (managed) | unpacked to `_extracted/VSBCustomComponents/` |
| `vsb_projectcosts_ba045_DocumentUri.msapp` | the Cost canvas app | unpacked to `_extracted/msapp/projectcosts/` |
| `VSBCloud-Code-App-Skeleton/vsbcode` | manager's code-app skeleton | `npm install` done, all gates run — results in §4 |

---

## 2. The Cost canvas app, measured

Extracted from `Src/*.pa.yaml` inside the `.msapp`.

| Screen | YAML lines | Controls | Notes |
|---|---:|---:|---|
| Capex Costs Screen | 20,178 | 355 | the app. Tabs, year matrix, comments panel, add/edit contract panel |
| Opex Costs Screen | 8,940 | 230 | serves **two** rail items (O&M, Other OPEX) |
| Contracts Screen | 7,835 | 243 | BoP contracts, payment targets, DevCo costs |
| Land Lease Costs Screen | 6,299 | 201 | periods + WTG allocation |
| Add Costs from Table | 395 | 23 | modal host for the SpreadSheet PCF |
| `Screen1` | 230 | 15 | **dev scratch — orphaned, unreachable** |
| `Screen2` | 58 | 4 | **dev scratch — orphaned, unreachable** |
| App (OnStart / Formulas / OnError) | 207 | – | theme, env vars, user/teams/roles bootstrap |
| 11 canvas components | 1,911 | 105 | Header, LeftNav, 4 popups, ReportError, fn_Numeric, fn_Percentage, Info button |

**Real screens to migrate: 5** (+ app shell + components). `Screen1` / `Screen2` are referenced
by nothing except `_EditorState` — they should not be ported.

Navigation is **not** `Navigate()`-driven between the five screens. The left rail
(`cmp_Left_Navigation`, itself hosting a PowerCAT Nav PCF) sets a variable and containers toggle
`Visible`. Only `Navigate('Capex Costs Screen')` exists (5 call sites) — the return from the
Add-Costs modal and the rail default. In React this is one route table.

### Data surface

- **37 Dataverse tables** (`default.cds`, org `vsbclouddev.crm4.dynamics.com`)
- **1 connected source**: `Assumptions BoP Contracts` → Fabric SQL
  (`[dbo].[AssumptionsBoPContracts]`; server/db from env vars `vsb_FabricSQLServer` /
  `vsb_FabricSQLDatabase`, table name from `vsb_AssumptionsBoPContracts`)
- **1 connector**: Office 365 Groups (`ListGroupMembers`) — approval-group membership
- 206 option sets, 37 views declared
- Connection references: `vsb_VSBCloudFabricSQL` (SQL, `oauthSP`), Office365Groups

Environment variables read at start: `vsb_VSBCloudInfoCenterUrl`,
`vsb_VSBcloudControllingApprovalGroup`, `vsb_TenantID`, `vsb_EnvironmentID`,
`vsb_ProjectManagementAppID`, `vsb_AppVersion`, `vsb_EnvironmentName`.

### Deep link from the PM app

`Param("projectId")` — read in `App.OnStart` **and again** in `Capex Costs Screen.OnVisible`.
The Cost app builds the return link itself:
`https://apps.powerapps.com/play/e/{gblEnvironmentID}/a/{gblProjectManagementAppID}?tenantId={gblTenantID}`.

### Code components in use (7 distinct)

| Component | Count | Origin | Code-app disposition |
|---|---:|---|---|
| `cat_PowerCAT.Icon` | 28 | Creator Kit | Fluent v9 icon button |
| `cat_PowerCAT.CommandBar` | 7 | Creator Kit | Fluent v9 `Toolbar` |
| `cat_PowerCAT.Nav` | 1 | Creator Kit | Fluent v9 nav / `Tree` |
| `cat_PowerCAT.ContextMenu` | 1 | Creator Kit | Fluent v9 `Menu` |
| `ckfix_CreatorKit.Hotfix.HotfixCDNFluentUI` | 1 | Creator Kit | delete — patches a canvas-only CDN problem |
| **`vsb_Dev.SpreadSheet`** | 1 | **ours** | rewrite (§3) |
| **`vsb_Dev.DevexCapexSummaryPCF`** | 1 | **ours** | rewrite (§3) |

Code apps do not host PCF controls, so all seven become React components. The five Creator Kit
ones are a straight swap to Fluent v9 — no custom work.

### Data-access density (why the canvas app is slow)

| Screen | ClearCollect | Collect | ForAll | Patch | Remove | LookUp | Filter | Timers |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Capex Costs | 83 | 94 | 73 | 36 | 12 | 174 | 331 | 5 |
| Opex Costs | 10 | 16 | 17 | 7 | 4 | 52 | 76 | 1 |
| Contracts | 12 | 17 | 8 | 7 | 2 | 21 | 68 | 0 |
| Land Lease | 14 | 18 | 12 | 8 | 7 | 35 | 31 | 0 |
| Add Costs from Table | 23 | 26 | 17 | 3 | 4 | 26 | 21 | 1 |

Seven `Timer` controls exist purely to poll PCF output properties and stage `ClearCollect`
chains — canvas plumbing with no analogue in React. All disappear.

---

## 3. The two PCFs

### `vsb_Dev.SpreadSheet` (v1.0.77, `control-type="virtual"`, React 16.8.6 + Fluent 8)

Bundle 1.85 MB. Third-party packages inside it:
`react-spreadsheet`, `fast-formula-parser`, `chevrotain`, `use-context-selector`,
`classnames`, `jstat`, `bessel`, `bahttext`, SheetJS number formatter.

**All ordinary npm packages** — they install and run in a Vite/React 19 code app unchanged.
The PCF-specific part is only the property plumbing, which is a canvas workaround:

| PCF property | Kind | What it actually is |
|---|---|---|
| `jsonDataIn` | input text | seed data, JSON-stringified |
| `jsonDataOut` | bound text | edited grid, JSON-stringified |
| `SaveData` / `CopyData` / `AddRow` / `DeleteRow` | bound bool | **toggle-to-trigger commands** |
| `StartingYear` / `CompletionYear` / `FiscelYear` | bound | year window + fiscal-year flag |
| `SubaccountDataIN` | dataset | DevCo/SPV subaccount rows |

In React these become props and callbacks: `data`, `onChange`, `onSave`, `onCopy`, `addRow()`,
`deleteRow()`. The JSON round-trip and the `Timer` polling in `Add Costs from Table` both go away.

### `vsb_Dev.DevexCapexSummaryPCF` (v1.1.1, `control-type="standard"`)

Bundle 151 KB, **zero npm dependencies** — hand-written DOM in `ui/GridRenderer.ts` and
`ui/ActionDropdown.ts`, plus a 1,416-line CSS file that documents every class against the
element it styles. Renders Account → Subaccount → Contract hierarchy with a sticky header,
sticky Grand Total row, month columns and a cluster timeline track.

Contract with the canvas app: 2 datasets in (`DevexCapexCostSummary`, `StandardContractOptions`),
6 scalar inputs (`ShowPlannedCost`, `StartYear`, `ShowEmptyAccounts`, `CostPaidByFilter`,
`CollapseResetKey`, `Cluster1..6Date`), and **13 outputs used as an event bus**
(`AddTriggered`, `EditTriggered`, `DeleteTriggered`, `CommentTriggered`,
`AddStandardContractTriggered`, `SetCostPaidUnpaidTriggered`, plus 7 `Selected*` fields).

Highest-fidelity port target: the CSS transfers verbatim; the renderer becomes a React
component whose 13 output properties collapse into 6 typed callbacks.

Note: `CollapseResetKey`'s own manifest description reads *"Bug 13472: change this value (on tab
switch / screen OnVisible) to collapse all accounts and subaccounts"* — a workaround shipped as
an API. Worth confirming 13472 is closed before copying the workaround forward.

---

## 4. The manager's skeleton — verified state

`VSBCloud-Code-App-Skeleton/vsbcode`, `npm install` + gates run on this Windows machine.

| Gate | Result |
|---|---|
| G-TYPE `tsc --noEmit` | **pass** |
| G-LINT `eslint` | **pass** |
| G-IDS | **pass** — 1,270 test ids, no duplicates |
| G-MATRIX | **pass** — 85 tables; warns 40 unverified names, 7 spelling conflicts |
| G-OWN | **FAIL** — 16 new, 16 stale (Bug S-1) |
| G-LABEL | **FAIL** — 51 new, 67 stale (Bug S-1, same cause) |
| G-UNIT | **pass** — **1,727 tests in 41 files** |
| G-BUILD | **pass** — 9.1 s; 395 kB app + 630 kB Fluent chunk |

So the skeleton is real working code, not stubs: 23 screens, ~69 k lines under `src/features/`,
a component library, a security matrix and a mock backend. The five Cost screens are
~12,150 lines of `Screen.tsx` / `rules.ts` / `rules.test.ts` / `hooks.ts`.

Three things it is **not**:

1. **It is one app containing both PM and Cost.** Splitting Cost out, or shipping the whole
   thing with PM routes hidden, is an open decision (see questions).
2. **It has never talked to a real Dataverse.** `VITE_DATA_MODE=mock` is the default and
   `power.config.json` has `"dataSources": []`.
3. **Neither PCF replacement exists.** `src/components/` has a generic `DataGrid` but no
   `YearGrid` and no `SpreadsheetImport` — both listed as required in the manager's own spec.
   The Capex `Screen.tsx` header says outright that `DevexCapexSummaryPCF` "is replaced by the
   shared `DataGrid` with twelve month columns", which is not the same control: no hierarchy
   expand/collapse, no sticky Grand Total, no cluster timeline, no row action menu.

---

## 5. Server-side dependencies — the best news in this analysis

### Power Automate: the Cost app calls exactly one flow, and that call is commented out

Every `*.Run(` invocation across all five screens and all eleven components:

```
1 ReportDevOpsBug.Run(
```

…and it sits inside a `/* */` block (bug B-1). **The Project Costs app has no live Power
Automate dependency at all.** The 17 flows in the solution, and the four the manager's spec
lists as missing from the export, are all Project Management concerns. Nothing about the Cost
migration is blocked on flows.

### Dataverse plugins: 11 assemblies, all server-side, all unaffected

```
vsb_InitialCapexContractCreation          VSB_CapexAssumptionDeletion
vsb_InitialCapexCostsCreation             VSBBoPContractAssumptionDeletion
vsb_InitialP50StandardBoPContractsCreation  VsbPluginsBoPDevCoCosts
VSB_BalancingPricePeriodDateSync          VSB_CODShiftSeniorDebtRepaymentRebalancing
VSB_SeniorDebtFinancialCloseDateShift     VSBDecommissioningProjectDatesSyncPlugin
vsb_SyncNegativePriceWithCOD
```

These register on Dataverse row events (`Update of vsb_project`,
`Delete of vsb_devexcapexstandardassumptions`, …), not on the app. They keep firing identically
when the writes come from a code app instead of a canvas app. Same for the
`LoadDevexCapexCostTotalCapacityTrigger` flow, which is Dataverse-triggered.

**Consequence:** the Cost app's server contract is *pure Dataverse CRUD*. That is the single
biggest reason it is the right app to migrate first.

One caveat: **"Add Standard Contract" is in-app Power Fx, not a plugin trigger.**
`btn_Capex_Cost_Add_Standard_Contract_Code.OnSelect` recomputes the start cluster, cost start
date and distribution client-side and writes the rows itself. The `vsb_Initial*` plugins handle
only the *initial* creation at project-creation time. So that logic has to be ported (it is the
largest single block in `rules.ts` on the skeleton side), and whether the bulk create becomes a
Custom API is a design decision, not a dependency.

---

## 6. Environment access — confirmed working

`pac` already holds an auth profile for the right org:

| | |
|---|---|
| profile | `[3] VSBCloudDev2` (**active**) |
| identity | `flow.serviceuser.vsbcloud@vsb.energy` — **a service account, not a named user** |
| org | `VSBCloud_Dev` · `https://vsbclouddev.crm4.dynamics.com/` |
| org id | `26269867-208d-ee11-8172-000d3a20a66e` |
| environment id | `be41add6-6f60-ebb0-9c73-2480d6bc615d` |

This is the same org the canvas app's `LocalDatabaseReferences` points at, so metadata read from
here is authoritative.

Code apps are already enabled in this environment — `pac code list` returns two:
`Analytics App` (`c00a4ba4-…`) and `Dummy Code App` (`c9aeb6af-…`).

Only read-only commands have been run so far (`pac org who`, `pac code list`,
`pac code --help`). `pac code init` creates an app record in the environment, so it is held
until the identity question is answered.

### Entity metadata, resolved from the solution rather than guessed

`reference/dataverse-entities.json` — 83 entities with `schemaName`, `logicalName`,
`entitySetName` and `primaryIdAttribute`, read out of `customizations.xml`
(`<entity Name>` + `<EntitySetName>`). This is the file that settles S-2 and S-3, and it
confirms the skeleton's `entitySet.replace(/s$/, "") + "id"` rule is wrong for **25** of the 83.
