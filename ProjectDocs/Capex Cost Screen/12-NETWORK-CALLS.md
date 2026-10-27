# 12 — Network calls (server round-trips) of the DEVEX/CAPEX Costs screen

Gap ID prefix: **GAP-NET**. Sibling files own the behaviour itself. This file covers only *which requests go to
Dataverse, in what order, and how many*. Related files:

- `07-FUNCTIONAL-SCREEN-AND-GRID.md`: load sequence, timers, tabs, year;
- `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`: the save logic;
- `09-COMMENTS-PANEL.md`;
- `11-DATAVERSE-TABLES.md`: columns, write payloads, flows and plugins;
- `13-OPTIMIZATION-AREAS.md`: what to do about the costs found here.

---

## 1. Scope

**What it covers.** Every server round-trip made by the canvas **Capex Costs Screen**, and by its code-app equivalent,
for these actions:

- initial load;
- switching the category tab;
- changing the year;
- opening the Add/Edit panel;
- save, in each mode;
- delete;
- setting a cost paid or unpaid;
- cluster (milestone) linking;
- adding a standard contract;
- opening the comments panel and saving a comment;
- reloading after a mutation.

For each call it records:

- the order of the calls;
- the table each call hits;
- delegation;
- parallel or sequential execution;
- N+1 patterns;
- a request-count estimate.

**Read, canvas.** All under `ProjectDocs/_extracted/msapp/projectcosts/`:

- `Src/Capex Costs Screen.pa.yaml`:
  - L11–301: OnVisible;
  - L303–434: `cmp_PopUp_Confirmation_1`;
  - L452–777: StandardContractOptions and Reload code buttons;
  - L778–787: `tmr_Capex_Initial_Load`;
  - L788–1013: the two cluster-range buttons;
  - L1014–2299: `btn_Capex_Cost_Refresh_Capex_Cost_Code`;
  - L2415–3716: the tabs, toolbar, year controls, the hidden command bar and the PCF navigation icons;
  - L4288–4590: the legacy gallery;
  - L7234–7768: `DevexCapexSummaryPCF` and `Btn_CodeforSettingCostPaidUnpaid`;
  - L8081–8155: the delete dialog;
  - L8156–10248: the comments panel;
  - L10249–18205: the Add/Edit panel. Save `OnSelect` L17574 is a single escaped line of 91,226 characters. It was
    unescaped to a scratch file and is cited below as "L17574 › n", where n is the line of the unescaped formula.
  - L18223–18927: `btn_Capex_Cost_Add_Standard_Contract_Code`;
  - L18928–19741: the timers;
  - L19864–20178: the two `cmp_PopUp_Confirmation_New` popups.
- `Src/App.pa.yaml`:
  - L12–86: named formulas (`varCurrentUserProfile`);
  - L205: OnStart, a single escaped line of 30,778 characters, cited as "OnStart › n".
- `Src/Components/cmp_Header.pa.yaml`: local `LookUp`s only.
- `Properties.json`: L9–95 `AppPreviewFlagsMap`, L109 `DefaultConnectedDataSourceMaxGetRowsCount`.
- `AppCheckerResult.sarif`: filtered to module `Capex Costs Screen`.

**Read, PCF source.**

- `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/`: `index.ts`,
  `ui/GridRenderer.ts`, `ui/ActionDropdown.ts`, `ControlManifest.Input.xml`.
- `ProjectDocs/_extracted/VSBCustomComponents/Controls/vsb_Dev.DevexCapexSummaryPCF/`: `bundle.js`,
  `ControlManifest.xml`.

**Read, code app.** All under `ProjectCosts-CodeApp/src/`:

- `features/cost/capex-costs/`: `Screen.tsx`, `PcfGrid.tsx`, `CommentsPanel.tsx`, `writeSet.ts`;
- `features/cost/costing/useCostBook.ts`;
- `data/`: `costBook.ts`, `client.ts`, `capexWrites.ts`, `comments.ts`, `standardContracts.ts`, `costRepository.ts`,
  `keys.ts`, `odata.ts`, `project.ts`;
- `features/cost/contracts/hooks.ts`: `useProjectExtras`;
- `app/Providers.tsx`, `app/SessionContext.tsx`, `app/routes.tsx`.

**Prior documents checked.**

- `ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md`;
- `migration-plans/screens/019-capex-costs.md`;
- `migration-plans/04-flow-inventory.md`;
- `app-docs/02-OPEN-DECISIONS.md` (D38);
- `instructions/KNOWN-RISKS-AND-DECISIONS.md` (R-10, R-11, R-12).

### Symbols used in the counts

| Symbol | Meaning |
|---|---|
| N | CAPEX project contracts on the project, all categories |
| Nc | contracts in the open category tab |
| Nb | of those, contracts whose `'Total Cost'` is blank |
| A | accounts plus sub-accounts in the open category |
| U | monthly cost rows a save upserts |
| D | monthly cost rows a save deletes |
| Rc | cost rows of one contract |
| K | comments on one contract |
| Kd | comments deleted in one panel save |
| Kc | comments changed in one panel save |
| P | cost rows a standard contract creates |
| S | rows in `Devex/Capex Standard Assumptions` |
| ⌈x/40⌉ | code-app id chunks (`CHUNK = 40`, `data/odata.ts:70`) |

A `Refresh(DS)` is not counted as a request: it drops the connector cache, and the *next read* of that table goes to
the server. That is the documented Power Apps behaviour, not verifiable from source.

---

## 2. Canvas implementation

### 2.1 Platform settings that shape every call

**`Properties.json:L109`: `"DefaultConnectedDataSourceMaxGetRowsCount": 2000`.**

