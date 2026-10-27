# 09 · DEVEX/CAPEX Costs screen: the Comments right panel

Gap ID prefix: **GAP-CMT**. Owner of this file: the comments right panel and how the grid opens it,
the red comment markers on the grid, and the comment save path. Siblings are referenced, not repeated:

- 06-POPUPS.md covers the shared spinner (`cmp_Costs_PopUpLoading`).
- 07-FUNCTIONAL-SCREEN-AND-GRID.md covers the refresh button `btn_Capex_Cost_Refresh_Capex_Cost_Code` as a whole.
- 10-COLLECTIONS-VARIABLES.md holds the full variable register.
- 11-DATAVERSE-TABLES.md covers the whole table model.
- 12-NETWORK-CALLS.md counts the round trips.
- 14-PCF-CONTROLS.md covers the PCF menu internals.

---

## 1. Scope

**What this covers.**

- The canvas container `con_Capex_Comments_Right_Panel` and everything in it:
  - `Container3`, `Container4`, `Container5`, `Container8`, `Container9`/`Container10`, `Container11`;
  - `con_Capex_Comments_Body`, `gal_Capex_Comments`, `gal_Capex_Replies` and the four card containers;
  - the hidden dirty and invalid toggles;
  - `Container2`, with `btn_Capex_Comment_Save` and `btn_Capex_Comment_Cancel`.
- The three comment types: a general comment on a contract row, a payment-date (cost-row) comment, and a reply.
- How the PCF grid opens the panel: the `CommentTriggered` branch of `DevexCapexSummaryPCF.OnChange`.
- How the grid's red markers are computed: the `HasComments` / `CommentTooltip` / `M1..M12HasComments` /
  `M1..M12CommentTooltip` columns.
- The save path: the table, columns, payload, Owning Business Unit, "Saving" state, validation and
  refresh.
- Every string, with its `AccessibleLabel`.
- The PCF snippet file `Comments_PCF_CodeSnippets.txt`.

**Canvas source read** (`ProjectDocs/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`, solution 1.21.709):

| Lines | What |
|---|---|
| L11–38 | `OnVisible` reset: `locIsVisibleCapexComments: false` at L32 |
| L1043–1190 | Refresh steps 1b and 1c: `colCapexCommentsInSelectedContracts`, `colCapexCommentsLatest` |
| L1790–2140 | Refresh step 6: the `HasComments` … `M12CommentTooltip` columns on `colFinatCostDataOptimized` |
| L7234–7294 | `DevexCapexSummaryPCF` and the head of its `OnChange` |
| L7457–7650 | the `CommentTriggered` branch |
| L8156–10248 | `con_Capex_Comments_Right_Panel`, read whole in four ranges (Save at L10092, Cancel at L10224) |
| L18206–18222 | `cmp_Costs_PopUpLoading`, the spinner the Save drives |

A grep for `AccessibleLabel` over L8156–10248 returns **no hits**. No control in the comments panel
sets an `AccessibleLabel`, so CONVENTIONS rule 16 falls back to the visible caption or the tooltip.

**Other sources read:**

- `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/Comments_PCF_CodeSnippets.txt` (all 216 lines).
- `…/CapexScreenCode.txt`, the flattened older dump, used to check the line numbers the code cites (L9687, L9839, L8484, L9437).
- From the PCF clone: `TableConnectedToDataversePCF/index.ts` (L236, L275), `ControlManifest.Input.xml` (L95) and `README.md` (L149, L258, L304, L402).
- `ProjectDocs/_extracted/VSBCloud/customizations.xml`: the option set `vsb_capexcommenttype`, the `vsb_comment` / `vsb_name` max lengths, and every `vsb_CapexComments` relationship with its cascade.
- `ProjectDocs/reference/dataverse-entities.json` and `dataverse-attributes.json` (`vsb_capexcomments`).
- The screenshots in `ProjectDocs/Existing Solution/UI Screenshots/`:
  - `Cost App - Comment Panel contract Row - General Comment.png`;
  - `… - Comment to payment date.png`;
  - `… - Reply to comment.png`;
  - `… - Saving.png`;
  - `Cost App - Contract Comments - Red on Contract Name if General Comment Exists - On Cost if Comment to payment date..png`.

**Code app files read** (under `ProjectCosts-CodeApp/src/`):

- In `features/cost/capex-costs/`:
  - `comments.ts`, `CommentsPanel.tsx`, `comments.test.ts`, `CommentsPanel.test.tsx`;
  - `Screen.tsx` (L246, L294–299, L423–433, L953–961);
  - `gridRows.ts` (L128–227);
  - `pcf/ui/GridRenderer.js` (L728–794, L930–1087, L1236–1320) and `pcf/ui/ActionDropdown.js` (L75–175).
- `data/comments.ts`, `data/comments.test.ts`.
- `features/cost/costing/useCostBook.ts` (L380–396, L566–614).
- `data/costBook.ts` (L1048–1160, `loadPayments`).
- `data/currentUser.ts` (L139–193).
- `components/FormPanel.tsx` and `components/CanvasFields.tsx` (`PanelButtons`, L251–291).
- `app/Providers.tsx` (L17–25).
- `data/dataverseNames.ts` (L562).

---

## 2. Canvas implementation

### 2.1 Data model: table, columns, and the in-memory collection

**Table.** The table is `vsb_capexcomments`, with entity set `vsb_capexcommentses` and primary key `vsb_capexcommentsid`
(`dataverse-entities.json:85-89`). The canvas calls it `'Capex Comments'`. The columns the panel uses,
resolved through `dataverse-attributes.json`:

| Canvas display name | Logical name | Type | Notes |
|---|---|---|---|
| `'Capex Comments (vsb_capexcommentsid)'` | `vsb_capexcommentsid` | primary key | |
| `Name` | `vsb_name` | nvarchar | MaxLength 850 (customizations.xml) |
| `Comment` | `vsb_comment` | nvarchar | **MaxLength 250** (customizations.xml). This matches `MaxLength: =250` on both text boxes |
| `'Comment Type'` | `vsb_commenttype` | picklist, global `vsb_capexcommenttype` | `1` = "General Comment", `2` = "Comments to payment date" (customizations.xml) |
| `'Capex Contract'` | `vsb_capexcontract` | lookup → `vsb_CAPEXProjectContract` | relationship `vsb_capexcomments_CapexContract_vsb_capexprojectcontract`, **CascadeDelete = Cascade** |
| `'Capex Cost'` | `vsb_capexcost` | lookup → `vsb_CAPEXCost` | **CascadeDelete = RemoveLink**: deleting a cost row leaves the comment with a null cost |
| `'Parent Comment'` | `vsb_parentcomment` | self-lookup | RemoveLink |
| `'Root Comment'` | `vsb_rootcomment` | self-lookup | RemoveLink |
| `Resolved` | `vsb_resolved` | bit | option set `vsb_capexcomments_vsb_resolved`, written as `'Resolved (Capex Comments)'.Yes/No` |
| `'Resolved By'` | `vsb_resolvedby` | lookup → **`aaduser`** | relationship `vsb_capexcomments_ResolvedBy_aaduser`. The canvas reads it as `'Microsoft Entra IDs'` |
| `'Owning Business Unit'` | `owningbusinessunit` | lookup | `business_unit_vsb_capexcomments` (Restrict) |
| `'Created By'` / `'Created On'` | `createdby` / `createdon` | system | The panel reads `'Created By'.'Full Name'` and `'Created By'.'Primary Email'` |

The table has **no year or month column**. A payment-date comment gets its month and year from the
CAPEX Cost row that `vsb_capexcost` points at.

**Collections and variables the panel owns.** The full register is in 10-COLLECTIONS-VARIABLES.md.

| Name | Set where | Meaning |
|---|---|---|
| `locIsVisibleCapexComments` | L32 (`OnVisible`), L7633 (open), L8238 (close icon), L10208 (save success) | panel `Visible` (L8167) |
| `colCapexComments` | L7573 (open), mutated throughout the panel | the working copy: real rows plus one `IsButton` placeholder |
| `colDeletedComments` | Collect in the delete handlers, cleared at L8240 and L10210 | rows staged for `RemoveIf` on Save |
| `colTempRoots` | L7582, L9465, L9725 | scratch list used to renumber roots |
| `locSelectedProjectContract` | L7569 | the contract whose thread is open |
| `locSelectedCapexComments` | L7570 | a copy of the loaded rows. **Set but never read in the panel** (inferred from grep: only L7570) |
| `locPinGeneralComments` | L7634 = `true`, L8369/L8371 | the `CheckboxCanvas1.Checked` source |
| `locShowResolvedComments` | L7635 = `false`, L8383/L8385 | the `CheckboxCanvas1_1.Checked` source |
| `locAvailebleCapexCosts` (sic) | L7636–7646 | every CAPEX Cost of the contract, feeding the Year/Month dropdowns |
| `locIsVisiblePopUpSpinner`, `locSpinnerInformationText` | L10138–10143, L10217–10222 | the "Saving comments..." spinner |

**Fields added to every `colCapexComments` row** at load (`AddColumns`, L7468–7562):

- `Resolver`: `'Resolved By'` when `Resolved` is set, otherwise blank.
- `RelatedCost`: `'Capex Cost'`.
- `IsRoot`: `Or(IsBlank('Parent Comment'), IsBlank('Root Comment'))`.
- `LocalID`: `GUID()`.
- `SelectedYear` / `SelectedMonth`: the linked cost's `Year` / `Month`, or blank for a General Comment.
- `IsGeneralComment`: `'Comment Type' = 'General Comment'`.
- `ParentCommentID`: the parent's id when the row is not a root.
- `IsModified`, `IsEdit`, `IsNew`, `IsButton`: all `false`.
- `SequenceNumber`: added later (L7577–7606).

### 2.2 How the grid opens the panel (PCF event and variables)

