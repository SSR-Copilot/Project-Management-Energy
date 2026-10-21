# Gap analysis: Admin Project Gates Approvals Screen

- **Canvas:** `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml` (3,978 lines, read in full). Line numbers are given as `Y:<n>`.
- **Components:** `cmp_NestedCountryPickerColumn`, `cmp_PopUp_Confirmation`, `cmp_PopUp_Loading`, `cmp_Header` and `cmp_Left_Navigation`.
- **Logical names:** verified against `_extracted/msapp/projectmanagement/References/DataSources.json` (`NativeCDSDataSourceInfoNameMapping`). `dataverse-attributes.json` does not cover these five tables.
- **Code:** `ProjectCosts-CodeApp/src/features/admin/admin-gates-approvals/`. Files are cited as `S:` (Screen.tsx, 620 lines), `R:` (rules.ts, 1,228 lines), `H:` (hooks.ts, 126 lines) and `T:` (rules.test.ts).
- **Context:** this screen follows D14 ("UI built, not connected"). Every hook returns `notConnected()` and every write control is disabled. So "not wired" is expected for writes. The status below judges whether the rule, payload or UI that will run once the screen is connected matches the canvas.

## Status summary

| Status | Count |
|---|---|
| COVERED | 60 |
| PARTIAL | 17 |
| MISSING | 14 |
| WRONG | 19 |
| **Total** | **110** |

**Top gaps**
1. **The checklist save and delete payloads target the wrong columns.**
   - `gateActive` is written to `vsb_gateactive`. The checklist column is `vsb_gateisactive`.
   - The PM bind uses the gate nav `vsb_ApprovalParticipant1`. The checklist nav is `vsb_PortfolioManagerId`.
   - The template bind is `vsb_ProjectDefaultCheckList`. The real nav is `vsb_ProjectDefaultCheckListId`.
2. **The Entra people source is wrong.** The canvas `'Microsoft Entra IDs'` is the virtual table `aadusers` / `aaduser`, which is already registered in `power.config.json` as `microsoftentraids`.
   - hooks and rules use `vsb_microsoftentraids` and `vsb_*` columns.
   - `accountenabled` is a Boolean, not `952850000`.
   - The PM bind path is `/vsb_microsoftentraids(<entra object id>)`.
3. **The country rail is wrong.** The Gates canvas does exclude Spain, Greece and Romania (`Y:272-280`). rules, hooks and a test (`UT-ADGATE-001d`) assert the opposite.
4. **The Draft and Reset rules diverge.**
   - `resolveGateActive` keys on the state name "Draft", but the gate name that reaches it is the transition label. On the gate branch the Draft guard never fires.
   - The same rule is also applied to the checklist branch, where the canvas does not apply it.
   - Reset Gate keeps a Draft gate active (`UT-ADGATE-035b`). The canvas writes `'Gate active': false` unconditionally.
5. **Several canvas behaviours are missing outright:**
   - the check-list row status toggle (canvas: always enabled, `Patch` flip);
   - removing a selected person from any picker;
   - the `MaxPeople` caps of 20, 5 and 20;
   - the "N Contributors / N Approvers / N Notifications" cell collapse;
   - the gate description `Switch` ("Draft to Cluster 1" / "Cluster n to Cluster n+1");
   - the loading, success and `Notify` texts.

**D15 verdict (item h):** accurate. `MSG.deleteChecklistTitle` (`R:541`) is "Delete this check-list approval?", while the canvas `cmp_DeleteChecklistApprovalItem_AdminScreen.Title` (`Y:3976`) is "Delete Check List Approval Item?". The screen renders the verbatim `SCREEN_LABELS.deleteTitle` (`R:484`, `S:394`). But:
- the JSDoc at `R:540` still calls the wrong string "the canvas title";
- the constant is unused;
- D15 misses other gates wording defects: X1–X4 below, plus `PANEL_LABELS.titleTask` citing a control (`…_Form_Title_1`, "Edit Task") that does not exist in the YAML (0 hits).

**Tables absent from `power.config.json`:**
- `vsb_projectdefaultapprovalses`
- `vsb_checklistdefaultapprovalses`
- `vsb_projectdefaultchecklistses`
- `vsb_checklistcountryandtechnologies`

Already registered: `vsb_countries`, `vsb_projectstates`, and `aadusers` (key `microsoftentraids`). `vsb_microsoftentraids`, which hooks `TABLES` lists, does not exist: it should be `aadusers`.

---

