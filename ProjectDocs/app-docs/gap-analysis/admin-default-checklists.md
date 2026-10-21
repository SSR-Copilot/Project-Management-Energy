# Gap analysis — Admin Project Default Checklists Screen

- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Default Checklists Screen.pa.yaml` (1,791 lines, read in full). Abbreviated as **Y:line**.
- Code: `ProjectCosts-CodeApp/src/features/admin/admin-default-checklists/` — `Screen.tsx` (**S:**), `rules.ts` (**R:**), `hooks.ts` (**H:**), tests `rules.test.ts` (**RT:**), `Screen.test.tsx` (**ST:**).
- Globals: `App.pa.yaml` `gblAppConstants` (App.pa.yaml:1181–1190), `gblAppSizes.RightPanel.MinWidth = 450` (App.pa.yaml:1142).
- Column names verified against `ProjectDocs/_extracted/VSBCloud/customizations.xml`. **None of the three checklist tables is in `ProjectDocs/reference/dataverse-attributes.json`** (only `vsb_ProjectState` is). They are in `dataverse-entities.json`.
- State: UI built, not connected (D14). Every hook returns `notConnected()` (H:67–90). No Save/Delete/Reorder/Toggle is wired to a write.

Status legend: COVERED / PARTIAL / MISSING / WRONG (WRONG quotes canvas vs code).

## 1. Data

| # | Requirement (canvas citation) | Code | Status |
|---|---|---|---|
| D1 | Scopes: `'Checklist Country And Technologies'` (`vsb_checklistcountryandtechnologies`), tab Items `Sort(…, Order, Ascending)` (`tab_Admin_Project_Checklist_Association.Items`, Y:231–236) | H:14–18 (checklist only), R:337–339 `sortScopes` | PARTIAL — not connected |
| D2 | **`vsb_checklistcountryandtechnology.vsb_order` is `nvarchar`** (customizations.xml). The tab DataField `Order1.FieldType: ="s"` (Y:251–259). Power Fx `Sort` on text puts "10" before "2". | `ScopeRow.order: number` (R:119); `sortScopes` subtracts numbers (R:339); H:16 plans `$orderby=vsb_order asc` (server sort is a text sort too) | WRONG — canvas: text sort of a text column; code: numeric subtraction on a field typed `number`. A string value gives `NaN` comparisons. |
| D3 | Default scope `First(SortByColumns('Checklist Country And Technologies',"vsb_name"))` (`OnVisible`, Y:23–28) | R:328–330 `defaultScope` = first by Order; `defaultScopeCanvasParity` R:333 | WRONG (deliberate) — canvas: first by `vsb_name`; code: first by Order. Marked SOURCE DEFECT in R:315–327, but **no entry in 02-OPEN-DECISIONS** (rule 8). |
| D4 | Gates: `Filter('Project States','Is Visible On Checklist')` sorted `vsb_order` asc, `IsFolded: true` (`OnVisible`, Y:32–46) | H:19–22; R:350–353 `checklistGates`; S:99 all folded | COVERED (`vsb_projectstates` IS registered in power.config.json, but the hook still returns notConnected) |
| D5 | Tasks: `Filter('Project Default Checklists', scope = tab.Selected, 'Cluster State' = gate, Not('To Delete'=true))` sort `vsb_order` asc (`gal_TasksInClusterDefaultChecklist_AdminScreen.Items`, Y:454–466) | H:23–31; R:363–374 `visibleTasks` | COVERED (column names verified: `_vsb_associatedcountryandtechnology_value`, `_vsb_clusterstate_value`, `vsb_todelete`) |
| D6 | Lock: `LookUp('Check List Default Approvals', 'Project Default Check List' = GUID(ThisItem.id) && 'Approval Mode' <> 'Only Notifications')` (`ico_Delete/Edit/ActivateDeactivate/EnablelCompletionDate.DisplayMode`, Y:493–498, 528–533, 561–566, 587–592) | H:32–36 filter is only `vsb_approvalmodecode ne 952850002`; R:396–407 `blockingChecklistIds` | PARTIAL — the planned query is not restricted to the gate's task ids (`_vsb_projectdefaultchecklistid_value in (…)`), so "one query per gate" reads the whole table (rule 2). Power Fx `Blank <> X` is true (blank mode locks); OData `ne` in Dataverse may drop nulls — the server filter and `blockingChecklistIds` can disagree. |
| D7 | Add: `locTotalRows = CountRows(Filter(scope, gate))` captured at Add click, NOT excluding `To Delete` (`pcf_CommandBar_Cluster_….OnSelect`, Y:345–357); `Order: locTotalRows + 1` (Y:1300) | R:466 `nextOrder`, R:469 `nextOrderFromHighest`; H:39–41 reads highest order at save time | WRONG (deliberate) — canvas: count incl. soft-deleted rows at click time; code: max(order)+1 at save time. Documented in R:453–465 only; not in 02-OPEN-DECISIONS. |
| D8 | Create Patch payload (Y:1295–1315): `Name: Trim(name)`, `Order`, `'Associated Country And Technology': locSelectedCountryAndTechnology`, `'Holding Task Description': Trim(…)`, `'Cluster State': LookUp('Project States', = locSelectedCluster)`, `'Gate Relevance'`, `'Is Completion Date'`, `'Owning Business Unit': scope.OBU` | R:592–619 `buildTaskPayload` | COVERED (binds `vsb_ClusterState`, `vsb_AssociatedCountryAndTechnology`, `owningbusinessunit`; nav-property casing still to be confirmed from `$metadata`) |
| D9 | Then a SECOND Patch on the same row (Y:1319–1349): Name, Holding, Gate Relevance, Is Completion Date, `Status` + `'Status Reason'` from `tgl_Active`, OBU | R:580–583, R:628–633 — one create carrying `statecode`/`statuscode` | PARTIAL — merged into one POST. Writing `statecode=1` on create is not accepted by every table; confirm, or keep create-then-update for the inactive case. Not in 02-OPEN-DECISIONS. |
| D10 | Edit: the second Patch only (Order, Cluster State, scope are not rewritten; OBU is rewritten from the *current tab*) (Y:1316, 1323–1346) | R:603–618 | COVERED |
| D11 | Delete: `Patch({'To Delete': true})` (the `Remove` is commented out, Y:1732–1735), then `ClearCollect(colTasksToReorder, Filter(scope, gate, Order > deleted.Order))` + `ForAll(Patch(Order-1))` — **soft-deleted siblings included** (`cmp_DeleteChecklistItem_AdminScreen.OnConfirm`, Y:1712–1753) | R:654–678 `planDeleteTask`, R:479–487 excludes `toDelete` | PARTIAL — code skips soft-deleted siblings (DIVERGENCE, not marked or logged). Siblings source for the plan is not built in hooks yet. |
| D12 | Activate/deactivate: `Patch(…, {Status: flip})` — Status only (`cmp_ActivateDeactiveChecklistItem_AdminScreen.OnConfirm`, Y:1769–1788) | R:535–542 writes statecode + statuscode; parity twin R:545 | WRONG (deliberate) — canvas writes `Status` only; code writes both. SOURCE DEFECT note in R:524–534; not in 02-OPEN-DECISIONS. |
| D13 | Completion date: `Patch({'Is Completion Date': Not(…)})` then `Refresh('Project Default Approvals')` (`ico_EnablelCompletionDate_….OnChange`, Y:600–629) | R:560–562; H:42–43 says invalidate approvals | PARTIAL — `'Project Default Approvals'` (`vsb_projectdefaultapprovalses`) is not in `TABLES` (H:57–62). |
| D14 | Reorder load: `ClearCollect(colTasksToReorder, Filter(scope, gate))` — **no `To Delete` filter**, sorted by Order (Y:366–373, 1570–1582) | S:306 passes `rows` (soft-deleted already removed) | PARTIAL — undocumented divergence (code is safer). |
| D15 | Reorder save: `ForAll(pcf_ReorderTaskList_AdminScreen.CurrentItems, UpdateIf(Text(id)=ItemId, {Order: RecordItem.Position}))`, then `Clear(colTasksToReorder)` (Y:1644–1661) | R:496–509 `reorderPositions` (1-based), R:681–697 | PARTIAL — PowerDragDrop `Position` base (0 or 1) not confirmed; the code assumes 1. |
| D16 | Permission: none on the screen (only nav `ItemVisible`) | R:12–31; R:418–422 `canEditScope`; route guard | PARTIAL — `canEditScope` is not called from `Screen.tsx`; `canEdit` will come from hooks. Not a server control. |

## 2. Behaviour

| # | Requirement | Code | Status |
|---|---|---|---|
| B1 | `OnVisible` resets panel/selection/loading state, picks the scope, loads gates (Y:15–46) | S:88–99 | COVERED (as useState defaults) |
| B2 | Tab `OnChange` → `locSelectedCountryAndTechnology = Self.Selected` (Y:237–238) | S:150 | COVERED |
| B3 | Chevron down/up (`ico_Down/ico_Up_DefaultChecklist_AdminScreen.OnSelect`) → toggle `IsFolded` AND select cluster (Y:808–810, 840–842) | S:100–104, S:323–334 (one button toggles) | PARTIAL — merged into `btn_Select`. The selected cluster (semibold name, `lbl_ClusterName_….FontWeight`, Y:703–708) is not tracked. |
| B4 | `btn_Select_DefaultChecklist_AdminScreen.OnSelect` → select cluster only, no fold (Y:778–779) | S:330–331 toggles fold | WRONG — canvas: `UpdateContext({locSelectedCluster: ThisItem})`; code: `onClick={onToggle}`. |
| B5 | Add Task → open panel blank, remember gate, capture count (Y:344–358) | S:112–115, S:305 | COVERED (count: see D7) |
| B6 | Reorder → open reorder panel and load list (Y:359–373) | S:306, S:225–248 | PARTIAL — list renders read-only; **no drag-and-drop** (PowerDragDrop replacement missing). |
| B7 | Edit icon → open panel with row (only in Edit mode) (Y:539–548) | S:116–118, S:403 | COVERED |
| B8 | Delete icon → confirm (Y:505–514) | S:132, S:250–260 | COVERED (UI); confirm does nothing yet (S:258) |
| B9 | Active/Inactive action → activation confirm (Y:572–573) | S:133, S:389 | COVERED (UI) |
| B10 | Completion-date action → immediate Patch, no confirm (Y:600–629) | S:370–380 — **no `onClick`** | MISSING — the button has no handler at all, not even a stub. |
| B11 | Panel close X (`pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_1.OnSelect`): reset fields, close, clear selection (Y:969–979) | FormPanel `onDismiss` S:167 → `closePanel` S:119 | COVERED |
| B12 | Save (`pcf_but_Admin_Checklist_Form_Buttons_Save.OnChange`): create/update, reset form, close panel (Y:1283–1361) | S:170 `onSave={closePanel}` | PARTIAL — closes only; plan exists in rules (R:622). |
| B13 | Cancel (`pcf_but_Admin_Admin_Checklist_Form_Buttons_Cancel.OnChange`) → reset + close (Y:1391–1399) | S:171 | COVERED |
| B14 | Reorder close X / Cancel → `locShowReorderForm:false` (Y:1483–1492, 1691–1696) | S:229, S:233 | COVERED |
| B15 | Logo → `Navigate('Project Main Screen')`; left nav `OnSelect` navigates to `gblLeftNavigationSelected.TargetScreen` (Y:86, 148–162; commented `With` variant Y:163–188 ignored) | app shell (`AppShell`/`LeftNav`) | COVERED by shell |
| B16 | Flow calls | none in canvas | n/a |

## 3. State gates, validation, messages

| # | Requirement | Code | Status |
|---|---|---|---|
| G1 | Add Task / Reorder `ItemEnabled: true` (Y:330, 336) | S:301–302 `enabled: writable` | COVERED (disabled only because not connected, per D14) |
| G2 | Edit/Delete `DisplayMode` View when locked; Activate/Completion `Disabled` when locked; icon colour `#bbb` (Y:493–503, 528–537, 561–569, 587–597) | S:310–318, S:359 | COVERED (all render disabled; View vs Disabled not distinguished — acceptable) |
| G3 | Locked tooltip "This Check List item is in use by a Project Gate. Delete the Project Gate to edit the Check List item." (all four `…Tooltip`, Y:515–519 etc.) | R:191–193 `MSG.inUse`, S:316 | COVERED |
| G4 | Name error `"Value cannot be blank."` visible when `IsBlank(Trim(name))` (`lbl_Admin_Checklist_Form_Fields_Name_ErrorMessage`, Y:1051–1056) | R:189, S:185 | COVERED |
| G5 | Save `DisplayMode` Disabled while the error is visible (Y:1260–1265) | R:431, S:172 | COVERED |
| G6 | `MaxLength: gblAppConstants.DefaultDefMaxLength` on both inputs (Y:1066, 1144) = **256** (App.pa.yaml:1186); counters `"{Len}/{256}"` (Y:1121, 1174) | R:306–307 `DESCRIPTION_MAX_LENGTH = 100` | WRONG — canvas: 256 (`DefaultDefMaxLength`); code: 100 (that is `DefaultMiddleMaxLength`). The JSDoc cites the right constant with the wrong value. Counter shows "/100". |
| G7 | Required asterisk on Description (`lbl_…_Name_Required`, Y:1090–1106) | `TextField required` S:181 | COVERED |
| G8 | `tgl_Active_ChecklistForm.Checked = If(locSelected.Status = Active, true, false)` → **false for a new task** (Y:1208) | R:157–163 `emptyTaskForm().active = true` | WRONG — canvas: Add opens with Active OFF (and the second Patch then writes Inactive unless the admin turns it on); code: ON. Product decision needed (see Q2). |
| G9 | Loading-dialog texts ("Checklist item '…' will be saved, please wait...", "Checklist item was successfully saved.", "Error: Checklist item could not be saved. Internal error: …", "Completion Date for '…' will be changed, please wait...", "Completion Date was successfully changed.", "Error: Completion Date could not be changed. …", "New order will be saved, please wait...", "Deleteing item '…', please wait...") (Y:1287, 1351–1352, 604, 620, 622, 1649, 1717, 1773) | not in MSG; R:225 adds `saveFailed` (new) | MISSING — but note SOURCE DEFECT: **this screen has no loading pop-up control**; `locAdminLoadingDialog` is set and never rendered, so the canvas never showed any of these texts or any save error. Needs a decision (Q4). |
| G10 | Load-error / loading state (rule 19) | only `NotConnectedNotice` S:141 | MISSING (D17-i) |
| G11 | `locShowReorderForm` is not reset in `OnVisible` (Y:15–31) | — | n/a (canvas quirk; code resets naturally) |