- A non-delegable query, and every `ClearCollect`/`Collect`, stops at 2,000 rows.
- It gives no warning.
- App Checker reports it app-wide as `app-DataSourceDefaultMaxRowsLimit` ("Data row limit for non-delegable queries is
  more than 500").

**`Properties.json:L16`: `"usenonblockingonstartrule": true`.**

- `App.OnStart` runs without blocking the first screen.
- That is why the screen polls for `gblAppStarted` with a repeating timer (§2.3).

**`Properties.json:L74`: `"enableupdateifdelegation": false`.**

- The `UpdateIf('CAPEX Costs', …)` calls at L390 and L20055 run without the UpdateIf-delegation preview.
- (inferred) They therefore retrieve the matching rows to the client, up to the 2,000 cap over the **whole** `CAPEX Costs`
  table, and send one PATCH per row.

**`Properties.json:L26`: `"formuladataprefetch": true`; L10 and L24: `"delayloadscreens"` and
`"delaycontrolrendering": true`.**

- These decide when hidden controls evaluate their formulas.
- That timing cannot be verified from source. See §5.

### 2.2 App.OnStart: the data this screen reads, loaded once per app session

All calls run in **sequence**. The only `Concurrent(...)` (OnStart › 817–963) wraps local `Set`s.

| # | Call (OnStart › line) | Table | Delegated | Requests |
|---|---|---|---|---|
| 1 | 5 × `LookUp('Environment Variable Values', …)` (› 5–39) | environmentvariablevalues | yes | 5 |
| 2 | `LookUp(Users, 'Azure AD Object ID' = User().EntraObjectId)` ×2 (› 79–92), plus named formula `varCurrentUserProfile` (`App.pa.yaml:L60-73`) | systemusers | yes | 2–3, (inferred) the formula may share the result |
| 3 | `ForAll(colCurrentUserSystemsDirect, … LookUp(Countries_1, …))` (› 110–124) | vsb_countries | yes, but N+1 | 1 per security role |
| 4 | `ForAll(colCurrentUserTeamsDirect, Collect(…'Security Roles'))`, then `ForAll(… LookUp(Countries_1, …))` (› 137–165) | roles, vsb_countries | N+1 | (inferred) 1 per team, plus 1 per team role |
| 5 | `LookUp('Microsoft Entra IDs', …)` (› 239–242) | aadusers | yes | 1 |
| 6 | `Office365Groups.ListGroupMembers(…, {'$top': 100})` (› 288–291) | Graph connector | n/a | 1 |
| 7 | `LookUp(Projects, Project = GUID(Param("projectId")))` (› 555–572) | vsb_projects | yes | 1 |
| 8 | `LookUp(Countries_1, …)` (› 582–588) | vsb_countries | yes | 1 |
| 9 | `Sort('Opex Accounts')`, `Sort('Opex Subaccounts')`, `Sort('Land Lease Subaccounts')` (› 622–649) | 3 tables | yes, capped at 2,000 | 3 |
| 10 | 2 × env var `LookUp` (› 650–663) | environmentvariablevalues | yes | 2 |
| 11 | `Filter('CAPEX Account Lists', 'Parent Account'.Number = "00001")` (› 673–686) | vsb_capexaccountlists | yes | 1 |
| 12 | `Filter('CAPEX Account Lists', 'Parent Account' in colCapexAccountCategoriesNew…, Active)` (› 687–701) | vsb_capexaccountlists | yes, (inferred) `in` becomes an OR list | 1 |
| 13 | `Filter('CAPEX Account Lists', 'Parent Account' in colCapexAccountsNew…, Active)` (› 702–713) | vsb_capexaccountlists | yes | 1 |
| 14 | `ClearCollect(colCapexProjectContracts, Filter('CAPEX Project Contracts', Project = …))` (› 714–720) | vsb_capexprojectcontracts | yes, capped at 2,000 | 1 page or more |
| 15 | **N+1:** `Collect(colCapexCosts, Ungroup(AddColumns(colCapexProjectContracts As Item, Value, Filter('CAPEX Costs', Contract = Item…))))` (› 725–750) | vsb_capexcosts | each filter is delegated; the pattern is N+1 | **N** |
| 16 | `Choices(...)` ×3 (› 751–765) | option-set metadata | n/a | 0, (inferred) metadata |

The **OnStart total** is about 25 + N + (role and team lookups) requests, all sequential. Every contract and every cost
row of the project, all years and all categories, is held in memory as `colCapexCosts` from then on.

### 2.3 Screen entry: OnVisible, `tmr_Capex_Initial_Load` and the hidden code buttons

**`Capex Costs Screen.pa.yaml:L14-301` (`OnVisible`).**

1. `LookUp(Projects, Project = GUID(Param("projectId")))` (L40–56) is delegated, 1 request. It **repeats** OnStart
   item 7.
2. Everything else up to L280 is local, reading `gblClusterDurations`, `colCapexAccountCategoriesNew` and the other
   OnStart collections.
3. If the base data is ready (L283), it runs these in sequence:

```powerfx
Reset(tab_Costs_ContentAssignableAccountCategories);
Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
Select(btn_Capex_Cost_Build_StandardContractOptions_Code);
```

Otherwise it sets `locCapexInitialLoadPending: true` (L294–299), and the timer takes over.

**`tmr_Capex_Initial_Load` (L778–787).** `Duration: =500`, `Repeat: =true`, `Start: =locCapexInitialLoadPending`.

- `OnTimerEnd` (L782) polls every 500 ms until `gblAppStarted && CountRows(...) > 0`.
- It then selects the "DEVEX/CAPEX Summary" category and runs the same two `Select`s.
- With the Summary category (`IsBlank('CAPEX Account List')`), the Refresh button works on empty category collections,
  so Nc = 0.

The timer exists because OnStart is non-blocking (`Properties.json:L16`). Exactly one of the two paths runs. The
OnVisible path leaves the first real category selected; the timer path leaves Summary selected.

**`btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1014–2299).** These are the only server calls in its 1,285 lines.

| # | Call | Table | Delegated | Requests |
|---|---|---|---|---|
| R1 | `ClearCollect(colCapexCommentsInSelectedContracts, Filter('Capex Comments', 'Capex Contract' in colCapexContractsInSelectedCategory.'CAPEX Project Contract' \|\| 'Capex Cost' in colCapexCostsInSelectedContracts.'CAPEX Cost'))` (L1058–1064) | vsb_capexcommentses | yes. App Checker raises no warning on it. (inferred) Both `in` lists become OR lists, and the second carries **every cost-row id of the category** | 1 page or more |
| R2 | **N+1:** `ClearCollect(colContractTotalsForPCF, ForAll(colCapexContractsInSelectedCategory As C, … Coalesce(C.'Total Cost', Sum(Filter('CAPEX Costs', Contract = C…), Cost), 0) … Sum(Filter('CAPEX Costs', Contract = C… && 'Cost Paid' = …Yes), Cost)))` (L1530–1568) | vsb_capexcosts | yes. App Checker raises no warning, so (inferred) each `Sum` is a server aggregate | **Nc + Nb**: the paid sum always runs, the total sum only when `'Total Cost'` is blank, because `Coalesce` short-circuits |
| R3 | Everything else (L1021–1056, L1067–1529, L1570–2295) is local, over `colCapexAccountsNew`, `colCapexSubaccountsNew`, `colCapexProjectContracts`, `colCapexCosts` | (none) | n/a | 0 |

`ForAll` gives no evaluation-order guarantee. (inferred) Power Apps may run the R2 aggregates concurrently rather than
one by one.

**`btn_Capex_Cost_Build_StandardContractOptions_Code` (L452–721).**

```powerfx
Refresh('CAPEX Project Contracts');
ClearCollect(colStandardContractOptionsForPCF, SortByColumns(Filter(ForAll(ShowColumns(Filter(
    'Devex/Capex Standard Assumptions' As InnerDCS,
    InnerDCS.Subaccount.'CAPEX Account List' in colCapexSubaccountsInSelectedCategoryNew.'CAPEX Account List',
    InnerDCS.Country.Country = gblSelectedProject.Country.Country,
    Lower(Text(InnerDCS.Technology)) = Lower(Text(gblSelectedProject.Technology)),
    IsBlank(LookUp(colCapexProjectContracts, …))   // local collection
  ), …) …
```

- `Refresh` (L456) drops the contracts cache. Nothing in this button reads that table again.
- The `Filter` (L460–486) is **not delegable**. App Checker flags `Lower(Text(InnerDCS.Technology))` and the `Filter`
  (`app-SuggestRemoteExecutionHint`, `…btn_Capex_Cost_Build_StandardContractOptions_Code.OnSelect`).
- (inferred) So the first 2,000 rows of the **whole** standard-assumption table are downloaded and filtered locally:
  ⌈min(S, 2000)/500⌉ requests.
- The commented-out server `LookUp` (L478–485) is not live.

**Hidden controls with server formulas.** Whether they evaluate while hidden cannot be verified; see §5.

- `cmd_Costs_ProjectCosts_TableCommandBar` (`Visible: =false`, L3566) has `Items` (L3088–3232).
  - It runs `Filter('Devex/Capex Standard Assumptions', … Lower(DCS.Technology) …)`, which is non-delegable and flagged
    by App Checker.
  - Inside it, for **each** applicable assumption, it runs `LookUp('CAPEX Project Contracts', And(Account = …,
    Project = …, 'Capex Standard Assumption Contract' = SA…))` (L3135–3147). That is N+1.
  - It also calls `DataSourceInfo('CAPEX Costs', …)` ×4.
  - It is re-evaluated whenever `locSelectedCostRow` changes (inferred).
- `gal_Costs_ProjectCosts` (L4288) has `Visible: =//true` (L4323), a formula that is only a comment (inferred: blank,
  so not visible). Its labels (for example L4508–4590) use local collections only: 0 requests.
- `cmp_Hotfix_CDN_FluentUI` (L2300) is a code component with no data.

**The PCF itself.**

- `DevexCapexSummaryPCF.Items: =colFinatCostDataOptimized` (L7277) and
  `StandardContractOptions_Items: =colStandardContractOptionsForPCF` (L7653) are both **local collections**.
- The control's source contains no `context.webAPI`, `fetch` or `XMLHttpRequest`:
  - grep of `TableConnectedToDataversePCF/**`;
  - grep of `bundle.js`, 0 matches;
  - `ControlManifest.xml:L34` has an empty `<feature-usage/>`.
- `index.ts:L208-215` calls `dataset.paging.loadNextPage()` while `hasNextPage`. Over a collection this is
  (inferred) in-memory paging with no Dataverse request.

**Initial-load total for the canvas screen visit** (after OnStart): 1 (Projects) + R1 + (Nc + Nb) + ⌈min(S, 2000)/500⌉.
On the timer path Nc = 0.

### 2.4 Category tab switch: `tab_Costs_ContentAssignableAccountCategories.OnSelect` (L2440–2513)

- The Summary branch (L2456–2509) is local. It recomputes `colDevexCapexSummaryView` from `colCapexCosts`: 0 requests.
- A real category runs this in sequence:

```powerfx
UpdateContext({locIsVisibleLoadingCostSpinner: false}),
Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
Select(btn_Capex_Cost_Build_StandardContractOptions_Code);
```

That costs R1 + (Nc + Nb) + ⌈min(S, 2000)/500⌉ requests.

- `tmr_Capex_Cost_Category_SwitchTabs` (L18928, `AutoStart: =locStartCategoryBinding`) is dead.
  - `locStartCategoryBinding` is only ever set to `false` (L2443, L782, L19026).
  - So `tmr_Capex_Cost_Category_SwitchTabs_1` (L19032, started only from L19026) never runs either.
  - Both are local-only in any case.

### 2.5 Year change

All three year controls end in `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)`:

- `drp_Costs_ProjectCostbtn_ShowSelectedYear.OnChange` (L2930–2941);
- `btn_Costs_ProjectCostbtn_ShowPreviousYear.OnSelect` (L2973–2993);
- `btn_Costs_ProjectCostbtn_ShowNextYear.OnSelect` (live part L3055–3059; L3009–3051 is commented out, not live).

That costs **R1 + (Nc + Nb)**, even though only the local month mapping depends on the year.

The PCF navigation icons `pcf_Costs_ProjectCosts_TableNavigation_NextYear` / `_PreviousYear` (L3599–3716) only set
`gblSelectedProjectYear`: 0 requests. Their `ClearCollect` at L3654–3665 is commented out, not live.

### 2.6 Opening the Add/Edit panel

The live trigger is the PCF. `DevexCapexSummaryPCF.OnChange`, `AddTriggered` branch (L7295–7322) and `EditTriggered`
branch (L7323–7359):

- `LookUp(colFinatCostDataOptimized, …)` and `LookUp(colCapexProjectContracts, …)` are local.
- `Coalesce(locSelectedProjectContract.'Cost Type', LookUp('SPVDevCo Mapping Capex Devexes', 'Name (Sub-Account)'
  …).'DevCo/SPV')` is delegated. It costs 1 request **only when** the contract's `Cost Type` is blank (`Coalesce`
  short-circuits). An Add has no contract, so it costs 1.
- Then `tmr_Load_Contract_Gallery_Warmup` (L19580, `Duration: =1`) runs, and starts `tmr_Capex_Cost_Cost_EnrichLoader`
  (L19136, `Duration: =100`). Both are local over `colCapexCosts` / `colCapexCostsInSelectedContracts`.
  - The enricher does 12 local `LookUp`s per year × `locProjectDuration` years (L19187–19234).
  - Note `Start: =true` (L19576) on the enricher. See §5.
- `rad_AddContract_RightPanel_CostPaidBy_1.DefaultSelectedItems` (L12240–12254) contains
  `LookUp('SPVDevCo Mapping Capex Devexes', …)`. That is 1 delegated request whenever it re-evaluates (inferred: on open).

The hidden command bar's `addContract` / `editProjectCostsInSubaccount` branches (L3413–3557) would add
`LookUp(Projects, …)`. They are not live, because the control is hidden.

**Total: 1–2 requests.**

### 2.7 Panel interactions that call the server

- **`drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster.OnChange` (L11468–11479).**
  `CountRows(Filter('CAPEX Costs', Contract = locSelectedCostRow… && 'Cost Paid' = true)) > 0` is delegated (inferred:
  no App Checker warning): **1 request per change**.
- **The same control's `Items` (L11433–11447).** `Filter('Project States', Order in [1..6] && Order > … &&
  Order >= Max(1, varStartClusterNo))` is flagged non-delegable by App Checker (`Max`, `Filter`). The table is small:
  1 request.
- **All other panel controls** are local. That covers the `locSelectedCostRow: Patch(...)` record patches (L10490–12408),
  the per-year gallery `UpdateIf(colNewEditPanelCost, …)` (L12706–17424), the Reset button's `Concurrent(Reset(…))`
  (L17582–17601) and the Calculate button (L17698+).

### 2.8 Save: `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save.OnSelect` (L17574)

The Save button runs three modes, in sequence. They are described below.

**Individual Distribution** (L17574 › 21–1231):

1. Local validation and conversion (› 21–690). An optional confirmation popup follows (§2.11).
2. `Patch('CAPEX Project Contracts', If(Not(locSelectedCostRow.IsContract), Defaults(...),
   LookUp(colCapexProjectContracts, …)), {…})` (› 951–1010): 1 request.
3. `colCapexFinalDataToPatch` is built with a local `LookUp(colCapexCosts, …)` per month (› 1094–1118).
4. `Patch('CAPEX Costs', ForAll(Filter(colCapexFinalDataToPatch, Not(IsBlank(Cost)) && Or(Cost <> 0,
   existing)), {…}))` (› 1119–1156): one write per row, **U**. (inferred) The bulk `Patch` may be sent as one `$batch`;
   it is still U row operations.
5. `ForAll(colCapexToDelete As D, Remove('CAPEX Costs', D.'CAPEX Cost'))` (› 1157–1170): **D** sequential deletes.
6. `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (› 1182): a full reload (§2.13).

**Equal Distribution** (› 1233–1916):

1. `Patch('CAPEX Project Contracts', …)` (› 1495–1578): 1 request.
2. **Only if** `Or(locChangedByDate, locChangedDistribution, locChangedFrequency, locClusterChanged,
   loctotalCostChanged) && !IsBlank(locSelectedProjectContract)` (› 1579–1586):
   - `RemoveIf('CAPEX Costs', Contract = locSelectedProjectContract…)` (› 1776–1779). (inferred) This is 1 query plus
     Rc deletes.
   - `Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch…))` (› 1780–1845): P row writes.
   - `Patch('CAPEX Project Contracts', LookUp(colCapexProjectContracts, 'CAPEX Project Contract' =
     locSelectedCostRow.vsb_capexaccountlistid), {'Average Payment': …, 'Linked Cluster': …})` (› 1846–1863): 1
     request. On an **Add**, `locSelectedCostRow` is the sub-account, the `LookUp` is blank and the write stores
     nothing (D38 §8).
3. `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (› 1876).

**`btn_SaveCost_Execute____`** (L17605, `Visible: =false` L17692, `OnChange` L17687) is never `Select`ed anywhere in the
file. It is not live.

### 2.9 Delete: `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm` (L8103–8149)

```powerfx
IfError(With({locContractToDelete: LookUp(colCapexProjectContracts, …)},
    /* RemoveIf('CAPEX Costs', …); */                 // commented out, not live
    RemoveIf('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = locContractToDelete.'CAPEX Project Contract');
    Remove('CAPEX Project Contracts', locContractToDelete);
), Notify("Error: Costs could not be deleted. " & …));
Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code);
```

- `RemoveIf` on comments: (inferred) 1 query plus K deletes.
- `Remove` on the contract: 1 request. The cost rows are left to the server-side cascade (inferred; `11-…` owns the
  relationship).
- Then the reload.

The `Description` property's `LookUp(colCapexProjectContracts, …)` (L8096) is local.

### 2.10 Set paid / unpaid

**`DevexCapexSummaryPCF.OnChange`, `SetCostPaidUnpaidTriggered` (L7422–7437), followed by an identical second block
(L7442–7456).**

- Each block runs `LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(Self.SelectedCostContractId))`.
  That is **2 LookUps on every toggle**.
- App Checker flags `LookUp` / `=` / `&&` on this `OnChange` as delegation warnings, plus
  `app-SuggestRemoteExecutionHint-OpNotSupportedByColumn` on `varSelectedRow.vsb_capexaccountlistid` at L7382.
  (inferred) Each flagged `LookUp` downloads up to 2,000 contract rows and filters locally.
- `DeleteTriggered` is also duplicated (L7418–7421 and L7438–7441). It is harmless: it only sets a variable.

**If the contract is not (Individual and linked):** `Select(Btn_CodeforSettingCostPaidUnpaid)` (L7661–7767).

- `varCostInSelectedContract: Filter('CAPEX Costs', Contract = GUID(…))`, then `LookUp(varCostInSelectedContract,
  Year = … && Month = …)` (L7697–7736). (inferred) These compose into 1 delegated query.
- `IfError(Patch('CAPEX Costs', varCostRecord, {'Cost Paid': …}); Refresh('CAPEX Costs');
  Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code), Notify(…))` (L7745–7758): 1 PATCH, then the reload.

**If it is Individual and linked:** the popup `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation`
(L19864–19883) opens. Its `OnConfirm` (L19875):

```powerfx
With({varGetContract: LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(DevexCapexSummaryPCF.SelectedCostContractId))},
    Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()}););