## 1. Data

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| D1 | The country rail shows `Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))`. `cmp_…NestedCountryTechnologyPicker.Countries` `Y:272-280` | `buildGateCountryRailItems` passes no exclusion (`R:191-197`). JSDoc `R:78` says "The GATES screen passes the UNFILTERED list". `H:17` says "no exclusion on Gates". `T:122-134` asserts the wrong behaviour. | **WRONG**. Canvas: excludes 3; code: "unfiltered" |
| D2 | Rail order (`Order` `Switch`): Germany 1, France 2, Poland 3, Italy 4, Finland 5, Croatia 6. `OnVisible` `Y:96-121` | `COUNTRY_PICKER_ORDER` / sort, `R:70-106` | COVERED |
| D3 | Nestings: Wind (1) and PV (2) for each of the 6 countries. `…Picker.Nestings` `Y:283-366` | `PICKER_TECHNOLOGIES`, `R:87,195` | COVERED |
| D4 | Gates are `Filter('Project States', 'Is Visible On Checklist', Order < 6)`, sorted by Order. `gal_…_Clusters.Items` `Y:703-730` | `configurableGates`, `R:580-585` | COVERED |
| D5 | Gate approvals are `'Project Default Approvals'` where `'Approvals Country'.Country = SelectedCountry.Country` and `Text(Technology) = SelectedNestedValue`. `Y:684-695` | The `H:21-25` checklist `$filter=_vsb_approvalscountry_value … and vsb_technologycode eq …` (stub) | COVERED (planned) |
| D6 | Every gate gets a row: `Coalesce(LookUp(sorted, Order = Gate.Order), placeholder)`. `LookUp` takes the first match. `Y:709-730` | `mergeGatesWithApprovals` matches on `clusterStateId`, and on duplicates the **last** one wins (`Map.set`). `R:596-608` | PARTIAL (duplicate tie-break differs) |
| D7 | Nested `'Check List Default Approvals'` rows are filtered on the template's `'Associated Country And Technology'` = Tech and on `'Cluster State'.Order = StateOrder`, then sorted by the template's `Order`. `gal_…_ChecklistDefaultApprovals.Items` `Y:891-920` | `checklistApprovalsForGate` `R:1021-1038`. `H:39-42` filters with `in (<itemIds>)`. | COVERED |
| D8 | Tech is `LookUp('Checklist Country And Technologies', techText = nested && Country.Country = country)`. `Y:898-905` | `useScopeCountryTechId`, `H:26-29`, `_vsb_country_value` / `vsb_technology` (both verified) | COVERED (planned) |
| D9 | Templates `'Project Default Checklists'` carry no "To Delete" filter anywhere in the canvas (`Y:774-792`, `Y:2840-2925`). | `H:32-33` adds `vsb_todelete ne true`. This is not logged as a DIVERGENCE. | PARTIAL |
| D10 | Gate dropdown items:<br>• `Sort(AddColumns('Project States', strOrder, Text(Order), nextStateName, LookUp(Order = Order+1).Name), strOrder)`, a **string** sort with the next state taken over **all** states;<br>• `FirstN(visible, n-1)`;<br>• `Label = Name & " to " & next`;<br>• exclude next in ["Inactive/ On-hold","Abandoned"].<br>`drp_…_State.Items` `Y:2681-2728` | `gateDropdownItems` takes the next **visible** state and sorts numerically. `R:638-653` | PARTIAL (the label differs if an invisible state sits at Order+1) |
| D11 | Check List options: templates for country × tech × `'Cluster State'.Order = drp_State.Selected.Order` that are **not already** in the nested gallery. On edit, only the record's own template. `drp_…_State_1.Items` `Y:2884-2926` | `items.filter(i => i.clusterStateId === panel.gate.id)`. Already-approved templates are not excluded. `S:374-375` | PARTIAL |
| D12 | People source `'Microsoft Entra IDs'`:<br>• `Filter('Microsoft Entra ID Account Enabled' = …Yes)`;<br>• `Search(term, 'Display Name','Given Name',Surname,Mail)`;<br>• blank or error term → `Blank()`.<br>`pcf_…PortfolioManger.OnSearch` `Y:3088-3116`, same in `Y:3219`, `Y:3351` and `Y:3481`. **Real table:** `aadusers` / `aaduser`, PK `aaduserid`; columns `id`, `displayname`, `givenname`, `surname`, `mail`, `accountenabled` (BooleanType). | • `ENTRA_COL` = `vsb_microsoftentraidid` / `vsb_entraid` / `vsb_displayname` / …, `R:314-323`<br>• `ENTRA_ACCOUNT_ENABLED_YES = 952850000`, `R:326`<br>• `TABLES` `ES.microsoftEntraIds` = `vsb_microsoftentraids`, `H:77`<br>• `H:43-46` | **WRONG**. Canvas: `aadusers`, `accountenabled eq true`; code: `vsb_microsoftentraids`, `vsb_accountenabled eq 952850000` |
| D13 | Cluster PM prefill: `LookUp('Microsoft Entra IDs', Id = 'Portfolio Manager'.'A unique identifer…')`, renamed to `PersonaKey/Name/Role`. `Y:2379-2416`. (The checklist edit uses `Users`, not Entra: `Y:1554-1571`. That is a SOURCE DEFECT.) | `usePortfolioManagerPersonas` filters on `vsb_microsoftentraidid in (…)`, `H:47-49` | PARTIAL (the idea is right; the table and column are wrong, see D12) |
| D14 | Cluster save: `Patch('Project Default Approvals', …)`, writing `Name`, `'Approvals Country'`, `'Cluster State'`, `'Approval Mode'`, `'Gate active'`, `'Portfolio Manager'`, the three JSON lists, `Technology` and `'Owning Business Unit'` on **every** save. `pcf_but_…_Save.OnChange` `Y:3723-3812` | `buildApprovalPayload` writes country, cluster state and technology on **create only**. `R:866-878`, `T:416` | PARTIAL (it is a divergence and needs logging) |
| D15 | Cluster `'Gate active'` is `If(drp_State.Selected.Name <> "Draft", toggle, true)`, where `Name` is the **state** name. `Y:3738-3742` | `resolveGateActive(gateName, …)` `R:700-702,856`. The `gateName` on hand is the transition label (`S:156-157`, `gateRecordName`), so "Draft to Cluster 1" ≠ "Draft" and the guard never fires. `R:1149-1151` admits this. | **WRONG** (latent) |
| D16 | PM is `LookUp('Microsoft Entra IDs', Id = GUID(First(SelectedPeople).PersonaKey))`, i.e. the record is resolved by Entra object id. `Y:3743-3753` | `` `${GATE_LOOKUP.portfolioManager}@odata.bind` = `/vsb_microsoftentraids(${id})` ``, where id = the Entra object id (Persona id) and the nav is `vsb_ApprovalParticipant1`. The real nav is `vsb_Approvalparticipant1` (case) and the set is `aadusers(<aaduserid>)`. `R:306,862-864` | **WRONG** |
| D17 | Checklist save: `'Gate active'` = `tog.Checked` (no Draft rule). Column `vsb_gateisactive`. `Y:3834` | Uses `GATE_APPROVAL_COL.gateActive` = `vsb_gateactive` on both branches, plus `resolveGateActive`. `R:856`, compare `R:293` | **WRONG** (column and rule) |
| D18 | Checklist `'Portfolio Manager'`: nav `vsb_PortfolioManagerId`. `Y:3835-3845` | Binds `vsb_ApprovalParticipant1` (the gate table nav). `R:862` | **WRONG** |
| D19 | Checklist `'Project Default Check List'` = the chosen template, on every save. Nav `vsb_ProjectDefaultCheckListId`. `Y:3829-3832` | `GATE_LOOKUP.projectDefaultChecklist = "vsb_ProjectDefaultCheckList"`, written on create only. `R:307,884-887` | **WRONG** (nav name) |
| D20 | Checklist `Name` = `drp_State_1.Selected.Name`. `Y:3828` | `panel.checklistItem?.name ?? ""`, `R:881` | COVERED |
| D21 | `'Default Approvals'` (gate) vs `'Default Approvers'` (checklist), written when mode ≠ Only Notifications. `Y:3766-3777`, `Y:3858-3869` | `R:870,883`, `T:386-405` | COVERED |
| D22 | `'Default Contributors'` only in Formal Approval. Notifications whenever the list is non-empty. PM only in Formal. `Y:3754-3789` | `personaFieldsForMode`, `R:816-827` | COVERED |
| D23 | Persona JSON is `JSON(ShowColumns(SelectedPeople, PersonaKey, PersonaName, PersonaRole))`. Read back as `{Id: PersonaKey, DisplayName: PersonaName, Mail: PersonaRole}`. `Y:3756-3762`, `Y:1578-1585` | `parsePersonaList` / `serialisePersonaList`, `R:224-252` | COVERED |
| D24 | `'Owning Business Unit'` = `LookUp('Project States', = drp_State.Selected).'Owning Business Unit'`, on both branches. `Y:3798-3801`, `Y:3882-3885` | Taken from `panel.gate.owningBusinessUnitId`, `R:890-894` (the documented fix) | COVERED |
| D25 | Gate chip: `Patch('Project Default Approvals', DropColumns(ThisItem,Id,Order), {'Gate active': If(Self.Text="Active", false, true)})`. `btn_…_ToggleStauts.OnSelect` `Y:2231-2238` | `planToggleGateActive`, `R:930-941` | COVERED (not wired, D14) |
| D26 | Checklist chip: `Patch('Check List Default Approvals', ThisItem, {'Gate active': flip})`. `btn_…ChecklistDefaultApproval_Item_ToggleStatus.OnSelect` `Y:1480-1487` | No plan exists. The chip is hard-disabled (`S:272-276`). | **MISSING** |
| D27 | Delete: `Remove('Check List Default Approvals', locSelectedChecklistApprovalEntity)`. `cmp_DeleteChecklistApprovalItem_AdminScreen.OnConfirm` `Y:3974` | `planDeleteChecklistApproval`, `R:949-960` | COVERED (not wired) |
| D28 | Reset Gate: `Patch('Project Default Approvals', locSelectedApprovalsEntity, {'Gate active': false, 'Portfolio Manager': Blank(), 'Default Contributors'/'Default Approvals'/'Default Notifications': Blank()})`, with no other fields. `btn_…_ResetGateApproval.OnSelect` `Y:3592-3616` | `planResetGate` reuses `buildApprovalPayload`. It also writes `Name`, `Approval Mode` and OBU, and Draft stays **active**. `R:985-1011`, `T:718-722` | **WRONG**. Canvas: `false` always; code: `resolveGateActive` → `true` for Draft |
| D29 | Add Task `OnSelect` immediately does `Patch(Defaults('Check List Default Approvals'), {'Gate active': false, Name: "", 'Approval Mode': Only Notifications})`. `Y:809-842` | Deferred to Save (no orphan rows), `R:40-42` | COVERED (DIVERGENCE; not in 02-OPEN-DECISIONS) |
| D30 | Gate Edit creates the row if it is missing (`Gate active` true, Only Notifications, country, tech `Switch`, `Cluster State`). For non-Wind/PV it silently resets the mode and lists. `Y:2295-2358` | Deferred to Save, plus `nonWindPvBanner`. `R:40-44,685-687` | COVERED (DIVERGENCE; not logged in D15) |
| D31 | Every read and write actually runs | All hooks return `notConnected`, `H:82-126` | MISSING (by D14) |

