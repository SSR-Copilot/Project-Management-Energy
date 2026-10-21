# Gap analysis — Project General Team Screen

- **Canvas:** `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project General Team Screen.pa.yaml` (1,780 lines). `Lnnnn` below means a line in this file.
- **Globals:** from `App.pa.yaml`:
  - `gblAppConstants.DefaultMiddleMaxLength: 100` (L1185) and `DefaultDefMaxLength: 256` (L1186);
  - `gblAppResx.InputBlank: "Input must not be blank"` (L1633).
- **Components:** `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Confirmation`, `cmp_PopUp_Loading` and `fn_Common`. The PCFs are PowerCAT CommandBar, PeoplePicker and Icon.
- **Code:** `ProjectCosts-CodeApp/src/features/pm/team/`: `Screen.tsx`, `rules.ts` and `hooks.ts`. Shared components: `src/components/FormPanel.tsx`, `CanvasFields.tsx` and `Fields.tsx`.
- **Reference only:** plan `014-project-team.md` (status COMPLETE; flows "none active"), and skeleton `ProjectDocs/skeleton-reference/features/pm/team/`.
- **Flows:** none. The screen calls no Power Automate flow; a grep for `.Run(` finds nothing. It **does** use the `Office365Users` connector (`Office365Users.UserProfile`, `editMember` branch L552), which the plan does not list.
- **Context:** the screen is UI-built and not connected (D14), so rows judge the requirement as captured in code.

## 1. Requirements vs implementation