**What the PCF emits.** `DevexCapexSummaryPCF` (`vsb_Dev.DevexCapexSummaryPCF`, L7234) has the output
`CommentTriggered` (TwoOptions, `ControlManifest.Input.xml:95`). Its `index.ts:236` sets
`this._commentTriggered = action === "Comment"` and `getOutputs` returns it at `index.ts:275`.
The `"Comment"` action fires from two places:

- the contract row's "…" menu item **Comments** (`ActionDropdown.ts:100` in the clone);
- the month-cell dropdown item **Comments** (`GridRenderer.ts:1581` in the clone).

That item is rendered only for individually distributed contracts. On an equal-distributed contract the
month dropdown shows only "Automatically distributed costs cannot be marked as paid or assigned
payment date comments." (`GridRenderer.ts:1550`). Both entry points send `SelectedRecordId` = the
contract row id (README L149, L258). The month the user clicked is **not** passed on: the panel always
opens on the whole contract thread.

**`OnChange` head** (L7278–7294). This runs for every action:

```powerfx
UpdateContext({
    locSelectedCostRow: LookUp(colFinatCostDataOptimized, vsb_capexaccountlistid = GUID(Self.SelectedRecordId)),
    locMilestoneRelinkResetNeeded:false, locClusterLinkageChanged:false, locCostPaidByChanged:false
    /*, locPCFSelectedContract: … */        // commented-out, not live
});
```

**`CommentTriggered` branch** (`DevexCapexSummaryPCF.OnChange`, L7457–7650). In order:

1. `Refresh('Capex Comments');` (L7459). This forces a server re-read.
2. `locTempContract: LookUp(colCapexProjectContracts, 'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid)` (L7462–7465).
3. `recFilteredComments`: `Sort(AddColumns(Filter('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid), …), 'Created On', SortOrder.Ascending)`
   (L7467–7565). The fields it adds are listed in §2.1.
   - It filters by the contract lookup only, with no `Cost` clause and no `statecode` condition.
4. `UpdateContext({locSelectedProjectContract: locTempContract, locSelectedCapexComments: recFilteredComments})` (L7567–7572).
5. `ClearCollect(colCapexComments, recFilteredComments)` (L7573–7576).
6. `UpdateIf(colCapexComments, IsRoot = false, {SequenceNumber: Blank()})` (L7577–7581). Replies get no number.
7. Roots are numbered by `'Created On'` ascending:
   - `ClearCollect(colTempRoots, Sort(Filter(colCapexComments, IsRoot = true), 'Created On', SortOrder.Ascending))` (L7582–7592);
   - then `ForAll(Sequence(CountRows(colTempRoots)), Patch(colCapexComments, LookUp(…, LocalID = Index(colTempRoots, Value).LocalID), {SequenceNumber: Value}))` (L7593–7606).
8. `Collect(colCapexComments, {… IsButton: true, IsRoot: true, Resolved: …No, 'Created On': Now(), LocalID: Blank(), IsGeneralComment: true …})` (L7607–7630).
   This is the **"Add Comment" placeholder**: it is a gallery ITEM, not a free-standing button.
9. A second `UpdateContext` (L7631–7648):
   - `locIsVisibleCapexComments: Self.CommentTriggered` opens the panel;
   - `locPinGeneralComments: true` and `locShowResolvedComments: false` reset the two checkboxes on **every** opening;
   - `locAvailebleCapexCosts: ShowColumns(Filter('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedProjectContract.'CAPEX Project Contract'), Year, Month, 'CAPEX Cost', Contract, Cost)` is set as well.

`modernDropdown1` (the sort) is **not** reset on opening. Its `Default` is a constant, so its last
selection survives while the screen stays loaded (inferred; it needs a live run to confirm).

### 2.3 Panel chrome

| Control | Line | Live formula / value | Meaning |
|---|---|---|---|
| `con_Capex_Comments_Right_Panel` | L8156 | `Fill: =RGBA(0, 0, 0, 0.3)`, full screen, `Visible: =locIsVisibleCapexComments` | A dimming scrim with no `OnSelect`: clicking it does nothing |
| `Container3` | L8170 | `Width: =Min(600,Parent.Width)`, `X: =Parent.Width-Self.Width`, white, vertical auto-layout | The 600 px drawer on the right |
| `Container4` | L8186 | `Fill: =ColorValue(gblAppTheme.palette.themePrimary)`, `Height: =48` | The blue header bar |
| `Label1` | L8205 | `Text: =With({ _text: "Comments : " & locSelectedProjectContract.Name }, If(Len(_text) > 45, Left(_text, 45) & "...", _text))`, `Tooltip: ="Comments : " & locSelectedProjectContract.Name` | The title, cut to 45 characters **including** the `"Comments : "` prefix. The full text is in the tooltip |
| `Icon2` | L8226 | `Icon: =Icon.Cancel`, `Tooltip: ="Cancel"`, `OnSelect: =UpdateContext({locIsVisibleCapexComments: false}); Clear(colCapexComments); Clear(colDeletedComments)` | The ✕. It discards everything with no confirmation |
| `Container8` / `Label5` | L8258 / L8282 | `Text: =With({_text: $"{tab_Costs_ContentAssignableAccountCategories.Selected.Name} / {locSelectedProjectContract.Account.Name}"}, If(Len(_text) > 50, Left(_text, 50) & "...", _text))`, with the untruncated tooltip | The breadcrumb `{Category tab} / {Sub-account}`, cut at 50 characters |
| `Rectangle1` | L8273 | 1 px `RGBA(231,231,231,1)` at Y 40 | The divider under the breadcrumb |
| `Container10` | L8318 | `Fill: =RGBA(243, 243, 243, 1)` | The grey filter block |
| `Text2` | L8332 | `Text: ="Sort by"` | The caption |
| `modernDropdown1` | L8346 | `Items: =["Date added [Oldest]","Date added [Newest]"]`, `Default: =First([...])`, `Width: =232` | The sort order |
| `CheckboxCanvas1` | L8360 | `Label: ="Pin general comments to top"`, `Checked: =locPinGeneralComments`; `OnCheck`/`OnUncheck` flip the variable | Pins general comments to the top |
| `CheckboxCanvas1_1` | L8375 | `Label: ="Show resolved comments"`, `Checked: =locShowResolvedComments` | Shows resolved threads |

### 2.4 Thread rendering: galleries, ordering, threading

**`gal_Capex_Comments.Items`** (L8425–8458). It shows root rows only, sorted three times
(innermost sort first):

```powerfx
Sort(Sort(Sort(
    Filter(colCapexComments, IsRoot = true,
           (CheckboxCanvas1_1.Checked Or Resolved <> 'Resolved (Capex Comments)'.Yes)),
    'Created On', If(modernDropdown1.Selected.Value = "Date added [Newest]", SortOrder.Descending, SortOrder.Ascending)),
  If(CheckboxCanvas1.Checked And IsGeneralComment = true, 0, 1), SortOrder.Ascending),
 If(IsButton, 1, 0), SortOrder.Ascending)
```

- **Tier 3** (weakest): date order, set by the dropdown.
- **Tier 2**: general comments first while "Pin" is checked.
- **Tier 1** (strongest): the Add placeholder always last. Its `Resolved` is `No`, so it survives the resolved filter.
- **Display order and `SequenceNumber` are independent.** Numbers come from creation order (§2.2 step 7),
  so with pinning on, the panel can show `#01, #03, #02`.

**`gal_Capex_Replies`** (L8504, nested in every root card):

- `Items` (L8521–8541): the rows of `colCapexComments` with `IsRoot = false` and `ParentCommentID` = this root's id,
  sorted by `'Created On'` **ascending**. The order is fixed; the dropdown does not affect it.
- `Visible` (L8544–8569): the root's read or edit card is visible **and** the root has at least one reply.
  Replies therefore show under an open edit card too.
- `X: =30`, `Width: =Parent.Width-60` (L8570–8571): replies are indented.
- **One level only.** A reply card has no Reply action, and the Save writes `'Parent Comment'` = `'Root Comment'`
  = the same record (§2.8).
- `rec_Capec_Comment_Seprator` (sic, L8491): a 1 px rule, `Visible: =Or(ThisItem.IsButton <> true, Not(IsBlank(ThisItem.SequenceNumber)))`.
  It is hidden for the placeholder.

**Card selection per row:**

| Card | Line | `Visible` |
|---|---|---|
| `con_Comment_Add_Button` | L8951 | `=ThisItem.IsButton = true` |
| `con_Comment_Draft_Edit` | L9050 | `=Not(ThisItem.IsButton) && (ThisItem.IsNew \|\| ThisItem.IsEdit)`. The line above it, `//Not(ThisItem.IsButton) && (ThisItem.IsNew \|\| (!IsBlank(locEditingCommentId) …))`, is commented-out, not live |
| `con_Comment_Read_Only` | L9573 | `=Not(ThisItem.IsButton) && Not(ThisItem.IsNew) && Not(ThisItem.IsEdit)` |
| `con_Reply_Comment_Read_Only` | L8599 | `=Not(ThisItem.IsNew) && Not(ThisItem.IsEdit)` |
| `con_Reply_Comment_Draft_Edit` | L8803 | `=ThisItem.IsNew \|\| ThisItem.IsEdit` |

### 2.5 Read cards: author, date format, actions, edit and delete rights

**Root read card** (`con_Comment_Read_Only`, L9573–10044):

- `lbl_Read_Header` (L9588), the heading:
  `=$"Comment #{Text(ThisItem.SequenceNumber,"00")} [{ThisItem.'Created By'.'Full Name'} - {Text(ThisItem.'Created On',"dd.mm.yyyy")}]"`.
  - The author is the systemuser Full Name.
  - The date format is the string `"dd.mm.yyyy"`. In Power Fx `mm` next to `dd` and `yyyy` is the month, so this renders as `14.09.2026`.
  - There is no locale tag.