Select(Btn_CodeforSettingCostPaidUnpaid);
```

That adds 1 `LookUp` and 1 PATCH (clear the link), then the same button path.

### 2.11 Cluster linking: the relink confirmation

The live popup is `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (`Visible:
=locShowClusterLinkageConfirmation`, L20171). Its `OnConfirm` is at L20040–20070.

```powerfx
If(locMilestoneRelinkResetNeeded,
    UpdateIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true, {'Cost Paid': false});
    /* RemoveIf('Capex Comments', … 'Comment Type' = 'Capex Comment Type'.'Comments to payment date') */   // commented out, not live
);
UpdateContext({locMilestoneRelinkResetNeeded: false});
Select(btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save);
```

- `UpdateIf` without delegation (`Properties.json:L74`) is (inferred) a read of up to 2,000 rows of the whole table,
  then 1 PATCH per paid row.
- The Save then re-runs (§2.8).
- `cmp_PopUp_Confirmation_1` (L303–434) carries a **live** `RemoveIf('Capex Comments', …)` in its `OnConfirm`
  (L396–399), but its `Visible` is `=//locShowClusterLinkageConfirmation` then `false` (L425–427). It can never be shown,
  so that `RemoveIf` never runs.

### 2.12 Add standard contract

**Live trigger:** `DevexCapexSummaryPCF.OnChange`, `AddStandardContractTriggered` (L7360–7417), in sequence.