### 1a. Data (tables, filters, sort, lookups, writes)

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| D1 | `OnVisible` L24 re-reads the project: `LookUp(Projects, Project = gblRecordSelectedProject.Project)`. The fields used are `'Project ID'`, `'End Date'`, `'Project Start Date'`, `'Total Capacity'`, `'Net Yield p50'`, `'Cluster State'.Name`, `'Project Manager'`, `'Deputy Project Manager'` and `'Besitzer (Unternehmenseinheit)'` | `useTeamProject` `hooks.ts:297-299`; checklist `hooks.ts:250-255` | WRONG | The checklist's `$select` is wrong in three places: `'Project ID'` is **`vsb_name`** (`dataverse-attributes.json`), not `vsb_internalprojectid`; the Deputy PM lookup is **`_vsb_deputyprojectmanagerentra_value`** (`Vsb_projectsModel.ts:291`), not `_vsb_deputyprojectmanager_value`; and `vsb_projectmanagermail` / `vsb_deputyprojectmanagermail` do not exist, so Mail must come from an expand to `aadusers` |
| D2 | `OnVisible`: `CanEditSelectedProject = And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(project, EditPermission), false))` | `TeamPermissions` `rules.ts:235-245`; `useTeamPermissions` `hooks.ts:315-319` | PARTIAL | The SDK has no DataSourceInfo or RecordInfo (02-OPEN-DECISIONS D1). The hook comment cites "CONVENTIONS rule 4", which is the wrong rule |
| D3 | Manager gallery `colProjectMembers` is built in memory: **PM row always** (`order 1`); Deputy row (`order 2`) only if not blank (`OnVisible`); `gal_Team_DisplayProject_Body_Content_Managers.Items` L793 sorts by `order` | `managerRows` `rules.ts:90-102` | PARTIAL | Canvas always shows a "Project Manager" row, even with no PM. Code omits it when `projectManager` is null |
| D4 | Member gallery `gal_Team_DisplayProject_Body_Content_Memebers.Items` L923: `Sort(AddColumns(Filter('Project Members', Project.Project = selected), DisplayName, Member.'Display Name'), DisplayName, Ascending)` | `sortMembers` `rules.ts:117`; checklist `hooks.ts:256-261` | WRONG | Filter and sort: COVERED (the sort is the hook's job; `teamTableRows` does not sort). The checklist's primary key `vsb_projectmemberid` is wrong: `dataverse-entities.json` gives **`vsb_projectmembersid`**. The other columns are **unverified**, because the table is not in `dataverse-attributes.json` |
| D5 | Description cell `lbl_Admin_Controlling_Members_Row_Position_1.Text` L1052: `Coalesce('Project Member Description'.Description, LookUp(Choices(Positions), Value=ThisItem.Position, Value))` | `memberDescription` `rules.ts:108-114` | COVERED | |
| D6 | Description dropdown `drp_Team_RightPanel_Member_Form_Position_TableBackedChoices`: `Items` = `'Project Member Descriptions'`, unsorted (L1319); shows `vsb_name` (`Name21`, L1331); default is the selected member's description (L1314) | `Screen.tsx:181-192`; checklist `hooks.ts:262-264` | PARTIAL | UI: COVERED. The checklist adds `$orderby vsb_order`, which the canvas does not have, and its primary key `vsb_projectmemberdescriptionid` should be **`vsb_projectmemberdescriptionsid`** |
| D7 | People search `pcf_Team_RightPanel_Member_Form_Principal.OnSearch` L1408. Blank or whitespace input → no results. Otherwise `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account Enabled' = Yes), Trim(text), 'Display Name', 'Given Name', Surname, Mail)`, mapped to DisplayName, EMail and `UniqueKey` = `'A unique identifer for Microsoft Entra ID'` | `useMemberSearch` `hooks.ts:265-269,311`; `ES.microsoftEntraIds` `dataverseNames.ts:47` | WRONG | The canvas table is the system virtual table **`aadusers`** (`aaduserid`, `accountenabled`, `displayname`, `givenname`, `surname`, `mail`, per `AadusersModel.ts`). It is already registered and already bound in `data/comments.ts:183`. Code uses `vsb_microsoftentraids` (UNVERIFIED) with `vsb_*` columns. `$top 25` is not in the canvas |
| D8 | Edit pre-selects the person with `Office365Users.UserProfile(locSelectedMember.Member.Id)` (`editMember` L552) | `draftFromMember` `rules.ts:403-412` | PARTIAL | Built from the member row instead. This is a reasonable divergence (no connector), but it is not logged in D15 |
| D9 | Tables: Projects, Project Members, Project Member Descriptions and Microsoft Entra IDs. `Users` is touched only in a zero-row `FirstN(Users, 0)` shape template | `TABLES` `hooks.ts:287-292` | PARTIAL | `ES.microsoftEntraIds` is wrong (D7). `vsb_projectmemberses` and `vsb_projectmemberdescriptionses` are **not in `power.config.json`**; `vsb_projects` and `aadusers` are |
| W1 | Save `pcf_btn_Team_RightPanel_Member_Form_Buttons_Save.OnChange` L1602:<br>1. `varCandidateMember = LookUp('Microsoft Entra IDs', Or(IsBlank(First(SelectedPeople)), id = GUID(PersonaKey)))`.<br>2. `Patch('Project Members', Defaults or locSelectedMember, {Name: "MBR-{Mail}", Project, 'Project Member Description', Member, Comment: Trim(...), 'Owning Business Unit': project.'Besitzer (Unternehmenseinheit)'})`.<br>3. `Refresh`.<br>4. On error, write an error text, then reset the collections, close the panel and clear the selection | `buildMemberPayload` `rules.ts:373-394` | WRONG | Payload fields: COVERED. The empty-picker guard is a good SOURCE DEFECT fix. But the OBU key is `"owningbusinessunit@odata.bind"` (`rules.ts:391`); rule 4 and the generated models use **`OwningBusinessUnit@odata.bind`**. The nav names `vsb_Project`, `vsb_Member` and `vsb_ProjectMemberDescription` are unverified. `bind` is imported from another feature, `@/features/pm/general-data/rules` (`rules.ts:26`); rule 17 says to use `@/data/odata` |
| W2 | Delete `cmp_PopUp_Member_Delete_Confirmation.OnConfirm` L1763: `IfError(Remove('Project Members', locSelectedMember); Refresh, UpdateContext({locDeleteMemberlDialogText: "Error: Project member could not be deleted. …"}))`, then clear the selection and close. The error text is never displayed (SOURCE DEFECT) | `Screen.tsx:233` (closes only) | PARTIAL | Not connected. There is no delete plan or error surface yet (rules 14 and 19) |

### 1b. Behaviour

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| B1 | `pcf_Team_DisplayProject_Body_CommandBar_Menu.OnSelect` L552, `newMember`: reset the people collections, open the panel, **`locSelectedMember: Blank()`**, then `Select(…Reset)` | `Screen.tsx:94-96` | PARTIAL | Opens an empty draft, but the row selection is not cleared |
| B2 | `editMember`: pre-select the person and open the panel. `deleteMember`: open the confirmation | `Screen.tsx:97-98` | COVERED | |
| B3 | Row selection: the whole-row `btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton_1.OnSelect` L1113 **toggles** the selection (clicking the selected row clears it). The radio image (L1065) shows `CircleDotBlue` / `CircleEmpty` | `Screen.tsx:143-151`; `toggleSelection` `rules.ts:174` | WRONG | Code uses a native `<input type="radio">` with `onChange`. A checked radio fires no change when clicked again, so a selection can never be cleared, and clicking the row does nothing |
| B4 | Close `psf_Team_RightPanel_Member_Form_CommandBar.OnSelect` (`closeKey`, L1218), Cancel (L1699) and the end of Save all reset the form, close the panel **and clear `locSelectedMember`** | `Screen.tsx:168,171-172` | PARTIAL | `setDraft(null)` only: the selection and the search text remain |
| B5 | Saving dialog `cmp_PopUp_Team_Saving_Dialog` (L1743). Texts: `"The member '{name}' will be added, please wait..."` / `"Project member information will be updated, please wait..."`. The success and error texts are written and then immediately blanked (SOURCE DEFECT) | none | MISSING | `rules.ts:20-22` says this was "replaced by a real toast plus a LoadingOverlay"; neither exists |
| B6 | People picker: `MaxPeople: 1` (L1405), with suggestions; `OnSelect` clears the collections | `Screen.tsx:193-213` | WRONG | Once a person is picked, the input shows `draft.person.displayName` and typing only changes `memberSearch` (:199-200). The chosen person cannot be changed or removed |
| B7 | Leave dialog `cmp_PopUp_Team_Leave_Confirmation` (L1711) is wired to `locLeaveGeneralDataConfirmationDialog`, which nothing on the screen sets, so it is unreachable | removed (`rules.ts:14-16`) | COVERED | Documented in code; not in 02-OPEN-DECISIONS |
| B8 | `OnHidden` clears the collections; the header logo navigates to Project Main; the left nav (`cmp_CheckList_Left_Navigation_1.OnSelect` L205) | app shell | COVERED | |

### 1c. State gates, validation and messages

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| S1 | Lock banner `con_Milestones_Page_LockMessage_4.Visible` L289: an `Or` of the 5 conditions. Title "This page is locked. To unlock it, please complete the following sections:" (L356); bullets "• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft", each with its own `Visible` (L376–448) | `pageLock` `rules.ts:180-222`; `Screen.tsx:108-116` | COVERED | The height formula tests `'Project Start Date'` while visibility tests `'End Date'` (SOURCE DEFECT, resolved to End Date and tested in UT-TEAM-008c). Not in 02-OPEN-DECISIONS. With no project loaded the code shows only "• General"; the canvas would show all five |
| S2 | Command bar `DisplayMode` L497: Disabled if the cluster is blank or "Draft", or the lock banner is visible | `commandState` `rules.ts:275-293` | COVERED | The gate reason strings (`rules.ts:286-303`) are invented, not canvas text (rule 7), and are not rendered |
| S3 | `Items.ItemEnabled` L508. Add Member: project present, `CreatePermission`, `RecordInfo(project, Edit)` and cluster ≠ "Draft". Edit and Delete: a selection and `RecordInfo(locSelectedMember, Edit)` | `rules.ts:295-306`; `Screen.tsx:88-92` | COVERED | The permissions source is open (D1) |
| S4 | Required errors `lbl_Team_RightPanel_Member_Form_Position_ErrMessage` (`Visible` L1300) and `lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage` (L1391). Text `gblAppResx.InputBlank` = "Input must not be blank". Shown only when editing a member and the field is blank | `memberPanelErrors` `rules.ts:353-360`; `Screen.tsx:222` | PARTIAL | Logic and text: COVERED. The errors render as a list at the bottom of the panel instead of under each field, without the canvas testids. The string is inline, not in a `MSG` object citing `gblAppResx.InputBlank` |
| S5 | Save `pcf_btn_Team_RightPanel_Member_Form_Buttons_Save.DisplayMode` L1573: description selected, people not empty, neither error visible | `canSaveMember` `rules.ts:342`; `Screen.tsx:175` | COVERED | |
| S6 | Comment `txt_Team_RightPanel_Member_Form_Comments_Comments`: `MaxLength = DefaultMiddleMaxLength` (100, L1503); counter `lbl_…_Comments_Details.Text` L1517 = `"{Len}/{DefaultDefMaxLength}"`, which renders "n/256" | `COMMENT_MAX_LENGTH` `rules.ts:312`; `TextAreaField` counter `Fields.tsx:106-107` | WRONG | Canvas renders "n/256"; code renders "n/100". Documented in code (`rules.ts:313-319`), but not logged in 02-OPEN-DECISIONS (rule 8) |
| S7 | Delete dialog: Title "Deletion of Project Member" (L1778); Description `Are you sure you want to delete the project member "{Member.'Display Name'}"?` (L1757); buttons "Yes" / "Cancel" (L1755-1756) | `rules.ts:398-400,435`; `Screen.tsx:227-235` | COVERED | |

### 1d. UI (controls, captions, aria-label, data-testid, layout)

| # | Canvas requirement (citation) | Code (file:line) | Status | Note |
|---|---|---|---|---|
| U1 | Headers in X order: "Description" (`…Header_Position`, X=40), "Display Name", "Comment" (L689–780) | `TEAM_COLUMN_HEADERS` `rules.ts:129-136`; `Screen.tsx:131-138` | COVERED | |
| U2 | Two galleries (managers above members) sharing the headers | one `Table` (`teamTableRows` `rules.ts:147-168`) | COVERED | GUIDE q21 decision |
| U3 | Cell tooltips: Name = `Member.Mail` (L877, L1019); Description and Comment = `Self.Text` (L843, L911, L985, L1060) | `Screen.tsx:154-156` | MISSING | |
| U4 | Command items "Add Member" / "Edit" / "Delete", icons Add / Edit / Delete (`Items` L508). `AccessibilityLabel` "pcf_Team_DisplayProject_Body_CommandBar_Menu" (L496) | `TEAM_COMMAND_LABELS` `rules.ts:248-258`; `Screen.tsx:88-92,119-123` | COVERED | The JSDoc cites `btn_Edit_AdminContracts` / `btn_Delete_AdminContracts` (Admin Contract Screen) for Edit and Delete; the literals are in **this** screen's `Items` |
| U5 | Panel header "Add Project Member" for both add and edit (L1197); Save `Tooltip` "Add Project Member" (L1672); Save / Cancel texts | `TEAM_PANEL_LABELS` `rules.ts:417-432`; `Screen.tsx:166` | PARTIAL | The Save tooltip is missing |
| U6 | Panel close `psf_Team_RightPanel_Member_Form_CommandBar`, with `AccessibilityLabel` equal to its name (L1203) | `FormPanel.tsx:18` (`aria-label="Close panel"`, `data-testid="panel-close"`) | WRONG | Rule 16: canvas name and label vs a generic one |
| U7 | `drp_Team_RightPanel_Member_Form_Position_TableBackedChoices`: `AccessibleLabel` equal to its name (L1312); label "Description" * | `Screen.tsx:181-191` | COVERED | |
| U8 | `pcf_Team_RightPanel_Member_Form_Principal`: `AccessibilityLabel` equal to its name (L1400); `HintText` "Select member" (L1402); `Tooltip` "Search member" (L1451); label "Name" * | `Screen.tsx:193-201` (`aria-label={TEAM_PANEL_LABELS.name}`) | WRONG | Canvas aria-label: "pcf_Team_RightPanel_Member_Form_Principal". Code: "Name". The tooltip is missing; the placeholder is COVERED. Suggestion buttons use `aria-label={p.displayName}`, which is bound data (rule 16; D16 b) |
| U9 | `txt_Team_RightPanel_Member_Form_Comments_Comments`: `AccessibleLabel` equal to its name (L1500), multiline, label "Comment" | `TextAreaField` `Fields.tsx:102` (`aria-label={label}`); `Screen.tsx:214-221` | WRONG | Canvas aria-label: the control name. Code: "Comment". `TextAreaField` cannot take a separate aria-label |
| U10 | Save and Cancel `AccessibilityLabel` equal to the control names (L1572, L1680) | `PanelButtons` `CanvasFields.tsx:186-189` (aria "Save" / "Cancel"; testids passed) | PARTIAL | The testids are COVERED. The aria-labels follow the CONVENTIONS exception ("PanelButtons labels Save/Cancel itself"), which conflicts with the AccessibleLabel rule |
| U11 | Radio `img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1`: `AccessibleLabel` equal to its name (L1068); the row button `btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton_1` | `Screen.tsx:144-150` (`aria-label={r.displayName}`, testid `…RadioSelection_1-${id}`, `value`) | WRONG | Canvas aria-label: the control name. Code: the member's display name, which is bound data and breaks rule 16. The row button control is not represented |
| U12 | Lock banner: `icon_milestones_lock_4` `AccessibleLabel` "icon_milestones_lock_4" (L312); bullet labels `lbl_ProjectRevenues_…_VisibilityMessage_15…20` | `Screen.tsx:109-115` (icon `aria-hidden`; no bullet testids) | PARTIAL | Non-interactive, so low priority |
| U13 | Layout: header, left nav, lock banner, command bar, content, right panel (overlay) and three pop-ups | `Screen.tsx:104-237`; `NotConnectedNotice` :106 | COVERED | |

**Counts (39 rows):** COVERED 14 · PARTIAL 12 · MISSING 2 · WRONG 11.

## 2. Proposed changes

### (a) UI: `Screen.tsx` (M overall)
1. **S. Selection.**
   - Replace the native radio's `onChange` with a row-level click and `onClick` toggle, so a click can clear the selection (B3).
   - `aria-label="img_Contracts_List_Card_Body_PaymentTargetsRow_RadioSelection_1"`.
   - Add a per-row `btn_Contracts_List_Card_Body_PaymentTargetsRow_TransparentButton_1-${id}` testid (U11).
2. **S. Clearing.** Clear `selected` and `memberSearch` on `newMember`, on panel close, cancel and save, and after delete (B1, B4).
3. **S. Text and placement.**
   - Tooltips: mail on Name, text on Description and Comment (U3); Save tooltip "Add Project Member" (U5).
   - Show each required error under its field, with the canvas testids `lbl_Team_RightPanel_Member_Form_Position_ErrMessage` / `lbl_Team_RightPanel_Member_Form_Principal_ErrorMessage` (S4).
4. **S. Canvas aria-labels.**
   - On the Name picker, Comment and the lock icon (U8, U9, U12).
   - This needs `ariaLabel` on `TextAreaField`, plus `closeTestId` / `closeLabel` on `FormPanel` set to `psf_Team_RightPanel_Member_Form_CommandBar` (U6). Both are shared component changes.
5. **M. Single-select people picker.**
   - Show the picked person as a removable chip, and allow clearing and re-searching (B6).
   - Show a `LoadingOverlay` with the two canvas saving texts (B5).
   - Show an error message bar for save and delete failures (rules 14 and 19).

### (b) Rules: `rules.ts` and `rules.test.ts` (S overall)
1. **S. Payload.**
   - Change `buildMemberPayload`'s OBU key to `OwningBusinessUnit@odata.bind`.
   - Import `bind` from `@/data/odata` instead of `features/pm/general-data/rules`.
   - Confirm the three nav names once the table is registered.
   - Update UT-TEAM-020 (W1).
2. **S. Messages.** Add a `MSG` object holding:
   - `InputBlank` ("Input must not be blank", citing `gblAppResx.InputBlank`);
   - `savingText(isAdd, name)`;
   - the save and delete error texts (`"Error: Project member could not be changed. Internal error: originated on {Source}. Message: {Message} {HttpResponse}"` and the "deleted" variant);
   - the success text `"Project member '{name}' was saved/updated successfully."`.
3. **S. Write plans.** Add `planSaveMember` (create vs update) and `planDeleteMember` (`WritePlan`, `deleteRecord`), in line with the other screens.
4. **S. Decide and test.**
   - `managerRows`: always emit the PM row (D3).
   - `pageLock(null)`: should it list all five lines (S1)?
   - The comment counter: /256 or /100 (S6).
5. **S. Fix citations** in `TEAM_COMMAND_LABELS` (U4) and in the hooks' permission comment (D2).
6. **S (docs). Log in `02-OPEN-DECISIONS.md` D15 (rule 8):**
   - the counter divergence;
   - the lock-height defect;
   - the removed leave dialog;
   - the edit prefill without `Office365Users`;
   - the toast replacing the blanked saving text;
   - `$top 25` on search;
   - the empty-picker guard.

### (c) Data: `hooks.ts` (M overall)
1. **Registration.** Register **`vsb_projectmemberses`** and **`vsb_projectmemberdescriptionses`**; neither is in `power.config.json`. `vsb_projects` and `aadusers` are already registered.
2. **Entra table.** Change `ES.microsoftEntraIds` to `aadusers`. Search with `$filter=accountenabled eq true and (contains(displayname,q) or contains(givenname,q) or contains(surname,q) or contains(mail,q))` and `$select=aaduserid,displayname,mail`. Skip the query for blank input (D7).
3. **Project query.** Correct the `$select`:
   - `vsb_name` (Project ID);
   - `_vsb_deputyprojectmanagerentra_value`;
   - mail through an expand of `vsb_projectmanager` / `vsb_deputyprojectmanagerentra` to `aadusers.mail`;
   - drop the non-existent `*mail` columns (D1).
4. **Members and descriptions.** Primary keys `vsb_projectmembersid` and `vsb_projectmemberdescriptionsid`. Read the real lookup and column names from `.power/schemas` after registration; they are not in `dataverse-attributes.json` (D4, D6).
5. **Permissions.** Follow D1: no DataSourceInfo or RecordInfo in the SDK.
6. **Mutations.** Create and update through the generated service, delete through `deleteRecord`; invalidate the members query.

## 3. Open questions for the product owner
1. **Selection after a write.** After save, cancel or delete, should the row selection clear (canvas) or stay?
2. **Comment counter.** The canvas counter shows "/256" while the field accepts 100 characters. Show "/100"?
3. **No PM assigned.** Should the "Project Manager" row show with a blank name (canvas) or be hidden?
4. **Lock banner.** Should the Milestones prerequisite test End Date (code) or Project Start Date (the canvas height formula)?
5. **Edit prefill.** Is pre-filling the person from the member row acceptable, instead of the `Office365Users` profile lookup? It needs no extra connector.
6. **Command greying.** Without DataSourceInfo or RecordInfo in the SDK (D1), should Add, Edit and Delete stay enabled and rely on the server, or wait for a privileges custom API?
7. **Messages.** The canvas never actually shows its success or error message (it blanks it immediately). Should the code app show a toast or message bar for both?
8. **Search limits.** Cap people-search results (code: 25) or not (canvas: unlimited)?
9. **Description order.** Should the Description dropdown be ordered by `vsb_order` (the hook checklist) or by table order (canvas)?