- `lbl_Read_Type_Title` (L9605) is `"Type"`. `lbl_Read_Type_Value` (L9620):

  ```powerfx
  If(ThisItem.IsGeneralComment, 'Capex Comment Type'.'General Comment', 'Capex Comment Type'.'Comments to payment date')
  & If(ThisItem.IsGeneralComment = false, $" : {Text(ThisItem.RelatedCost.Month)} , {ThisItem.RelatedCost.Year}")
  ```

  The result is, for example, `Comments to payment date : March , 2028`, with a space before both the colon and the comma.
- `lbl_Read_Comment_Title` (L9643) is `"Comment"`. `lbl_Read_Comment_Value` (L9658) is `=ThisItem.Comment` (Semibold, height 60).

**Action icons.** Each is an `Image` plus a transparent `ModernButton` laid over it, and the button's
`OnSelect` is `Select(img…)`. Left to right: Reply, Check, Edit, Delete.

| Action | Image / button | Visible | Enabled (`DisplayMode` on the button) | OnSelect |
|---|---|---|---|---|
| Reply | `img_Read_Comment_Reply` L9881 / `btn_Read_Comment_Reply` L9931 | `Not(ThisItem.Resolved = …Yes)` | always | `Collect(colCapexComments, With({rec: LookUp('Capex Comments', id = GUID(ThisItem.id))}, {id: Blank(), LocalID: GUID(), Comment: "", IsRoot: false, IsNew: true, IsModified: true, IsGeneralComment: If(ThisItem.IsGeneralComment, true, false), ParentCommentID: rec.id, SequenceNumber: Blank(), Resolved: …No, 'Created On': Now(), RelatedCost: ThisItem.RelatedCost, …}))` (L9889–9925). This makes **a Dataverse LookUp per click** |
| Mark as resolved | `img_Read_Comment_Check` L9832 / `btn_Read_Comment_Check` L9869 | not resolved | always | `With({_Resolver: LookUp('Microsoft Entra IDs', Id = User().EntraObjectId), _CurrentId: ThisItem.id}, UpdateIf(colCapexComments, Or(LocalID = ThisItem.LocalID, (Not(IsBlank(_CurrentId)) And ParentCommentID = GUID(_CurrentId))), {Resolved: …Yes, IsModified: true, Resolver: _Resolver, IsEdit: false, IsNew: false}))` (L9840–9863). It resolves the root and its replies, and closes any editor on them |
| Edit | `img_Read_Comment_Edit` L9775 / `btn_Read_Comment_Edit` L9814 | not resolved | `If(ThisItem.'Created By'.'Primary Email' = User().Email, DisplayMode.Edit, DisplayMode.Disabled)` (L9818–9823). The image swaps to a grey SVG for non-authors (L9793–9798) | `UpdateIf(colCapexComments, LocalID = ThisItem.LocalID, {IsEdit: true, IsModified: true})` (L9800–9808) |
| Delete | `img_Read_Comment_Delete` L9674 / `btn_Read_Comment_Delete` L9757 | not resolved | the same author gate (L9761–9766) | see §2.7 |
| Resolved pill | `txt_Read_Comment_Resolved_Tag` L9943 | `ThisItem.Resolved = …Yes` | `DisplayMode.View` | `Default: ="Resolved"`, an 85×22 pill |
| Reset (reopen) | `img_Read_Comment_Reset` L9969 / `btn_Read_Comment_Reset` L10019 | resolved | `Or('Created By'.'Primary Email' = User().Email, ThisItem.Resolver.Id = User().EntraObjectId)` (L10023–10032): author **or** resolver | `UpdateIf(…same scope…, {Resolved: …No, IsModified: true, Resolver: Blank()})` (L9998–10013) |

**Reply read card** (`con_Reply_Comment_Read_Only`, L8599–8802):

- `lbl_Read_Header_Reply` (L8613): `=$"Reply [{ThisItem.'Created By'.'Full Name'} - {Text(ThisItem.'Created On',"dd.mm.yyyy")}]"`.
- `lbl_Read_Comment_Title_Reply` is `"Comment"`; `lbl_Read_Comment_Value_Reply` is `=ThisItem.Comment`. A reply has no Type block.
- There are only two actions, Edit (`img/btn_Read_Comment_Edit_Reply`, L8660/L8706) and Delete (`img/btn_Read_Comment_Delete_Reply`, L8730/L8779).
  - Both are visible while the reply itself is not resolved.
  - Both are enabled only when `'Created By'.'Primary Email' = User().Email` **and** the parent is not resolved (L8710–8721, L8783–8794).
- A resolved reply shows no pill and no Reset.

**Can a comment be edited or deleted?** Yes, while it is unresolved, and only by its author, matched
by primary email. Reply and Mark-as-resolved are open to everyone. Reset is open to the author or the
resolver. **Note:** only the overlaid *button* carries the `DisplayMode` gate. The image underneath has
an ungated `OnSelect`. Whether a disabled overlay button still swallows the click needs a live run (§5).

### 2.6 Edit cards (new comment, edited comment, reply)

**Add** (`btn_Add_Comment`, L8967, `Text: ="Add Comment"`, `Icon: ="Add"`), `OnSelect` L8978–9047:

1. `_nextSequence = Coalesce(Max(Filter(colCapexComments, IsRoot = true && IsButton = false), SequenceNumber), 0) + 1`.
2. `RemoveIf(colCapexComments, IsButton = true)`.
3. `Collect` the draft. Its fields:
   - `{id: Blank(), LocalID: GUID(), Comment: "", 'Comment Type': Blank()}`;
   - `IsNew: true, IsEdit: false, IsRoot: true, IsModified: true, IsButton: false`;
   - `ParentCommentID: Blank(), SequenceNumber: _nextSequence, Resolved: …No`;
   - `'Created On': Now(), RelatedCost: Blank(), IsGeneralComment: true`;
   - `SelectedYear/SelectedMonth: Blank()`.
4. Collect the placeholder again.

A new comment therefore always starts as a **General Comment**.

**Root edit card** (`con_Comment_Draft_Edit`, L9050–9572): a dotted border `RGBA(125,125,125,1)`, 0.5 px, radius 8. Its contents:

| Control | Line | Live formula |
|---|---|---|
| `lbl_Draft_Edit_Header` | L9070 | `=$"Comment #{Text(ThisItem.SequenceNumber,"00")}"` |
| `con_Draft_Edit_Comment_Warning` | L9531 | `Visible: =Or(locSelectedProjectContract.Distribution = 'Distribution Type'.'Equal Distribution')`, height 40, `Fill: =RGBA(225, 236, 244, 1)`. It holds `ico_Draft_Edit_Comment_Warning` (`Icon.Information`) and `lbl_Draft_Edit_Comment_Warning` `Text: ="Payment date comments cannot be added to automatically distributed costs."` (L9569) |
| `lbl_Draft_Edit_Type_Title` | L9085 | `="Type"` |
| `drp_Draft_Edit_Type_Value` | L9100 | `Items: =Choices('Capex Comment Type')`. `Default: =If(ThisItem.IsGeneralComment = true, LookUp(Choices(…), Value = …'General Comment'), LookUp(Choices(…), Value = …'Comments to payment date'))`; the first line, `//LookUp(…ThisItem.'Comment Type')`, is commented-out, not live. `DisplayMode: =If(Or(locSelectedProjectContract.Distribution = 'Equal Distribution'), DisplayMode.View, DisplayMode.Edit)`. `OnChange` (L9130–9153): `Patch(colCapexComments, _targetRecord, {IsGeneralComment: Self.Selected.Value = 'General Comment', IsModified: true, SelectedMonth: Blank(), SelectedYear: Blank(), IsRoot: true})`. **`RelatedCost` is NOT cleared.** Width 250 |
| `lbl_Draft_Edit_Year_Title` / `drp_Draft_Edit_Year_Value` | L9196 / L9213 | `="Year"`. `Items: =Sort(Distinct(locAvailebleCapexCosts, vsb_year), Value, SortOrder.Descending)` (newest first). `Default` is the row's `SelectedYear`. `OnChange: =UpdateIf(colCapexComments, LocalID = ThisItem.LocalID, {IsModified: true, SelectedYear: Self.Selected.Value, SelectedMonth: Blank()})`, followed by `//Reset(drp_Draft_Edit_Month_Value)` (commented-out, not live). It does **not** clear `RelatedCost`. `Visible: =And(ThisItem.IsGeneralComment = false)`. Width 100 |
| `lbl_Draft_Edit_Month_Title` / `drp_Draft_Edit_Month_Value` | L9264 / L9281 | `="Month"`. `Items` (L9307–9332): `Filter(ForAll(Choices([@Month]), {Value: Int(ThisRecord.Value), MonthName: Text(ThisRecord.Value)}), Value in ForAll(Distinct(Filter(locAvailebleCapexCosts, vsb_year = ThisItem.SelectedYear), vsb_month), …{MonthValue: Int(…)}))`, i.e. January..December, restricted to months that have a cost row in that year. `ItemDisplayText: =ThisItem.MonthName`. `OnChange` (L9333–9422) does a **Dataverse `LookUp('CAPEX Costs', And(Year = _year, Month = _monthEnum, Contract.'CAPEX Project Contract' = _contractId))`**, then `Patch(colCapexComments, _targetRecord, {IsModified: true, SelectedMonth: <enum>, IsGeneralComment: false, RelatedCost: _capexCost})`. Visible only on a payment-date comment. Width 100 |
| `lbl_Draft_Edit_Comment_Title` | L9157 | `="Comment"` |
| `lbl_Draft_Edit_Comment_Length` | L9514 | `=$"{Len(txt_Draft_Edit_Comment_Value.Text)} / 250"`, right-aligned on the label row |
| `txt_Draft_Edit_Comment_Value` | L9172 | `ModernTextInput`, `Type: Multiline`, `MaxLength: =250`, `Default: =ThisItem.Comment`, height 60, `OnChange: =UpdateIf(colCapexComments, LocalID = ThisItem.LocalID, {Comment: Self.Text, IsModified: true})` |
| `img_Draft_Edit_Delete` / `btn_Draft_Edit_Delete` | L9430 / L9496 | `Tooltip: ="Delete"`. The only action on an open card. Same handler as the read-card delete (§2.7). Not author-gated |