## 2. Behaviour

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| B1 | `OnVisible`: `locIsVisibleApprovalsRightPanel=false`, entity Blank, loading off, empty `colApprovals1-4` / `PreSelected`, `col_CollapsedApprovalGates` empty. `Y:15-135` | Initial `useState` (`panel=null`, `collapsed=∅`), `S:136,152-154` | COVERED |
| B2 | Default scope: the first country (Germany) and its first child (Wind). Picker `SelectedCountry` / `SelectedNestedValue` (component `Y:137-138`). | `defaultScope`, `S:91-97,106` | COVERED |
| B3 | Rail: "+"/"-" expands a country, and clicking a technology selects the scope. Component `Y:171,277-296` | `toggleCountry` / `setPicked`, `S:193-197,317-346` | COVERED |
| B4 | Collapse "-"/"+" toggles `col_CollapsedApprovalGates`. `btn_…_Collapse.OnSelect` `Y:1721-1739` | `toggleCollapsed`, `S:141-145` | COVERED |
| B5 | When a gate is collapsed only the nested gallery hides. `con_AddChecklistApproval` has no `Visible`, so **Add Task stays visible** (`Y:741-762`). | `if (!expanded) continue;` skips the Add Task row too, `R:1164` | **WRONG** |
| B6 | Gate Edit opens the panel as type "Cluster", prefilled from the record (PM, contributors, approvals, notifications). `Y:2289-2461` | `gatePanelFrom`, `S:159-171,286-288` | COVERED |
| B7 | Checklist Edit opens the panel as type "Checklist", `locCreateNewRecord=false`, prefilled. `Y:1537-1616` | `checklistPanelFrom`, `S:172-183` | COVERED |
| B8 | Add Task opens the panel as type "Checklist", `locCreateNewRecord=true`, defaults `Gate active=false` and Only Notifications, Check List = `FirstN(unapproved,1)`. `Y:809-842`, `Y:2833-2877` | `nextUnapprovedItem` + `checklistPanelFrom(…, null)`, `S:185-191,228` | COVERED |
| B9 | The gate chip toggles **without confirmation** (`Y:2231`). | `ConfirmDialog` titled "Switch this gate off?" opens on every click, **including when the gate is activated**. `S:383-390`, `R:536-539` | **WRONG** (new UX; wording wrong when activating) |
| B10 | The checklist chip toggles (always enabled; it has no `DisplayMode`). `Y:1452-1505` | `statusChip(r.active, false, …, () => undefined)`, `S:272-276` | **MISSING** |
| B11 | Delete click sets the entity and opens the confirmation. `Y:1637-1642` | `setDeleteTarget`, `S:295,392-407` | COVERED |
| B12 | Delete confirm sets loading on with "Approval item for {headline}\rCheck List: '{…}' being deleted, please wait...", runs `Remove`, then sets loading off. `Y:3966-3975` | `onConfirm={() => setDeleteTarget(null)}`, `S:405` | MISSING (D14, and no loading text in rules) |
| B13 | Save:<br>1. Show loading text.<br>2. `IfError(Switch(type, "Cluster" → Patch PDA, "Checklist" → Patch CLDA))` → success text, or error text + `Notify`.<br>3. Reset.<br>4. Close the panel and hide loading.<br>`pcf_but_…_Save.OnChange` `Y:3706-3904` | `onSave={onClose}`, `S:442` | MISSING (D14; no mutation sequence or messages) |
| B14 | Cancel: Reset + close. `pcf_but_…_Cancel.OnChange` `Y:3934-3942` | `onCancel={onClose}`, `S:443` | COVERED |
| B15 | Close (X) in the command bar: Reset, close, `locSelectedApprovalsEntity` Blank. `pcf_com_…_CommandBar.OnSelect` `Y:2551-2561` | `FormPanel onDismiss={onClose}`, `S:439` | COVERED |
| B16 | Reset Gate: Patch, Reset, close, loading off. `Y:3592-3624` | `onClick={onClose}`, `S:559` | MISSING (D14) |
| B17 | `OnSearch` per picker. Blank term → no suggestions. `Y:3088` … | `usePeopleSearch` stub + `shouldSearchPeople` / `entraSearchFilter`, `R:1192-1206` (wrong columns, see D12) | PARTIAL |
| B18 | Picking a person clears the suggestions and search text (`OnSelect` `ClearCollect(…, Blank())`). `Y:3117-3121` | `setTerm("")`, `S:610` | COVERED |
| B19 | Header logo → `Navigate('Project Main Screen')`. The left nav uses `LeftAdminNavigationMenu`. `Y:175`, `Y:228-252` | App shell. Nav entry "Project Gates" → `/admin/gates-approvals` (`app/navigation.ts:153`, `app/routes.tsx:152`) | COVERED |

