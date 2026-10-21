# Gap analysis: Project General CheckList Screen → `src/features/pm/checklist/`

Read-only analysis, 19 Oct 2026. I read the whole canvas file (`Project General CheckList Screen.pa.yaml`, 6,412 lines). Live formulas only: `/* */` and `//` blocks are skipped. I also read `Components/fn_Common.pa.yaml` (`ChecklisAsHTMLTable`), `Components/cmp_Project_States.pa.yaml` and `App.pa.yaml` (globals).
Code read in full: `Screen.tsx` (580), `rules.ts` (2042) and `hooks.ts` (277). I also read `components/Fields.tsx`, `CanvasFields.tsx` (PanelButtons) and `CommandBar.tsx`.
Context: under D14 the screen is "UI built, not connected". Every hook returns `notConnected()` and every write button is disabled. Data and write rows are therefore judged on whether the **rule or query contract** exists and is correct. "PARTIAL" on a data row usually means "the contract is documented or ported, but nothing is wired".

Canvas citations are `Control.Property:line` in the `.pa.yaml`. Code citations are `file:line` under `ProjectCosts-CodeApp/src/features/pm/checklist/` unless a path is given.

## Status summary

| Area | COVERED | PARTIAL | WRONG | MISSING | Rows |
|---|---|---|---|---|---|
| Data (reads) | 1 | 8 | 3 | 0 | 12 |
| Data (writes / payloads) | 6 | 6 | 6 | 3 | 21 |
| Behaviour | 11 | 3 | 4 | 4 | 22 |
| State gates | 19 | 4 | 2 | 3 | 28 |
| Validation & messages | 6 | 0 | 1 | 1 | 8 |
| UI | 14 | 8 | 9 | 2 | 33 |
| **Total** | **57** | **29** | **25** | **13** | **124** |

Biggest gaps:
1. **Return-to-previous is ported from the dead control.** The live path is `Return_1` → `cmp_PopUp_CheckList_ClusterState_ReturnConfirmation.OnConfirm`, which sets the current row to *Not Started* and clears the flow ids on the previous row. The code ports the hidden panel button instead (*Request canceled*) and renders it in the wrong place.
2. **The sequence engine diverges in three ways:**
   - the gate lookup does not apply the Draft "gate source" shift (`varGateSourceNo`);
   - the sequences are sorted by cluster number, not `Order`;
   - the display sequence drops the non-cluster states.
   Separately, the stepper renders skipped clusters as "Not Started" instead of their tracking state.