**Reply edit card** (`con_Reply_Comment_Draft_Edit`, L8803–8936):

- `lbl_Draft_Edit_Header_Reply` is `=$"Reply to comment"` (L8834).
- `lbl_Draft_Edit_Comment_Title_Reply` is `"Comment"`, and `lbl_Draft_Edit_Comment_Length_1` is `=$"{Len(txt_Draft_Edit_Comment_Value_Reply.Text)} / 250"`.
- `txt_Draft_Edit_Comment_Value_Reply` has MaxLength 250 and the same `OnChange` shape.
- `img/btn_Draft_Edit_Delete_Reply` (L8836/L8863) has `Tooltip: ="Delete"`.
- There is no Type, Year or Month.

### 2.7 Delete, renumbering and staging

- **Root delete** (read card L9699–9751, edit card L9439–9491, identical):
  - if the root has a GUID, `Collect(colDeletedComments, Filter(colCapexComments, id = ThisItem.id Or ParentCommentID = GUID(ThisItem.id)))`;
  - `RemoveIf` its replies and `Remove` the root locally;
  - renumber the remaining roots 1..n by their current `SequenceNumber` order.
- **Reply delete** (read L8762–8773, edit L8845–8858): stage only that reply (if it has a GUID), then `Remove` it.
- Nothing reaches Dataverse until Save.

### 2.8 Save path (`btn_Capex_Comment_Save`, L10092)

**`DisplayMode`** (L10095–10131):

```powerfx
With({ _hasLiveInvalids: CountRows(Filter(gal_Capex_Comments.AllItems, tgl_Root_IsInvalid.Value = true)) > 0,
       _hasLiveValidChanges: CountRows(Filter(gal_Capex_Comments.AllItems, tgl_Root_IsDirty.Value = true)) > 0,
       _hasDeletions: !IsEmpty(colDeletedComments),
       _hasModifiedRecords: CountRows(Filter(colCapexComments, IsModified = true)) > 0 },
  If(_hasLiveInvalids, DisplayMode.Disabled,
     _hasLiveValidChanges Or _hasDeletions Or _hasModifiedRecords, DisplayMode.Edit,
     DisplayMode.Disabled))
```

The hidden per-card toggles:

- `tgl_Root_IsInvalid` (L10058): `((ThisItem.IsNew Or ThisItem.IsEdit) And IsBlank(Trim(txt_Draft_Edit_Comment_Value.Text))) Or <any reply invalid>`.
- `tgl_Reply_IsInvalid` (L8944): `(IsNew Or IsEdit) And IsBlank(Trim(txt…Reply.Text))`.
- `tgl_Root_IsDirty` (L10045) and `tgl_Reply_IsDirty` (L8937): the text differs from `ThisItem.Comment` **and** is not blank.

**Validation, in full:**

- an open card whose text is blank or whitespace disables Save;
- length is capped at **250** by `MaxLength`, which matches the column;
- there is **no** check that a payment-date comment has a Year and Month.

Clicking Edit sets `IsModified: true`, so Save becomes enabled even when nothing is typed. Resolve and
Reset both set `IsModified`.

**`OnSelect`** (L10136–10222), verbatim structure:

```powerfx
SetFocus(btn_Capex_Comment_Save);
UpdateContext({locIsVisiblePopUpSpinner: true, locSpinnerInformationText: "Saving comments..."});
IfError(
    If(!IsEmpty(colDeletedComments),
       ForAll(colDeletedComments, With({_Item: ThisRecord},
           RemoveIf('Capex Comments', 'Capex Comments (vsb_capexcommentsid)' = _Item.'Capex Comments (vsb_capexcommentsid)'))));
    ForAll(Filter(colCapexComments, IsButton <> true) As _currentComment,
        Patch('Capex Comments',
            If(IsBlank(_currentComment.id), Defaults('Capex Comments'), {'Capex Comments (vsb_capexcommentsid)': _currentComment.id}),
            With({recRootComment: LookUp('Capex Comments', 'Capex Comments (vsb_capexcommentsid)' = _currentComment.ParentCommentID)},
            { Name: $"Comment - {_currentComment.SequenceNumber} - {User().FullName}",
              Comment: _currentComment.Comment,
              'Capex Contract': locSelectedProjectContract,
              'Comment Type': If(_currentComment.IsGeneralComment, 'General Comment', 'Comments to payment date'),
              Resolved: _currentComment.Resolved,
              'Resolved By': _currentComment.Resolver,
              'Parent Comment': If(_currentComment.IsRoot = false, recRootComment, Blank()),
              'Capex Cost': If(_currentComment.IsGeneralComment = false, _currentComment.RelatedCost, Blank()),
              'Root Comment': If(_currentComment.IsRoot = false, recRootComment, Blank()),
              'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)' })));
    UpdateContext({locIsVisibleCapexComments: false});
    Clear(colCapexComments);
    Clear(colDeletedComments),
    Notify("An error occurred while saving. Please try again.", NotificationType.Error)
);
Select(btn_Capex_Cost_Refresh_Capex_Cost_Code);
UpdateContext({locIsVisiblePopUpSpinner: false, locSpinnerInformationText: Blank()});
```

What it does:

- **Spinner first, panel still open.** `cmp_Costs_PopUpLoading` (L18206) comes later in the tree, so
  it draws above the panel. The Saving screenshot shows exactly this: the panel is visible and dimmed
  behind the centred "Saving comments..." card. One exception: the spinner text becomes "Please wait, loading
  data..." when `colFinatCostDataOptimized` is empty (L18211–18215).
- **Deletes first**, one `RemoveIf` per staged row, in collection order.
- **Then every non-placeholder row is patched, changed or not.** Each patch:
  - rewrites `Name` with the current sequence number and the **saving** user's `User().FullName`;
  - rewrites `'Owning Business Unit'` to the project's owning business unit (`gblSelectedProject.'Besitzer (Unternehmenseinheit)'`);
  - looks up `recRootComment` again for every row, roots included.
- **The panel closes and the collections clear only when everything succeeded.** On any error:
  - Notify shows "An error occurred while saving. Please try again.";
  - the panel stays open with the user's edits intact.
  - (inferred) A retry re-creates any new row that had already been created on the first attempt: the Patch result is never written back, so its id stays blank.
- **Refresh runs whether the save worked or not**: `Select(btn_Capex_Cost_Refresh_Capex_Cost_Code)` rebuilds the grid and the red markers (see 07).
  The spinner then goes off.

**Cancel** (`btn_Capex_Comment_Cancel`, L10224): a `cat_PowerCAT.Icon` code component with
`Text: ="Cancel"`, `IconName: ="Cancel"`, `Tooltip: =""` and `OnChange: =Select(Icon2)`, which is the
same discard as the ✕. There is no discard confirmation anywhere.

**Save** (`Button@0.0.45`) is `Text: ="Save"`, `Icon: ="Checkmark"`, `FontSize: =15`.

**Server-side.** 04-flow-inventory and 11-DATAVERSE-TABLES own the flow and plugin map. No flow or
plugin is triggered from this panel in the YAML. The only server behaviour that matters here is the
relationship cascade in §2.1. Deleting a contract cascades to its comments, and deleting a CAPEX cost
nulls `vsb_capexcost` on its comments (RemoveLink).

### 2.9 The red markers on the grid (contract name and month cells)

**Load and flatten** (refresh button, L1057–1190; this is Snippet 1 of the PCF file, made live):