## 4. UI (controls, captions, aria-label, data-testid)

Only one canvas control sets `AccessibleLabel` (`but_Admin_Checklist_Form_Buttons_Reset` = "Reset", Y:1240, a hidden button, correctly not ported). Every other aria-label falls back to the visible caption.

| # | Canvas control (caption) | Code | Status |
|---|---|---|---|
| U1 | `cmp_Admin_Project_Checklist_Header` Project.Name "Checklist settings" (Y:90) | S:144 `MSG.pageTitle` | COVERED |
| U2 | `tab_Admin_Project_Checklist_Association` | S:146–156, testid ✓; tabs `aria-label={sc.name}` (bound data), testid `default-checklists-scope-${id}` | PARTIAL — bound-data aria-label (D16-b) |
| U3 | `gal_DefaultChecklist_AdminScreen` / `con_Main_DefaultChecklist_AdminScreen` | S:158, S:321 | PARTIAL — `con_Main…` repeated per gate without row id (D16-c) |
| U4 | `lbl_ClusterName_DefaultChecklist_AdminScreen.Text` = `Switch(Name, "Draft","Draft to Cluster 1", "Cluster 1","Cluster 1 to Cluster 2", … "Cluster 5","Cluster 5 to Cluster 6", "Cluster 6","Criteria After Cluster 6 Entry", Name)` (Y:718–736) | S:333 renders `gate.name` raw; RT:367–380 (UT-ADCHK-023) assumes the *stored* names are already the transition texts | WRONG — canvas: "Draft" shows "Draft to Cluster 1"; code: shows "Draft". The test fixture hides this. |
| U5 | `btn_Select_DefaultChecklist_AdminScreen` (Text " ") / `ico_Down_…` / `ico_Up_…` | one Button S:323–334, testid `btn_Select…`, `aria-label={gate.name}` | PARTIAL — `ico_Down/ico_Up` testids missing; aria-label is bound data |
| U6 | `shp_BottomLine_…` visible when folded (Y:741–757) | border on section S:63–67 | COVERED |
| U7 | `pcf_CommandBar_Cluster_DefaultChecklist_AdminScreen` "Add Task" (Add) · "Reorder" (NumberedList) (Y:324–338) | S:300–303, R:245–247; Reorder has no icon | PARTIAL — Reorder icon "NumberedList" missing; CommandBar has no canvas testid |
| U8 | Column headers "Description", "Holding Description", "Gate Relevance", "Completion Date", "Active" (Y:396–445) | S:349–353, R:249–257 | COVERED (order matches the X chain) |
| U9 | `gal_TasksInClusterDefaultChecklist_AdminScreen` | S:345 | COVERED (repeated per gate) |
| U10 | `lbl_DescriptionValue_…` = Name; `lbl_HoldingDescriptionValue_…` truncated at 110 + " ..."; `lbl_GateRelevanceValue_…` = boolean text (Y:639–677) | S:365–368, R:446–449 | COVERED (no testids on value labels — not interactive, fine) |
| U11 | `ico_EnablelCompletionDate_…` Text Yes/No, icon CalendarReply/Calendar, green when on (Y:582–638) | S:370–380 | PARTIAL — testid not row-suffixed; no handler (B10) |
| U12 | `ico_ActivateDeactivate_…` Text = Status, icon DeactivateOrders/ActivateOrders (Y:557–581) | S:383–393 | PARTIAL — no icon; testid not row-suffixed |
| U13 | `ico_Edit_…` / `ico_Delete_…` icon-only (Y:488–556) | S:397–414, aria "Edit"/"Delete" | PARTIAL — testids not row-suffixed |
| U14 | `lblAdmin_ProjectGates_Approvals_Form_Title_1` "Add Task"/"Edit Task" (Y:944–949) | R:437–438 `panelTitle` | COVERED (strings inline in the function, not in MSG — rule 7 nit) |
| U15 | Panel close `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_1` | FormPanel `panel-close` / "Close panel" | PARTIAL — canvas name not used as testid |
| U16 | `lbl_Admin_Checklist_Form_Fields_Name` "Description", `txt_Admin_Checklist_Form_Fields_Name` | S:179–188 | COVERED |
| U17 | `lbl_…_HoldingDescription` "Holding Description", `txt_…_HoldingDescription` | S:189–196 | COVERED |
| U18 | Toggles "Gate relevance", "Completion Date", "Active" (`tgl_GateRelevance/CompletionDate/Active_ChecklistForm`, Y:1185–1214) | S:197–220 | COVERED (Switch has no `value`, D16-h) |
| U19 | Save "Save" (CheckMark) / Cancel "Cancel" (Y:1256–1403). Save tooltip "Filter projects details list view." (Y:1365) is a copy-paste leftover | PanelButtons S:169–175 with canvas testids | COVERED (tooltip correctly dropped — log as SOURCE DEFECT) |
| U20 | Panel width `Min(450, Parent.Width)` (Y:914) | `width="narrow"` | COVERED (check narrow = 450) |
| U21 | `lblAdmin_Reorder_Title` "Reoder checklist" (Y:1463), `TextCanvas1` "To reorder drag and drop listed items" (Y:1542) | R:281, R:283 | COVERED |
| U22 | `pcf_ReorderTaskList_AdminScreen` drag list, item template `<b>{{RenderName}}</b>` (Y:1543–1600) | S:242–246 static div | PARTIAL — not draggable, no keyboard reorder |
| U23 | Reorder Save/Cancel `pcf_but_Admin_Checklist_Reorder_Buttons_Save` / `pcf_but_Admin_Admin_Checklist_Reorder_Buttons_Cancel` | S:231–237 | COVERED; reorder close X `pcf_Cancel_Reorder_CommandBar` testid PARTIAL |
| U24 | `cmp_DeleteChecklistItem_AdminScreen`: Title "Delete checklist item?", Description `Are you sure that you want to permanently delete task "<name>"?`, buttons "Delete" (Trash) / "Cancel" (Y:1700–1756) | S:250–260, R:195, R:291–292 | COVERED |
| U25 | `cmp_ActivateDeactiveChecklistItem_AdminScreen`: Title `$"{"Decativate"/"Activate"} checklist item?"`, confirm "Decativate"/"Activate", right icon "Trash" (Y:1757–1791) | R:201–207, R:235–236, R:303–304; no confirmIcon | WRONG — canvas title "Decativate checklist item?"; code "Deactivate checklist item?", while the button keeps "Decativate". Rule 7 says verbatim; this correction is not logged in 02-OPEN-DECISIONS. |
| U26 | `lbl_ClusterName_Checklist_AdminScreen` (Visible false, debug height) (Y:854–884) | not ported | COVERED (correctly dropped) |