## 3. State gates, validation and messages

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| S1 | The panel is `Visible: =locIsVisibleApprovalsRightPanel` (`Y:2484`). | `FormPanel open={panel !== null}`, `S:436` | COVERED |
| S2 | Title: `If(IsBlank(locSelectedApprovalsEntity), "Add Approvers", "Edit Approvers")` (`Y:2531`). A Cluster edit always has an entity, so it shows "Edit Approvers". The Checklist path leaves the cluster entity Blank, so it shows "Add Approvers". | `panel?.existingId ? "Edit Approvers" : "Add Approvers"`, `S:437` (placeholder gate → "Add"; checklist edit → "Edit") | PARTIAL (open question Q3) |
| S3 | `drp_…_State.DisplayMode` = `DisplayMode.Disabled` (live line `Y:2680`; the `//` line `Y:2679` is ignored). | `Dropdown disabled`, `S:461` | COVERED |
| S4 | The Gate required asterisk `lbl_…_State_Requered` is `Visible: =false` (`Y:2765`). | `<Field label="Gate" required>`, `S:459` | **WRONG** (asterisk shown) |
| S5 | Check List block is `Visible: =locEditigApprovalType = "Checklist"` (`Y:2783`), with an asterisk shown (`Y:2826`). | `panel.kind === "checklist"` + `required`, `S:469-470` | COVERED |
| S6 | Check List `DisplayMode`: Edit when creating, otherwise Disabled (`Y:2878-2883`). | `disabled={!connected \|\| panel.existingId !== null}`, `S:472` | COVERED |
| S7 | "The cluster cannot be blank." shows when `drp_State.Selected` is blank (`Y:2656-2657`) **and** when `drp_State_1.Selected` is blank (`Y:2799-2800`). Neither gates Save. | `MSG.clusterBlank` (`R:526`) is defined but never rendered. A blank Check List is reachable (gate with no templates). | MISSING |
| S8 | The main error "Default Approval for the selected Gate allready exists." (`Y:2620-2622`) | `validatePanel.duplicateGate` `R:753-769`; `S:452-456` | COVERED (documented re-interpretation) |
| S9 | The toggle `DisplayMode` is Edit if `drp_State.Selected.Name <> "Draft" \|\| type = "Checklist"`, otherwise View. `Checked` = checklist entity active \|\| cluster entity active. `Y:2961-2967` | `canToggleGateActiveInPanel(kind, gateName.split(" to ")[0])`, `S:489-490`; `R:704-706` | COVERED (fragile string split; see D15) |
| S10 | Approval Mode items: Wind/PV → `Choices('Approval Mode')`, otherwise only Only Notifications. Default `Coalesce(entity mode, Only Notifications)`. `Y:2990-3006` | `approvalModeChoices` / `defaultApprovalMode`, `R:664-672`; `S:502` | COVERED |
| S11 | PM and Contributors containers are visible only in Formal Approval, each with an asterisk (`Y:3051,3157,3179,3289`). | `{formal ? …}` + `required`, `S:511-530` | COVERED |
| S12 | The Approvers container is visible when mode ≠ Only Notifications. Its asterisk is always visible (`Y:3311,3419`). | `{onlyNotifications ? null : …}` `required`, `S:532-541` | COVERED |
| S13 | Notifications is always visible. Its asterisk shows only for Only Notifications (`Y:3551`). | `required={onlyNotifications}`, `S:543-550` | COVERED |
| S14 | "Value cannot be empty." ×4 with each condition: PM / Contributors in Formal, Approvers when ≠ OnlyNotif, Notifications when = OnlyNotif. `Y:3067-3075,3195-3203,3327-3335,3457-3465` | `validatePanel` `R:757-763`; `MSG.valueEmpty` `R:518`; `S:595` | COVERED |
| S15 | Save is Disabled if any of the 5 error labels is visible (`Y:3679-3688`). | `canSavePanel`, `R:773-779`; `S:444` | COVERED |
| S16 | Reset Gate is visible for type "Cluster" (`Y:3570`) and always enabled. | `panel.kind === "gate"`, `S:552`. `canResetGate` requires `existingId`, `R:973-975`. | PARTIAL (divergence; follows from deferred create) |
| S17 | Gate chip `DisplayMode`: View when the three lists are blank or `'Cluster State'.Order = 0` (`Y:2217`). | `canToggleGateChip`, `R:712-720`; `S:268` | COVERED |
| S18 | Add Task is Disabled when no unapproved template exists. The canvas checks the **whole** CLDA table (`Y:769-797`). | `canAddChecklistApproval` checks the current scope only, `R:1053-1071`; `S:225` | COVERED (fixed; not logged in D15) |
| S19 | Collapse is visible when the nested gallery has more than 0 items (`Y:1761`). | `hasTasks \|\| !open`, `S:244` | COVERED |
| S20 | `MaxPeople`: PM 1 (`Y:3087`), Contributors 20 (`Y:3216`), Approvers 5 (`Y:3348`), Notifications 20 (`Y:3478`). | Only `maxPeople={1}` is passed (`S:517`). `applyPersonaSelection` JSDoc: "the other three are unbounded", `R:1213-1227`. | **WRONG** |
| S21 | Suggestions exclude people already selected: `Filter(colX, Not(Mail in SelectedPeople.PersonaRole))` (`Y:3260,3391,3521`). | Selected people still appear in the suggestions; picking one is only deduplicated, `R:1225-1227`; `S:605` | PARTIAL |
| S22 | Loading popup `cmp_Admin_Loading` (`Visible=locAdminLoadingDialog`) shows these texts:<br>• "Approvals data for {headline}\rGate: '{label}' will be saved, please wait..."<br>• "Approvals data for {headline}\rCheck List: '{name}' will be saved, please wait..."<br>• the delete text (B12)<br>`Y:3710-3713`, `Y:3946-3952` | No `LoadingOverlay`. The strings are absent from `rules.ts`. | MISSING |
| S23 | Success text "Approvals was successfully saved." (`Y:3891`) | Absent | MISSING |
| S24 | Error text and `Notify`, verbatim: `"Error: Approvals type could not be saved. Internal error: originated on {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}"` (`Y:3893-3895`) | Absent. `R:51-52` says one banner will replace both, but none exists. | MISSING |
| S25 | Every write stays disabled while the screen is not connected (D14). | `connected` gate, `S:129-130,225,268,282,293,444` | COVERED |