- `colCapexCommentsInSelectedContracts = Filter('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' in colCapexContractsInSelectedCategory.'CAPEX Project Contract' || 'Capex Cost'.'CAPEX Cost' in colCapexCostsInSelectedContracts.'CAPEX Cost')` (L1058–1064).
  - It contains an `in` plus `||`, so the query is **not delegable**.
  - The whole `Capex Comments` table is subject to the row limit (the PCF file's own NOTES 3 says so).
- `colCapexCommentsLatest` (L1067–1190) has one record per **root** (`IsBlank('Parent Comment'…)`):
  - `ContractId` = `Coalesce(root.'Capex Contract', linked cost.Contract)`;
  - `CommentTypeText` = `Text('Comment Type')`;
  - `CostYear` = `IfError(Value(Text(locCost.Year)), -1)`;
  - `CostMonthIndex` = a 36-arm `Switch`: month labels, lower-cased English names and `"1"`…`"12"`;
  - `IsResolved` = `ParentC.Resolved = true`;
  - `LastActivityOn` = `Coalesce(latest reply.'Created On', root.'Created On')`;
  - `LatestText` = `Coalesce(latest reply.Comment, root.Comment)`.

**Columns on each grid row** (L1816–2140; this is Snippet 2, made live). Only contract rows get them:

- `HasComments` = `R.IsContract && CountRows(Filter(colCapexCommentsLatest, ContractId = R.vsb_capexaccountlistid && CommentTypeText = "General Comment" && !IsResolved)) > 0` (L1816–1822).
- `CommentTooltip` = the `LatestText` of the most recent such thread, by `LastActivityOn` descending, or `""` (L1823–1840).
- `M1HasComments`…`M12HasComments` and `M1CommentTooltip`…`M12CommentTooltip` use the same shape with
  `CommentTypeText = "Comments to payment date" && CostYear = Value(gblSelectedProjectYear) && CostMonthIndex = n && !IsResolved`
  (L1841–2140). A month marker therefore shows only in the grid's selected year.

**What the PCF does with them** (the clone and shipped bundle; the vendored copy is cited in §3):

| Data | What the PCF shows |
|---|---|
| `HasComments` | A red dot after the contract name, with a floating tooltip `Comment:` + newline + `CommentTooltip` |
| `MnHasComments` | A red dot in the top right of that month cell, with a CSS tooltip |
| A non-empty `MnCommentTooltip` | Implies the dot on its own |

The "…" button and its **Comments** menu item get their own red badge when **any** comment marker is
set (BUG 13888, `hasAnyComments`). 14-PCF-CONTROLS covers this.

The screenshot "Red on Contract Name…" shows the name dots, the tooltip `Comment:` / `Comment to This`,
and the "…" badges.

### 2.10 Every string, verbatim, with its AccessibleLabel

No control in L8156–10248 sets an `AccessibleLabel` (grep, §1). The "AccessibleLabel" column is therefore
"(none)" throughout, and rule 16 takes the caption or tooltip.

| Control | Property | Verbatim text | AccessibleLabel |
|---|---|---|---|
| `Label1` | Text / Tooltip | `"Comments : " & {contract Name}` (cut at 45 + `"..."`) / untruncated | (none) |
| `Icon2` | Tooltip | `Cancel` | (none) |
| `Label5` | Text / Tooltip | `{Category} / {Sub-account}` (cut at 50 + `"..."`) / untruncated | (none) |
| `Text2` | Text | `Sort by` | (none) |
| `modernDropdown1` | Items | `Date added [Oldest]`, `Date added [Newest]` | (none) |
| `CheckboxCanvas1` | Label | `Pin general comments to top` | (none) |
| `CheckboxCanvas1_1` | Label | `Show resolved comments` | (none) |
| `lbl_Read_Header` | Text | `Comment #{00} [{Full Name} - {dd.mm.yyyy}]` | (none) |
| `lbl_Read_Type_Title` / `lbl_Draft_Edit_Type_Title` | Text | `Type` | (none) |
| `lbl_Read_Type_Value` | Text | `General Comment` / `Comments to payment date : {Month} , {Year}` | (none) |
| `lbl_Read_Comment_Title`, `lbl_Read_Comment_Title_Reply`, `lbl_Draft_Edit_Comment_Title`, `lbl_Draft_Edit_Comment_Title_Reply` | Text | `Comment` | (none) |
| `img/btn_Read_Comment_Reply` | Tooltip | `Reply` | (none) |
| `img/btn_Read_Comment_Check` | Tooltip | `Mark as Resolved.` (trailing full stop) | (none) |
| `img/btn_Read_Comment_Edit`, `…_Edit_Reply` | Tooltip | `Edit` | (none) |
| `img/btn_Read_Comment_Delete`, `…_Delete_Reply`, `img/btn_Draft_Edit_Delete`, `…_Delete_Reply` | Tooltip | `Delete` | (none) |
| `txt_Read_Comment_Resolved_Tag` | Default | `Resolved` | (none) |
| `img/btn_Read_Comment_Reset` | Tooltip | `Reset` | (none) |
| `lbl_Read_Header_Reply` | Text | `Reply [{Full Name} - {dd.mm.yyyy}]` | (none) |
| `lbl_Draft_Edit_Header` | Text | `Comment #{00}` | (none) |
| `lbl_Draft_Edit_Header_Reply` | Text | `Reply to comment` | (none) |
| `drp_Draft_Edit_Type_Value` | Items | `General Comment`, `Comments to payment date` (choice labels) | (none) |
| `lbl_Draft_Edit_Year_Title` / `lbl_Draft_Edit_Month_Title` | Text | `Year` / `Month` | (none) |
| `drp_Draft_Edit_Month_Value` | ItemDisplayText | `Text(<Month choice>)`, e.g. `March` | (none) |
| `lbl_Draft_Edit_Comment_Length`, `…_Length_1` | Text | `{n} / 250` | (none) |
| `lbl_Draft_Edit_Comment_Warning` | Text | `Payment date comments cannot be added to automatically distributed costs.` | (none) |
| `btn_Add_Comment` | Text | `Add Comment` | (none) |
| `btn_Capex_Comment_Save` | Text | `Save` | (none) |
| `btn_Capex_Comment_Cancel` | Text / Tooltip | `Cancel` / `""` | (none) |
| Save `OnSelect` | `locSpinnerInformationText` | `Saving comments...` | n/a |
| Save `OnSelect` | Notify (Error) | `An error occurred while saving. Please try again.` | n/a |
| Save `OnSelect` | stored `Name` | `Comment - {SequenceNumber} - {User().FullName}` (a reply gives `Comment -  - {name}`) | n/a |
| PCF (clone/bundle) | menu items | `Comments` (row "…" menu and month dropdown) | n/a |
| PCF | tooltip prefix | `Comment:` + newline | n/a |
| PCF | month info | `Automatically distributed costs cannot be marked as paid or assigned payment date comments.` | n/a |

### 2.11 `Comments_PCF_CodeSnippets.txt`

The file is a **pre-implementation integration spec**. Its target is `btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect`.

- **Header (L6–19).** It assumes table and column names that turned out different in the build:

  | Snippet assumed | Live |
  |---|---|
  | `'CAPEX Comments'` | `'Capex Comments'` |
  | `Contract` | `'Capex Contract'` |
  | `Cost` | `'Capex Cost'` |
  | `'CAPEX Comment'` (primary key) | `'Capex Comments (vsb_capexcommentsid)'` |

  It also notes that `Resolved` may be a Choice. Live, it is a bit compared with `= true` in the flatten and with `'Resolved (Capex Comments)'.Yes` in the panel.
- **Snippet 1 (L26–114)** is `colCapexCommentsInSelectedContracts` plus `colCapexCommentsLatest`. It went live at L1057–1190 with the names corrected and the logic unchanged.
- **Snippet 2 (L124–196)** is the 26 columns `HasComments`, `CommentTooltip`, `M1..M12HasComments` and `M1..M12CommentTooltip`. They are live at L1816–2140.
- **NOTES (L201–215):**
  1. Dots show for unresolved threads only, and the tooltip is the latest activity (a reply wins over its parent).
  2. Month dots show for the selected year only.
  3. The `in` filter is non-delegable; the suggested fix is a Project lookup. It was not done in the canvas.
  4. Re-run the refresh after a save. This is live at L10216.
  5. The PCF parses these exact names, so no PCF change is needed.

---

## 3. Code app implementation

### 3.1 Files and responsibilities

**`features/cost/capex-costs/comments.ts`: pure rules.**

- `COMMENT_TYPE` (L11, `{general: 1, paymentDate: 2}`). This duplicates `dataverseNames.capexCommentType` (`data/dataverseNames.ts:562`, CONVENTIONS rule 17).
- `COMMENT_MAX_LENGTH = 250` (L13).
- The types `CapexComment` and `CommentThread`.
- `paymentDateComplete` (L94), `commentTypeLabel` (L106), `commentTypeValue` (L131).
- `commentPanelTitle` (L152, 45 characters including the prefix) and `commentBreadcrumb` (L164, 50 characters).
- `commentYearOptions` (L177, descending) and `commentMonthOptions` (L193).
- `commentDateLabel` (L210, `dd.MM.yyyy` from local parts) and `commentHeading` (L219).
- `truncateComment` (L232).
- `threadLatestActivity` (L250), `commentThreads` (L268) and `renumberThreads` (L291, by `createdOn`).
- `gridCommentIndicators` (L339) and `gridCommentFlags` (L382).
- `resolveThread` (L394) and `reopenThread` (L406), both scoped to the root and its own replies.
- `planDeleteRoot` (L414). It is not used by the panel.
- `sortComments` (L447), `PAYMENT_DATE_NOT_ALLOWED` (L464) and `paymentDateCommentsAllowed` (L477).
- `canSaveComments` (L501), `commentEditable` (L529, which checks the resolved state only), `commentName` (L553) and `commentCosts` (L568).

**`data/comments.ts`: Dataverse access.**

- `loadComments` (L64–96). One `$select`-ed request per chunk of contract ids:
  `filter: and(lookupIn("vsb_capexcontract", ids), ACTIVE)`. The author comes from the
  `_createdby_value` FormattedValue (`authorName`, L25–31).
- `saveComment` (L155–216):
  - it writes `vsb_name`, `vsb_comment`, `vsb_commenttype`, `vsb_resolved` and `vsb_CapexContract@odata.bind`;
  - `vsb_CapexCost`, `vsb_ParentComment`, `vsb_RootComment` and `vsb_ResolvedBy` (to `aadusers`) are bound only when they have a value;
  - an update sends `null` binds to clear lookups, and a create omits them;
  - `owningbusinessunit@odata.bind` is written **on create only** (L209–211).
- `deleteComment` (L218–220): `await Vsb_capexcommentsesService.delete(id)`. This is the **raw generated delete**, not `deleteRecord` from `data/client.ts`.

**`features/cost/costing/useCostBook.ts`: hooks.**

- `useCapexComments(contractIds)` (L581–588): the key is `["capex-comments", sortedIds]` and the default `staleTime` is 30 s (`app/Providers.tsx:21`).
- `useCommentWrites()` (L590–614):
  - `save` injects `project?.owningBusinessUnitId`;
  - `remove` calls `deleteComment`;
  - `invalidate` refreshes the `["capex-comments"]` prefix and `["cost-book", projectId]`;
  - none of the mutations has an `onError`.

**`features/cost/capex-costs/CommentsPanel.tsx`: the panel.**

- It renders `FormPanel width="comments"` with `PanelButtons`, the `ReadCard` (L651) and the `DraftCard` (L735).
- Local state: `working`, `deletedIds`, `editingIds`, `touchedIds`, `yearById`, `pinGeneral`, `showResolved`, `order` and `saving` (L225–258).
- `commit` (L450–519) writes the changes.

**`features/cost/capex-costs/Screen.tsx`: wiring.**

- `commentFor` state (L246).
- `onAction`: `if (action === "Comment") setCommentFor(id)` (L433).
- The category-wide comment query and `commentFlags` (L294–299).
- `<CommentsPanel …/>` is **always mounted** (L953–961). Its props are `open={!!commentFor}`, `contractDescription` = `line.description`, the breadcrumb `${categoryNames[category]} / ${subaccount name}`, `payments` = `line.payments` and `distribution` (defaulting to `"equal"`).

**`features/cost/capex-costs/gridRows.ts`** (L197–223) emits `HasComments`, `CommentTooltip`, `M{n}HasComments` and `M{n}CommentTooltip` from `commentFlags`.

**The vendored renderer:**

- In `pcf/ui/GridRenderer.js`:
  - `hasAnyComments` (L734–736);
  - the name dot (L771–773);
  - month dots (`appendContractMonthCell` L942–984, `setMonthCellContent` L990–998);
  - `createCommentDot` (L1008–1033, `aria-label` = the tooltip text);
  - `formatCommentTooltip` (L1071–1077, the `Comment:\n` prefix);
  - the month dropdown "Comments" item, which fires `"Comment"` (L1299–1309);
  - the equal-distribution info-only dropdown (L1268–1279).
- In `pcf/ui/ActionDropdown.js`: the "Comments" menu item (L84–98) and the badge toggle (L156–163).

### 3.2 Canvas item → code mapping

| Canvas item | Code app | Tests |
|---|---|---|
| `CommentTriggered` → open (L7457–7650) | `onAction("Comment", id)` → `setCommentFor` (`Screen.tsx:433`). Both PCF entry points fire `"Comment"` (`ActionDropdown.js:95-97`, `GridRenderer.js:1305-1309`). The panel loads with `useCapexComments([contractId])` (`CommentsPanel.tsx:222`) and seeds its working copy once per opening (L266–276) | UT-CMT-051 |
| `Refresh('Capex Comments')` on every open (L7459) | React Query cache with a 30 s `staleTime`; the panel seeds from cached data when it is fresh | none |
| Pin and Show-resolved reset on open (L7634–7635) | `useState(true)` / `useState(false)` (L247–248), but the component is never unmounted, so the values **persist across openings** | none |
| Title, 45-character cut (L8215–8225) | `commentPanelTitle` (`comments.ts:152`) passed as the `FormPanel` title. No tooltip | UT-CMT-065, UT-CMT-051 |
| Breadcrumb, 50-character cut (L8289–8298) | `commentBreadcrumb` (`comments.ts:164`), with `title={breadcrumb}` (`CommentsPanel.tsx:528-530`) | UT-CMT-066 |
| Sort / Pin / Show resolved (L8346–8388) | Fluent `Dropdown` (`data-testid="modernDropdown1"`, `aria-label="Sort by"`) and two `Checkbox`es (`CheckboxCanvas1`, `CheckboxCanvas1_1`) at `CommentsPanel.tsx:532-554` | UT-CMT-051 |
| The triple sort (L8425–8458) | `sortComments` (`comments.ts:447-457`). The Add row is rendered after the threads (`CommentsPanel.tsx:619-623`) | UT-CMT-016..019, UT-CMT-059, UT-CMT-060 |
| Sequence numbers (L7577–7606, L8982–8991, L9465–9491) | `commentThreads` → `renumberThreads` by `createdOn` (`comments.ts:268-295`) | UT-CMT-007, UT-CMT-014, UT-CMT-037 |
| Replies: one level, ascending, indented (L8504–8579) | `commentThreads` groups replies by `parentId` in ascending order; `styles.reply` sets `marginLeft: 28px` (`CommentsPanel.tsx:86`). Replies render under both read and edit cards (L582–598) | UT-CMT-003, UT-CMT-055 |
| Root read card (L9588–9673) | `ReadCard` (`CommentsPanel.tsx:651-705`) and `commentHeading` / `commentTypeValue` | UT-CMT-047..050, UT-CMT-052, UT-CMT-061..064, UT-CMT-073 |
| Reply / Resolve / Edit / Delete visible while unresolved (L9753, L9810, L9865, L9927) | `commentEditable` = `!resolved` (`comments.ts:529`). Reply and Resolve appear on roots only (`CommentsPanel.tsx:667-676`) | UT-CMT-026, UT-CMT-052 |
| Author gates on Edit / Delete (L9761, L9818), reply gates (L8710, L8783), Reset gate (L10023) | **Not implemented.** Recorded in a code comment only (`comments.ts:520-528`) | none |
| Resolved pill and Reset (L9943, L9969) | `CommentsPanel.tsx:684-697`, roots only | UT-CMT-077 |
| Resolve / Reset scope (L9849–9862, L10001–10012) | `resolveThread` / `reopenThread` (`comments.ts:394-411`); resolving also closes editors (`CommentsPanel.tsx:388-399`) | UT-CMT-011..013, UT-CMT-076 |
| Resolver = `LookUp('Microsoft Entra IDs', Id = User().EntraObjectId)` (L9843–9846) | `session.entraObjectId`, bound as `/aadusers(id)` (`data/comments.ts:182-183`) | UT-CMT-084, UT-CMT-085 |
| Add (L8978–9047) | `addComment` (`CommentsPanel.tsx:321-331`) creates a General draft with a temporary id `draft-…` | UT-CMT-054 |
| Reply (L9889–9925) | `addReply` (`CommentsPanel.tsx:333-343`) inherits the type and cost. No Dataverse LookUp | UT-CMT-055, UT-CMT-078 |
| Edit card (L9070–9572) | `DraftCard` (`CommentsPanel.tsx:735-833`): the header, Type (250 px), Year/Month (100 px), the counter, a `Textarea` with `maxLength={250}`, Delete | UT-CMT-054, UT-CMT-067..069, UT-CMT-074 |
| Equal distribution: Type frozen plus the warning (L9121–9126, L9531–9572) | `equalDistribution` → `disabled` Dropdown and a `role="note"` strip with `PAYMENT_DATE_NOT_ALLOWED` (`CommentsPanel.tsx:766-790`) | UT-CMT-020, UT-CMT-021, UT-CMT-075 |
| Type `OnChange` blanks `SelectedYear`/`SelectedMonth` and keeps `RelatedCost` (L9130–9153) | `changeType` sets `costId: null` (`CommentsPanel.tsx:415-418`) | UT-CMT-074 |
| Year `OnChange` (L9249–9259) | `changeYear` sets `costId: null` (`CommentsPanel.tsx:421-424`) | none |
| Month `OnChange` LookUps the CAPEX Cost (L9333–9422) | The option value **is** the cost id (`CommentsPanel.tsx:804-816`), from `book.lines[].payments` (all years, `data/costBook.ts:1130-1160`) | UT-CMT-068 |
| Delete with staging and cascade (L9439–9491, L9699–9751, L8762–8773, L8845–8858) | `deleteWorking` (`CommentsPanel.tsx:358-370`) stages the replies first, then the root; temporary ids are not staged | UT-CMT-014 (pure) |
| Save `DisplayMode` (L10095–10131) | `canSaveComments` (`comments.ts:501-509`) plus the `drafts` derivation (`CommentsPanel.tsx:429-447`), with an extra `missingPaymentDate` rule | UT-CMT-022..025, UT-CMT-045, UT-CMT-053, UT-CMT-056, UT-CMT-070, UT-CMT-071 |
| Save `OnSelect` (L10136–10222) | `commit` (`CommentsPanel.tsx:450-519`): `setSaving(true)` then `onDismiss()` (the panel closes **before** the writes), then the deletes, the changed roots (sequence number `i + 1` by `createdOn`) and the changed replies; `invalidate()` on success only; `finally` turns the overlay off. **No `catch`, and no Notify** | UT-CMT-058, UT-CMT-078 |
| The Patch payload (L10177–10204) | `saveComment` (`data/comments.ts:155-216`) | UT-CMT-027, UT-CMT-072, UT-CMT-079..UT-CMT-083, UT-CMT-086 |
| `'Owning Business Unit'` on every Patch (L10203) | `owningbusinessunit@odata.bind` on **create only** (`data/comments.ts:209-211`), with the value from `useCommentWrites` (`useCostBook.ts:609-610`) | UT-CMT-079 |
| "Saving comments..." spinner (L10140) | `<LoadingOverlay label="Saving comments..." />` rendered outside the drawer (`CommentsPanel.tsx:631`) | UT-CMT-058 |
| Refresh after save (L10216) | `writes.invalidate()` (`useCostBook.ts:603-607`) | none at the panel level |
| Cancel / ✕ (L8237–8240, L10244) | `PanelButtons onCancel={onDismiss}` (`cancelTestId="btn_Capex_Comment_Cancel"`). The FormPanel ✕ has `aria-label="Close panel"`, `data-testid="panel-close"` (`FormPanel.tsx:119-121`); Escape and a backdrop click also dismiss (`FormPanel.tsx:114`) | UT-CMT-053 |
| Grid markers (L1057–1190, L1816–2140) | `gridCommentIndicators` (`comments.ts:339-374`) plus `commentCosts`, fed by a category-wide `useCapexComments(contractIds)` (`Screen.tsx:294-299`), emitted by `gridRows.ts:212-223`, rendered by the vendored `GridRenderer.js` | UT-CMT-008..010, UT-CMT-031..036, UT-CMT-041, UT-CMT-044, UT-GRID-008b, UT-GRID-008c, UT-GRID-008e |

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-CMT-01 | Panel chrome and ordering | Title cut at 45 (L8215), breadcrumb cut at 50 (L8289), Sort / Pin / Show-resolved (L8346–8388), the triple sort (L8425–8458), creation-order numbering (L7582–7606), Add row last (L8452–8457) | `commentPanelTitle`, `commentBreadcrumb`, `sortComments`, `renumberThreads` (`comments.ts:152-166, 291-295, 447-457`); Add row after the threads (`CommentsPanel.tsx:619-623`) | UI/Functional | Covered | Low | UT-CMT-016..019, 051, 059, 060, 065, 066 |
| GAP-CMT-02 | Read cards | Heading `Comment #NN [Full Name - dd.mm.yyyy]` (L9603), `Reply […]` (L8627), the Type value (L9632–9640), resolved pill and Reset (L9943, L9969), all four actions hidden when resolved | `commentHeading`, `commentTypeValue`, `ReadCard` (`CommentsPanel.tsx:651-705`) | UI | Covered | Low | UT-CMT-047..050, 052, 055, 061..064, 073, 077 |
| GAP-CMT-03 | Edit cards | Header, Type/Year/Month visibility (L9209, L9260, L9277, L9423), years descending (L9240), months Jan..Dec with a cost row (L9307), 250 counter and MaxLength (L9181, L9527), equal-distribution warning and frozen Type (L9121, L9531), delete cascades to replies and renumbers (L9439–9491) | `DraftCard`, `commentYearOptions`, `commentMonthOptions`, `truncateComment`, `deleteWorking` | UI/Functional | Covered | Low | UT-CMT-001, 002, 014, 020, 021, 054, 067..069, 075 |
| GAP-CMT-04 | Save payload and gate | Nine-field Patch (L10177–10204); Parent = Root = the same row; a reply's Name has a blank number; resolver via Entra; Save gate: blank invalid, dirty / deleted / modified enables (L10095–10131) | `saveComment`, `commentName`, `canSaveComments` | Data/Functional | Covered | Low | UT-CMT-022..025, 027, 070..072, 078..086 |
| GAP-CMT-05 | Grid red markers | Name dot for an unresolved general thread; month dots in the selected year; the tooltip is the latest activity; contract reached through the cost by `Coalesce` (L1057–2140). The canvas load is non-delegable (L1062) | `gridCommentIndicators`, `gridRows.ts:212-223`, `GridRenderer.js:771-773, 942-998`. Server-side `lookupIn` with chunking, so no delegation cap (an improvement) | Functional/Data | Covered | Low | UT-CMT-008..010, 031..036, 041, 044; UT-GRID-008b/c/e |
| GAP-CMT-06 | Opening and resolve scope | `CommentTriggered` from the "…" menu and the month dropdown (index.ts:236); resolve and reset scoped to the root and its replies (L9851–9854, L10003–10006) | `Screen.tsx:433`; `resolveThread` / `reopenThread` (`comments.ts:394-411`) | Functional | Covered | Low | UT-CMT-011..013, 076. BUGS-FOUND N-5 is obsolete (see §6) |
| GAP-CMT-07 | Edit/delete rights | Edit and Delete enabled only for the author (`'Created By'.'Primary Email' = User().Email`, L9761–9766, L9818–9823). Reply Edit/Delete also require the parent to be unresolved (L8710–8721, L8783–8794). Reset needs the author or the resolver (L10023–10032). Icons go grey for others | No gate: anyone can edit, delete or reopen any comment (`commentEditable` checks the resolved state only, `comments.ts:529-530`; no `disabled` on the action buttons, `CommentsPanel.tsx:665-697`) | Functional | Missing | High | Explained only in a code comment (`comments.ts:520-528`); no D-entry. The comment says this is infeasible, but `_createdby_value` is already loaded and `currentUser.ts:151` selects `systemuserid` and `internalemailaddress` (inferred: feasible) |
| GAP-CMT-08 | Save failure | `IfError` → Notify "An error occurred while saving. Please try again."; the panel stays open with the edits intact (L10144–10215); the refresh runs anyway (L10216) | The panel is closed **before** the writes (`CommentsPanel.tsx:459-460`); `try/finally` with no `catch` (L461–518); `void commit()` (L525), so a failure is an unhandled rejection; no message; the edits are lost; no invalidate on failure | Functional/UX | Missing | High | Violates the spirit of CONVENTIONS rule 3. The multi-request save can also half-apply (KNOWN-RISKS, "no changeset") |
| GAP-CMT-09 | Delete error surfacing | `RemoveIf` inside `IfError`, so a refusal reaches the Notify (L10146–10156) | `deleteComment` awaits the raw `Vsb_capexcommentsesService.delete(id)` (`data/comments.ts:218-220`), whose result is discarded, so a 403 or a restriction looks like success | Data | Divergent-unmarked | High | CONVENTIONS rule 14: use `deleteRecord` from `data/client.ts` |
| GAP-CMT-10 | Saving sequence | Spinner shown over the **open** panel; the panel closes only after success (L10138–10143, L10208); the Saving screenshot confirms it | Closes first, then shows the overlay (`CommentsPanel.tsx:452-460`) | UX | Divergent-unmarked | Med | The code comment and the UT-CMT-058 comment cite the screenshot as "Panel Closes and Spinner is shown", but the comments Saving screenshot shows the opposite. No D-entry |
| GAP-CMT-11 | Load error state | n/a in the canvas: the synchronous `Filter` in `OnChange` (L7470) | The panel renders no `query.error`: a failed read shows an empty list with only "Add Comment" (`CommentsPanel.tsx:556-601`). The grid's category query (`Screen.tsx:295-299`) fails silently into "no dots" | Data/UX | Missing | Med | CONVENTIONS rule 19 |
| GAP-CMT-12 | Payment-date completeness | No check: a payment-date comment saves with a blank `RelatedCost` (L10095–10131, L10193–10197) | `missingPaymentDate` blocks Save and shows "Required" under Year (`CommentsPanel.tsx:441, 794-796`, `comments.ts:94-97, 505-506`) | Functional | Code-app-only | Med | "Required" has no canvas source (rule 7). It is a deliberate fix of a canvas gap (live row `e2ec8083`), but has no `DIVERGENCE:` marker and no D-entry (rule 8) |
| GAP-CMT-13 | Rows written per save | Patches **every** non-placeholder row on every save (L10158–10207) | Writes changed rows only (`CommentsPanel.tsx:482-485, 498-501`) | Perf/Data | Divergent-marked | Low | Comment-only marker "DELIBERATE DIVERGENCE" (`data/comments.ts:142-146`); no D-entry |
| GAP-CMT-14 | N-4 name rewrite | After a delete, the next save rewrites the `Name` of renumbered survivors, because every row is patched (L10178) | Survivors that did not otherwise change are skipped, so their stored `Name` keeps its old number | Data | Divergent-unmarked | Low | Contradicts BUGS-FOUND N-4 and the code comments that say "reproduced" (§6). UT-CMT-037 pins only the pure naming, not `commit` |
| GAP-CMT-15 | OBU on update | `'Owning Business Unit'` re-stamped to the project BU on **every** Patch, updates included (L10203) | Create only (`data/comments.ts:209-211`) | Data | Divergent-unmarked | Low | The code comment at `data/comments.ts:147` wrongly says the canvas writes no OBU |
| GAP-CMT-16 | Type/Year change and the cost link | Type `OnChange` and Year `OnChange` blank only `SelectedYear`/`SelectedMonth`; `RelatedCost` stays, so switching back or changing the year without a month saves the **old** cost (L9142–9151, L9254–9256, L10193–10197) | Both clear `costId` (`CommentsPanel.tsx:415-424`), and Save stays blocked until a month is picked | Functional | Divergent-unmarked | Low | The code comment "BLANKS the date, as the canvas does" is only half right. Effectively a silent fix of a canvas defect |
| GAP-CMT-17 | Filter state on reopen | Pin reset to `true` and Show-resolved to `false` on every open (L7634–7635) | Panel always mounted (`Screen.tsx:953`), so `pinGeneral`, `showResolved` and `order` keep their last values (`CommentsPanel.tsx:247-249`) | UX | Divergent-unmarked | Low | The canvas sort dropdown is not reset either (inferred) |
| GAP-CMT-18 | Save enablement edge cases | Clicking Edit sets `IsModified: true`, which enables Save with no change (L9800–9808); Resolve then Reset leaves `IsModified` set (L10009) | Save stays disabled until something really changes (`CommentsPanel.tsx:429-446`) | UX | Divergent-unmarked | Low | |
| GAP-CMT-19 | Close control and dismissal | ✕ is `Icon2`, `Tooltip: ="Cancel"` (L8226–8242); the scrim has no `OnSelect`, so clicking outside does nothing | ✕ is `aria-label="Close panel"`, `data-testid="panel-close"` (`FormPanel.tsx:119-121`); Escape and a backdrop click dismiss and discard edits (`FormPanel.tsx:114`) | UX | Divergent-unmarked | Low | Rule 16 expects `data-testid="Icon2"` and the label "Cancel" (`closeTestId`/`closeLabel` exist) |
| GAP-CMT-20 | Action tooltips | Tooltips `Reply`, `Mark as Resolved.`, `Edit`, `Delete`, `Reset` (L9926, L9864, L9809, L9752, L10014) | `aria-label` only, no `title`, so no hover tooltip; Resolve is labelled `Mark as Resolved` without the full stop (`CommentsPanel.tsx:675`) | UX | Missing | Low | Rule 7 (verbatim) |
| GAP-CMT-21 | Header tooltip | `Label1.Tooltip` holds the untruncated title (L8224) | `FormPanel` title has no tooltip | UX | Missing | Low | |
| GAP-CMT-22 | Icon glyphs | Reply is a speech bubble with lines (L9887), Resolve a plain check (L9838), Reset a circular arrow (L9979); grey variants for disabled | `ArrowReplyRegular`, `CheckmarkCircleRegular`, `ArrowUndoRegular` (`CommentsPanel.tsx:26-27`); no disabled look | UI | Divergent-unmarked | Low | 03-THEMES / 02-UI for styling |
| GAP-CMT-23 | Blank comment type | `IsGeneralComment = ('Comment Type' = General)`: a blank type is treated as payment-date (L7520–7528), with no name dot (`CommentTypeText` `""`) | `numberOf(...) ?? COMMENT_TYPE.general` (`data/comments.ts:90`): a blank type becomes General and produces a name dot | Data | Divergent-unmarked | Low | Only matters for rows written outside both apps |
| GAP-CMT-24 | Inactive rows | No `statecode` condition (L7470, L1061) | `ACTIVE` filter (`data/comments.ts:78`) | Data | Divergent-unmarked | Low | |
| GAP-CMT-25 | Cost-only comments | Grid load also takes comments linked only by `'Capex Cost'` (L1062) | Contract clause only (`data/comments.ts:41-63`) | Data | Divergent-marked | Low | "DELIBERATE NARROWING" comment, measured 0 such rows; no D-entry |
| GAP-CMT-26 | Freshness on open | `Refresh('Capex Comments')` before every open (L7459) | Cached query with a 30 s `staleTime` (`Providers.tsx:21`); seeded once per opening, possibly from the cache (`CommentsPanel.tsx:266-276`) | Data/Perf | Divergent-unmarked | Low | Matters for two users editing at once (R-12) |
| GAP-CMT-27 | Month options | `Distinct(... vsb_month)`: one entry per month; the cost is resolved by `LookUp` (the first match) (L9307–9332, L9375–9382) | One option per cost **row** for the year (`comments.ts:193-201`), so duplicate cost rows give duplicate months | UI/Data | Divergent-unmarked | Low | (inferred) edge case |
| GAP-CMT-28 | Root detection | `IsRoot = Or(IsBlank('Parent Comment'), IsBlank('Root Comment'))` (L7497–7504) | `parentId === null` (`comments.ts:269`) | Data | Divergent-unmarked | Low | Differs only for a row with a parent but no root |
| GAP-CMT-29 | Payment-date option availability | The Type dropdown always offers both choices (except under equal distribution) (L9129) | "Comments to payment date" is disabled when the contract has no saved cost rows (`CommentsPanel.tsx:316, 787`) | Functional | Code-app-only | Low | UT-CMT-057; no D-entry |
| GAP-CMT-30 | Loading indicator | None in the panel | `LoadingOverlay mode="inline" label="Loading comments..."` (`CommentsPanel.tsx:556`) | UX | Code-app-only | Low | A string with no canvas source |
| GAP-CMT-31 | Delete order | Staged in collection order (L9443–9449) | Replies first, then the root (`CommentsPanel.tsx:358-364`) | Data | Code-app-only | Low | Harmless: `vsb_ParentComment` / `vsb_RootComment` are RemoveLink, so the "400" rationale in the code comment does not apply |

**Counts by Status:** Covered 6, Missing 5, Divergent-unmarked 14, Divergent-marked 2, Code-app-only 4, Partial 0 (31 rows).

**Counts by Severity** (non-Covered rows only):

| Severity | Count | Rows |
|---|---|---|
| High | 3 | 07, 08, 09 |
| Med | 3 | 10, 11, 12 |
| Low | 19 | the rest |

The six Covered rows are rated Low.

---

## 5. Open questions / not verifiable from source

1. **Overlaid disabled buttons.** In the canvas, does a `DisplayMode.Disabled` `ModernButton` over an
   `Image` stop the click from reaching the image's ungated `OnSelect`? Examples are
   `btn_Read_Comment_Delete` over `img_Read_Comment_Delete` (L9757 / L9699). If it does not,
   non-authors can delete or edit in the canvas too, and GAP-CMT-07 shrinks to a visual-only gap.
   This needs a live canvas run.
2. **Server-side permissions.** Do the Dataverse security roles stop a non-author from updating or
   deleting another user's `vsb_capexcomments` row? If they do, GAP-CMT-07 becomes a "server refuses"
   case under D1. That needs a working error message, which GAP-CMT-08 and GAP-CMT-09 currently
   prevent.
3. **Author matching.** `User().Email` is compared with `'Created By'.'Primary Email'`. For guest or
   external users the UPN and the primary email can differ (the live name
   `Singh Rajput, Shakti (external)` hints at a guest account). Does the canvas author gate work for them?
4. **The Month `Items` formula.** `Int(ThisRecord.rec)` is applied to a month choice value
   (L9322–9325). The screenshot shows `March` being offered, so it works, but the exact semantics need
   a live check.
5. **Re-stamping OBU on update.** Patching `'Owning Business Unit'` on an existing row: does it re-home
   the row's BU or is it ignored? This decides whether GAP-CMT-15 has any effect.
6. **Retry after a partial failure** (inferred). When some Patches succeeded before the failure, the
   ids are not written back, so a retry in the canvas re-creates them. Confirm on a live run before
   treating it as a canvas defect.
7. **Spinner text edge case.** "Please wait, loading data..." replaces "Saving comments..." when
   `colFinatCostDataOptimized` is empty (L18211–18215). This is not reproduced and probably unreachable
   while the panel is open (inferred).
8. **Origin of the cost-less payment-date row** `e2ec8083…` that the code comments cite. It can come
   from the panel (GAP-CMT-12), or from a CAPEX Cost delete: `vsb_capexcomments_CapexCost_vsb_capexcost`
   is RemoveLink, so deleting a cost leaves the comment with a null cost. The second path is not closed
   by the panel validation (inferred).
9. **Sort dropdown persistence** in the canvas across openings (inferred: it persists, because
   `Default` is constant).

---

## 6. Doc disagreements

1. **BUGS-FOUND N-5 is obsolete against the ground truth.** It quotes
   `Not(IsBlank(_CurrentId) And ParentCommentID = …)` from `CapexScreenCode.txt:9687/9839`. The
   pa.yaml (1.21.709) has `(Not(IsBlank(_CurrentId)) And ParentCommentID = GUID(_CurrentId))` at
   L9853 and L10005. The canvas now resolves only the root and its replies, which is what the code app
   does. N-5's "deliberate divergence, not reproduced" is therefore parity.
2. **BUGS-FOUND N-4 and the code comments overstate the reproduction.** They say "reproduced
   deliberately" and "the next save rewrites their stored `Name`" (`data/comments.ts:151-153`,
   `CommentsPanel.tsx:466-471`, `comments.ts:289`). But `commit` skips unchanged rows
   (`CommentsPanel.tsx:482-485`), so untouched survivors are never rewritten. UT-CMT-037 tests only
   `renumberThreads` + `commentName`. See GAP-CMT-14.