3. **Several write payloads differ from the canvas:**
   - the persona snapshot (raw JSON instead of a `Concat` of PersonaRole joined by Char(13), and no `"None"` fallback);
   - the gate-cancel note name (the user's display name is missing);
   - the terminal-state change (the Projects patch and the bulk reset are not guarded);
   - materialisation (adds `Approval Checklist State`).
   These are missing entirely: the checklist pre-flow patch, the comment-form patch, and the "Approval requested" note builders.
4. **Row "Complete" always opens the panel.** In the canvas a task with no approval mode is patched straight to *Completed*.
5. **The canvas `AccessibilityLabel` is not used as the `aria-label` (rule 16)** on the command bar, NextCluster, Abandon, Inactive, RequestApproval, panel Save and Cancel, the panel comment box, and the completion date picker.

**Tables missing from `power.config.json`:**
- `vsb_projectstatetracking`
- `vsb_projectstatetrackingnote`
- `vsb_projectchecklist`
- `vsb_projectchecklisttrackingnote`
- `vsb_projectdefaultchecklists`
- `vsb_projectdefaultapprovals`
- `vsb_checklistdefaultapprovals`
- `vsb_checklistcountryandtechnology`

Present: `vsb_project`, `vsb_projectstate`, `vsb_country`, `businessunit`, `systemuser`.

**Flows:** `connectionReferences` is `{}`, so none of these four flows is registered:
- `PerformCommonRequestofGateApproval`
- `PerformCommonRequestofCheckListApproval`
- `PerformRequestofGateApprovalCancellation`
- `PerformRequestofCheckListApprovalCancellation`

---

## 1. Data (reads)

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| D1 | `OnVisible:93-98` reloads `Projects` by id. The screen uses `'Start Cluster'`, `'Cluster State'`, `'Approval States'`, `Country`, `Technology`, `'Project ID'`, `'Total Capacity'`, `'Net Yield p50'`, the 8 milestone dates and `'Besitzer (Unternehmenseinheit)'`. | `hooks.ts:12-17` ($select documented), `hooks.ts:119-121` (returns `notConnected`), mapper `hooks.ts:163-191` | PARTIAL | Not connected. `'Plant WTG Capacity [MW]'` and `'Project Name'` are used for `gblProjectHeaderData` (`pcf_…_Save.OnChange:5380-5388`) and are not in the $select. |
| D2 | `btn_CheckList_BuildProjectStatesSequence.OnSelect:614-623`: `Sort(Filter('Project States', 'Is Visible On Checklist'), Order, Ascending)`. **All** visible states, sorted by `Order`. Non-cluster names get ClusterNo 999. | `rules.ts:448-451` `checklistStates`, which both sequences use (`rules.ts:467`, `rules.ts:484`) | WRONG | The code filters out the 999 rows and sorts by `clusterNo`. Canvas: the display collection keeps every visible state in `Order` order (`:742-765`). Only the operational one drops 999 rows (`:715-718`). `checklistStates` is correct only for the back-fill (`:517-528`, `Name in [...]`). |
| D3 | `OnVisible:153-173` (repeated at `:332-352`, `:1369-1415`, `:2644-2664`, `:4957-4998`): `'Project State Trackings'` filtered `Project = selected`, projected to ID/Name/ClusterProjectStateID/StateProgress/Comment/DueDate/FlowRunId/FlowApprovalId. | `hooks.ts:22-27`, `toTrackingRow` `hooks.ts:201-213` | PARTIAL | Contract correct; not connected. `clusterStateName` comes from the lookup's FormattedValue, with `vsb_name` as fallback. |
| D4 | `OnVisible:184-189`: `'Project Default Approvals'` where `'Gate active' = true && (IsBlank(country) \|\| 'Approvals Country' = country) && (IsBlank(project) \|\| IsBlank(Technology) \|\| Technology = …)`. | `hooks.ts:28-33` | PARTIAL | The documented filter always applies country and technology `eq`. The canvas falls back to "no filter" when either is blank. |
| D5 | `OnVisible:177-180`: `ClearCollect(colDefaultProjectChecklists, 'Project Default Checklists')`, a whole-table load that is not used by any live formula on this screen. | not loaded; a scoped template query replaces it (`hooks.ts:47-54`) | COVERED | Correct per rule 2. |
| D6 | `but_Project_States_CheckList_Refresh.OnSelect:2568-2638`: `'Project Checklists'` for project + cluster, `Status = Active`, shaped to ID/Type/ClusterState/GateRelevance/Title/HoldingDescription/IsCompletionDate/CompletionDate/TaskState/Note/Sort/RowNumber, sorted by `Order` ascending. `gal_…General_Content.Items:3066-3087` re-indexes it. | `hooks.ts:34-41`, `toChecklistRow` `hooks.ts:216-231`, `sortChecklistRows` `rules.ts:741` | PARTIAL | Contract correct; not connected. |
| D7 | `ico_…ListRow_ApprovalMode.Icon:3639-3656` looks up `'Check List Default Approvals'` by `'Project Default Check List'` **without** a gate-active filter. `.Visible:3660-3671` requires `'Gate active'`. `pcf_…_Save.Visible:5421` uses `Distinct('Check List Default Approvals', …)`, i.e. **all** rows. | `hooks.ts:42-46` (filter `vsb_gateisactive eq true`), `approvalSettingIndex` `rules.ts:749` | PARTIAL | Save visibility needs "any row exists, active or not". The query only returns active rows (see S23). |
| D8 | `but_Project_States_CheckList_Refresh.OnSelect:2500-2506`: templates with `Status = Active`, cluster = selected, `'Associated Country And Technology'.Country = project.Country` and `.Technology = project.Technology`. | `hooks.ts:47-54` (two-step query via `vsb_checklistcountryandtechnologies`) | PARTIAL | Contract correct; not connected. The comment at `hooks.ts:83-86` says the entity set is "not yet named in dataverseNames". That is stale: `ES.checklistCountryAndTechnologies` exists (`data/dataverseNames.ts:18`). |
| D9 | `gal_CheckList_RightPanel_ChangeCluster_Form_Inputs_History.Items:4448-4468`: `'Project State Tracking Notes'` by tracking for "Cluster Transition", `'Project Checklist Tracking Note'` by checklist for "Checklist Completion", sorted `createdon` descending. | `historyDescriptor` `rules.ts:1604-1621`, `useHistory` `hooks.ts:147` | PARTIAL | Rule correct; not connected. |
| D10 | History row author `lbl_CheckList_RightPanel_ChangeCluster_Form_Modifed.Text:4630` = `ThisItem.modifiedby.'Full Name'` | `NOTE_COL.createdBy` `rules.ts:114`, `hooks.ts:57-59`, `Screen.tsx:503` (`createdByName`) | WRONG | Canvas uses **modified by**; code uses **created by**. |
| D11 | `gblRecordClusterStateAbandoned` = `LookUp('Project States', Name = "Abandoned")` and `gblRecordClusterStateInactive` = `LookUp('Project States', "Inactive" in Name)` (`App.pa.yaml:1168-1179`). Neither is filtered on visibility. | `Screen.tsx:144-145` searches `states` (from the visible-on-checklist query) for the exact names `"Abandoned"` / `"Inactive/ On-hold"` | WRONG | If those states are not "visible on checklist" both resolve to `null`, and Abandon/Inactivate/Activate break. The substring match for Inactive is also lost. |
| D12 | `OnVisible:125-145`: `CanEditSelectedProject = DataSourceInfo(Projects, CreatePermission) && RecordInfo(project, EditPermission)`. No control reads it. | `requireEditPermission` `rules.ts:1821`, applied in each `plan*` | PARTIAL | `Screen.tsx` never computes `canEdit`, and no hook supplies it. A deliberate divergence (logged as ambiguity 1 in the `rules.ts` header). |

## 2. Data (writes: Patch / Remove / Collect payloads and order)

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| W1 | Skipped-cluster back-fill. Guard: `OnVisible:202-328` (start > 0, project still Draft, no real gate progress, some state mismatches). Writes: `btn_CheckList_EnsureSkippedClusterStatesCompleted.OnSelect:543-599`, one `Patch(Coalesce(existing, Defaults))` per state with `{Project, Cluster State, Approval Cluster State: target, Cluster Step State: Blank, Approval Due Date: Blank, FlowRunId: Blank, FlowApprovalId: Blank, Approval Comment: auto-skip text or Blank, Owning BU}`. | `hasRealGateProgress` `rules.ts:325-345`, `shouldBackfillSkippedClusters` `rules.ts:369-378`, `planSkippedClusterBackfill` `rules.ts:388-445` | COVERED | Minor differences: (a) the code also writes when only the comment differs, while the canvas `OnVisible` trigger tests state only (`:319`); (b) the code adds `vsb_name` on create. The auto-skip text is verbatim (`rules.ts:303-304`). |
| W2 | Ensure tracking. `but_Project_States_CheckList_Refresh.OnSelect:2378-2422` creates `{Project, Cluster State, Approval Comment: Blank, Approval Due Date: Blank, Approval Cluster State: Draft ? In Progress : Not Started, Owning BU}`. | `planEnsureTracking` `rules.ts:558-583` | COVERED | Adds `vsb_name`. |
| W3 | Checklist materialisation. Guard (`:2475-2487`): tracking not Completed and 0 rows. Payload (`:2507-2536`): `{Name, Project, Cluster State (template), Holding Task Description, Gate Relevance (bool), Task State: None, Is Completion Date (bool), Order, Project Default Checklist: Text(id), Owning BU}`. | `shouldMaterialiseChecklist` `rules.ts:591`, `planChecklistMaterialisation` `rules.ts:606-642` | WRONG | The code also writes `vsb_approvalcheckliststate: Not Started` (`rules.ts:624`), which the canvas does not. Otherwise correct. The order is one `$batch` instead of a `ForAll`. |
| W4 | `but_…ListRow_Complete.OnSelect:3216-3235`. When the approval-mode icon is **not** visible: `Patch('Project Checklists', row, {'Task State': Completed})` plus a local `UpdateIf`. **Else** (`:3236-3251`): open the panel as "Checklist Completion". | `completeTaskPatch` `rules.ts:731` exists. `Screen.tsx:197-201` `onRowAction` **always** calls `openChecklistPanel`. | WRONG | Tasks without an approval setting must complete directly. |
| W5 | Same control, approval-mode branch: set `locSelectedCheckListEntity` and `locSelectedCheckListDefaultApprovalEntity` (gate active), open the panel. | `Screen.tsx:191-195` | COVERED | |
| W6 | `but_…ListRow_InProgress.OnSelect:3383-3429`: `{'Task State': In Progress ↔ None, 'Approval Checklist State': Not Started}`. | `inProgressTogglePatch` `rules.ts:720-728` | PARTIAL | Rule correct. The button at `Screen.tsx:368-372` has no `onClick`. |
| W7 | `date_…_CompletionDate.OnChange:3780-3817`: `{'Completion Date': SelectedDate}`. Default `SelectedDate:3818-3831` is the existing value or `Now()`. | `completionDatePatch` `rules.ts:736` | PARTIAL | `Screen.tsx:415-417` has no `onChange`, and the value is `""` when blank instead of today. |
| W8 | `pcf_btn_CheckList_RightPanel_Checklist_Form_Buttons_Save.OnChange:6091-6126`: `Patch('Project Checklists', entity, {Comments: Trim(text)})` plus `UpdateIf(Note)`. | none | MISSING | No patch builder. `Screen.tsx:406` stores only the note text, not the row id, so a Save could not target a row. |
| W9 | Cluster Transition Save, `pcf_…_Buttons_Save.OnChange:5235-5411`, in this order: (1) current tracking `{Project, Cluster State, Approval Comment (raw), Approval Due Date if dtp visible, Approval Cluster State: Completed, Owning BU}`; (2) next tracking upsert `{…, Approval Comment: Blank, Due Date if visible, In Progress, Owning BU}`; (3) note `{Name: "Change {cur} to {next}", Tracking, Comment: Trim, Note: html, Note Type: Checklistitem, Owning BU}`; (4) if Cluster Transition and next exists, `Projects {Cluster State: next, Approval States: Approved}`, then refresh `gblProjectHeaderData`. | `planClusterTransition` `rules.ts:1043-1153` | PARTIAL | Payload and order match. Missing: the header-data refresh and the `noteHtml` source (see D10/S22). `PanelButtons onSave` is a no-op (`Screen.tsx:457`). SOURCE DEFECT: the same Save also runs steps 1–3 in **Checklist Completion** mode (only step 4 is gated). See Q2. |
| W10a | Request Approval, Cluster: `pcf_…_RequestApproval.OnChange:5580-5646` patches tracking with `'Last Triggered Approval Personas': JSON([{PortfolioManager: Coalesce(PM.Mail,"None"), Approvers: Coalesce(Concat(ParseJSON(..).PersonaRole, Char(13)),"None"), Contributors: …, Notifications: …}])` and `'Last Triggered Approval Mode'`, plus Comment, Due Date, In Progress and Owning BU. | `approvalPersonaSnapshot` `rules.ts:1361-1371` | WRONG | The code stores the **raw JSON column strings** and `""` instead of the PersonaRole list joined by `\r` with a `"None"` fallback. The comment, due date and state are not part of any plan function. |
| W10b | `PerformCommonRequestofGateApproval.Run(ProjectGUID, StateGUID, StateTrackingGUID, DefaultApprovalGUID)` (`:5660-5668`). If `runid` is returned, update the local collection only (`:5669-5683`). | `gateApprovalArgs` `rules.ts:1474-1490` | COVERED | The canvas writes no Dataverse row after the gate flow. Keep `flowWriteBackPatch(…, "tracking")` (`rules.ts:1509`) unused for this branch. |
| W10c | Note `'Project State Tracking Notes'` `{Name: "Approval requested - {Project Name}, {state}", Comment: "Approval requested - {Trim(comment)}", Note: html, Note Type: Checklistitem, Owning BU}` (`:5687-5698`). | `trackingNoteWrite` is private (`rules.ts:1623`), and no builder produces this name | MISSING | |
| W11a | Request Approval, Checklist pre-flow patch (`:5487-5499`): `{'Approval Comment': raw, 'Approval Due Date': if visible, 'Approval Checklist State': In Progress}`. | none | MISSING | |
| W11b | `PerformCommonRequestofCheckListApproval.Run(Project, Checklist, CLDA id, current Project State)` (`:5512-5523`). If `runid`: `Patch {Approval Checklist State: In Progress, 'Flow Run Id', 'Flow Approval Id': Coalesce(approvalid, Blank)}` (`:5524-5538`). | `checklistApprovalArgs` `rules.ts:1447-1468`, `flowWriteBackPatch` `rules.ts:1509-1521` | COVERED | The write-back omits `Approval Checklist State: In Progress` (already set by W11a, so harmless). |
| W11c | Note in `'Project Checklist Tracking Note'`: `{Name and Comment: "{Approval requested \| Completed and notified about Check List} {checklist} for Project {project}", 'Project Checklist', Note: "", Note Type: Checklistitem}`, with no Owning BU (`:5542-5560`). | `checklistNoteWrite` `rules.ts:1652-1671` | PARTIAL | The name/comment text is not built anywhere. The code adds Owning BU (correct per rule 4). |
| W12a | Cancel gate approval, `pcf_…_CancelApproval.OnChange:1547-1564`: tracking `{Project, Approval Cluster State: In Progress, Cluster Step State: Blank, FlowRunId: Blank, Owning BU}`. | `planGateCancel` `rules.ts:1564-1572` | COVERED | |
| W12b | Note `{Name: "Request canceled - {Project Name}, {gblCurrentUser.DisplayName}", Comment: "Request canceled - {Trim}", Note Type: None, Owning BU}` (`:1617-1627`). | `rules.ts:1575` | WRONG | The `, {DisplayName}` suffix is missing. `planGateCancel` takes no user name. |
| W12c | Flow `PerformRequestofGateApprovalCancellation.Run(gblProjectManagmentAppID, JSON(13-field record))` (`:1600-1606`). Order: patch → flow → local UpdateIf → note. | `gateCancelArgs` `rules.ts:1529` (custom API `vsb_CancelGateApproval`, id only) | PARTIAL | DIVERGENCE: the plan replaces the flow with a custom API. No D15 row was found for it. See Q3. |
| W13 | `ico_…ListRow_CancelApproval.OnSelect:3689-3703`: `PerformRequestofCheckListApprovalCancellation.Run(ThisItem.ID).success`, then `Refresh('Project Checklists')`. | `checklistCancelSucceeded` `rules.ts:1545` (custom API `vsb_CancelCheckListApproval`) | PARTIAL | Same divergence as W12c. The button at `Screen.tsx:387-389` has no `onClick`. |
| W14 | Return to previous, **live** path: `cmp_PopUp_CheckList_ClusterState_ReturnConfirmation.OnConfirm:6345-6400`. Current tracking `{Approval Cluster State: **Not Started**, Owning BU}`. Previous tracking `{**In Progress**, FlowApprovalId: Blank, FlowRunId: Blank, Owning BU}`. Note `{Name: "Project was reset to {prev}", Comment: Trim, Note Type: None, Owning BU}`. Then Navigate to the same screen. | `planReturnToPreviousCluster` `rules.ts:1164-1205` | WRONG | The code ports the **dead** panel button `pcf_…_Buttons_Return.OnChange:5105-5175` (`Visible: false`, `:5180-5189`): current → **Request canceled**, previous flow ids not cleared. |
| W15 | Terminal change, `cmp_PopUp_CheckList_ClusterState_Confirmation.OnConfirm:6188-6258`. `First(Filter(trackings, state in [In Progress, Abandoned, Inactive]))`. **Only if that row exists**: patch it `{Project, staged state, Owning BU}`; patch `Projects {Cluster State: staged target}`; `UpdateIf` Request canceled / Rejected → Not Started. Then refresh header data and Select Refresh. | `planTerminalStateChange` `rules.ts:1295-1352` | WRONG | The Projects patch and the bulk reset run even when no primary row is found (canvas `If(Not(IsBlank(varRecord…)))`, `:6206-6243`). |

## 3. Behaviour

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| B1 | `OnVisible:29-89`: no selected project → clear all collections and reset every `loc*`. | `useSession().projectId` (`Screen.tsx:109`); `pageLock(null)` returns "• General" (`rules.ts:1705-1707`) | PARTIAL | No explicit empty state when there is no project. |
| B2 | `OnVisible` sequence: (1) re-read the project and compute the start cluster; (2) CanEdit; (3) load trackings; (4) default approvals; (5) back-fill (W1); (6) re-read trackings; (7) build sequences; (8) reset context and the default selection; (9) `Reset(cmp)` then `Select(but_Project_States_CheckList_Refresh)`, which runs ensure tracking (W2), materialise (W3) and load the checklist (D6). | hooks are stubs (`hooks.ts:119-153`) | MISSING | No orchestration, and no mutation-then-reread step. |
| B3 | Start-cluster number `OnVisible:100-123` | `startClusterNo` `rules.ts:295-299` | COVERED | |
| B4 | Operational sequence `btn_…BuildProjectStatesSequence.OnSelect:709-737`: `ClusterNo = 0 \|\| (>= start && <= 6)`. | `buildOperationalSequence` `rules.ts:462-473` | COVERED | Except the sort and source issue in D2. |
| B5 | Gate per state, `:640-682`: for **Draft** with start > 0, the gate comes from cluster `start-1` (or 0 if start = 1): `varGateSourceNo`, then `varGateSourceState`, then `LookUp(colDefaultProjectApprovalsSettings, Cluster State = gate source)`. | `toSequenceEntry` `rules.ts:491-507` matches on the state's **own** id | WRONG | For a project that starts at Cluster 3, Draft's gate should be Cluster 2's gate. This changes `HasGate`, the captions, Request Approval and Save visibility. |
| B6 | Display sequence `:742-765` with `IsSkippedDisplayOnly`. The component shows `ThisItem.State` (the tracking) for every card (`cmp_Project_States.pa.yaml:812-817`). | `buildDisplaySequence` `rules.ts:479-489` (COVERED). `Screen.tsx:235-237` forces `approvalStateLabel(null)` = "Not Started" for skipped steps. | WRONG | Skipped clusters were back-filled to Completed, so the stepper should show their real state. |
| B7 | Default selection `:766-776`, `cmp…DefaultValue:1256-1297` | `defaultSelectedCluster` `rules.ts:541-550`, `Screen.tsx:131-132` | COVERED | |
| B8 | Stepper click `cmp_CheckList_Project_States.OnSelect:1418-1470`: use the clicked state if it is in the operational sequence, else the default. | `Screen.tsx:238,248-249` (non-operational steps disabled) | COVERED | Minor divergence: the canvas lets the click happen and falls back silently. |
| B9 | Previous/next = operational `RowNumber ± 1` (`:2456-2463`, `:5039-5050`) | `previousState`/`nextState` `rules.ts:517-535` | COVERED | |
| B10 | Command bar `pcf_con_…CommandBar_Menu.OnSelect:1238-1248`: `refreshKey` → `Navigate` to the same screen (full reload). | `Screen.tsx:166-168,218` (`onCommand` no-op) | PARTIAL | Needs query invalidation. |
| B11 | Header logo → Project Main (`cmp_CheckList_ProjectHeader.OnLogoClick:811-815`); left navigation (`cmp_CheckList_Left_Navigation.OnSelect:872-886`) | App shell (`components/AppShell.tsx`, `AppHeader.tsx`, `LeftNav.tsx`; route `app/routes.tsx:143`) | COVERED | Shared shell, not screen-specific. |
| B12 | NextCluster `OnChange:1891-1911` → `locRequestApprovalEntityType="Cluster Transition"`, open the right panel. | `Screen.tsx:278` | COVERED | The canvas opens the same panel for the "View … Request History" caption. `nextClusterActionKind` (`rules.ts:970`) is used only for the icon. |
| B13 | Row History `OnSelect:3728-3744` → open the Checklist Completion panel | `Screen.tsx:374-378` | COVERED | |
| B14 | Row Comments icon `OnSelect:3134-3143` → `locIsVisibleRightPanelEditCheckList`, `locSelectedCheckListEntity` = the row | `Screen.tsx:403-406` | PARTIAL | Opens with the note text only; the row is not tracked. |
| B15 | Completion-date edit `OnSelect:3521-3530` → show the picker for the row, then SetFocus | `Screen.tsx:359-362,410-426` | COVERED | No focus call (minor). |
| B16 | Holding-column toggle `OnSelect:2960-2961` | `Screen.tsx:328-334` | COVERED | |
| B17 | Panel close `pcf_…_Form_CommandBar.OnSelect:3979-3988`, and Cancel `:5818-5823`: close, then `Reset` the comment and date. `locLeaveGeneralDataConfirmationDialog` is **never set true** on this screen, so `cmp_PopUp_CheckList_Leave_Confirmation` is dead. | `closePanel` `Screen.tsx:203-209` opens the leave dialog when the comment changed | WRONG | Adds a confirmation the canvas never shows. See Q5. |
| B18 | After writes: `Refresh`, `Navigate('Project General CheckList Screen')` and `Select(…Refresh/Reset)` (`:1643-1646`, `:5409-5411`, `:5716-5720`, `:6256`, `:6409`) | none | MISSING | Hooks need mutation → invalidate (trackings, checklist, project header). |
| B19 | Abandon/Inactivate `OnChange:2119-2145`, `:2217-2235` → stage and open the confirmation | `stageTerminalToggle` `rules.ts:1231-1260`, `Screen.tsx:297` | COVERED | |
| B20 | `pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1` sits in the **main button bar** (`con_Checklist_DisplayProject_Body_Content_Buttons`) and its `OnChange:1779-1784` opens the return confirmation. | `Screen.tsx:442-448` renders a return button in the **right-panel footer**, with test id `…_Buttons_Return` (the dead control) | WRONG | Wrong place, wrong identity, and it is only reachable with the panel open. |
| B21 | The four flow calls (W10b, W11b, W12c, W13) | none wired; `connectionReferences: {}` | MISSING | |
| B22 | Progress pop-ups `cmp_PopUp_Checklist_Saving_Dialog` (`:6308-6314`) and `cmp_PopUp_GateProcess_Saving_LoadingDialog_1` (`:6316-6322`) | none (no `LoadingOverlay`) | MISSING | See M7 for the texts. |

## 4. State gates (DisplayMode / Visible)

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| S1 | `con_Milestones_Page_LockMessage_3.Visible:972-1016`, with the bullet `Visible`s at `:1087,1109-1140,1157,1175` (start-cluster milestone switch; Project ID; Total Capacity; Net Yield p50; no Draft clause) | `pageLock` `rules.ts:1704-1766`, `Screen.tsx:221-230` | COVERED | |
| S2 | Lock → Disabled: command bar `:1220-1225`, Return_1 `:1760-1765`, NextCluster `:1828-1830`, Abandon `:2081-2086`, Inactive `:2184-2189`, gallery `:3059-3064` | `Screen.tsx:167,296,362,370,388,394`, `rules.ts:1021` | COVERED | |
| S3 | `con_…Buttons_Info.Visible:2026-2035`: not locked and NextCluster disabled | `Screen.tsx:283` | COVERED | |
| S4 | NextCluster `DisplayMode:1827-1863` | `nextClusterEnabled` `rules.ts:1014-1027` | COVERED | |
| S5 | NextCluster `Visible:2008`: `!IsBlank(next)` | `Screen.tsx:271` | COVERED | |
| S6 | Cancel Approval Request `Visible:1651-1664`: FlowRunId set, In Progress, and `LookUp('Project Default Approvals', id = Gate).'Approval Mode' <> Only Notifications` (looked up by id, regardless of active) | `showCancelApproval` `rules.ts:899-909` with `activeGateFor` (`Screen.tsx:134`) | PARTIAL | When the gate exists but is inactive, the code's `gate` is null, so the button shows even when the mode is Only Notifications. |
| S7 | Cancel Approval Request `DisplayMode:1504-1518`: Disabled while `lbl_…Comment_Details_ErrorMessage_1.Visible` (the hidden panel's comment is blank) | `canCancelApproval` `rules.ts:911` exists. `Screen.tsx:264` uses `!connected` only. | PARTIAL | SOURCE DEFECT: the comment box lives in the closed panel. See Q6. |
| S8 | Return_1 `Visible:1789-1818`: previous exists; previous cluster no. ≥ start; tracking in {In Progress, Rejected, Request canceled}; CancelApproval not visible; previous ≠ Draft | `showReturnToPrevious` `rules.ts:921-934` | COVERED | The logic matches, but it is rendered in the wrong place (B20). |
| S9 | Abandon `Visible:2154-2176` / Inactive `Visible:2244-2266` | `terminalButtonVisible` `rules.ts:1266-1281` | COVERED | |
| S10 | Title `Visible:2288`, OverviewHeader `:2763` and Galleries `:3049`: **only for Wind or PV** | `Screen.tsx:303-311,319-432` always render | WRONG | For other technologies the canvas shows only the tip. |
| S11 | Technology tip `Visible:2713` | `Screen.tsx:313-317` | COVERED | |
| S12 | Row Complete `DisplayMode:3165-3170` | `rowActionEnabled` `rules.ts:685-694` | COVERED | |
| S13 | Row Complete `Text:3275-3290` | `rowActionLabel` `rules.ts:668-676` | COVERED | |
| S14 | Row InProgress `Visible:3444`, History `:3759`, CancelApproval `:3708` | `rules.ts:697-702`, `Screen.tsx:367-391` | COVERED | |
| S15 | Approval-mode icon `Icon:3638-3656`, `Visible:3659-3671` | `rowApprovalIcon` `rules.ts:653-659` | COVERED | |
| S16 | Completion-date container `Visible:3475`, edit button `Visible:3531-3535` | `Screen.tsx:356-364` | COVERED | |
| S17 | Panel comment block `Visible:4044-4066`. Cluster: NOT (tracking in {Completed, Request canceled, Canceling}, or FlowRunId set and In Progress). Checklist: `RequestApproval.Visible`. | `Screen.tsx:472-481` always renders | MISSING | No `commentBlockVisible` rule. |
| S18 | Comment `DisplayMode:4111-4124`: View when Completed and Cluster | `commentReadOnly` `rules.ts:817-820` | COVERED | |
| S19 | Asterisk `Visible:4104` | `commentAsteriskVisible` `rules.ts:809-810` | COVERED | |
| S20 | Approval Due Date `Visible:4164-4178`: Formal or Local mode (and `HasGate` for a cluster) **and** comment block visible | `showApprovalDueDate` `rules.ts:826-831` | PARTIAL | The `&& comment block visible` clause is missing. |
| S21 | Approval Due Date `SelectedDate:4200-4249`. Cluster: the project milestone for the **next** cluster (C1→Feasibility … C6→COD). Checklist: the milestone after the **current** cluster (Draft→Feasibility … C5→COD). | `Screen.tsx:157` uses `tracking.approvalDueDate`; `Screen.tsx:193` uses `null` | MISSING | No default-date rule. |
| S22 | Actual-task-state block `Visible:4347-4381` plus `html_…_Form_History.HtmlText:4391`. This is the checklist table (name, relevance, task state, cluster, editor and edit date when In Progress/Completed) rendered by `fn_Common.ChecklisAsHTMLTable` (`fn_Common.pa.yaml:88-111`). It also becomes the transition/approval note's `Note`. | `showActualTaskState` `rules.ts:941-948` is never called; no table builder | MISSING | |
| S23 | Save `Visible:5416-5429`. Checklist: In Progress and the template is **not in** `Distinct(all CLDA)`. Cluster: `!HasGate` and the tracking is In Progress. | `showSave` `rules.ts:839-846`; `hasChecklistApprovalEntry = setting !== null` `Screen.tsx:194` (active settings only) | PARTIAL | See D7. |
| S24 | Save `DisplayMode:5198-5217` | `canSavePanel` `rules.ts:853-858` | COVERED | |
| S25 | Request Approval `Visible:5756-5791`. Cluster: `HasGate && (state not in {In Progress, Completed} \|\| (In Progress && IsBlank(Coalesce(tracking.FlowRunId, **locSelectedCheckListEntity.'Flow Approval Id'**))))` | `showRequestApproval` `rules.ts:870-884` requires both `flowRunId` and `flowApprovalId` of the **tracking** to be blank | WRONG | The code hides the button when the tracking has an approval id but no run id; the canvas shows it. The canvas's use of the checklist entity is itself odd (Q11). |
| S26 | Request Approval `DisplayMode:5438-5456` | `canRequestApproval` `rules.ts:887-892` | COVERED | |
| S27 | Comment-form Save `DisplayMode:6068-6073` | `Screen.tsx:519` | COVERED | |
| S28 | Header "Country Description" label `Visible:2940` (`locIsVisibleColumnHoldingDescription`) | `Screen.tsx:327,354` | COVERED | |

## 5. Validation and Notify / progress messages (verbatim)

| # | Canvas text | Code | Status |
|---|---|---|---|
| M1 | "Please enter comment" (`lbl_…Comment_Details_ErrorMessage_1.Text:4144`, `Visible:4145` = `IsBlank(Trim())`) | `rules.ts:793-802` | COVERED |
| M2 | "Comment field cannot be empty" (`lbl_CheckList_RightPanel_BodyForm_Comments_ErrorMessage:6036-6037`) | `rules.ts:1965`, `Screen.tsx:525` | COVERED |
| M3 | Title "Completion date"; text `Please enter completion date to set the cluster-check on "Complete"` (`but_…ListRow_Complete.OnSelect:3205-3206`) | `rules.ts:704-705,1973`, `Screen.tsx:199,569` | COVERED |
| M4 | Info: "Please activate this project first to initialize approval process." / "Please complete the previous cluster or wait for cluster approval." (`:2067-2068`) | `rules.ts:1931-1933` | COVERED |
| M5 | Confirm dialogs: `Do you really want to change Cluster State to "{name}"?` / `Do you really want to change the project state to "active"` (`:6179-6180`); `Do you really want to return to "{prev}"?` (`:6331`); title "Change Cluster State"; buttons "Yes" / "Cancel" | `rules.ts:1248,1258,1977,1967-1969` | COVERED |
| M6 | Leave dialog "Unsaved data" / "You have unsaved data. Do you really want to leave current form without saving?" (`:6282,6305`) | `rules.ts:1981-1984` | COVERED (but dead in the canvas; see B17) |
| M7 | Progress and error texts, none of which exist in code: "Loading, please wait..." (`:2336`); "The state of task '{Title}' will be changed, please wait..." (`:3212,3387,6095`); "Task state was successfully changed." (`:3218,3391,6099`); "Panel for requesting a checklist completion approval and/or notification is opening..." (`:3237,3730`); "Error: Task state could not be changed. Internal error: originated on {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}" (`:3254,3422,6117`); "Completion Date {date} of task '{Title}' will be changed, please wait..." (`:3784`); "Completion Date {date} was successfully updated." (`:3806`); "Error: Completion Date could not be changed. Internal error: …" (`:3807`); "Cancel Request Approval for '{state}' has been sent, please wait..." (`:1541`); "Cancel Cluster Approval ..." (`:1570`); "Canceling Check List completion approval request..." (`:3691`); "Cluster data '{state}' will be save, please wait..." (`:1896,5239`); "Cluster data '{state}' will be saved." (`:5395`); "Please wait..." (`:5478,5505,5652`); "Return to {prev}, please wait..." (`:5109,6342`); "Error: Project Status was updated.  Internal error: originated on {…}. Message: {…}" (double space; `:1634,5166,5400,5567,5705,6401`); "Error: Cluster state could not be changed. Internal error: …" (`:6257`) | none | MISSING |
| M8 | The canvas has no message when checklist cancellation returns `success=false` (`:3696`). | `CHECKLIST_CANCEL_FAILED` `rules.ts:1532-1533` ("The approval could not be cancelled. Nothing was changed.") | WRONG (new text, not logged in D15) |

## 6. UI (controls, captions, aria-label = AccessibleLabel, data-testid = control name)

| # | Canvas control (identity / caption) | Code | Status | Notes |
|---|---|---|---|---|
| U1 | `pcf_con_CheckList_DisplayProject_Body_CommandBar_Menu`: AccessibilityLabel `"pcf_con_CheckList_DisplayProject_Body_CommandBar_Menu"` (`:1219`); one item, Refresh, icon only (`:1228-1237`) | `Screen.tsx:166-168,218`: bar `aria-label="Checklist actions"`; item test id `command-refreshKey` (`components/CommandBar.tsx:109`) | WRONG | Rule 16: the bar's aria-label must be the canvas AccessibilityLabel. |
| U2 | Lock banner: `lbl_…VisibilityMessage_10` "This page is locked. To unlock it, please complete the following sections:" plus `_11` "• General", `_12` "• Milestones", `_13` "• Generator", `_14` "• Production" | `Screen.tsx:221-230`, `rules.ts:1675-1676` | PARTIAL | Captions verbatim; the inner labels have no `data-testid`. |
| U3 | `cmp_CheckList_Project_States`: cards show `Description` (Cluster Description, split on ": "), a gate marker when `HasGate`, a completed check, a clock-alarm icon while an approval is pending, and connectors (`cmp_Project_States.pa.yaml:280-337,733-870`) | `Screen.tsx:233-258` (name and approval label only); `stepConnectorLit` `rules.ts:1880` unused | PARTIAL | |
| U4 | `pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_CancelApproval`: "Cancel Approval Request", tooltip "Cancel the currently running Approval Request", no AccessibilityLabel | `Screen.tsx:262-270` | COVERED | |
| U5 | `pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1`: `$"Reset to {prev}"`, AccessibilityLabel `"pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1"` (`:1758`), icon Back, in the main bar | `Screen.tsx:443-447`: test id `…_Buttons_Return`, aria-label = caption, in the panel footer | WRONG | |
| U6 | `pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster`: AccessibilityLabel `"pcf_Checklist_DisplayProject_Body_Content_Buttons_NextCluster"` (`:1826`); icon TriggerApproval / CheckMark (`:1877-1887`) | `Screen.tsx:274-279`: aria-label = caption; History icon for the history branch | WRONG | |
| U7 | NextCluster `Tooltip:1952-2007`: "Cluster Transition in Progress. Please wait 30 Seconds and then Refresh the Page" / "Move to the next Cluster and send notifications" / "View history" / `Gate Relevance Tasks: {completed} / {total}` | none | MISSING | |
| U8 | Abandon `AccessibilityLabel:2079` / Inactive `:2182` = the control names; Fill and FontColor invert while active (`:2087-2109`, `:2190-2212`) | `Screen.tsx:293-300`: aria-label = caption; no active styling | WRONG | |
| U9 | Info `lbl_…Buttons_Info` "Info" plus `but_…Buttons_Info` (Content, warning colour) | `Screen.tsx:284-291` | COVERED | |
| U10 | Title `lbl_Checklist_DisplayProject_Body_Content_Title`: `$"{state} Checklist"`; `Tooltip:2318-2319` `$"{vsb_name}: {vsb_approvalclusterstate}"` | `Screen.tsx:304-306`, `rules.ts:1852` | PARTIAL | Tooltip missing. |
| U11 | `but_Project_States_CheckList_Refresh`: AccessibleLabel "RefreshProjectStates", Text "Refresh", icon ArrowReset | `Screen.tsx:307-310`: icon only, with a tooltip | PARTIAL | The visible caption "Refresh" is not rendered. No `onClick`. |
| U12 | Tip "Tip: For selected technology cluster checklist is not available." plus the lamp image | `Screen.tsx:313-317`, `rules.ts:1935` | COVERED | No image (cosmetic). |
| U13 | Column headers in X order: "Gate Relevance", "Holding Description", "Country Description" (+ toggle, tooltip `"{Hide\|Show} Holding Description Column"`), "Completion Date", "Status", "", "" (`:2766-3028`) | `Screen.tsx:321-341`, `rules.ts:1937-1943,1990` | COVERED | |
| U14 | Gate Relevance cell `lbl_…ListRow_Name.Text:3628` = `ThisItem.GateRelevance` (boolean "true"/"false"); Tooltip = TaskState | `gateRelevanceLabel` "Yes"/"No" `rules.ts:1859`, `Screen.tsx:352` | WRONG | Driven by the GUIDE recording; needs a D15 entry. See Q4. |
| U15 | Holding cell `lbl_…ListRow_Holding.Text:3565`: truncated to 100 characters + " ..."; Tooltip = full text | `Screen.tsx:354` (full text) | MISSING | |
| U16 | Title cell `lbl_…ListRow_Description` `$"{Title}"` | `Screen.tsx:353` | COVERED | |
| U17 | Completion-date cell `Text(…,"ddd, mmm. dd, yyyy")`; edit button AccessibleLabel = its name | `fmtCanvasDate` `rules.ts:2031`, `Screen.tsx:356-364` | COVERED | |
| U18 | `date_Checklist_DisplayProject_Body_Content_CompletionDate`: AccessibleLabel = the control name (`:3776`); Format LongAbbreviated | `Screen.tsx:415`: `aria-label="Completion Date"`; native date input | WRONG | |
| U19 | `but_Checklist_DisplayProject_Body_Content_CompletionDate_Cancel` "Cancel" | `Screen.tsx:419-422` | COVERED | |
| U20 | Row Complete: caption (COVERED); `Tooltip:3291-3352` per Approval Mode (Portfolio Manager / Contributors / Approvers / Notifications lists); green `Fill:3172-3187` when Approved or Completed | `Screen.tsx:392-397` | PARTIAL | The tooltip and fill are missing. `personaTooltip` (`rules.ts:1414`) takes a `GateSetting`, not a `ChecklistApprovalSetting`. |
| U21 | Row "In Progress" / "History" captions and test ids | `Screen.tsx:368-378` | COVERED | |
| U22 | `ico_…ListRow_Comments`: AccessibleLabel = its name, Tooltip = Note, colour primary when a note exists | `Screen.tsx:402-407` | PARTIAL | No note-present colour. |
| U23 | `ico_…ListRow_CancelApproval`: AccessibleLabel = its name, Tooltip "Cancel approval" | `Screen.tsx:385-391` | COVERED | |
| U24 | `ico_…ListRow_ApprovalMode` (Mail / People) | `Screen.tsx:383-384` | PARTIAL | No `data-testid`; rendered as `aria-hidden` icons. |
| U25 | Panel header `lbl_CheckList_RightPanel_ChangeCluster_Form_Header.Text:3921-3958` | `rightPanelTitle` `rules.ts:1997-2006` | COVERED | |
| U26 | `txt_GeneralData_RightPanel_ProjectState_InpForm_Comment_1`: AccessibleLabel = the control name (`:4110`); label "Comment"; counter `{len}/300`; asterisk | `Screen.tsx:472-481`; `TextAreaField` sets aria-label = label "Comment" (`components/Fields.tsx:102`) | WRONG | `TextAreaField` needs an aria-label prop. |
| U27 | Due date: "Approval Due Date", placeholder "Select a approval due date...", AccessibleLabel = the control name | `Screen.tsx:482-490` | COVERED | |
| U28 | History block: "History", Refresh (AccessibleLabel "Refresh"); rows "Comment:", `createdon` "ddd, mmm. dd, yyyy hh:mm", `Coalesce(comment, name)`, and an HTML note (`html_…Gal_History.HtmlText:4666` = `vsb_note`) | `Screen.tsx:491-505` | PARTIAL | HTML note missing. The Refresh button has no `onClick`. |
| U29 | `pcf_…_Buttons_RequestApproval`: AccessibilityLabel = the control name (`:5437`); caption (COVERED); icon Forward / CheckMark | `Screen.tsx:449-455`: aria-label = caption | WRONG | |
| U30 | `pcf_…_Buttons_Save` AccessibilityLabel = name (`:5197`), Tooltip = state name; `pcf_…_Buttons_Cancel` AccessibilityLabel = name (`:5799`) | `PanelButtons` hard-codes `aria-label="Save"`/`"Cancel"` (`components/CanvasFields.tsx:186-189`); `Screen.tsx:462` "Cancel" | WRONG | |
| U31 | Comment form: header "Add Comment for Task changes", "Comment", counter, "*", multiline, Save / Cancel (no AccessibilityLabel → captions) | `Screen.tsx:511-531` | COVERED | |
| U32 | `cmp_PopUp_CheckList_GeneralData_Information` (Title / Description / OK) | `Screen.tsx:566-577` | COVERED | |
| U33 | Hidden or dead controls not ported: `btn_…EnsureSkipped…` / `btn_…BuildProjectStatesSequence` (logic in `rules.ts`); `but_…ApplyDefaultChecklist` (`Visible: false`, `:1752`); `pcf_…_Buttons_Return` (`Visible: false`); `con_…_Form_Info` (`Visible: false`, `:4683`); `RefreshButtonVisibility` (developers only, `:1471`); `OnHidden` clears unrelated collections | header of `rules.ts` (`rules.ts:21-36`) | COVERED | |

---

## Proposed changes

### (a) UI: `Screen.tsx`
1. **(M)** Move "Reset to {prev}" into `con_Checklist_DisplayProject_Body_Content_Buttons`:
   - test id and aria-label `pcf_CheckList_RightPanel_ChangeCluster_Form_Buttons_Return_1`;
   - disabled when locked;
   - open the return confirmation;
   - remove it from the panel footer. (B20, U5)
2. **(M)** Rule 16 aria-labels. Use the canvas AccessibilityLabel on:
   - the command bar (`ariaLabel`);
   - NextCluster, Abandon, Inactive and RequestApproval;
   - the panel Save and Cancel (add `saveAriaLabel` / `cancelAriaLabel` to `PanelButtons`);
   - the panel comment box (add `ariaLabel` to `TextAreaField`);
   - the completion date picker.
   The shared components change, so touch only these props. (U1, U6, U8, U18, U26, U29, U30)
3. **(S)** Show the title row, column header and table only for Wind or PV; otherwise show only the tip. (S10)
4. **(S)** Stepper: show the real tracking state for skipped clusters, and do not force "Not Started". (B6)
5. **(S)** Row action: call a new `rowActionKind` rule:
   - `needDate` → information dialog;
   - `complete` → the direct patch;
   - `panel` → open the panel. (W4)
6. **(S)** Comment form: store the row (id and note), not just the text. (B14, W8)
7. **(S)** Panel close: remove the leave-dialog path, pending Q5. (B17)
8. **(M)** Panel body:
   - gate the comment block with `commentBlockVisible`;
   - gate the due date with `showApprovalDueDate && commentBlockVisible`;
   - initialise the due date from `approvalDueDateDefault`;
   - render the actual-task-state table when `showActualTaskState`. (S17, S20, S21, S22)
9. **(S)** History rows: show the modifier name. Render `vsb_note` as sanitised HTML, or as a table built from the same rows. (D10, U28)
10. **(S)** Add tooltips:
    - NextCluster (`nextClusterTooltip`, U7);
    - the title (U10);
    - the full Holding text, plus 100-character truncation (U15).
11. **(M)** Row Complete: add the persona tooltip (from `ChecklistApprovalSetting`) and the green state when Approved or Completed. Add a Comments-icon colour when a note exists. (U20, U22)
12. **(S)** Cancel Approval Request: `disabled={!connected || !canCancelApproval(...)}`, pending Q6. (S7)
13. **(S)** Give the approval-mode icons `data-testid="ico_Checklist_DisplayProject_Body_Content_ListRow_ApprovalMode"`. Give the lock bullets their `lbl_…VisibilityMessage_1x` test ids. (U2, U24)
14. **(S)** `but_Project_States_CheckList_Refresh`: render the visible caption "Refresh". (U11)
15. **(M)** Loading overlays for the saving dialog and the gate-process dialog, using the verbatim M7 texts from `rules.ts` `MSG`. (B22, M7)
16. **(M)** Stepper visuals: cluster description, gate marker, completed check, pending clock icon, connector (`stepConnectorLit`). (U3)
17. **(S)** Abandon/Inactive pressed (active) styling. (U8)

### (b) `rules.ts` (+ `rules.test.ts`, UT-CHKLST-NNN)
1. **(M)** Split the state sources:
   - `sequenceStates(states)` filters visible states and sorts by `order`, keeping the 999 rows;
   - the operational sequence filters 0 or start…6;
   - the display sequence keeps everything;
   - `checklistStates` stays for the back-fill only.
   Add tests for the `Order` sort and for a non-cluster visible state. (D2)
2. **(M)** Gate source shift in `toSequenceEntry`: when Draft and start > 0, take the gate from cluster `start === 1 ? 0 : start-1`. Add tests for start = 0, 1 and 3. (B5)
3. **(S)** `planReturnToPreviousCluster`, aligned with the live popup:
   - current → Not Started;
   - previous → In Progress, with `vsb_flowapprovalid`/`vsb_flowrunid` set to null;
   - Owning BU bind on both;
   - note type None.
   Update the existing test at `rules.test.ts:838`. (W14)
4. **(S)** `planTerminalStateChange`: emit nothing beyond the log when there is no `primary` row. (W15)
5. **(S)** `approvalPersonaSnapshot`: `parsePersonaList(x).join("\r") || "None"` for each list; portfolio manager email or "None". Update the test at `rules.test.ts:1019-1027`. (W10a)
6. **(S)** `planGateCancel`: add a `userDisplayName` argument and name the note `Request canceled - {project}, {user}`. (W12b)
7. **(S)** `planChecklistMaterialisation`: drop `vsb_approvalcheckliststate`, or log the divergence in D15. (W3)
8. **(S)** New pure builders:
   - `commentPatch(text)` (W8);
   - `checklistApprovalPrePatch(comment, dueDate|null)` (W11a);
   - `gateApprovalNote({project, state, comment, html, bu})` (W10c);
   - `checklistApprovalNoteName(icon, checklist, project)` (W11c);
   - `gateApprovalTrackingPatch` (comment, due date, In Progress, plus the snapshot) (W10a).
9. **(S)** New gates:
   - `commentBlockVisible(panel)` (S17);
   - `approvalDueDateDefault(panel, project, next, current)` (S21);
   - `rowActionKind(row, setting)` (W4);
   - `truncateHolding(text)` (U15);
   - `nextClusterTooltip(...)` with the `Gate Relevance Tasks: x / y` count (U7);
   - `checklistPersonaTooltip(setting)` (U20).
10. **(S)** Fix `showRequestApproval`'s stalled clause to match the canvas, pending Q11. (S25)
11. **(S)** `showCancelApproval`: take the gate looked up by id (active or not). Have `showSave` take "any CLDA row exists", not "active setting exists". (S6, S23)
12. **(S)** Add a `MSG` constant set with every M7 string, verbatim (including the double space and "will be save"). Remove `CHECKLIST_CANCEL_FAILED` or log it in D15. (M7, M8)
13. **(S)** `terminalStates(allStates)`: Abandoned by exact name, Inactive by `name.includes("Inactive")`. (D11)
14. **(M)** `actualTaskStateRows(checklistRows)` plus an HTML or table formatter that mirrors `fn_Common.ChecklisAsHTMLTable`: columns Gate Relevance, Description, Cluster, State, Modified By, Modified On; date format "ddd, mmm. dd, yyyy hh:mm". (S22)
15. **(S)** Decide `gateRelevanceLabel` ("Yes"/"No" vs canvas "true"/"false") and log the decision. (U14)

### (c) `hooks.ts` (connection)
1. **(M)** Register the 8 missing tables with `pac code add-data-source -a dataverse -t <logical>`:
   - `vsb_projectstatetracking`
   - `vsb_projectstatetrackingnote`
   - `vsb_projectchecklist`
   - `vsb_projectchecklisttrackingnote`
   - `vsb_projectdefaultchecklists`
   - `vsb_projectdefaultapprovals`
   - `vsb_checklistdefaultapprovals`
   - `vsb_checklistcountryandtechnology`
   Diff `dataSourcesInfo.ts` after each.
2. **(L)** Flows. Register connection references for the four flows, or confirm the custom APIs `vsb_CancelGateApproval` / `vsb_CancelCheckListApproval` exist (Q3). Today `connectionReferences` is `{}`.
3. **(L)** `OnVisible` orchestration as a query or mutation chain:
   1. project;
   2. trackings + gates + all states in parallel;
   3. back-fill mutation if `shouldBackfillSkippedClusters`, then invalidate trackings;
   4. on cluster select: ensure-tracking mutation → count checklist rows → materialise mutation → checklist query. (B2)
4. **(S)** Project `$select`: add `vsb_name`, the capacity field for the header and `_owningbusinessunit_value` (D1). Approvals filter: drop the country / technology clauses when the project value is blank (D4).
5. **(S)** States: one query for **all** `vsb_projectstates` (id, name, order, visibility, description). Filter visibility client-side, so Abandoned / Inactive resolve. (D11)
6. **(S)** `useChecklistApprovalSettings`: return all CLDA rows for the cluster's templates, including inactive ones, with `vsb_gateisactive` kept for the icon gate. (D7)
7. **(S)** History `$select`: `_modifiedby_value` with its FormattedValue, and `vsb_note`. (D10)
8. **(M)** `canEdit`: compute from privileges and record access, and pass it to every `plan*` (D12, pending Q14).
9. **(M)** Mutations: one `$batch` per plan, then invalidate trackings, checklist and project, which refreshes the header. Surface errors with the verbatim M7 error texts. (B18)
10. **(S)** Remove the stale comment at `hooks.ts:83-86`. `ES.checklistCountryAndTechnologies` already exists.

## Open questions for the product owner
1. **Return to previous:** port the live confirmation behaviour (current → *Not Started*, flow ids cleared on the previous row), as the canvas does today? The code currently follows the hidden button (*Request canceled*).
2. **SOURCE DEFECT:** Save in "Checklist Completion" mode completes the current cluster and starts the next (`pcf_…_Save.OnChange:5245-5355`; only the Projects patch is gated). Port it as-is, or restrict Save in that mode to completing the checklist row?
3. **Gate / checklist cancellation:** keep the canvas flows (`PerformRequestofGateApprovalCancellation` with the 13-field JSON, and `PerformRequestofCheckListApprovalCancellation`), or use the custom APIs the code assumes (`vsb_CancelGateApproval`, `vsb_CancelCheckListApproval`)? Do those APIs exist in DEV?
4. **Gate Relevance column:** "Yes"/"No" (as in the recording) or the canvas "true"/"false"?
5. **Leave confirmation:** it is dead in the canvas. Keep the code's new "Unsaved data" prompt when closing the panel, or remove it?
6. **"Cancel Approval Request":** it is disabled unless the hidden panel's comment is filled in, which is effectively always. Should cancel require a comment (open the panel first), or be enabled directly?
7. **Approval Due Date default:** the canvas pre-fills the project milestone date for the target cluster, not the stored due date. Is that correct?
8. **Checklist Completion panel comment:** the canvas pre-fills the cluster tracking's approval comment. Should it start empty (current code) or follow the canvas?
9. **Inactive state:** resolve it by "name contains Inactive" (canvas), or by a fixed id or name?
10. **"View … Request History":** the GUIDE recording shows a read-only "Cluster Movement to …" dialog. The canvas opens the same transition panel. Which one do we build?
11. **Request Approval "stalled" recovery:** the canvas checks the tracking's FlowRunId, or the selected checklist's Flow Approval Id. Confirm the intended rule: tracking FlowRunId blank only?
12. **New error text** "The approval could not be cancelled. Nothing was changed.", which has no canvas equivalent. Approve?
13. **Materialised checklist rows:** should they also set *Approval Checklist State = Not Started* (code) or leave it blank (canvas)?
14. **Edit permission:** the canvas computes `CanEditSelectedProject` but never enforces it. The code refuses every write without it. Confirm that enforcement is wanted.
15. **Draft gate:** Draft takes its gate from the cluster before the start cluster (`varGateSourceNo`). Confirm this is intended and should be ported.