## 4. UI: controls, captions, aria-label, data-testid

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| U1 | Page title is `cmp_Header.Project.Name` "Project Gates" (`Y:179`). | `SCREEN_LABELS.pageTitle`, `S:309` | COVERED |
| U2 | Headline `$"Project Gates \| {Country.Name} {If(IsBlank(tech),"","\| "&tech)}"`, testid `lbl_Admin_ProjectGates_Approvals_Headline` (`Y:417-422`). | `gatesHeadline` `R:495-496`; `S:350-352` | COVERED |
| U3 | Headers: Description, Portfolio Manager, Contributors, Approvers, Notifications, Status, Action (`Y:447-668`). | `GATE_TABLE_COLUMNS` `R:509-512`; `S:360` | COVERED |
| U4 | Gate description: `Switch(ThisItem.Order, 0, "Draft to Cluster 1", $"Cluster {Order} to Cluster {Order+1}")`. `lbl_…_Item_ApprovalDescription.Text` `Y:1790-1796` | `approval.name \|\| dropdown label \|\| gate.name`, `R:1137-1140` | **WRONG** |
| U5 | Checklist description = `ThisItem.'Project Default Check List'.Name` (`Y:1042-1043`). | `t.item?.name ?? t.approval.name`, `R:1173` | COVERED |
| U6 | Person cells: `Concat("{DisplayName}\n({Mail})", "\n\n")` if count < 4. Otherwise "{n} Contributors" / "{n} Approvers" / "{n} Notifications". Blank → "-". `Y:1137-1162,1258-1284,1892-1918,2012-2038,2134-2160` | `personLines` gives "Name (mail)" per line, with no count collapse. `R:260-267` | PARTIAL |
| U7 | Checklist Notifications cell: lists people when `(C<4 && A<4 && N<4) \|\| N = 1`, using the "`;\n\n`" separator. `Y:1382-1410` | Not modelled | MISSING |
| U8 | Gate PM cell `Coalesce('Display Name', "-")`, tooltip `$"{Self.Text}, ({Mail})"` (`Y:1830-1835`). Checklist PM `"{Display Name}\r{Mail}"` or "-" (`Y:1077-1078`). | "Name (mail)" for both, `R:1146,1176`; `title=line`, `S:201` | PARTIAL |
| U9 | Cell tooltips list every person (some with "`;`" separators, e.g. `Y:1178,1934`). | `title` per line only, `S:201` | PARTIAL |
| U10 | Chip captions "Active" / "Inactive". Fill RGBA(173,209,121) / RGBA(200,200,200). Border RGBA(100,152,67) / RGBA(120,120,120). `Y:1456-1505,2206-2256` | `S:76-81,205-216` (no border colour) | COVERED |
| U11 | Collapse captions "-" / "+" (`Y:1750-1760`). | `R:474-476`; `S:252` | COVERED |
| U12 | Add Task caption `"   Add Task"`, Add icon (`Y:803,847`). | "Add Task" (trimmed, documented), `R:478`; `S:224-230` | COVERED |
| U13 | Gate row: Edit only. Checklist row: Edit + Delete. Icons "Edit" / "Delete" (`Y:1533,1633,2285`). | `S:280-297` | COVERED |
| U14 | Panel captions: "Gate", "Check List", "Gate active", "Approval Mode", "Portfolio Manager", "Contributors", "Approvers", "Notifications" (`Y:2747,2809,2968,3014,3139,3271,3402,3532`). | `PANEL_LABELS` / `SCREEN_LABELS`, `R:423-489` | COVERED |
| U15 | Hint texts: "Select Portfolio Manager", "Select Contributors", "Select Approvers", "Select Notifications" (`Y:3085,3213,3345,3475`). | placeholders, `S:515,523,535,545` | COVERED |
| U16 | PCF tooltips: "Search for portfolio manager", "Select Contributors", "Select Approvers", "Select Notifications" (`Y:3130,3262,3393,3523`). | No tooltip on the pickers | MISSING |
| U17 | Reset Gate caption "Remove all cluster gate participants and deactivate the gate approval." and button "Reset Gate" (`Y:3586,3625`). | `MSG.resetGateCaption` / `PANEL_LABELS.resetGate`; `S:554-563` | COVERED |
| U18 | Delete dialog: Title "Delete Check List Approval Item?", buttons "Delete" / "Cancel", icons Trash / Cancel (`Y:3958-3976`). | `S:392-404` | COVERED |
| U19 | Delete description: `"Are you sure you want to execute the deletion?\r\r{Country} - {Tech}\r{lbl_…_Item_ApprovalDescription.Text}\rCheck List Item: '{drp_State_1.Selected.Name}'"` (`Y:1641`). The canvas reads the stale form combobox (a SOURCE DEFECT). | `deleteChecklistApprovalText` with `gateLabel` = dropdown label (not the U4 `Switch` text); the item comes from the row. `R:502-506`; `S:396-399` | PARTIAL |
| U20 | Approval Mode option labels | `APPROVAL_MODE_OPTIONS`, Formal / Local / Only Notifications, `R:411-415` | COVERED |
| U21 | A PCF people picker can remove a selected persona. | Selected people render as plain `<Text>` with no remove control. `S:617` | MISSING |
| U22 | `AccessibleLabel` "Project Status" on `drp_…_State` (`Y:2665`) | `aria-label="Project Status"`, `S:462` | COVERED |
| U23 | `AccessibleLabel` "Reset" on the hidden `but_…_Buttons_Reset` (`Y:3653`) | Hidden helper, not needed (state reset) | COVERED |
| U24 | Canvas testids for interactive controls (rule 16): Add Task, Collapse, both chips, both Edits, Delete, the State / State_1 dropdowns, the toggle, the radio, 4 pickers, Reset Gate, Save, Cancel | `S:227,249,269,274,284-285,294,463,475,488,499,516,524,536,546,558,445-446` | COVERED |
| U25 | Close X is `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar` (`Y:2533`). The rail is `cmp_…NestedCountryTechnologyPicker`, with children in `gal_Countries` / `gal_CountryNestedChilds`. | Close is the shared `panel-close` / "Close panel". Rail technology ids are `admin-gates-approvals-technology-…` (`S:337`). The rail `aria-label` is "Project Gates" (`S:314`). | PARTIAL |
| U26 | Country flag images in the rail (`'Flag Image'` `Switch`, `Y:74-95`) | None | MISSING |
| U27 | Panel title testid `lblAdmin_ProjectGates_Approvals_Form_Title`, error label testids (`lbl_…_ErrorMessage`) and dialog testid `cmp_DeleteChecklistApprovalItem_AdminScreen` | The Field validation messages and the `ConfirmDialog` have no canvas testid (only `…Main_ErrorMessage`, `S:453`). | PARTIAL (non-interactive, low priority) |