1. `LookUp('CAPEX Project Contracts', Project = … && Account = varSelectedRow.vsb_capexaccountlistid && 'Capex Standard
   Assumption Contract' = varSelectedStandardGuid)` (L7378–7384). App Checker flags it
   (`OpNotSupportedByColumn`). (inferred) It is non-delegable, so 1–4 requests.
2. `Select(btn_Capex_Cost_Add_Standard_Contract_Code)` (L7402), which does the following (L18227–18923):
   - `LookUp('Devex/Capex Standard Assumptions', … = locGUIDforLoadingStandardContract)` (L18230–18233): 1.
   - `Sum(Filter(GeneratorTypeInProjects, Project = …, Status = Active), 'Number of Generators')` (L18243–18250):
     1 aggregate (inferred delegated).
   - `LookUp('Milestones Standard Assumptions', Name = "average duration [months]" && Country… && Technology…)`
     (L18300–18303): 1.
   - Either branch "no eligible cluster" (L18609–18635): `Concurrent(Clear(…)…, Refresh('CAPEX Project Contracts'),
     Refresh('Devex/Capex Standard Assumptions'))`. This is the only `Concurrent` with data calls on the screen, and
     the two calls are cache drops only.
   - Or the create branch:
     - `Patch('CAPEX Project Contracts', Defaults(…), {…})` (L18636–18703): 1.
     - If no payment lands in an eligible cluster, `Remove('CAPEX Project Contracts', locSelectedProjectContract)`
       (L18758–18771): 1.
     - Otherwise `Patch('CAPEX Costs', ForAll(colCapexCostDataToPatch …))` (L18849–18889): P.
     - Then `Patch('CAPEX Project Contracts', locSelectedProjectContract, {'Average Payment', 'Total Cost'})`
       (L18890–18900): 1.
     - Then `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (L18903): the reload (§2.13).
3. Back in `OnChange`, `If(!IsBlank(locSelectedProjectContract), … Refresh('CAPEX Project Contracts');
   Refresh('CAPEX Costs'); Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
   Select(btn_Capex_Cost_Build_StandardContractOptions_Code))` (L7403–7413).
   - The success branch never blanks `locSelectedProjectContract`: L18904–18912 omits it.
   - So (inferred) the Refresh and Build buttons run **a second time**, after the reload already ran them.

The hidden command bar's `addStandardContract` / `AddStandardContractWithDesc` branches (L3238–3412) add
`LookUp(Projects, …)`. They are not live.

### 2.13 Reload after a mutation: `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L722–777)

| # | Call | Table | Delegated | Requests |
|---|---|---|---|---|
| 1 | `Refresh('CAPEX Project Contracts'); Refresh('CAPEX Costs')` (L727–728) | (none) | n/a | 0, cache drops |
| 2 | `ClearCollect(colCapexProjectContracts, Filter('CAPEX Project Contracts', Account in colCapexSubaccountsNew…, Project = …))` (L729–736) | vsb_capexprojectcontracts | yes (no App Checker warning) | 1 page or more |
| 3 | **N+1:** `Collect(colCapexCosts, Ungroup(…AddColumns(colCapexProjectContracts As Item, Value, Filter('CAPEX Costs', Contract = Item…))…))` (L737–766) | vsb_capexcosts | per item | **N** |
| 4 | `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` (L767) | comments, costs | see §2.3 | R1 + Nc + Nb |
| 5 | `Select(btn_Capex_Cost_Build_StandardContractOptions_Code)` (L768) | standard assumptions | non-delegable | ⌈min(S, 2000)/500⌉ |

**Reload total ≈ N + Nc + Nb + 2 + ⌈min(S, 2000)/500⌉**, all sequential. It runs after every save, delete, paid toggle
and standard-contract add.

### 2.14 Comments panel

**Open:** `DevexCapexSummaryPCF.OnChange`, `CommentTriggered` (L7457–7650).

- `Refresh('Capex Comments')` (L7459).
- `Filter('Capex Comments', 'Capex Contract' = locSelectedCostRow…)` (L7467–7472): 1 delegated request. Its
  `AddColumns` reads `ThisRecord.'Capex Cost'.Year/Month` (L7512, L7534). (inferred) The related record is fetched by
  `$expand` or lazily.
- `ForAll(Sequence(...), Patch(colCapexComments, …))` (L7593–7606) is local. App Checker flags it as
  `app-ForAllWithMutation`.
- `locAvailebleCapexCosts: ShowColumns(Filter('CAPEX Costs', Contract = …), …)` (L7636–7646): 1 request.
- The gallery labels show `ThisItem.'Created By'.'Full Name'` (L8627, L9603). (inferred) That is one lazy lookup per
  distinct author.

**Row actions.**

| Action | Call | Requests |
|---|---|---|
| Resolve, `img_Read_Comment_Check.OnSelect` (L9840–9846) | `LookUp('Microsoft Entra IDs', Id = User().EntraObjectId)` | 1 |
| Reply, `img_Read_Comment_Reply.OnSelect` (L9890–9897) | `LookUp('Capex Comments', id = …)` | 1 |
| Month change, `drp_Draft_Edit_Month_Value.OnChange` (L9375–9382) | `LookUp('CAPEX Costs', Year && Month && Contract)` | 1 |
| Edit, delete, type change | local `UpdateIf` / `Remove` / `Patch` on `colCapexComments` (L8693–10001) | 0 |

**Save:** `btn_Capex_Comment_Save.OnSelect` (L10136–10222).