## 5. Counts

| Area | COVERED | PARTIAL | MISSING | WRONG |
|---|---|---|---|---|
| Data (16) | 4 | 8 | 0 | 4 |
| Behaviour (16) | 11 | 3 | 1 | 1 |
| Gates/messages (11) | 7 | 0 | 2 | 2 |
| UI (26) | 15 | 9 | 0 | 2 |
| **Total (69)** | **37** | **20** | **3** | **9** |

(D16 / n/a rows are counted as COVERED where the shell or a deliberate drop handles them.)

## 6. Proposed changes

### (a) UI — `Screen.tsx`
1. **S** — Render gate captions through a new `gateCaption(name)` rule (U4).
2. **S** — Split the gate header: `btn_Select…` selects the gate (semibold name); separate `ico_Down_…` / `ico_Up_…` buttons toggle the fold (B3, B4, U5).
3. **S** — Wire the completion-date button `onClick` to a stub handler that runs the `toggleCompletionDatePatch` plan when connected (B10).
4. **S** — Add the Reorder `NumberedList` icon, and the Activate/Deactivate icons (U7, U12).
5. **M** — Replace the static reorder list with a keyboard-accessible sortable list (up/down buttons or dnd-kit). It feeds `orderedIds` to `planReorderTasks` (B6, U22).
6. **S** — Add load-error and loading states (`EmptyState`) per rule 19 (G10).
7. **S** — Use `canEditScope` (once hooks supply the user and scope) in `writable` (D16).
8. **S** — Decide row-suffixed testids (`${base}-${row.id}`) and canvas testids for the close X buttons. These change existing ids, so they need a D16-c decision first (U3, U11–U15).