## 5. Code comments and wording that contradict the canvas

| # | Where | Problem | Status |
|---|---|---|---|
| X1 | `R:23-24` | The JSDoc says "`RequireAdmin` guards the route and `canEditScope` gates every write plan". No `RequireAdmin` exists in `src` (grep: 0). `routes.tsx:152` is unguarded, and `canEditScope` is not called from `Screen.tsx`. | **WRONG** |
| X2 | `R:78,190`, `H:17`, `T:122` | "Gates passes the unfiltered list" (see D1). | **WRONG** |
| X3 | `R:540` | The JSDoc on `MSG.deleteChecklistTitle` calls it "the canvas title for this dialog" (D15 h). The constant is unused. | **WRONG** |
| X4 | `R:426-431` | `PANEL_LABELS.titleTask` cites `…_Form_Title_1.Text` ("Edit Task"). No such control or string exists in the YAML. The constant is unused. | **WRONG** |
| X5 | `R:1210-1211` | "the other three are unbounded" (see S20). | **WRONG** |
| X6 | `R:51-52` | Says the error surface was merged into "one banner", which does not exist (S24). | PARTIAL |
| X7 | 02-OPEN-DECISIONS D15 | Lists only item (h) for gates. These DIVERGENCE / SOURCE DEFECT fixes are not logged (rule 8):<br>• deferred create (D29/D30);<br>• no silent non-Wind/PV reset;<br>• scoped Add Task (S18);<br>• OBU from the record's own gate (D24);<br>• duplicate-guard re-interpretation (S8);<br>• `vsb_todelete` filter (D9);<br>• the confirm dialog on the chip (B9);<br>• Reset disabled without a record (S16);<br>• the checklist PM taken from `Users` (D13). | **WRONG** (rule 8 not met) |
| X8 | Save `Tooltip` "Filter projects details list view." (`Y:3908`) | A copy-paste SOURCE DEFECT. It is correctly not ported, but it is not logged. | COVERED |