```powerfx
IfError(
  If(!IsEmpty(colDeletedComments), ForAll(colDeletedComments, With({_Item: ThisRecord},
      RemoveIf('Capex Comments', 'Capex Comments (vsb_capexcommentsid)' = _Item.'Capex Comments (vsb_capexcommentsid)'))));
  ForAll(Filter(colCapexComments, IsButton <> true) As _currentComment,
      Patch('Capex Comments', If(IsBlank(id), Defaults('Capex Comments'), {id}),
            With({recRootComment: LookUp('Capex Comments', id = _currentComment.ParentCommentID)}, {…})));
  …, Notify("An error occurred while saving. Please try again.", NotificationType.Error));
Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
```

- Every deleted comment costs (inferred) a `RemoveIf` query plus a delete, so 2 × Kd.
- **Every** comment of the thread, not only the changed ones, costs a `LookUp` (for the root) plus a PATCH, so 2 × K.
  This is N+1. App Checker flags the `ForAll` as `app-ForAllWithMutation`.
- Then R1 + Nc + Nb.

### 2.15 Other server calls on the screen

`btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable.OnSelect` (L2568–2780):

- `ClearCollect(colSubaccountMappedCostPaid, ShowColumns(Filter('SPVDevCo Mapping Capex Devexes', 'Account Number' in
  colCapexSubaccountsInSelectedCategoryNew.Number), …))` (L2577–2587): 1 request.
- The rest is local, then `Navigate` (L2777).

**No flows are called.** The screen has no `.Run(` call. `04-flow-inventory.md:L72` agrees: "The Project Costs Canvas
app has no active `.Run(...)` calls". No server-triggered flow or plugin is registered on `vsb_capexprojectcontract`,
`vsb_capexcost` or `vsb_capexcomments` (`04-flow-inventory.md:L21-65`).

### 2.16 Canvas request-count summary

| Action | Calls in order | Parallel? | Estimate |
|---|---|---|---|
| App start (OnStart) | env vars, users, roles (N+1), Entra, Graph, project, country, OPEX/LL lists, 3 × account lists, contracts, **costs per contract (N+1)** | sequential | ≈ 25 + N + roles (inferred) |
| Screen visit | Projects `LookUp`, Refresh button (comments + 2 aggregates per contract), Build (standard-assumption table) | sequential | 2 + Nc + Nb + ⌈min(S, 2000)/500⌉ |
| Category tab | Refresh button + Build | sequential | 1 + Nc + Nb + ⌈min(S, 2000)/500⌉ |
| Year change | Refresh button | sequential | 1 + Nc + Nb |
| Open Add/Edit panel | SPVDevCo `LookUp` (when Cost Type is blank), radio default `LookUp` | sequential | 1–2 |
| Link-to-milestone change | `CountRows` of paid costs | n/a | 1 per change |
| Save, Individual | contract PATCH, U row writes, D deletes, reload | sequential | 1 + U + D + reload |
| Save, Equal (schedule changed) | contract PATCH, `RemoveIf` costs, P creates, contract PATCH, reload | sequential | 3 + Rc + P + reload (inferred) |
| Save, Equal (nothing schedule-related changed) | contract PATCH, reload | sequential | 1 + reload |
| Relink confirm | `UpdateIf` paid rows, then Save | sequential | ≈ 1 + paid rows + Save (inferred) |
| Delete | `RemoveIf` comments, `Remove` contract, reload | sequential | 2 + K + reload (inferred) |
| Paid toggle | 2 × contract `LookUp`, cost `LookUp`, PATCH, reload; linked case adds `LookUp` + PATCH | sequential | 4 (+2) + reload; the `LookUp`s may each be up to 4 pages (inferred) |
| Standard contract | contract `LookUp`, standard-assumption `LookUp`, WTG `Sum`, milestone `LookUp`, contract create, P creates, contract PATCH, reload, then Refresh + Build again | sequential | ≈ 7 + P + reload + (1 + Nc + Nb + ⌈S/500⌉) (inferred) |
| Comments open | comments filter, cost filter, lazy author lookups | sequential | 2 + distinct authors (inferred) |
| Comment save | 2 per deleted, 2 per comment, then Refresh button | sequential (`ForAll`) | 2Kd + 2K + 1 + Nc + Nb |
| Reload after a mutation | contracts, **costs per contract (N+1)**, Refresh button, Build | sequential | N + Nc + Nb + 2 + ⌈min(S, 2000)/500⌉ |

**Reload dominates every mutation.** Its cost grows with the whole project's contract count N, not with the edited
contract.

---

## 3. Code app implementation

### 3.1 SDK and cache settings that shape every call

**Paging.**

- `fetchAll` (`data/client.ts:50-82`) always sends `maxPageSize: 500` (`DEFAULT_PAGE_SIZE`, L48). The SDK sends it as
  `Prefer: odata.maxpagesize`, and always adds that header (`client.ts:256-258`, comment).
- `fetchAll` follows `skipToken` up to `maxPages = 50` (L47). Truncation is only `trace`d (L69–78).
- So a single query reads at most 25,000 rows. `loadContractCostSums` overrides the page size to 5,000
  (`costBook.ts:1228-1231`, pinned by UT-BOOK-034).

**`$top` semantics (D42).**

- `top` caps the **whole** result. `countedPage` therefore never sends it (`client.ts:253-265`; UT-PAGE-011..014).
  `countedPage` is not used by this screen.
- The CAPEX-path reads that pass `top: 1` want exactly one row, so the cap is correct there:
  - `loadProject` (`data/project.ts:171`);
  - `loadProjectExtras` (`:240`);
  - `loadMilestoneAssumptionValues` (`costBook.ts:971`).

**Id lists.** They are chunked at 40 (`odata.ts:70`, `chunk` L78–82) into `lookupIn` OR filters (L72–75). The chunks of
one read run in **parallel** (`Promise.all`).

**Query defaults** (`app/Providers.tsx:17-28`):

- `staleTime: 30 * 1000`;
- `refetchOnWindowFocus: true`;
- `retry` up to 2 on retryable errors;
- mutations `retry: false`.
- `gcTime` and `refetchOnMount` are the TanStack defaults (not set).

**Query keys.** The CAPEX keys are inline literals in `useCostBook.ts`, not `qk` entries: `["cost-book", projectId,
category]`, `["capex-totals", projectId]`, `["capex-comments", ids]`, `["capex-standard-assumptions", ids]` and others.
`data/keys.ts:80-93` names their prefixes for the admin invalidation helpers only.

**Writes** are strictly **sequential** (`await` inside `for`):

- `data/capexWrites.ts:215-291` and `:329-343`;
- `CommentsPanel.tsx:462-513`.

No CAPEX write uses `executePlan`, `runPlan`, `concurrency.ts` or `updateRecordIfExists` (grep). There is no changeset
(`capexWrites.ts:7-11`).

### 3.2 Initial load

**App shell** (`app/SessionContext.tsx:45-89`):

- `qk.session` is host context (`staleTime: Infinity`).
- `qk.environmentVariables` makes 2 sequential `fetchAll`s (`data/project.ts:56-90`).
- `qk.project(id)` calls `loadProject` (`project.ts:127-225`): 1 request, then up to 3 in parallel (country, cluster
  state, country area; L180–185). `staleTime` is 5 minutes.

**The CAPEX screen** (`features/cost/capex-costs/Screen.tsx:158-299`), the route `lazy`-loaded (`app/routes.tsx:22`).

With no `?category=` the screen opens on the Summary tab (`resolveCategory`, `Screen.tsx:182`). That matches the canvas
timer path.