### (b) `rules.ts` (+ tests)
1. **S** — `DESCRIPTION_MAX_LENGTH = 256` (`DefaultDefMaxLength`), and fix UT-ADCHK-020b (G6).
2. **S** — `gateCaption()` with the canvas `Switch` table. Rewrite UT-ADCHK-023 to use stored names ("Draft", "Cluster 1" … "Cluster 6") and expect the transition captions (U4).
3. **S** — `ScopeRow.order: string`, and make `sortScopes` a text compare that matches Power Fx `Sort` on text, or confirm with the PO that numeric order is intended (D2).
4. **S** — `emptyTaskForm().active`: either match the canvas (`false`) or keep `true` as a logged DIVERGENCE with a parity test (G8, Q2).
5. **S** — Mark and test the compaction/reorder divergences (soft-deleted rows excluded) as `DIVERGENCE:` (D11, D14).
6. **S** — Move the "Add Task"/"Edit Task" literals into `LABELS` (U14).
7. **S** — Decide the "Decativate" title: either restore it verbatim, or log the correction (U25).
8. **S** — Add the eight loading/result texts to `MSG` if the PO wants them surfaced (G9).
9. **Docs, S** — Add entries to 02-OPEN-DECISIONS for D3, D7, D9, D11, D12, D14, G8, G9 and U25 (rule 8).