---

## Proposed changes

### (a) UI: `Screen.tsx`

| # | Change | Size |
|---|---|---|
| a1 | Enable the checklist row status chip and wire it to a new `planToggleChecklistActive` (D26/B10). Decide with the PO whether the confirmation dialog stays (see a2). | S |
| a2 | Toggle confirmation (B9): either remove it (canvas parity) or show it only when deactivating, with an activation-neutral title. Log the choice in D15. | S |
| a3 | Keep the Add Task row visible when a gate is collapsed (B5). This needs `R:1164` to emit `addTask` before the `continue`. | S |
| a4 | PeoplePicker: pass `maxPeople` 20 / 5 / 20 (S20), hide people who are already selected from the suggestions (S21), add a remove ("×") control per selected persona with `aria-label` + `data-testid` (U21), and add the canvas tooltips (U16). | M |
| a5 | Remove `required` from the Gate field (S4). Render `MSG.clusterBlank` under Check List when no template is selected, and gate Save on it (S7, PO Q4). | S |
| a6 | Wire Save, Reset Gate and Delete through a `useMutation` / `WritePlan` (after c3). Show `LoadingOverlay` with the verbatim save and delete texts and the success text, and show the verbatim error in a MessageBar (S22–S24, B12, B13, B16). Close and reset the panel afterwards. | M |
| a7 | Person cells: render "{name}\n({mail})" blocks, collapse to "{n} Contributors" / "{n} Approvers" / "{n} Notifications" when there are 4 or more, add a full-list tooltip, and use the special checklist-notifications rule (U6, U7, U9). The gate PM cell shows the name only, with tooltip "{name}, ({mail})" (U8). | M |
| a8 | Title logic (S2): match the canvas or confirm the current behaviour (PO Q3). | S |
| a9 | Optional parity items: rail flags (U26), canvas testids on the panel title, error labels and delete dialog (U27), and the close button testid `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar` if the shared `FormPanel` allows overriding it (U25). | S |

### (b) `rules.ts` (+ tests)