| Wave | Query (key) | Function | Requests |
|---|---|---|---|
| 1 | `["capex-categories"]`, 30-min staleTime (`useCostBook.ts:539-545`) | `loadCapexCategories` (`costBook.ts:744-765`), all active `vsb_capexaccountlists` | 1 |
| 1 | `["cost-book", pid, -1]` (`useCostBook.ts:54-61`) | `loadCostBook` (`costBook.ts:1181-1195`): `loadCostAccounts` (1); no category, so no payer defaults and no lines | 1 |
| 1 | `["capex-totals", pid]`, enabled only on Summary (`Screen.tsx:196`; `useCostBook.ts:365-373`) | `loadCapexTotals` (`costBook.ts:1270-1300`): `loadCostAccounts` and the contract list in parallel, then `loadContractCostSums` chunks in parallel | 2, then ⌈N/40⌉ |
| 1 | `["active-wtg-count", pid]`, 5-min (`useCostBook.ts:496-501`) | `loadActiveWtgCount` (`data/standardContracts.ts:59-69`) | 1 |
| 1 | `[...qk.project(pid), "extras"]`, 5-min (`contracts/hooks.ts:108-115`) | `loadProjectExtras` (`project.ts:233-246`) | 1 |
| 1 | `["capex-project-states"]`, 30-min (`useCostBook.ts:520-526`) | `loadProjectStates` (`costBook.ts:859-875`) | 1 |
| 2 | `["capex-milestone-durations", country, tech]`, 30-min (`useCostBook.ts:554-564`) | waits for `extras`; `loadMilestoneAssumptionValues` (`costBook.ts:951-988`) | 1 |
| (none) | `["capex-standard-assumptions", ""]`, `["capex-comments", ""]` | disabled: there are no sub-accounts and no lines on Summary (`useCostBook.ts:493`, `:585`) | 0 |

**Total on the screen:** about 9 + ⌈N/40⌉ requests in 3 waves, plus the shell's 3–6. `vsb_capexaccountlists` is read
**three times in parallel** (categories, cost book, totals); see `13-…` GAP-OPT-09.

### 3.3 Category tab switch

`chooseCategory` (`Screen.tsx:321-325`) only rewrites `?category=`. The new key `["cost-book", pid, i]` and
`<PcfGrid key={category}>` (`Screen.tsx:744`) remount the grid.

`loadCostBook(pid, i)` (`costBook.ts:1181-1186`) runs in **four sequential waves**:

1. `loadCostAccounts` (1).
2. `loadPayerDefaults` (1, the whole SPV/DevCo table; `costBook.ts:155-173`).
3. `loadCostLines` contract chunks: ⌈A/40⌉ in parallel (`:1019-1040`).
4. `loadPayments` chunks ⌈Nc/40⌉ in parallel (`:1130-1145`, page size 500), plus `loadProjectStates` (1, only when a
   contract is linked; `:1047-1051`, UT-BOOK-044). This read does **not** use the `["capex-project-states"]` cache.

After the book arrives, two waves follow in parallel:

- `["capex-standard-assumptions", ids]` calls `loadStandardAssumptions` (`data/standardContracts.ts:19-35`). It reads the
  **entire** active standard-assumption table, filtered client-side to the sub-accounts (L36–38), so ⌈S/500⌉ requests.
  The key changes with every tab.
- `["capex-comments", ids]` calls `loadComments` (`data/comments.ts:64-82`): ⌈Nc/40⌉ in parallel.

**Total ≈ 2 + ⌈A/40⌉ + ⌈Nc/40⌉ + (0|1) + ⌈S/500⌉ + ⌈Nc/40⌉** in 5 waves.

Revisiting a tab within 30 s is free (cache). After 30 s, the mount refetches in the background while it shows the cached
grid (inferred: TanStack `refetchOnMount` default). Within the default `gcTime` the cached copy is still shown first.

### 3.4 Year change

`setYear` (`Screen.tsx:728-742`) is client state only.

- `gridRows` re-runs (`PcfGrid.tsx:58-61`).
- `commentFlags` re-runs (`Screen.tsx:296-299`).
- Both read data already loaded. `loadCostLines` loads every year (`costBook.ts:1010-1011`).

**0 requests.**

### 3.5 Opening the Add/Edit panel

`open()` (`Screen.tsx:327-343`) clones the cached `CostLine`. Payer, project states, project and cluster dates are all
in memory or in 30-min caches. **0 requests.**

The Link-to-Milestone change also costs **0 requests**: the relink condition (`milestoneRelinkResetNeeded`, UT-CAPEXR-104)
is evaluated against the cached `line.payments` and the cached comments.

### 3.6 Save: `persist()` → `useCapexWrites().saveLine` → `saveCostLine`

The calls are `Screen.tsx:590-658`, then `useCostBook.ts:404-416`, then `data/capexWrites.ts:107-294`, all sequential:

1. The contract (1):
   - `Vsb_capexprojectcontractsService.update(id, …)` for an edit (L215–222);
   - or `create` with `vsb_Project`, `vsb_Account` and `owningbusinessunit` binds for an add (L223–240).
2. Accepted relink only (L244–252):
   - one `setCostPaid(id, false)` PATCH per **cached** paid payment;
   - `loadComments([contractId])` (1);
   - one `deleteComment` per payment-date comment.
3. `capexWriteSet(rows)` (`writeSet.ts:40-56`) decides the cost-row writes:
   - every non-null amount that has an id, or that is non-zero, is an upsert. **Unchanged rows are PATCHed too.**
   - U upserts are sent one at a time (`capexWrites.ts:262-282`).
4. D deletes go through `deleteRecord` (`capexWrites.ts:289-291`; `client.ts:113-120`), which checks the result
   (rule 14).
5. `onSuccess: invalidate` (`useCostBook.ts:386-396`) runs `Promise.all` over 5 prefixes:
   - the active `["cost-book", pid, cat]` refetches (§3.3 waves 1–4);
   - `["capex-comments"]` refetches the active category query (⌈Nc/40⌉);
   - `["capex-totals"]`, `qk.devCoCapexContracts` and `qk.devCoCapexCosts` are inactive on this tab, so they are only
     marked stale.

Because `onSuccess` returns the promise, the mutation stays `isPending` until the refetch settles. The spinner
(`Screen.tsx:1045-1049`) therefore covers the reload, as the canvas spinner does.

**Total ≈ 1 + U + D + [p + 1 + k] + 2 + ⌈A/40⌉ + 2⌈Nc/40⌉ + (0|1).** The same path serves Individual and Equal.

### 3.7 Delete: `writes.deleteLine` → `deleteCostLine` (`capexWrites.ts:329-343`)

1. `loadComments([id])` (1).
2. One `deleteComment` per comment (K). This goes through the generated `delete`, which **discards the result**
   (`comments.ts:218-220`).
3. One `deleteRecord` per cost row (Rc).
4. 1 contract `deleteRecord`.
5. The invalidation as §3.6.

The explicit per-row deletes are marked `DIVERGENCE` (`capexWrites.ts:315-327`). Pinned by UT-CAPEXW-001..003 and
UT-BOOK-039..041. **Total ≈ 2 + K + Rc + refetch.**

### 3.8 Set paid / unpaid

`onAction("SetCostPaidUnpaid")` (`Screen.tsx:434-451`) resolves the cost row from the cached `line.payments`.
`paidToggleNeedsConfirmation(line)` (UT-CAPEXR-058) decides the dialog from the cache.

The call chain is `writes.setPaid` → `costRepository.setCostPaid` (`costRepository.ts:317-322`) → `setCostPaid`
(`capexWrites.ts:53-58`). It sends **1 PATCH** `{vsb_costpaid}` through the generated `update`, with no existence check.

The confirmed path (`Screen.tsx:1028-1036`) sends the **same single PATCH**. It does **not** clear the contract's
`Linked Cluster`; see GAP-NET-06.

**Total = 1 + refetch** (§3.6 step 5).

### 3.9 Add standard contract

`addStandardContract` (`Screen.tsx:388-421`):

- uses the cached standard assumptions, WTG count and milestone durations (`useStandardAssumptions`,
  `Screen.tsx:277`; `useMilestoneDurations`, `:281`);
- decides "already exists" from the cached `book.lines` (`:372-383`, `checkStandardContractClick`);
- then `saveLine.mutate({isNew: true, …})`: 1 contract `create` and P sequential cost `create`s (§3.6).

**Total = 1 + P + refetch.** No pre-check request, no second reload.

### 3.10 Comments panel

**Open.** `CommentsPanel.tsx:222` runs `useCapexComments([contractId])`, key `["capex-comments", id]`, so 1 request.
The row is already in the category-level `["capex-comments", ids]` cache, but under a different key.