3. **`data/comments.ts:147`** says "the canvas has no create/update split and no `owningbusinessunit`".
   The canvas writes `'Owning Business Unit': gblSelectedProject.'Besitzer (Unternehmenseinheit)'`
   on every Patch (L10203).
4. **`comments.ts:206-207`** says the canvas renders the date with `Text(…, "[$-en-US]dd.MM.yyyy")`.
   The source is `Text(ThisItem.'Created On',"dd.mm.yyyy")` with no locale tag (L8627, L9603; also
   `CapexScreenCode.txt:8484, 9437`). The rendered output is the same.
5. **`CommentsPanel.tsx:452-458` and the UT-CMT-058 comment** cite the client screenshot as "Panel
   Closes and Spinner is shown". The comments-panel screenshot
   `Cost App - Comment Panel contract Row - Saving.png` shows the panel **still open** behind the
   spinner. That matches L10140 (spinner) and L10208 (close only on success). The quoted wording comes
   from the Add/Edit Cost panel's save, not this one.
6. **`CommentsPanel.tsx:405-414`** says "Switching type BLANKS the date, as the canvas does". The canvas
   blanks `SelectedYear`/`SelectedMonth` but keeps `RelatedCost` (L9142-9151), and the Year change
   does the same (L9254-9256).
7. **`comments.ts:520-528`** says author gating is infeasible because "`Session` carries no systemuser
   id, so there is nothing to compare against". `loadComments` already selects `_createdby_value`, and
   `data/currentUser.ts:151` selects `systemuserid` and `internalemailaddress` (it returns `mail` at
   L185). The data exists; it is just not plumbed through (inferred).