### (c) `hooks.ts`
Tables **not in `power.config.json`**: `vsb_checklistcountryandtechnology`, `vsb_projectdefaultchecklists`, `vsb_checklistdefaultapprovals`, `vsb_projectdefaultapprovals` (Refresh target). `vsb_projectstate` is already registered.
1. **M** — Register the four tables. Implement `useChecklistScopes` / `useChecklistGates` / `useScopeTasks` with `$select` as in H:14–31. Gates can be connected now.
2. **M** — `useBlockingApprovals`: filter on the gate's task ids (`idIn` on `_vsb_projectdefaultchecklistid_value`) plus the mode. Handle a null mode explicitly (`or vsb_approvalmodecode eq null`) to match Power Fx `<>` (D6).
3. **M** — Mutations: save (with highest-order read), delete+compaction (needs a siblings query including or excluding soft-deleted rows per decision), reorder, toggle active, toggle completion date. Each invalidates the task and approvals keys. If D9 holds, use create-then-update for an inactive create.
4. **S** — Add `ES_PROCESS.projectDefaultApprovals` to `TABLES` if the refresh is kept.

## 7. Open questions for the product owner
1. **Scope order:** `Checklist Country And Technology.Order` is a text column. Should "10" sort after "9" (numeric), or as text (canvas)? Should the default tab be the first by name (canvas) or by order (code)?
2. **New task Active toggle:** in the canvas, a new task opens with Active **off**, and the save writes Inactive unless the admin turns it on. Is that intended, or should new tasks default to Active (code)?
3. **Row toggle status:** should the row Activate/Deactivate also set Status Reason (code), or only Status (canvas)?
4. **Feedback:** the canvas sets progress, success and error texts but never shows them (no loading pop-up on this screen). Show them now (toast/MessageBar), or stay silent?
5. **Soft-deleted rows:** should they keep taking part in order numbering (canvas compaction and reorder include them), or be ignored (code)?
6. **Blank Approval Mode:** should an approval with no mode lock the task? The canvas says yes.
7. **"Decativate" typo:** keep it verbatim in the title and the button (Tosca), or correct both?
8. **Reorder UX:** is drag-and-drop required, or are up/down buttons acceptable? Is PowerDragDrop `Position` 1-based?