- Authors arrive in the `_createdby_value` formatted-value annotation (`comments.ts:25-31`), at no extra cost.
- Cost rows come from the book.
- Resolve uses the session's Entra id. Reply and month change are local.
- **Total: 1 request** (0 if fetched in the last 30 s).

**Save** (`CommentsPanel.tsx:450-519`), sequential:

1. Kd `writes.remove`, through the generated `delete` (`comments.ts:218-220`).
2. The roots, then the replies. **Only changed rows** are saved (`:482-485`, `:499-501`), so Kc `create`/`update`s
   (`comments.ts:155-216`).
3. `writes.invalidate()` (`useCostBook.ts:603-607`):
   - `["capex-comments"]` refetches the active category query, ⌈Nc/40⌉ (the panel's own query is unmounted after
     `onDismiss`);
   - `["cost-book", pid]` refetches the **whole active cost book** (§3.3 waves 1–4), although the book never carries
     comments (`costBook.ts:51-53`).

**Total ≈ Kd + Kc + ⌈Nc/40⌉ + 3 + ⌈A/40⌉ + ⌈Nc/40⌉.**

### 3.11 Reload after a mutation

There is no reload button. The reload is the invalidation in `useCapexWrites` (`useCostBook.ts:386-396`) and
`useCommentWrites` (`:603-607`). No optimistic `setQueryData` exists for CAPEX writes. There are no prefetches: no
`prefetchQuery` anywhere in the CAPEX path (grep).

### 3.12 Background refetches with no canvas equivalent

When the window regains focus, every **active** CAPEX query older than 30 s refetches (`Providers.tsx:20-24`). That is
the cost book (4 waves), the comments and the standard assumptions. The 30-minute master-data queries do not, because
they are not yet stale.

### 3.13 Code-app request-count summary

| Action | Calls in order | Parallel? | Estimate |
|---|---|---|---|
| Shell | session; env vars (2); project (1 + ≤3) | waves | 3–6 |
| Screen open (Summary) | categories, accounts, totals (accounts + contracts → cost sums), WTG, extras, states; then milestones | 3 waves, parallel within a wave | ≈ 9 + ⌈N/40⌉ |
| Category tab (cold) | accounts → payer map → contracts → payments (+ states); then standard assumptions and comments | 5 waves | ≈ 3 + ⌈A/40⌉ + 2⌈Nc/40⌉ + ⌈S/500⌉ |
| Year change | none | n/a | 0 |
| Open panel, milestone change | none | n/a | 0 |
| Save (either mode) | contract, [relink resets], U upserts, D deletes, refetch | writes sequential, refetch parallel | 1 + U + D + [p + 1 + k] + ≈ 3 + ⌈A/40⌉ + 2⌈Nc/40⌉ |
| Delete | comments read, K deletes, Rc deletes, contract delete, refetch | sequential | 2 + K + Rc + refetch |
| Paid toggle | 1 PATCH, refetch | sequential | 1 + refetch |
| Standard contract | contract create, P creates, refetch | sequential | 1 + P + refetch |
| Comments open | panel comments query | n/a | 1 (0 if cached) |
| Comment save | Kd deletes, Kc writes, comments refetch, cost-book refetch | sequential, then parallel | Kd + Kc + ≈ 3 + ⌈A/40⌉ + 2⌈Nc/40⌉ |
| Window focus after 30 s | active queries refetch | parallel | ≈ cost book + comments + standard assumptions |

**Illustrative comparison.** These are hypothetical figures, not measured: N = 60 contracts, Nc = 15, Nb = 0, A = 20,
S = 400. A paid toggle then costs the canvas about 4 + reload (60 + 15 + 0 + 2 + 1), so about 82 requests. The code app
needs about 1 + 3 + 1 + 1 + 1, so about 7. A year change costs the canvas about 16 requests and the code app 0.

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-NET-01 | Load shape | OnStart reads every contract, then one `Filter('CAPEX Costs')` per contract (OnStart › 714–750). Reload repeats it (L729–766). Contract totals use one server `Sum` per contract (L1530–1568) | Category-scoped reads; id lists chunked at 40 and run in parallel (`costBook.ts:1013-1166`); totals computed from loaded rows (`gridRows.ts:158-168`) | Perf | Covered | Low | Same figures on screen. The N+1 patterns are removed. See `13-…` GAP-OPT-01 |
| GAP-NET-02 | Local-only actions | Panel open costs 1–2 `SPVDevCo` `LookUp`s (L7303–7308, L12247–12253). The milestone dropdown change costs 1 `CountRows` (L11472–11477). Add Cost from Table costs 1 `SPVDevCo` filter (L2577–2587) | 0 requests. Payer defaults are folded into the book (`costBook.ts:1091`); relink decided from cache (UT-CAPEXR-104); Add Cost from Table only navigates (`Screen.tsx:711-715`) | Perf | Covered | Low | The freshness aspects are rows 08–11 |
| GAP-NET-03 | PCF I/O | The PCF has no `webAPI` or `fetch` (grep of `TableConnectedToDataversePCF/**` and `bundle.js`). Datasets are local collections (L7277, L7653) | The vendored renderer gets plain row objects from `PcfGrid.tsx:11-28`, with no I/O (`PCF-RENDERER-PORT.md:13-14`) | Perf | Covered | Low | No flows on this screen (`04-flow-inventory.md:L72`) |
| GAP-NET-04 | Year change | Every year control runs the Refresh button: comments filter plus Nc to 2Nc aggregates (L2939, L2992, L3058). Server totals and comments are re-read on every year step | 0 requests; data from the all-years cache (`Screen.tsx:728-742`; `costBook.ts:1010-1011`) | Data | Divergent-unmarked | Low | The canvas picks up another user's changes on a year step; the code app only on refetch. No D-entry |
| GAP-NET-05 | Summary tab | Summary totals come from in-memory `colCapexCosts` (L2469–2508, timer L782): 0 requests | `loadCapexTotals` makes 2 + ⌈N/40⌉ requests per Summary visit after 30 s (`costBook.ts:1270-1300`; `useCostBook.ts:365-373`) | Perf | Code-app-only | Low | Fresher than the canvas. See GAP-OPT-19 |
| GAP-NET-06 | Paid on a cluster-linked cost | The confirmation `OnConfirm` reads the contract and **PATCHes `'Linked Cluster': Blank()`**, then sets paid (L19875) | Confirm sends only the cost PATCH (`Screen.tsx:1033-1035`; `capexWrites.ts:53-58`). The contract's link is never cleared | Functional / Data | Divergent-unmarked | **High** | The dialog text the user confirms says the link will be removed (`PAID_CONFIRM_DESCRIPTION`, `panelRules.ts:280-282`). Prior doc `gap-analysis/cost-capex-costs.md:148` (S12) marks this COVERED; see §6. Owner: `07`, `11` |
| GAP-NET-07 | Relink reset: comments | The live relink popup's `RemoveIf('Capex Comments', … 'Comments to payment date')` is **commented out** (L20061–20065). The live copy at L396–399 sits in `cmp_PopUp_Confirmation_1`, which is `Visible: false` (L425–427) | Deletes every payment-date comment of the contract on an accepted relink (`capexWrites.ts:248-251`; UT-BOOK-058). Follows `CapexScreenCode.txt:19917-19920`, where the call is live | Data | Divergent-unmarked | Med | Extra 1 + k requests, and user comments deleted that the canvas on disk keeps. Which version is current? See §5 |
| GAP-NET-08 | Relink reset: paid rows | `UpdateIf('CAPEX Costs', contract && 'Cost Paid' = true, …)` evaluates against the server at confirm time (L20055–20059) | Resets only the paid months in the **cached** `line.payments` (`capexWrites.ts:245-247`). The reset condition also counts cached payment-date comments (UT-CAPEXR-104); the canvas condition queries paid costs only (L11472–11477) | Data | Divergent-unmarked | Low | A month marked paid by someone else since load is missed |
| GAP-NET-09 | Paid toggle: the confirmation decision | `LookUp('CAPEX Project Contracts', …)` at click time decides Individual and linked (L7426–7435) | Decided from the cached line (`Screen.tsx:449`; UT-CAPEXR-058) | Data | Divergent-unmarked | Low | Stale only if the contract was relinked in another session |
| GAP-NET-10 | Standard contract inputs | Fresh `LookUp` of the standard-assumption row, a fresh WTG `Sum` and a fresh milestone `LookUp` on every click (L18230–18303) | Cached: standard assumptions for 30 s (default), WTG count for 5 min (`useCostBook.ts:499`), milestones for 30 min (`:561`) | Data | Divergent-unmarked | Low | An amount can be computed from a WTG count up to 5 minutes old |
| GAP-NET-11 | Standard contract: "already exists" | Server `LookUp` on contracts before creating (L7378–7384) | Checked against the cached `book.lines` (`Screen.tsx:378-381`, `:388-395`) | Data | Divergent-unmarked | Low | A concurrent duplicate is possible within 30 s; the canvas check is also racy |
| GAP-NET-12 | Delete: cost rows | Cost rows are left to the server cascade; only comments and the contract are removed (L8122–8134) | Deletes Rc cost rows explicitly, plus 1 comment read (`capexWrites.ts:329-343`) | Perf | Divergent-marked | Low | `DIVERGENCE:` at `capexWrites.ts:315-327`; D38 §7 |
| GAP-NET-13 | Delete result observability | The comment `RemoveIf`s run inside `IfError(…, Notify(…))` (L8114–8140, L10144–10215) | `deleteComment` uses the generated `delete`, which discards `IOperationResult` (`comments.ts:218-220`). It is used by delete-contract (`capexWrites.ts:336`), the relink reset (`:250`) and the panel (`CommentsPanel.tsx:462`) | Data | Divergent-unmarked | Med | Breaks CONVENTIONS rule 14 and KNOWN-RISKS ("audit other delete call sites"). A refused delete reads as success |
| GAP-NET-14 | Concurrency on updates | `Patch(DS, record, …)` on a row deleted meanwhile errors (inferred) | Generated `update` is a PATCH without `If-Match`, which is an upsert (`client.ts:381-391`). Used for `setCostPaid`, cost updates, contract updates and comment updates; no `updateRecordIfExists` | Data | Divergent-unmarked | Med | R-12. `019-capex-costs.md:84` requires the row version on every mutation; not done |
| GAP-NET-15 | Equal save, nothing schedule-related changed | Cost writes are skipped unless the date, distribution, frequency, cluster or total changed (L17574 › 1579–1586) | Recomputes and PATCHes every month on every save (`Screen.tsx:614-628`; `writeSet.ts:50-51`) | Perf | Divergent-marked | Low | D38 §6. See GAP-OPT-14 |
| GAP-NET-16 | Equal save, schedule changed | `RemoveIf` of all cost rows, then a re-create (L17574 › 1776–1845) | Reconciles in place: updates, creates, then deletes (`capexWrites.ts:254-291`) | Data | Divergent-marked | Med | Paid flags and payment-date comment links survive in the code app and are lost in the canvas. `Screen.tsx:623-626`; D38 §6 |
| GAP-NET-17 | Equal add, final contract PATCH | Final `Patch` resolves a blank `LookUp` on Add, so it writes nothing (L17574 › 1846–1863) | `Average Payment` and `Linked Cluster` are written in the create (`capexWrites.ts:159-181`, `:207-240`) | Data | Divergent-marked | Low | D38 §8 (`Screen.tsx:629-640`) |
| GAP-NET-18 | Comment save write set | Every comment is PATCHed with a root `LookUp` each (L10158–10207) | Only changed rows are written (`CommentsPanel.tsx:482-501`) | Perf / Data | Divergent-marked | Low | `comments.ts:142-147`. Interacts with N-4 (renumbered `Name` not rewritten); owner `09` |
| GAP-NET-19 | Comment save reload | Runs the Refresh button: comments plus aggregates (L10216) | Also refetches the whole active cost book (`useCostBook.ts:606`) | Perf | Code-app-only | Low | The book carries no comments (`costBook.ts:51-53`). GAP-OPT-12 |
| GAP-NET-20 | Focus refetch | None. Data refreshes only on explicit actions | `refetchOnWindowFocus` with a 30 s `staleTime` refetches the active book, comments and standard assumptions (`Providers.tsx:20-24`) | Perf | Code-app-only | Low | Deliberate, for multi-user freshness (`Providers.tsx:22-23`). GAP-OPT-18 |