8. **`CommentsPanel.tsx:353-356`** justifies "replies first" by saying a root deleted first "is a 400
   under a restricted relationship". `customizations.xml` defines
   `vsb_capexcomments_ParentComment_vsb_capexcomments` and `…_RootComment_…` as **RemoveLink**, so
   neither order fails.
9. **The code cites `CapexScreenCode.txt` line numbers throughout** (e.g. `:8014`, `:10012`, `:9885`).
   That file is an older flattened dump. It differs from the pa.yaml at least in the N-5 resolve
   formula (item 1), so its line numbers do not map onto the ground-truth file. This document cites
   the pa.yaml.
10. **The PCF clone's docs are stale on the canvas wiring.** `CANVAS_APP_GUIDE.md:106, 285` and
    `README.md:304, 402` say `CommentTriggered` is unhandled and the comments panel "still to be
    built". The pa.yaml handles it at L7457–7650.
11. **`Comments_PCF_CodeSnippets.txt:6-14`** assumes the names `'CAPEX Comments'`, `Contract`, `Cost`
    and `'CAPEX Comment'`. The live names are `'Capex Comments'`, `'Capex Contract'`, `'Capex Cost'`
    and `'Capex Comments (vsb_capexcommentsid)'` (L1061–1092). The logic is otherwise identical.
12. **`gap-analysis/cost-capex-costs.md` D6** says the code loads comments "for the category's
    contracts and costs". The code drops the costs clause (`data/comments.ts:41-63`, GAP-CMT-25).
    **B13** marks the whole panel COVERED. This file finds three High and three Med gaps.
13. **`02-OPEN-DECISIONS.md:323` (rule-16 table, row g)** says "The CAPEX panel Save/Cancel names were
    inferred from position". For the comments panel, `btn_Capex_Comment_Save` (L10092) and
    `btn_Capex_Comment_Cancel` (L10224) are the real canvas names and the code uses them
    (`CommentsPanel.tsx:527`). If row g means the Add/Edit panel, it should say so.
14. **`11-CAPEX-PARITY-CHANGE-RECORD-2026-10-23.md:340`** records the comments panel as "not
    re-examined beyond confirming canvas test ids". The gaps above were not reviewed in that pass.
