# Gap analysis — Admin CAPEX Accounts

- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin CAPEX Accounts.pa.yaml` (2 463 lines; Y:n = YAML line)
- Globals: `Src/App.pa.yaml` OnStart `colCapexAccounts` (A:1548), `colCapexProjectContracts` (A:1563), `colCapexAccountCategories` (A:1567), `LeftAdminNavigationMenu` (A:311)
- Components: `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Confirmation` (x4), PCFs `cat_PowerCAT.CommandBar` (x2), `cat_PowerCAT.FluentDetailsList`, `cat_PowerCAT.Icon` (Save/Cancel x6), `pdd_CustomControl.PowerDragDrop` (x2)
- Code: `ProjectCosts-CodeApp/src/features/admin/admin-capex-accounts/` — `Screen.tsx` (S:n), `rules.ts` (R:n), `hooks.ts` (H:n)
- State: UI built, not connected (D14). `hooks.ts` returns `notConnected()`; every write closes the panel / dialog and writes nothing.

**No control on this screen sets `AccessibleLabel`** (grep: 0 hits). aria-labels therefore fall back to the visible caption (SKILL §1) — which the code does.

Status legend: COVERED / PARTIAL / MISSING / WRONG (differs from canvas — both quoted).

---

## 1. Data

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| D1 | Table `CAPEX Account Lists` = `vsb_capexaccountlist` / ES `vsb_capexaccountlists`; columns used: `vsb_name`, `vsb_number`, `vsb_order` (decimal), `vsb_parentaccount` (lookup, self), `statecode` (0 Active / 1 Inactive) | attributes.json `vsb_CAPEXAccountList` | `CAPEX_ACCOUNT_COL` R:52-60, `CHOICE_ADMIN.capexAccountStatus` dataverseNames.ts:440 | COVERED |
| D2 | `colCapexAccounts` = `AddColumns(Sort(Filter('CAPEX Account Lists', Not(IsBlank('Parent Account'))), Order, Asc), IsFolded, true)` — every row with a parent (roots excluded) | A:1548-1561 | H:11-15 documents "no filter — the whole chart of accounts, $orderby=vsb_order"; `useCapexTree` H:62 returns `notConnected` | PARTIAL — not connected; checklist query has no `_vsb_parentaccount_value ne null` filter (needed by `listCategories` to find root "00001", so whole table is OK, but note the difference) |
| D3 | Categories = `SortByColumns(Filter('CAPEX Account Lists', Not(IsBlank('Parent Account')), 'Parent Account'.Number = "00001"), "vsb_order", Asc)` | A:1567-1579 | `listCategories` R:255-265 (children of number `CAPEX_ROOT_NUMBER`="00001", sort order) | COVERED |
| D4 | Tab list `Items: =colCapexAccountCategories`, display `vsb_name` | Y:161, Y:180 | S:224-233 | COVERED |
| D5 | Account gallery `Sort(Filter(colCapexAccounts, 'Parent Account' = locSelectedCapexAccountCategory), Order, Asc)` | `gal_Account_Accounts.Items` Y:392-399 | `childrenOf(category.id)` S:131-133 | COVERED |
| D6 | Subaccount grid `AddColumns(Sort(Filter(colCapexAccounts, 'Parent Account' = ThisItem), Order, Asc), EditIcon, ChangeStatusIcon, DeleteIcon, RecordKey)` | `pcf_Account_AccountCardBody_SubAccounts.Items` Y:529-590 | `childrenOf(account.id)` S:243, `subaccountRowIcons` R:402-416 | COVERED |
| D7 | Grid columns `vsb_number` "Number" (80), `vsb_name` "Subaccount", `statecode` "Status" (80), three clickable-image columns; `HeaderVisible: =false` | `columns_Items` Y:637-686, Y:525 | S:291-300 (sr-only header), S:306-308 | COVERED |
| D8 | `CAPEX Project Contracts` (`vsb_capexprojectcontract`, `_vsb_account_value`) — read for delete gating; canvas mixes live table (Y:276) and stale `colCapexProjectContracts` (Y:576) | Y:276, Y:576, A:1563 | `useCapexContracts` H:66-69, `CapexContractRef` R:104 | PARTIAL — not connected |
| D9 | Uniqueness check `LookUp('CAPEX Account Lists', Number = Trim(<input>))` against the **server** table (all rows incl. roots/categories) at Save time | `pcf_…NewEditAccount_BodyButtons_Save.OnChange` Y:1436; subaccount `Number = locSelectedAccount.Number & "_" & Trim(<input>)` Y:1980 | `validateAccountForm` R:495-511 checks `existingNumbers` from the cached tree (live, before Save) | PARTIAL — documented SOURCE DEFECT fix (R:459-469); in the not-connected tree the list is empty, and once connected it is only as fresh as the query. Hook must re-check server-side before create (R:467 promises `existsByNumber` in hooks.ts — **does not exist**) |
| D10 | **Create account** payload, in order: `Patch(Defaults, {'Parent Account': <category>, Number: Trim(input), Name: input, Order: Max(Max(Filter(colCapexAccounts, Parent = category), Order), 0)+1})` → `Collect(colCapexAccounts, …IsFolded true)` → `locSelectedAccount = new` → `UpdateIf(…, {Status: Inactive})` (server) → same in collection → refresh `locSelectedAccount` | Y:1436 | `buildAccountPayload` R:546-576 + `planSaveAccount` R:578-619 (statecode Inactive folded into create — documented R:539-545) | PARTIAL — rules done; not wired (Save → `closePanel` S:355). New account not auto-selected after save (canvas sets `locSelectedAccount`). Name trimmed in code (`form.name.trim()` R:564) vs canvas untrimmed `Name: txt_….Value` — minor DIVERGENCE, undocumented. **Risk:** setting `statecode` in a Web API create may be rejected / leave `statuscode` inconsistent — see open questions |
| D11 | **Edit account**: `UpdateIf('CAPEX Account Lists', id, {Name: input})` then collection, then refresh selection — Name only | Y:1436 (else-branch) | `buildAccountPayload` isEdit R:555-558 | COVERED (rules) / not wired |
| D12 | **Create subaccount**: `Patch(Defaults, {'Parent Account': locSelectedAccount, Number: parent.Number & "_" & Trim(input), Name: input, Order: Max(Max(Filter('CAPEX Account Lists' (server), Parent = account), Order), 0)+1})` → `Collect` → `UpdateIf Status Inactive` (server, then collection) → selection cleared | Y:1980 | `buildAccountPayload` R:559-575, `composeSubaccountNumber` R:456 | COVERED (rules) / not wired. Order source differs: canvas reads server siblings, code reads cached `siblings` — equivalent once connected |
| D13 | **Edit subaccount**: `UpdateIf(…, {Name: input})` | Y:1980 | R:555-558 | COVERED (rules) |
| D14 | **Reorder**: `ForAll(<drag control>.CurrentItems As RecordItem, UpdateIf('CAPEX Account Lists', Text(id) = RecordItem.ItemId, {Order: RecordItem.Position}); UpdateIf(colCapexAccounts, …))` for every item (subaccounts or accounts); account reorder then clears `locSelectedAccount` | `pcf_Account_RightPanel_Ordering_BodyButtons_Save.OnChange` Y:2261-2296 | `planReorder` R:808-827 writes `index + 1`, skips unchanged | PARTIAL — `Position` base (0 or 1) of PowerDragDrop not verified; code assumes 1-based. Selection clear after account reorder not modelled |
| D15 | **Delete subaccount**: `Remove('CAPEX Account Lists', LookUp(colCapexAccounts, id))` then collection | `cmp_Account_PopUpConfirmation_DeleteSubAccount.OnConfirm` Y:2345-2363 | `planDeleteAccount` R:785-805 | COVERED (rules) / not wired (S:479) |
| D16 | **Delete account**: `Remove` row → collection → `ClearCollect(colCapexSubaccounts, 'CAPEX Account Lists')` (whole table) → `locSelectedAccount = Blank()` | Y:2379-2397 | `planDeleteAccount` R:785-805 (reload replaced by invalidation, documented R:39-40) | COVERED (rules) / not wired |
| D17 | **Deactivate account** (order): account → Inactive (server+col); children → **Active** (server+col) [SOURCE DEFECT]; contracts = `Filter(colCapexProjectContracts, Account in <subaccounts>)` (subaccounts only, not the account itself); `Filter('CAPEX Costs', Contract in …, Year = Year(Today()), Month > Month(Today()))` → `ForAll Patch {Cost: 0}`; `RemoveIf('CAPEX Costs', Contract in …, Year > Year(Today()))` | `cmp_Account_PopUpConfirmation_ChangeStatusOfAccount.OnConfirm` Y:2423 | `planDeactivateAccount` R:704-761, `costCascadeWindow` R:637-643, `classifyCostRow` R:647-651; defect fixed to Inactive with parity switch R:656-677 | COVERED (rules, documented DIVERGENCE). Code adds the account's own id to `affectedIds` (R:732) — canvas only uses subaccounts; harmless superset, undocumented |
| D18 | **Activate account**: account → Active only (children untouched) | Y:2423 else-branch | `planActivateAccount` R:764-777 | COVERED |
| D19 | **Deactivate subaccount**: sub → Inactive; costs for `Filter(colCapexProjectContracts, Account = sub)` zeroed (rest of year) / removed (future years). **Activate subaccount**: → Active | `cmp_Account_PopUpConfirmation_ChangeStatusOfSubAccount.OnConfirm` Y:2454 | `planDeactivateAccount` with `subaccounts: []` / `planActivateAccount` | COVERED (rules) |
| D20 | `CAPEX Costs` (`vsb_capexcost`): `_vsb_contract_value`, `vsb_year` (int), `vsb_month` (**picklist**), `vsb_cost` (decimal) | attributes.json `vsb_CAPEXCost` | `CAPEX_COST_COL` R:67-73; H:26-32 filter `vsb_month gt <n>` | PARTIAL — `vsb_month` is an option set; `gt <1..12>` only works if option values are 1–12. Not verified |
| D21 | All three tables registered | `power.config.json` | `vsb_capexaccountlist`, `vsb_capexprojectcontract`, `vsb_capexcost` **are all registered**; services `Vsb_capexaccountlistsService`, `Vsb_capexprojectcontractsService`, `Vsb_capexcostsService` exist | WRONG (stale doc) — H:4-6 says "None of this screen's tables is registered with `pac` yet"; nothing blocks connecting |
| D22 | Table privileges `DataSourceInfo(…, Create/EditPermission)` and **record** privileges `RecordInfo(locSelectedAccount / ThisItem, Edit/DeletePermission)` | Y:214-217, Y:224-227, Y:235-238, Y:249-251, Y:288-291, Y:490, Y:540-583 | `useCapexPrivileges` H:72 → table-level `Privileges` only (R:118-124); record checks mapped to `p.canWrite`/`p.canDelete` (R:296-297, R:409-415) | PARTIAL — record-level privilege (RecordInfo) collapsed to table-level; no SDK source chosen yet |

## 2. Behaviour

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| B1 | `OnVisible`: `locSelectedCapexAccountCategory = First(colCapexAccountCategories)`; all panels/pop-ups false; spinner off; `locSelectedAccount`/`locSelectedCapexSubaccount` blank; `UpdateIf(colCapexAccounts, Not(IsFolded), {IsFolded: true})` (collapse all) | Y:15-38 | state init S:129-141; `category ?? categories[0]` S:130; `expanded` = empty set S:137 | COVERED (remount resets) |
| B2 | Tab `OnSelect`: `locSelectedAccount = Blank()`, category = `Self.Selected` | Y:164-170 | S:228 | COVERED |
| B3 | Top command bar `OnSelect` Switch: `newAccount` → clear selection + open account panel; `editAccount` → reopen panel for selection; `activateAccount`/`deactivateAccount` → status pop-up; `orderAccounts` → `locIfOrderingSubaccounts=false`, reset list, open ordering; `deleteAccount` → delete pop-up | Y:332-364 (live; Y:298-330 is commented) | `onCommand` S:182-192 | PARTIAL — `newAccount` does not clear the selection (`selectedId` kept; canvas `locSelectedAccount: Blank()`); keys renamed (`new` vs `newAccount`, etc.) |
| B4 | Card header button toggles selection: `If(locSelectedAccount = ThisItem, Blank(), ThisItem)` | `btn_Account_AccountCardHeader.OnSelect` Y:849-856 | S:254 `onClick={() => setSelectedId(account.id)}` | WRONG — canvas toggles off on second click; code only selects |
| B5 | Chevron Down/Up `OnSelect`: **select** `ThisItem` **and** toggle `IsFolded` of the selected card | `ico_Account_AccountCard_Down.OnSelect` Y:885-896, `_Up` Y:923-933 | S:266-270 toggles `expanded` only | PARTIAL — does not set selection |
| B6 | Subaccount command bar: `newSubaccount` → `locSelectedAccount = gal.Selected`, clear sub, open sub panel; `orderSubaccounts` → select account, `locIfOrderingSubaccounts = true`, open ordering | Y:495-516 | S:283-287 | PARTIAL — `orderSubaccounts` does not `setSelectedId(account.id)` |
| B7 | Grid `OnChange` CellAction: `EditIcon` → set sub + account, open sub panel; `ChangeStatusIcon` → status pop-up; `DeleteIcon` → delete pop-up | Y:593-629 | S:310-332 | PARTIAL — Edit sets account (S:313); status/delete do not set the parent selection (canvas does `locSelectedAccount: gal.Selected`) |
| B8 | Account panel ✕ and Cancel: close, clear duplicate flag, `Reset` category/name/number. (Cancel also runs a stray `LookUp('CAPEX Project Contracts', …)` with no effect) | Y:1022-1031, Y:1464-1478 | `closePanel` S:212, FormPanel ✕ `panel-close` | COVERED (stray LookUp correctly not ported) |
| B9 | Subaccount panel ✕ and Cancel: close, clear sub selection + duplicate flag, Reset fields | Y:1556-1566, Y:2008-2018 | S:403-411 | COVERED |
| B10 | Account Save: duplicate → show label and abort (new only); else spinner "Saving Account...", close panel, write (D10/D11), clear flags | Y:1436 | S:355 `onSave={closePanel}` | MISSING (by D14 — not connected) |
| B11 | Subaccount Save: same pattern, "Saving Subaccount..." | Y:1980 | S:406 | MISSING (D14) |
| B12 | Ordering panel: drag-and-drop list (`pdd_CustomControl.PowerDragDrop`), template `<p><b>{{vsb_name}}</b></p>`; Accounts zone `Visible: Not(locIfOrderingSubaccounts)` items = **accounts of the selected category** sorted by Order; Subaccounts zone items = children of `locSelectedAccount` | Y:2150-2224 | S:214-216, S:461-465 static list | WRONG — account ordering lists `parents` (`parentAccountsForReorder`: roots + children of "10005") instead of `Filter(colCapexAccounts, Parent = locSelectedCapexAccountCategory)`; row text is `"<number> - <name>"` vs canvas `vsb_name` only; **no drag-and-drop at all** (MISSING) |
| B13 | Ordering ✕/Cancel: reset list, close | Y:2095-2096, Y:2324-2325 | S:455 | COVERED |
| B14 | Ordering Save: spinner "Saving new order...", close, ForAll UpdateIf (D14), reset list, spinner off | Y:2261-2296 | S:455 `onSave={closePanel}` | MISSING (D14) |
| B15 | Confirm pop-ups `OnCancel` → hide; `OnConfirm` → D15–D19 | Y:2343-2461 | S:470-481 (`onConfirm={() => setConfirm(null)}`) | MISSING (D14) |
| B16 | Spinner `locIsVisiblePopUpSpinner` + `locSpinnerInformationText` ("Saving Account...", "Saving Subaccount...", "Saving new order...", "Deleting Subaccount...", "Deleting Account...", "Updating Account...", "Updating Subaccount...") | Y:1436, Y:1980, Y:2263, Y:2347, Y:2381, Y:2423, Y:2454 | none | MISSING — note **SOURCE DEFECT**: no spinner control exists on the canvas screen, so it never showed. Use `LoadingOverlay` / `ConfirmDialog busy` with these texts when connected |
| B17 | Header `OnLogoClick: Navigate('Project Main Screen')`; left nav `OnSelect` navigates to `gblLeftNavigationSelected.TargetScreen`; `OnExpand` toggles `gblLeftNavigationMenuIsExpanded` | Y:78, Y:117-136 | app shell (`AppShell`/`LeftNav`, `navigation.ts:154` `/admin/capex-accounts`) | COVERED (shell) |

## 3. State gates, validation, Notify

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| G1 | `orderAccounts.ItemEnabled = And(CountIf(varColParentAccounts, true) > 1, DataSourceInfo(EditPermission))`, `varColParentAccounts = Filter('CAPEX Account Lists', And(Or(IsBlank(Parent), Parent.Number = "10005"), Not(Number = "10005")))` | Y:191-218 | `parentAccountsForReorder` R:274-279, `canReorderAccounts` R:307-308, S:162 | COVERED |
| G2 | `newAccount.ItemEnabled = DataSourceInfo(CreatePermission)` | Y:224-227 | `canCreateAccount` R:293, S:164-165 | COVERED |
| G3 | `editAccount.ItemEnabled = And(Not(IsBlank(sel)), RecordInfo(sel, EditPermission))` | Y:233-239 | `canEditAccount` R:296-297 | COVERED (table-level, see D22) |
| G4 | `activateAccount.ItemVisible = sel and Status <> Active`; `deactivateAccount.ItemVisible = sel and Status = Active`; both `ItemEnabled = RecordInfo(EditPermission)` | Y:245-265 | `showActivate`/`showDeactivate` R:300-304, S:168-175 | COVERED |
| G5 | `deleteAccount.ItemVisible = sel AND IsBlank(LookUp('CAPEX Project Contracts', Account in <subaccounts of sel>)) AND IsEmpty(<subaccounts of sel>)`; `ItemEnabled = RecordInfo(DeletePermission)` | Y:271-291 | `canDeleteAccount` R:322-332 + `deleteEnabled` R:335 | PARTIAL — code also hides Delete when a contract references the **account itself** (R:330); canvas never tests the account (its LookUp is over subaccounts, which must be empty). Stricter; undocumented DIVERGENCE |
| G6 | Subaccount `orderSubaccounts` has **no** `ItemEnabled` (commented out Y:483-484) — always enabled; `newSubaccount.ItemEnabled = DataSourceInfo(CreatePermission)` | Y:478-491 | `canReorderSubaccounts` R:314-315 (>1 and canWrite) | COVERED as documented DIVERGENCE (R:31-33, R:310-313) — needs D15 entry |
| G7 | Row icons: Edit if `RecordInfo(Edit)`; ChangeStatus: Active → "DeactivateOrders" if edit; Inactive → "ActivateOrders" only if `Status = Active` (never) [SOURCE DEFECT]; Delete if no `colCapexProjectContracts` row references the sub AND `RecordInfo(Delete)` | Y:538-587 | `subaccountRowIcons` R:402-416 (activate fixed), parity R:419-426 | COVERED (documented fix) — needs D15 entry |
| G8 | Gallery `Visible: =Self.AllItemsCount>0` | Y:406 | S:239 renders an empty div; `MSG.emptyCategory` R:180 exists but is unused | PARTIAL (harmless) |
| G9 | Account panel Category dropdown `DisplayMode: =DisplayMode.Disabled` (always), `DefaultSelectedItems = <current category>` | Y:1077-1080 | S:369 `disabled={!connected || !isCategoryEditable(isEdit)}` | WRONG — canvas: always disabled; code: enabled for New once connected (lets a user create an account under another category) |
| G10 | Account Number `DisplayMode: If(IsBlank(sel), Edit, Disabled)`, `Value: locSelectedAccount.Number` | Y:1186-1194 | `isNumberEditable` R:531, S:382 | COVERED |
| G11 | Account Number not-numeric label visible when `Not(IsBlank(v)) And (Not(IsNumeric(v)) Or contains "," Or contains ".")` — text "Account number must contain numbers only." | Y:1271-1282 | `isNumericAccountNumber` R:448-453, S:207-208 `T.accountNumbersOnly` | COVERED. Note: `accountFormMessages` R:523 returns the **subaccount** text `MSG.numbersOnly` for accounts too (used by `planSaveAccount` refusal) — WRONG for account |
| G12 | Duplicate label "Account number already in use. Please choose different number." visible = `locIfAccountOrSubAccountNumberAlreadyExists` (only after a failed Save) | Y:1224-1226 | live check S:209-210 | COVERED (documented SOURCE DEFECT fix R:459-469) |
| G13 | Account Save `DisplayMode`: Disabled if category blank OR name blank OR number blank OR not-numeric label visible | Y:1411-1421 | `hasFormErrors(validateAccountForm(…))` S:357 | PARTIAL — code also disables on duplicate (fix), and on `numberNotNumeric` when editing (canvas same). OK |
| G14 | Name `MaxLength: =55` (account and subaccount) | Y:1341, Y:1885 | S:387-393, S:438-444 — no `maxLength` | MISSING |
| G15 | Subaccount prefix label `locSelectedAccount.Number & "_"` **Visible only when `IsBlank(locSelectedCapexSubaccount)`** (new) | Y:1711-1713 | S:427-431 shows prefix whenever the sub panel is open, with `value = editing.number` (already the full number) | WRONG — on Edit the code renders `80000_` + `80000_01` |
| G16 | Subaccount Number `DisplayMode: If(IsBlank(sub), Edit, Disabled)`; not-numeric label also requires `DisplayMode = Edit`; text "Subaccount number must contain numbers only." | Y:1758-1826 | S:433, `MSG.numbersOnly` R:135 | COVERED |
| G17 | Subaccount duplicate "Subaccount number already in use. Please choose different number." | Y:1743-1745 | `MSG.duplicateSubaccount` R:145 | COVERED |
| G18 | Subaccount Save Disabled if name blank OR number blank OR not-numeric visible | Y:1955-1964 | S:408 | COVERED |
| G19 | Main Account field `DisplayMode.Disabled`, `Value: locSelectedAccount.Name` | Y:1611-1614 | S:416-421 | COVERED |
| G20 | Ordering Save `DisplayMode: =DisplayMode.Edit` (always) | Y:2245-2246 | S:455 `disabled={!connected}` | COVERED |
| G21 | Sub status pop-up `Title` reads `locSelectedAccount.Status` (parent!) — SOURCE DEFECT; Description/ConfirmButtonText read the subaccount | Y:2455-2460 | `confirmTitle` S:486-492 uses the subaccount's status | COVERED as fix — **undocumented** (no SOURCE DEFECT note, no D15 row) |
| G22 | Screen protection: entry gated only by nav `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)` | A:383-386 | no guard on `admin/*` routes (routes.tsx:150-158); D15a | PARTIAL — R:23-25 claims "`RequireAdmin` guards the route, `canEditCountry` gates the writes" — **WRONG/stale**: no `RequireAdmin` on this route, and nothing in Screen.tsx calls `canEditAccountScope` |
| G23 | No `Notify(…)` calls on this screen | grep | `MSG.noCreatePrivilege` etc. R:160-185 are NEW (labelled) | COVERED |

## 4. UI

| # | Canvas control / caption | Citation | Code (`data-testid` / aria-label) | Status |
|---|---|---|---|---|
| U1 | Header title `Project.Name: "CAPEX Accounts"` | `cmp_Admin_CAPEX_Accounts_Header` Y:79-87 | `<Text as="h1">` S:222 `T.title`; no testid (non-interactive) | COVERED |
| U2 | Tab list `tab_Admin_CAPEX_Accounts_RightContent_Parents` | Y:156 | S:226 testid ✓; tabs `capex-accounts-category-<id>`, aria = category name (bound data, D16b) | COVERED |
| U3 | Command bar `pcf_Admin_CAPEX_Accounts_RightContent_Parents_CommandBar` — items "Reorder" (NumberedList), "New" (Add), "Edit" (Edit), "Activate" (ActivateOrders), "Deactivate" (DeactivateOrders), "Delete" (Delete), canvas order Reorder, New, Edit, Activate, Deactivate, Delete | Y:184-293 | S:159-180, labels R:346-365; testids `command-reorder/new/edit/activate/deactivate/delete` | PARTIAL — no testid on the bar itself (`CommandBar` has none); command keys ≠ canvas `ItemKey` (`orderAccounts`, `newAccount`, `editAccount`, `activateAccount`, `deactivateAccount`, `deleteAccount`); icons missing for Reorder/Activate/Deactivate (`CommandIcon` has no NumberedList/ActivateOrders/DeactivateOrders). Caption citations for New/Edit/Activate/Deactivate/Delete point at **other screens** (R:353-364) although this screen's own `ItemDisplayName` literals exist at Y:207-270 |
| U4 | Account gallery `gal_Account_Accounts`, card `con_Account_AccountCard` | Y:369, Y:439 | S:239, S:246 | COVERED (per-row duplicate ids, D16c) |
| U5 | Card title `lbl_Account_AccountName` = `ThisItem.Number & " - " & ThisItem.Name` | Y:728 | S:256 `accountRowLabel` R:287 | COVERED |
| U6 | Status chip `lbl_Account_AccountStatus` = `ThisItem.Status` | Y:801 | S:257-259 | COVERED |
| U7 | Radio image `img_…RadioSelection` (CircleDotBlue / CircleEmpty) + transparent button `btn_Account_AccountCardHeader` | Y:806-865 | S:248-255 (one button with radio icon, `aria-pressed`) | COVERED (merged) |
| U8 | Chevrons `ico_Account_AccountCard_Down` (Visible IsFolded) / `_Up` | Y:867-938 | S:260-271 | COVERED |
| U9 | Bottom line `shp_Account_AccountCardHeaderBottomLine` visible when folded | Y:733-747 | card border | COVERED (cosmetic) |
| U10 | Sub command bar `pcf_Account_AccountCardBody_SubAccountsCommandBar`: "Reorder subaccounts" (NumberedList), "Add subaccount" (Add) | Y:472-491 | S:275-288 testids `command-orderSubaccounts` / `command-newSubaccount` | PARTIAL — bar itself has no testid; Reorder icon missing |
| U11 | Sub grid `pcf_Account_AccountCardBody_SubAccounts` | Y:521 | S:290 ✓; row buttons `capex-accounts-subaccount-{edit,activate,deactivate,delete}-<id>` | COVERED |
| U12 | Account panel `con_Account_RightPanel_NewEditAccount`; header "New Account"/"Edit Account"; ✕ `ico_Account_RightPanel_NewEditAccount_BodyHeaderCancel` (Tooltip "Cancel") | Y:942-1035 | `FormPanel` S:348-396; ✕ is `panel-close` / aria "Close panel" | PARTIAL — no testid for panel container; ✕ testid/tooltip not the canvas name |
| U13 | Fields "Category" * (`drp_…Category`), "Number" * (`txt_…Number`), "Name" * (`txt_…Name`) | Y:1074-1387 | S:364-394 ✓ testids, aria = captions | COVERED |
| U14 | Error labels `lbl_…Number_ErrorMessageNumberExists`, `lbl_…Number_ErrorMessageNotNumbers` | Y:1198, Y:1245 | `CostField error` S:377 (one message slot, no testid) | PARTIAL — no canvas testids on the messages; both can't show at once (canvas could) |
| U15 | Buttons `pcf_…NewEditAccount_BodyButtons_Save` "Save" (CheckMark) / `_Cancel` "Cancel" | Y:1407-1482 | `PanelButtons` S:354-360 ✓ | COVERED |
| U16 | Subaccount panel: header "New Subaccount"/"Edit Subaccount"; "Main Account" *, "Subaccount Number" *, prefix label, "Subaccount Name" *; Save/Cancel | Y:1486-2022 | S:399-447 ✓ testids | COVERED (see G15) |
| U17 | Ordering panel: header "Subaccounts order" / "'Capex Accounts' order"; hint "To reorder drag and drop listed items"; drag controls `pcf_…Ordering_BodyContent_Accounts` / `_Subaccounts`; Save/Cancel | Y:2026-2329 | S:450-467 | PARTIAL — no drag zones, no testids for the two lists |
| U18 | Pop-ups `cmp_Account_PopUpConfirmation_DeleteSubAccount` ("Delete Subaccount?", "Are you sure that you want to permanently delete "<n>" subaccount?"), `_DeleteAccount` ("Delete Account?", "… account with its all related subaccounts?"), `_ChangeStatusOfAccount` ("Deactivate Account?"/"Activate Account?", Confirm "Deactivate"/"Activate"), `_ChangeStatusOfSubAccount`; icons Cancel / CheckMark | Y:2333-2461 | one `ConfirmDialog` S:470-481, texts `CAPEX_SCREEN_TEXT` R:876-899 verbatim | PARTIAL — captions verbatim ✓; dialog has generic testids (`confirm-dialog-*`) not the four canvas names. `MSG.deactivateAccount/deactivateSubaccount/deleteAccount/deleteSubaccount` R:146-155 are **non-verbatim duplicates** ("Are you sure you want…" vs canvas "Are you sure that you want…") — unused by the screen, only by tests (rules.test.ts:379-382) |

---

## Proposed changes

### (a) UI — `Screen.tsx`
| Change | Size |
|---|---|
| Make the Category dropdown always disabled (`disabled` regardless of `isEdit`), defaulted to the current tab (G9) | S |
| Show the `<number>_` prefix only for New subaccount (`!isEdit`) (G15) | S |
| Header button toggles selection off on second click (B4); chevrons also select (B5); `orderSubaccounts`, row status/delete set `selectedId` to the parent (B6/B7); New clears selection (B3) | S |
| Ordering panel: list `childrenOf(category.id)` for account ordering, label `name` only (B12); add keyboard-accessible reorder (Fluent move up/down buttons or a dnd lib) with testids `pcf_Account_RightPanel_Ordering_BodyContent_Accounts/_Subaccounts` | M |
| `maxLength={55}` on both Name inputs (G14) | S |
| Use canvas `ItemKey`s as command keys (`orderAccounts`, `newAccount`, …) so testids become `command-newAccount` etc.; add `data-testid` support to `CommandBar` and pass the `pcf_…CommandBar` names; extend `CommandIcon` with NumberedList / ActivateOrders / DeactivateOrders (U3, U10) — touches shared component | M |
| Optional `testId` prop on `ConfirmDialog` / `FormPanel` so the four `cmp_Account_PopUpConfirmation_*` and three `con_Account_RightPanel_*` names land on the DOM (U12, U17, U18) | S |
| Separate error slots with canvas testids for the two number messages (U14) | S |
| Busy overlay with the seven canvas spinner texts during writes (B16) | S |

### (b) `rules.ts` (+ `rules.test.ts`)
| Change | Size |
|---|---|
| `accountFormMessages`: account → "Account number must contain numbers only." (G11) + UT | S |
| `canDeleteAccount`: drop the "contract on the account itself" test or document it as DIVERGENCE (G5) + UT | S |
| Remove or make verbatim the duplicate `MSG.deactivate*/delete*` strings (U18) and update tests 379-382 | S |
| Fix header comment: no `RequireAdmin`, no `canEditCountry` wiring (G22); fix R:467 (`existsByNumber` does not exist) | S |
| Document the sub status-pop-up Title fix (G21) as SOURCE DEFECT; add a D15 row for G6, G7, G21, D17 (child status inversion) | S |
| `planSaveAccount`: return the created id so the screen can select the new account (D10); decide whether `statecode` goes in the create or a follow-up update (open Q2) | S |
| `planReorder`: confirm 0/1-based position (D14) | S |

### (c) `hooks.ts`
All three tables (`vsb_capexaccountlist`, `vsb_capexprojectcontract`, `vsb_capexcost`) **are already in `power.config.json`** and have generated services — fix the H:4-6 comment; nothing to register.
| Change | Size |
|---|---|
| `useCapexTree`: `fetchAll` over `Vsb_capexaccountlistsService`, `$select` per H:14-15, `$orderby vsb_order`; key `['capexTree']` | S |
| `useCapexContracts`: `$select vsb_capexprojectcontractid,_vsb_account_value`, ideally `$filter _vsb_account_value ne null` | S |
| `useCapexPrivileges`: choose the SDK source for table (and per-record) privileges (D22) | M |
| Mutations: save (with server-side duplicate re-check `$filter vsb_number eq '<n>'` before create, D9), delete, activate, reorder (WritePlan in order), invalidate tree | M |
| Deactivate cascade: read `vsb_capexcosts` for the contract ids with the window filter (verify `vsb_month` option values, D20), build `planDeactivateAccount`, execute as one `$batch`; consider a custom API (R:697-702) | L |

## Open questions for the product owner
1. **Child status on account deactivation (D17).** Canvas sets subaccounts **Active**; the dialog promises "automatically deactivated". Code does Inactive. Confirm the fix.
2. **New accounts created Inactive (D10/D12).** Canvas creates then flips to Inactive. Keep this? If yes, may we set `statecode=1` in the create (Dataverse may require `statuscode` too), or must it be a create + update?
3. **Subaccount Activate icon (G7).** The canvas never shows it (defect). Confirm reactivating subaccounts from the grid is wanted.
4. **Subaccount Reorder privilege (G6).** Canvas: always enabled. Code: needs >1 subaccount and write privilege. Accept?
5. **Delete account when a contract references the account itself (G5).** Canvas allows it (only subaccounts are checked); code hides Delete. Which?
6. **Account ordering scope (B12).** Canvas reorders the accounts of the selected category, while the enable test counts "roots + children of 10005". Should the enable test also use the category's accounts?
7. **Duplicate number timing (D9/G12).** Code shows the error live; canvas only after Save. OK?
8. **Name trimming (D10).** Code trims names; canvas stores them as typed. OK?
9. **`vsb_month` option values (D20)** — are they 1–12, so `Month > Month(Today())` maps to `vsb_month gt N`?
10. **Access control (G22).** Admin routes are open to everyone today (D15a). Who may see and write this screen — app admins and controllers only, via a route guard plus server security roles?
11. **Record-level privileges (D22).** Is the table-level privilege enough, or do you need per-record `RecordInfo` checks (business-unit-owned rows)?