---

## 5. Open questions / not verifiable from source

1. **Delegation and request shape of the canvas connector.** These are taken from Power Apps platform behaviour, not
   from source:
   - the `in`-collection filters (R1, L729–736);
   - the aggregates (R2), on which App Checker raises no warning;
   - bulk `Patch(DS, ForAll(…))` (one request per row, or one `$batch`);
   - `RemoveIf` and `UpdateIf` with `enableupdateifdelegation: false`.

   Confirm with the browser network trace (F12) on a live canvas run.
2. **Hidden-control evaluation.** Does `cmd_Costs_ProjectCosts_TableCommandBar.Items` (`Visible: =false`, L3566) still
   run its standard-assumption `Filter` and its per-assumption contract `LookUp`s? The flags `delaycontrolrendering` and
   `formuladataprefetch` (`Properties.json:L24`, `L26`) affect this. The same question applies to `gal_Costs_ProjectCosts`
   (`Visible: =//true`). It needs a network trace.
3. **`tmr_Capex_Cost_Cost_EnrichLoader`** has both `AutoStart: =locStartBinding` and `Start: =true` (L19139, L19576).
   Does it run once on screen entry with no selected row? It is local-only either way.
4. **Which canvas version is current** for the relink popup (GAP-NET-07)? On disk (`.pa.yaml`) the comment `RemoveIf`
   is commented out. In `CapexScreenCode.txt:19917` it is live. `CONVENTIONS.md` rule 16 notes that the on-disk canvas
   is solution 1.21.709.
5. **The double reload after a standard contract via the PCF** (§2.12 step 3) is inferred from L18904–18912 not blanking
   `locSelectedProjectContract`. Confirm on a live run.
6. **Real figures for N, Nc, S and request latency** on a production-size project. R-11 says live performance is
   unmeasured.

## 6. Doc disagreements

| Doc | Claim | Source says |
|---|---|---|
| `ProjectDocs/app-docs/gap-analysis/cost-capex-costs.md:148` (S12) | The paid confirmation "confirming clears the link for the whole contract" is COVERED by `Screen.tsx:936-943` | The code confirm path calls only `writes.setPaid.mutate` (`Screen.tsx:1033-1035`), and `setCostPaid` writes only `vsb_costpaid` (`capexWrites.ts:53-58`). The canvas PATCHes `'Linked Cluster': Blank()` (L19875). The line numbers cited there are also stale |
| `ProjectCosts-CodeApp/src/data/capexWrites.ts:84-91` (code comment) and UT-BOOK-058 | The relink `OnConfirm` runs `RemoveIf('Capex Comments', … payment date)`, citing `CapexScreenCode.txt:19906-19925` | In `Capex Costs Screen.pa.yaml:L20061-20065`, the ground truth, that `RemoveIf` is commented out |
| `ProjectDocs/migration-plans/04-flow-inventory.md:L80` | `LoadDevexCapexCostTotalCapacityTrigger` lists "Capex Costs" among its main screen owners | The verified section of the same file (L29) shows it fires on `vsb_project` capacity columns, which this screen never writes. No flow fires on CAPEX contract, cost or comment writes |
| `ProjectDocs/migration-plans/screens/019-capex-costs.md:84` | "Every mutation must include the current row version where available" | No CAPEX write sends a row version or `If-Match` (`capexWrites.ts`, `comments.ts`). See GAP-NET-14 |
| `ProjectCosts-CodeApp/src/data/comments.ts:142-147` (code comment) | The canvas save is "27 writes to change one word" | Not wrong about writes, but incomplete about round-trips. Each canvas `Patch` also issues its own root `LookUp('Capex Comments', …)` (L10172–10175), so the canvas makes 2 requests per comment, 54 at that size |