| # | Change | Size |
|---|---|---|
| b1 | **Fix the checklist payload columns** (D17–D19). Split `buildApprovalPayload` into per-table column maps:<br>• checklist gate active `vsb_gateisactive`;<br>• checklist PM nav `vsb_PortfolioManagerId`;<br>• template nav `vsb_ProjectDefaultCheckListId`;<br>• gate PM nav `vsb_Approvalparticipant1` (case as in DataSources.json; verify against `.power` schema).<br>Add tests that assert each key per branch. | M |
| b2 | **Fix the Entra model** (D12, D16):<br>• `ENTRA_COL` → `aaduserid`, `id`, `displayname`, `givenname`, `surname`, `mail`, `accountenabled`;<br>• filter `accountenabled eq true` (delete `ENTRA_ACCOUNT_ENABLED_YES`);<br>• bind `/aadusers(<aaduserid>)`;<br>• carry both `aaduserid` and `id` on `Persona` (`PersonaKey` = `id`, as the canvas stores it).<br>Update `UT-ADGATE-020`. | M |
| b3 | **The Draft rule** (D15, D17, D28):<br>• pass the state **name** (`panel.gate.name`) to `resolveGateActive`, not the transition label;<br>• apply it only on the gate branch;<br>• change `canToggleGateActiveInPanel` to take `panel.gate.name` (drop the `split(" to ")`);<br>• `planResetGate` writes only `{gateActive:false, PM:null, three lists:null}` (canvas `Y:3598-3603`).<br>Rewrite `UT-ADGATE-010` / `035b`. | S |
| b4 | Country rail exclusion (D1): `buildGateCountryRailItems` passes `COST_CONTRACT_EXCLUDED_COUNTRIES` (rename it to `PICKER_EXCLUDED_COUNTRIES`). Fix the JSDoc at `R:75-80,190`, and rewrite `UT-ADGATE-001d` to expect the exclusion on Gates. | S |
| b5 | Gate description (U4): add `gateDescription(order)` = order 0 → "Draft to Cluster 1", otherwise `Cluster ${o} to Cluster ${o+1}`. Use it in `buildGateTableRows` and in `deleteChecklistApprovalText` (U19). Add a test. | S |
| b6 | `gateDropdownItems` (D10): resolve `next` as the state with `order + 1` over **all** states, and replicate the `FirstN(visible, n-1)` / exclusion semantics. Add a test with an invisible state at order+1. | S |
| b7 | Add `planToggleChecklistActive(approval, canEdit)`, a flip of `vsb_gateisactive` (D26). Add a test. | S |
| b8 | Add `checklistOptions(items, approvals, gateId, countryTechId, editing)`, which excludes already-approved templates on create (D11). Add a test. | S |
| b9 | `personCellText(people, kind)`, with the count collapse and the notifications special case (U6/U7), plus verbatim message constants: `MSG.saving(headline, gateLabel)`, `MSG.savingChecklist`, `MSG.deleting`, `MSG.saved = "Approvals was successfully saved."`, `MSG.saveError(source, message, http)` (S22–S24). | M |
| b10 | `PERSON_LIMITS = {portfolioManager:1, contributors:20, approvers:5, notifications:20}`, enforced in `applyPersonaSelection` (S20). Fix the JSDoc. | S |
| b11 | Decide whether create-only country, state, tech and template writes are acceptable (D14 / D19), or write them on every save as the canvas does. | S |
| b12 | Clean up the stale comments X1–X6. Delete the unused `MSG.deleteChecklistTitle`, `PANEL_LABELS.titleTask`, `MSG.noApprovals`, `MSG.addTaskAllApproved` and `MSG.outOfScope`, or wire them. Make `mergeGatesWithApprovals` keep the **first** duplicate (D6). | S |

### (c) `hooks.ts` (and registration)

| # | Change | Size |
|---|---|---|
| c1 | Register the missing tables with `pac code add-data-source -a dataverse -t <logical>`: `vsb_projectdefaultapprovals`, `vsb_checklistdefaultapprovals`, `vsb_projectdefaultchecklists`, `vsb_checklistcountryandtechnology`. Diff `.power/schemas/appschemas/dataSourcesInfo.ts` and confirm the nav-property casing for b1. | M |
| c2 | Change `TABLES` from `ES.microsoftEntraIds` (`vsb_microsoftentraids`) to the registered `aadusers`. Fix `dataverseNames.ts:45-47` (it is marked UNVERIFIED, and the real set is `aadusers`). Update the `UT-ADGATE-901` assertion. | S |
| c3 | Replace the stubs with TanStack queries using `fetchAll` / `fetchPage` + `$select`:<br>• countries (rail, with exclusion);<br>• states;<br>• gate approvals (`_vsb_approvalscountry_value`, `vsb_technologycode`);<br>• country-tech id;<br>• templates (decide on `vsb_todelete`, D9);<br>• checklist approvals `in (ids)`;<br>• the Add Task check (scoped, as S18);<br>• the Entra search on `aadusers` (`contains(displayname/givenname/surname/mail)`, `accountenabled eq true`, `$top`);<br>• PM resolution by `aaduserid`. | L |
| c4 | Mutations: execute the `WritePlan`s for save (gate / checklist), the gate and checklist toggles, reset and delete. Invalidate the gate-approval and checklist-approval keys for the scope. Surface failures (rule 14) with the verbatim S24 text. Every create carries `owningbusinessunit@odata.bind` (rule 4, already in the payload). | M |
| c5 | Fix the hooks JSDoc: `H:15-17` ("no exclusion on Gates"), `H:43-49` (`vsb_microsoftentraids`, `vsb_entraid` → `aadusers`, `id`). | S |

---

## Open questions for the product owner

1. **Confirm on gate toggle (B9).** The canvas switches a gate on or off with no confirmation. Keep the code app's confirm dialog (deactivate only?) or remove it?
2. **Deferred create (D29/D30).** The canvas creates a `Project Default Approvals` or `Check List Default Approvals` row as soon as Edit or Add Task is clicked, which leaves orphans when the user cancels. Is "create on Save" acceptable? This also makes Reset Gate unavailable until a record exists (S16).
3. **Panel title (S2).** The canvas shows "Edit Approvers" for every gate, including new ones, and usually "Add Approvers" for checklist approvals, including when editing. Keep the canvas quirk, or use "Add" for new and "Edit" for existing?
4. **Blank Check List (S7).** The canvas shows "The cluster cannot be blank." under the Check List combobox but still allows Save. Should a blank template block Save, and should the wording be corrected to say "check list"?
5. **Reset Gate on a Draft gate (D28).** The canvas writes `Gate active = false` even for Draft, but a Draft gate cannot otherwise be deactivated. Which rule wins?
6. **Add Task scope (S18).** The canvas blocks Add Task if the template has an approval in **any** country. The code app scopes the check to the current country and technology. Confirm the fix.
7. **"To Delete" templates (D9).** Should check-list approvals whose template is flagged `vsb_todelete` be hidden (code) or shown (canvas)?
8. **Non-Wind/PV technologies.** The picker can only produce Wind and PV, so the non-Wind/PV reset and banner are unreachable. Keep the banner or drop it?
9. **Write-once fields (b11).** Should country, cluster state and technology (gate) and the template (checklist) be written on every save, as the canvas does, or only on create?
10. **Admin guard (X1).** No route guard or server privilege protects these writes. Is a `RequireAdmin` route guard (Application Administrator or Controller Own Data) required before connecting, and will a Dataverse privilege be added?
