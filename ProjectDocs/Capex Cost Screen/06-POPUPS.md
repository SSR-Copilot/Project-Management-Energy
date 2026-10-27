# 06 · Popups, loaders and error surfaces: DEVEX/CAPEX Costs screen

Gap ID prefix: **GAP-POP**. Sibling files: `05-UX.md` covers the interaction journeys and accessibility. `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md` covers the Save logic that raises two of these dialogs. `09-COMMENTS-PANEL.md` covers the comments panel internals, and `07-FUNCTIONAL-SCREEN-AND-GRID.md` covers the timers and hidden code buttons. This file does not repeat their content and links to them instead.

---

## 1. Scope

This file covers every dialog, overlay, loader, error panel and `Notify(...)` toast that the CAPEX screen can show. For each one it gives:
- the trigger;
- the verbatim copy;
- the icons;
- what each button does;
- the geometry;
- the component definition behind it;
- the code-app equivalent.

**Canvas sources read** (all under `ProjectDocs/_extracted/msapp/projectcosts/Src/`):

| File | Lines read |
|---|---|
| `Capex Costs Screen.pa.yaml` | L11-60 (OnVisible), L303-434 (`cmp_PopUp_Confirmation_1`), L722-787 (reload button, initial-load timer, decoded), L2431-2516 (tabs), L2558-3063 (toolbar), L3280-3566 (hidden command bar), L7234-7768 (PCF `OnChange` and `Btn_CodeforSettingCostPaidUnpaid`), L8081-8155, L8156-8243 (comments header), L10092-10222 (comments Save), L10249-10359 (panel header), L11450-11481 (Link to Milestone `OnChange`), L12287-12292 (Cost Paid By `OnChange`), L17484-17720 (panel footer), L17574 (Save `OnSelect`, a single 91 k-character line, decoded in full), L17687 (hidden duplicate), L18155-18205 (Cancel), L18206-18222, L18223-18250, L18610-18660, L18780-18927 (standard contract), L19580-19600, L19725-19741 (warm-up), L19742-20178 |
| `Components/cmp_PopUp_Confirmation.pa.yaml` | whole file (256 lines) |
| `Components/cmp_PopUp_Confirmation_New.pa.yaml` | whole file (295 lines) |
| `Components/cmp_PopUp_Loading.pa.yaml` | whole file (84 lines) |
| `Components/cmp_ReportErrorRightPanel.pa.yaml` | whole file (457 lines) |
| `Components/cmp_Information_Button_PCF.pa.yaml` | whole file (164 lines) |
| `Components/cmp_Header.pa.yaml` | L495-549 (error icon and Help menu) |
| `App.pa.yaml` | L188-204 (`OnError`) and L205 (`gblAppConstants`, decoded) |

**Screenshots viewed:**
- `Cost App - Edit Panel - Popup Design - When DevcoSpv or Link to cluster is changed.png`;
- `Cost App - Loading Spinner Design - Panel Closes and Spinner is shown..png`;
- `Cost App - DevexCapex Screen Tab Selected - Showcasing dropdown for three dots clicked on contract.png`.

**Code read** (under `ProjectCosts-CodeApp/src/`):
- `features/cost/capex-costs/`: `Screen.tsx` (whole), `rules.ts` L95-110 and L820-1215, `panelRules.ts` L195-497, `standardContracts.ts` L90-151, `CommentsPanel.tsx` L448-540 and L631, `PcfGrid.tsx`, and `pcf/ui/GridRenderer.js` (excerpts);
- `components/`: `ConfirmDialog.tsx`, `LoadingOverlay.tsx`, `useNotify.tsx`, `AppToaster.tsx`, `NoticeBar.tsx`, `WriteFeedback.tsx`, `PanelMessages.tsx`, `FormPanel.tsx` and `discardGuard.tsx`;
- `data/capexWrites.ts` L40-343, `data/costRepository.ts` L229-333, `features/cost/costing/useCostBook.ts` L380-424, `platform/errors.ts` L1-60, and `features/shared/report-problem/ReportProblemPanel.tsx`;
- the tests `Screen.test.tsx`, `ConfirmDialog.test.tsx`, `LoadingOverlay.test.tsx` and `rules.test.ts` (test names only).

**Prior docs checked:**
- `app-docs/gap-analysis/cost-capex-costs.md` §3-§5;
- `app-docs/02-OPEN-DECISIONS.md` D38 (§2, §3, §7, §9), D39 (all) and D49 §1;
- `app-docs/01-BUGS-FOUND.md` (B-1, the `App.OnError` row);
- `migration-plans/screens/019-capex-costs.md`.

### 1.1 Inventory at a glance

| # | Canvas surface | Line | Component | Live? | Code equivalent |
|---|---|---|---|---|---|
| P1 | `cmp_PopUp_Confirmation_1` | L303 | `cmp_PopUp_Confirmation` | **No**: `Visible: =//locShowClusterLinkageConfirmation` then `false` (L425-427) | None, correctly |
| P2 | `cmp_PopUp_SubaccountCostsDeletion_Confirmation` | L8088 | `cmp_PopUp_Confirmation` | Yes | `Screen.tsx:977-987` `ConfirmDialog` |
| P3 | `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` | L19864 | `cmp_PopUp_Confirmation_New` | Yes | `Screen.tsx:1028-1036` |
| P4 | `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` | L19884 | `cmp_PopUp_Confirmation_New` | Yes. This is the "Edit Panel - Popup Design" screenshot | `Screen.tsx:999-1016` |
| P5 | `cmp_Costs_PopUpLoading` | L18206 | `cmp_PopUp_Loading` | Yes | `Screen.tsx:1045-1049` `LoadingOverlay`, plus `CommentsPanel.tsx:631` |
| P6 | `spn_LoadingSpinnerCost` | L19749 | `Spinner@1.4.6` | Yes | `Screen.tsx:301` (inline `LoadingOverlay`) and the busy overlay (§3.6) |
| P7 | `cmp_ShowErrorInContract` | L19760 | `cmp_Information_Button_PCF` | Yes, conditional | **None** |
| P8 | `cmp_ReportErrorRightPanel_CapexCosts` | L8081 | `cmp_ReportErrorRightPanel` | Yes (opened from the header) | `ReportProblemPanel.tsx`, mounted in `App.tsx:125` |
| P9 | `Notify(...)`: 8 live call sites, 2 dead, 4 commented out | §2.9 | Power Apps toast | Yes | Inline `.canvas-error` text, `window.alert`, or nothing (§3.8) |
| P10 | The month-cell "info" popover inside the PCF | `GridRenderer.js:1268-1279` | PCF DOM | Yes (same vendored code) | Same code |

**About the "in-panel warning pop-up when DevCo/SPV or Link to Cluster changes"** (the screenshot "Edit Panel - Popup Design"). This is **P4**. It is not raised when the field changes. Changing the field only sets flags:
- `locCostPaidByChanged` (L12289);
- `locClusterLinkageChanged` and `locMilestoneRelinkResetNeeded` (L11456-11479).

The dialog appears only when the user presses **Save** (§2.4). The screenshot agrees: it shows the dialog over the still-open panel, with Save in its pressed state.

---

## 2. Canvas implementation

### 2.1 The two confirmation components

#### `cmp_PopUp_Confirmation` (used by P1 and P2)

**Custom properties** (`cmp_PopUp_Confirmation.pa.yaml:13-67`):

| Property | Kind | Type | Default |
|---|---|---|---|
| `Description` | Input | Text | `="Description..."` |
| `IconCancelButton` | Input | Text | `="Cancel"` |
| `IconConfirmButton` | Input | Text | `="CheckMark"` |
| `OnCancel` | Event | Boolean | `=true` |
| `OnConfirm` | Event | Boolean | `=true` |
| `TextCancelButton` | Input | Text | `="Cancel"` |
| `TextConfirmButton` | Input | Text | `="Confirm"` |
| `Title` | Input | Text | `="Title"` |
| `WidthConfirmButton` | Input | Number | `=96` |

**Tree and geometry:**
- **`con_PopUpConfirmation`** is the full-size scrim: `Fill: =RGBA(0, 0, 0, 0.1)`, `Height: =Parent.Height`, `Width: =Parent.Width` (`:69-80`). It has no `OnSelect`, so clicking the scrim does nothing (inferred: a GroupContainer with no handler).
- **`con_PopUpConfirmation_Body`** is the card: `Fill: =Color.White`, **`Height: =260`** (fixed), `Width: =Min(450, Parent.Width)`, centred with `X: =Parent.Width/2-Self.Width/2` and `Y: =Parent.Height/2-Self.Height/2` (`:82-92`). It has no radius and no shadow.
- **Header `con_PopUpConfirmation_BodyHeader`**: `Fill: =ColorValue(AppTheme.palette.themePrimary)`, `Height: =42` (`:94-109`). It contains:
  - the title label `lbl_PopUpConfirmation_BodyHeader` in Open Sans Semibold, `Size: =11`, white, at `X: =20`, with `Text: =cmp_PopUp_Confirmation.Title` (`:111-128`);
  - the close icon `ico_PopUpConfirmation_BodyHeader`: `Icon.Cancel`, 20 × 20, white, `HoverColor: =Self.Color` (no hover change), `PressedColor: =ColorValue(AppTheme.palette.themeLighter)`, **`Tooltip: ="Cancel"`**, `OnSelect: =cmp_PopUp_Confirmation.OnCancel()`, placed at `X: =Parent.Width-Self.Width-15` (`:129-144`).
- **Body band `con_PopUpConfirmation_BodyDescription`**: vertical AutoLayout with `LayoutOverflowY: =LayoutOverflow.Scroll` and `PaddingTop: =16` only (`:145-160`). The label `lbl_PopUpConfirmation_BodyDescription` uses Open Sans `Size: =11`, `LineHeight: =1.4`, `Color: =RGBA(50, 49, 48, 1)`, `PaddingLeft/Right: =20`, `PaddingTop/Bottom: =0`, and `Text: =cmp_PopUp_Confirmation.Description` (`:162-182`).
- **Buttons `con_PopUpConfirmation_BodyButtons`**: `Height: =60`, transparent (`:183-198`). Two PowerCAT `cat_PowerCAT.Icon` ActionButtons:
  - **`pcf_PopUpConfirmation_BodyButtons_Confirm`**: themePrimary fill, white text, `HoverFillColor: =hoverButton`, `HoverFontColor: =themePrimary`, `IconName: =…IconConfirmButton`, `Text: =…TextConfirmButton`, `Width: =…WidthConfirmButton`, `Height: =32`, `X: =pcf_…_Cancel.X - Self.Width - 20`, `OnChange: =cmp_PopUp_Confirmation.OnConfirm()` (`:200-227`).
  - **`pcf_PopUpConfirmation_BodyButtons_Cancel`**: white fill, themePrimary border and text, `Width: =96`, `X: =Parent.Width -Self.Width - 20`, `OnChange: =…OnCancel()` (`:228-255`).

So Confirm sits to the left of Cancel and both are right-aligned. Neither button sets an `AccessibleLabel`, and both set `Tooltip: =""`.

#### `cmp_PopUp_Confirmation_New` (used by P3 and P4)

**Custom properties** (`cmp_PopUp_Confirmation_New.pa.yaml:13-79`). These are the same as above, plus two. Note that the defaults **differ**:

| Property | Type | Default |
|---|---|---|
| `BoxHeight` | Number | `=260` |
| `Description` | Text | `="Text"` |
| `IconCancelButton` | Text | **`="CheckMark"`** |
| `IconConfirmButton` | Text | **`="Text"`** |
| `OnCancel` / `OnConfirm` | Event | `=true` |
| `TextCancelButton` / `TextConfirmButton` | Text | `="Cancel"` / `="Confirm"` |
| `TextHeight` | Number | `=100` |
| `Title` | Text | `="Title"` |
| `WidthConfirmButton` | Number | `=96` |

The component's own authoring size is `Height: =320`, `Width: =320` (`:80-82`). That is the design canvas, not the card.

**Differences from `cmp_PopUp_Confirmation`:**
- The card height is `Height: =cmp_PopUp_Confirmation_New.BoxHeight` (`:104`).
- The description band is `Height: =…TextHeight`, `LayoutDirection.Horizontal`, `PaddingTop/Bottom: =16`, `PaddingLeft/Right: =10`, scroll on Y (`:161-180`).
- Inside the band is a pale "info" block `con_PopUpConfirmation_BodyDescription_Inside_2`: `Fill: =RGBA(225, 236, 244, 1)`, `PaddingLeft: =10`, `PaddingRight: =5`, `Height:` the label's height, no radius (`:182-193`). It holds:
  - the label `lbl_PopUpConfirmation_BodyDescription_2`: Open Sans **`Size: =9`**, `LineHeight: =1.4`, `Height: =…TextHeight`, `Width: =386`, `X: =32` (`:195-213`);
  - `Icon1`: `Icon.Information`, 22 × 16, at `X: =10`, vertically centred (`:214-221`).
- The control names carry a `_2`, `_3` or `_1` suffix: `ico_PopUpConfirmation_BodyHeader_3` (Tooltip "Cancel", `:145-160`), `pcf_PopUpConfirmation_BodyButtons_Confirm_1` and `pcf_PopUpConfirmation_BodyButtons_Cancel_1` (`:239-294`).

**`IconConfirmButton: ="Text"` is not a PowerCAT icon name, so it renders no icon.** The screenshot confirms this: "Confirm All" has no glyph, and **Cancel carries a ✓** because `IconCancelButton` is `"CheckMark"`.

### 2.2 P1 · `cmp_PopUp_Confirmation_1` (L303): dead

`Visible: =//locShowClusterLinkageConfirmation` then `false` (L425-427). It never renders. For the record:
- its live `Description` is a four-armed `If` (L334-363) with a different single-message wording;
- its `OnConfirm` (L376-401) contains a **live** `RemoveIf('Capex Comments', … 'Comments to payment date')` (L396-399). Its replacement, P4, has that same `RemoveIf` commented out (§2.4).

`Description` also carries an older `Concat(Filter(Table(…)))` form, commented out and not live (L308-333).

### 2.3 P2 · `cmp_PopUp_SubaccountCostsDeletion_Confirmation` (L8088): Delete Contract

- **Trigger.** `UpdateContext({locIsVisibleSubaccountCostsDeletionDialog: true})` runs from the PCF `OnChange` when `Self.DeleteTriggered` (L7418-7421). The PCF raises this from the ••• menu's **Delete** item. The same `If` block is duplicated verbatim at L7438-7441; the duplicate is harmless because setting the flag twice has the same result. A third setter, in the hidden `cmd_Costs_ProjectCosts_TableCommandBar` (L3560-3561), is unreachable because that command bar and its container are `Visible: =false` (L3080, L3566). The flag is reset in `OnVisible` (L20).
- **Visible:** `=locIsVisibleSubaccountCostsDeletionDialog` (L8153). Size `Height: =Parent.Height`, `Width: =Parent.Width` (L8098, L8154); the card is 450 × 260, centred.
- **Title:** `="Delete Contract"` (L8152).
- **Description** (L8092-8097), verbatim:
  ```powerfx
  If(
      locSelectedCostRow.IsContract,
      $"Are you sure you want to delete the costs for {Char(34)}{locSelectedCostRow.vsb_costdescription}{Char(34)} of the selected Subaccount {Char(34)}{LookUp(colCapexProjectContracts,'CAPEX Project Contract'=locSelectedCostRow.vsb_capexaccountlistid).Account.Name}{Char(34)}?"
  )
  ```
  The result reads: `Are you sure you want to delete the costs for "<contract description>" of the selected Subaccount "<sub-account name>"?`
- **Buttons:**
  - `TextConfirmButton: ="Confirm"` with icon `="CheckMark"`, width `=96`;
  - `TextCancelButton: ="Cancel"` with icon `="Cancel"` (✕) (L8099-8100, L8150-8151, L8155).
- **`OnCancel`** (L8101-8102): `UpdateContext({locIsVisibleSubaccountCostsDeletionDialog: false})`.
- **`OnConfirm`** (L8103-8149), in order:
  1. Hide the dialog, raise **`locIsVisibleLoadingCostSpinner: true`** (P6, which has no text), and reset `locSelectedAccount`, `locShowInActive` and `locSelectedCapexAccountCategory`.
  2. `IfError(With({locContractToDelete: LookUp(colCapexProjectContracts, …)}, RemoveIf('Capex Comments', 'Capex Contract'.'CAPEX Project Contract' = …); Remove('CAPEX Project Contracts', locContractToDelete)), Notify(…))`. The `RemoveIf('CAPEX Costs', …)` at L8122-8126 is **commented out, not live**, so the cost rows go by the Dataverse cascade.
  3. On error, **Notify N5** (§2.9).
  4. `Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code)` (L8141). That button also raises and clears the spinner, at L726 and L769-774.
  5. Clear `locSelectedCostRow` and turn the spinner off (L8142-8149).

### 2.4 P4 · `cmp_PopUp_Confirmation_For_SetClusterLinkingConfirmationPopup` (L19884): the relink / Cost Paid By confirmation

**Trigger.** Only the panel **Save** button raises it. `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save.OnSelect` is the one-line formula at L17574. Decoded:
- **Individual branch** (decoded lines 692-714): `If(locValidCostInContract, If(Or(And(CountRows(Filter(colOtherClusterHavingCost, Order <> drp_…Link_to_Cluster.Selected.Order)) > 0, locClusterLinkageChanged), locCostPaidByChanged, locMilestoneRelinkResetNeeded), UpdateContext({locIsVisiblePopUpSpinner: false, locSpinnerInformationText: "", locShowClusterLinkageConfirmation: true}), <save>))`.
- **Equal branch** (decoded lines 1466-1486): the same test, but without the `locValidCostInContract` wrapper.

**Where the three flags come from:**
- `locCostPaidByChanged: locInitialCostPaidBy <> Self.Selected.Value` is set in `rad_AddContract_RightPanel_CostPaidBy_1.OnChange` (L12289).
- `locClusterLinkageChanged: And(Selected.Name <> "None", Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name)` is set in `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster.OnChange` (L11456-11459).
- `locMilestoneRelinkResetNeeded` is set in the same `OnChange` (L11468-11479):
  ```powerfx
  locMilestoneRelinkResetNeeded: And(
      Self.Selected.Name <> "None",
      Self.Selected.Name <> locSelectedProjectContract.'Linked Cluster'.Name,
      Or(
          CountRows(
              Filter(
                  'CAPEX Costs',
                  Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true
              )
          ) > 0
      )
  )
  ```
  The `Or(...)` has **one** argument: paid months only. No comment count is involved.
- All three flags are reset to `false` when the panel is opened by Add or Edit (L7285-7287, L7297-7311, L7333-7347, L3455-3469, L3531-3545).

**Visible:** `=locShowClusterLinkageConfirmation` (L20171). The component is declared after the panel container (L10249), so it draws **over the open panel**, as the screenshot shows.

**Message count.** `BoxHeight`, `TextHeight`, `Title` and `Description` each compute `locCount = C1 + C2 + C3`, where:
- `C1 = locCostPaidByChanged`;
- `C2 = locClusterLinkageChanged && CountRows(Filter(colOtherClusterHavingCost, Order <> Selected.Order)) > 0`;
- `C3 = locMilestoneRelinkResetNeeded`.

| Property | Live formula |
|---|---|
| `BoxHeight` (L19906-19936) | `Switch(locCount, 1, 200, 2, 250, 3, 280)`, with no default arm. Two earlier forms (L19889-19905) are commented out, not live |
| `TextHeight` (L20096-20126) | `Switch(locCount, 1, 60, 2, 120, 3, 150)`. Two earlier forms (L20079-20095) are commented out, not live |
| `Title` (L20127-20170) | `If(locCountOfMessages >= 2, "Confirm Changes", locCostPaidByChanged, "Change Cost Paid By", And(locClusterLinkageChanged, CountRows(Filter(…)) > 0), "Change Cluster Link", locMilestoneRelinkResetNeeded, "Cluster-linked Costs")` |
| `TextConfirmButton` (L20072-20077) | `If(locCostPaidByChanged && locClusterLinkageChanged && CountRows(colOtherClusterHavingCost) > 0 && !IsBlank(drp_….Selected.Name) && drp_….Selected.Name <> "None", "Confirm All", "Confirm")`. Note that this uses the **unfiltered** count |
| `WidthConfirmButton` (L20173-20178) | Same predicate as the confirm caption, giving `120` or `96` |
| `TextCancelButton` | `="Cancel"` (L20071) |
| `IconConfirmButton` / `IconCancelButton` | `="Text"` (no icon) / `="CheckMark"` (✓) (L20029-20030) |

**`Description`** (live, L19956-20027). The older form at L19938-19955 is commented out, not live.
- **`locMsg1`** = `Switch the "Cost Paid By" to <payer>. This will impact liquidity planning and BoP.`
- **`locMsg2`** = `Costs have been entered for Cluster <orders> and linked to <selected>.` Here `<orders>` is `Concat(colOtherClusterHavingCost, Order, ", ")`, unfiltered.
- **`locMsg3`** = `"Paid" markers are not supported for milestone-linked costs. Linking this cost to a milestone will reset all costs to unpaid. ` It ends with a **trailing space**.
- **When `locCount > 1`:** `Are you sure you want to proceed with the following changes?`, followed by `Char(10) & "• " & locMsgN` for each condition that holds.
- **When exactly one condition holds**, one sentence:
  - C1: `Are you sure you want to switch the 'Cost Paid by' to <payer>? This will influence the liquidity planning and BoP.`
  - C2: `You have entered costs in Cluster <orders> and linked them to <selected>. Would you like to proceed?`
  - C3: `locMsg3 & "Do you want to continue?"`

**`OnCancel`** (L20031-20039): `UpdateContext({locShowClusterLinkageConfirmation: false, locConfirmCostPaidByChange: false, locConfirmClusterLinkChange: false, locContinueToSavelinkedCluster: false})`. The panel stays open with what the user typed. The header ✕ calls the same `OnCancel()`.

**`OnConfirm`** (L20040-20070), in order:
1. Clear the flags, set `locContinueToSavelinkedCluster: true`, and **close the panel** (`locIsVisibleRightPanelAddContract: false`).
2. `If(locMilestoneRelinkResetNeeded, UpdateIf('CAPEX Costs', Contract.'CAPEX Project Contract' = locSelectedCostRow.vsb_capexaccountlistid && 'Cost Paid' = true, {'Cost Paid': false}))`. Inside this branch:
   - the `ForAll`/`Patch` variants at L20054 and L20060 are commented out, not live;
   - **the `RemoveIf('Capex Comments', … 'Comments to payment date')` at L20061-20065 is commented out, not live.**
3. `UpdateContext({locMilestoneRelinkResetNeeded: false})`. This line carries the comment "Bug 13772: clear the flag AFTER the reset above and BEFORE the Save re-run" (L20067-20069).
4. `Select(btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save)` (L20070). This re-runs Save, which now takes the save branch.

### 2.5 P3 · `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation` (L19864): paid toggle on a cluster-linked cost

- **Trigger.** In the PCF `OnChange`, `If(Self.SetCostPaidUnpaidTriggered, With({varPCFSelectedContract: LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(Self.SelectedCostContractId))}, If(varPCFSelectedContract.Distribution = 'Distribution Type'.'Individual Distribution' && Not(IsBlank(varPCFSelectedContract.'Linked Cluster')), UpdateContext({locIsVisibleSetPaidCost: true}), Select(Btn_CodeforSettingCostPaidUnpaid))))` (L7422-7437).
  - A **duplicate** block at L7442-7456 repeats only the `true` arm. The effect is the same.
  - The PCF raises this action from the month-cell menu item "Set as paid" / "Set as unpaid" (`GridRenderer.js:1281-1297`).
  - The dialog is shown for **both** directions, paid and unpaid.
- **Visible:** `=locIsVisibleSetPaidCost` (L19880-19881). It covers the full screen; `BoxHeight: =200` and `TextHeight: =75` are literals (L19868, L19878).
- **Title:** `="Cluster-linked Costs"` (L19879).
- **Description:** `="Setting the milestone-linked cost to ‘Paid’ will remove the milestone link for all costs in the contract. Do you want to proceed?"` (L19869). The quotes are U+2018 and U+2019. Note the canvas mismatch: the title says "Cluster" and the body says "milestone" (D39 §3, UX-3).
- **Buttons:**
  - Confirm `="Confirm"` with no icon (`IconConfirmButton: ="Text"`) and width `=96`;
  - Cancel `="Cancel"` with a ✓ (`IconCancelButton: ="CheckMark"`) (L19871-19872, L19876-19877, L19883).
- **`OnCancel`:** `UpdateContext({locIsVisibleSetPaidCost: false})` (L19873-19874).
- **`OnConfirm`** (L19875, decoded):
  ```powerfx
  UpdateContext({locIsVisibleSetPaidCost: false, locIsVisiblePopUpSpinner: true, locSpinnerInformationText: "Please wait..."});
  With({varGetContract: LookUp('CAPEX Project Contracts', 'CAPEX Project Contract' = GUID(DevexCapexSummaryPCF.SelectedCostContractId))},
      Patch('CAPEX Project Contracts', varGetContract, {'Linked Cluster': Blank()}););
  Select(Btn_CodeforSettingCostPaidUnpaid);
  true
  ```
  So it **clears the contract's `Linked Cluster` first**, then runs the paid write (§2.6).

### 2.6 `Btn_CodeforSettingCostPaidUnpaid` (L7656): the paid write and its feedback

The button is hidden (`Visible: =false`, L7768). Its `OnSelect` (L7661-7767):
1. Raises the loading popup with **`"Please wait, saving..."`** (L7662-7667).
2. Resolves the cost row for the contract, year and month (L7668-7737).
3. If no row matches, shows **Notify N3** (L7738-7744).
4. Otherwise runs `IfError(Patch('CAPEX Costs', varCostRecord, {'Cost Paid': DevexCapexSummaryPCF.SelectedCostPaid}); Refresh('CAPEX Costs'); Select(btn_Capex_Cost_Reload_PCF_After_Mutation_Code), Notify(N4))` (L7745-7758).
5. Clears the spinner (L7762-7767).

### 2.7 P5 · `cmp_Costs_PopUpLoading` (L18206) and P6 · `spn_LoadingSpinnerCost` (L19749)

#### `cmp_PopUp_Loading` (component)

- **Custom property:** `InformationText` (Input, Text, default `="Text"`) (`:13-19`).
- **Scrim:** `RGBA(0, 0, 0, 0.1)`, full size (`:21-28`).
- **Card `con_PopUpLoading_InformationArea`:** white, `Height: =240`, radius 5 on all corners, centred (`:30-42`). It sets no `Width`; the screenshot measures it at 500 px.
- **Spinner `spi_PopUpLoading_Spinner`:** **`AccessibleLabel: ="Waiting"`**, `Height: =If(InformationText = "", 120, 90)`, `Y: =50` (`:44-55`).
- **Label:** Segoe UI Semibold, `Size: =gblAppSizes.Font.Medium`, centred, `Tooltip: =Self.Text`, placed at `Y: =Spinner.Y + Spinner.Height + 10` (`:56-83`).

#### The instance P5

- `Visible: =locIsVisiblePopUpSpinner`. The `|| And(CountRows(colFinatCostDataOptimized) = 0, gblAppStarted)` tail is commented out, not live (L18216-18221).
- `InformationText: =If(CountRows(colFinatCostDataOptimized) = 0, "Please wait, loading data...", locSpinnerInformationText)` (L18211-18215). Whenever the grid collection is empty, **any** popup spinner reads "Please wait, loading data...".

**Every value it shows** (setters of `locIsVisiblePopUpSpinner: true` and `locSpinnerInformationText`):

| Trigger | Text | Line |
|---|---|---|
| Add Cost from Table button | `Please wait, loading cost ...` | L2573-2574 |
| Save, Individual, before validation | `Please wait, checking validation` | L17574 (decoded line 26) |
| Save, Equal, before validation | `Please wait, checking validations` | L17574 (decoded line 1237) |
| Save, Individual, saving | `Please wait, saving the cost...` | L17574 (decoded line 719) |
| Save, Equal, saving | `Please wait, saving costs...` | L17574 (decoded line 1491) |
| Paid dialog `OnConfirm` | `Please wait...`, replaced at once by the next row | L19875 |
| `Btn_CodeforSettingCostPaidUnpaid` | `Please wait, saving...` | L7665 |
| Comments Save | `Saving comments...` | L10140-10141 |
| Add Standard Contract code | `$"Please wait, loading standard contract : '{varStandardContractAssumption.Description}' ..."` | L18237-18238 |
| Hidden command bar (dead) | `Please wait, loading standard contract...` | L3318-3319, L3406-3407 |

#### P6 `spn_LoadingSpinnerCost` (L19749-19759)

- A plain `Spinner@1.4.6` with `Appearance: ='Spinner.Appearance'.Primary`. It has **no label text** and no `AccessibleLabel`.
- `Visible: =locIsVisibleLoadingCostSpinner`.
- Geometry: `X: =con_Costs_LeftNavigationMenu.Width+5`, `Y: =cmp_Costs_Header.Height`, `Width: =Parent.Width-con_Costs_LeftNavigationMenu.Width-5`, `Height: =Parent.Height-con_Costs_Footer.Height-Self.Y`. It covers the content area **including the tab strip and toolbar**, and leaves the header and left nav uncovered. The rest of the `Y` formula is commented out, not live (L19759).
- **Setters:**
  - `OnVisible` (L17);
  - `btn_Capex_Cost_Reload_PCF_After_Mutation_Code` (L726, cleared at L769-774);
  - `btn_Capex_Cost_Refresh_Capex_Cost_Code` (L1018);
  - the tab `OnSelect` (L2451);
  - the year dropdown, ◀ and ▶ (L2933, L2974, L3055);
  - the Delete `OnConfirm` (L8108);
  - `tmr_Capex_Initial_Load` (L782, decoded; it turns the spinner off at the end).
  - The "Show inactive" toggle also sets it (L2833, L2848), but that toggle is `Visible: false` (L2858-2860).

### 2.8 P7 · `cmp_ShowErrorInContract` (L19760): the in-panel error strip

- **Component** `cmp_Information_Button_PCF`. Custom properties (`:13-69`):
  - `Color` (Color, default black);
  - `ErrorTitle` (Text, default `$"Error: Duplicate or Non-existing Accounts"`);
  - `Items` (Table, three placeholder rows);
  - `MaxHeight` and `MaxWidth` (Number, 100);
  - `OnSelect` (Event);
  - `ToolTipVisibility` (Boolean, default `true`).
- **Tree:** a 32 px row with `pcf_ico_Information_Button`, a PowerCAT ActionButton with `IconName: ="Info"`, red `#d20532` icon and text, `Text: =…ErrorTitle`, right-aligned, and **`AccessibilityLabel: ="Data Invalid"`** (`:87-102`). Below it is an expandable tooltip box listing `Items` (`:103-153`) with a dismiss ✕ whose `AccessibleLabel` is `="Required fields"` (`:154-164`).
- **The instance** (L19760-19834):
  - `ToolTipVisibility: =false`, so only the 32 px row shows. `Height: =If(ToolTipVisibility, 432, 32)`, `Width: =220`.
  - Position: `X: =Parent.Width-Min(750, Parent.Width)`, which is the panel's left edge; `Y: =con_cost_RightPanel_Form_AddContract.Height-Self.Height-9`, which is the bottom of the panel, level with the footer.
  - `ErrorTitle` (L19765-19794):
    - `% Values`: `Total percentage is over 100%` / `Total percentage is below 100%`, from `Sum(ForAll(colNewEditPanelCost, TotalUI), Value)`;
    - `Absolute Values` with `Sum(TotalSave) = 0`: `No cost is allocated.`
  - `Visible: =And(locEditSaveButtonEnabled, rad_…DistributionType_1.Selected.Value = 'Individual Distribution', locShowErrorInContractCost, Len(Self.ErrorTitle) > 0)`. The scheme test and a `Not(Sum(…) = 100)` test in this formula are commented out, not live (L19818, L19820-19828).
- **Trigger.** `locShowErrorInContractCost: true` is set only in Save's Individual branch when `locValidCostInContract` is false (decoded lines 1223-1230; `//Notify("false run")` there is commented out, not live). `locValidCostInContract` is `Round(Sum(colNewEditPanelCost, TotalUI), 1) = 100` for `% Values` and `Sum(colNewEditPanelCost, TotalSave) > 0` for `Absolute Values` (decoded lines 489-503).
- **Cleared by:**
  - a successful save (decoded line 1187);
  - Cancel (L18179);
  - the header ✕ (L10334).

### 2.9 Every `Notify(...)` on the screen

Timeout constant: `gblAppConstants.NotifyTimeOut` is **500 ms**. It is set as `Set(gblAppConstants, {NotifyTimeOut: 500, Form: {…}})` inside `App.OnStart` (`App.pa.yaml:L205`, decoded).

| # | Line | Control and property | Condition | Verbatim text | Type | Timeout |
|---|---|---|---|---|---|---|
| N1 | L7373-7377 | `DevexCapexSummaryPCF.OnChange` (AddStandardContractTriggered) | No grid row matches `Self.SelectedRecordId` | `Please select a valid subaccount before adding a standard contract.` | Warning | `NotifyTimeOut` (500 ms) |
| N2 | L7385-7389 | same | A `CAPEX Project Contracts` row already exists for project + sub-account + assumption. The option is then removed from `colStandardContractOptionsForPCF` (L7390-7393) | `This standard contract is already created for this project and subaccount.` | Information | 500 ms |
| N3 | L7740-7744 | `Btn_CodeforSettingCostPaidUnpaid.OnSelect` | No `CAPEX Costs` row for the contract, year and month | `No monthly cost row found for selected contract/month/year.` | Warning | 500 ms |
| N4 | L7753-7757 | same | The `Patch`, `Refresh` or reload failed | `Could not update paid status. Please refresh and try again.` | Error | 500 ms |
| N5 | L8136-8139 | `cmp_PopUp_SubaccountCostsDeletion_Confirmation.OnConfirm` | `RemoveIf` or `Remove` failed | `"Error: Costs could not be deleted. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse` | Error | default (none passed) |
| N6 | L10211-10214 | `btn_Capex_Comment_Save.OnSelect` | Any comment write failed. On failure the panel **stays open**; only the success path closes it (L10208-10210) | `An error occurred while saving. Please try again.` | Error | default |
| N7 | L17574 (decoded lines 1151-1155 and 1840-1844) | Save `OnSelect`, Individual and Equal branches | `Patch('CAPEX Costs', ForAll(…))` failed. A `Trace("Error While Trying to Patch Data to Capex Cost: " & Concat(AllErrors, Message, ", "), TraceSeverity.Error)` runs first | `Something went wrong saving the Capex data. Please refresh the page and verify your changes were saved correctly.` | Error | `5000`. The canvas comment says "10 seconds"; the literal is 5 s |
| N8 | L18631-18635 and L18792-18796 | `btn_Capex_Cost_Add_Standard_Contract_Code.OnSelect` | `CountRows(colEligibleStandardCostClusters) = 0`, or no payments were generated | `Standard cost was not created because no applicable cost period was found for the project's Start Cluster.` | Information | 500 ms |

**Not live:**
- **Dead:** L3310-3314 and L3398-3402, `Standard contract is already being created. Please wait.` (Information, 500 ms). These are in the hidden `cmd_Costs_ProjectCosts_TableCommandBar` (`Visible: =false`, L3566, inside a container that is also `Visible: =false`, L3080).
- **Dead:** the copy of N7 in `btn_SaveCost_Execute____` (L17687, `Visible: =false` at L17692). It is never `Select`ed; the only `Select(...Save)` calls target the visible Save (L401, L20070).
- **Commented out, not live:**
  - `//Notify($"{Self.Selected.ItemStandardContract.'Description Input'}")` (L3392);
  - `//Notify("false run")` (L17574, decoded line 1223);
  - the `App.OnError` Notify (`App.pa.yaml:L199-204`);
  - the two Notifies in `pcf_ReportErrorRightPanel_BodyButtons_Save.OnChange` (`cmp_ReportErrorRightPanel.pa.yaml:401-418`).

**Errors the canvas does not catch.** These include the contract `Patch` in Save (decoded lines 1846-1863) and the `'Linked Cluster'` `Patch` in P3. They fall through to `App.OnError` (`App.pa.yaml:L188-198`), which stores `gblReportError` without a Notify. The only visible sign is the red ⚠ in `cmp_Header` (`cmp_Header.pa.yaml:495-505`, tooltip "An error has occurred! …"). See `01-EDIT-COST-MODULE.md`.

### 2.10 P8 · `cmp_ReportErrorRightPanel_CapexCosts` (L8081)

- **Instance:** `Visible: =gblShowReportProblemPanel`, full screen (L8081-8087). Opened from the header Help menu ("Report Problem", `cmp_Header.pa.yaml:519-539`).
- **Component** (`cmp_ReportErrorRightPanel.pa.yaml`):
  - **Chrome.** It has no custom properties. The scrim is **`RGBA(0, 0, 0, 0.7)`** (`:22`); the panel is `Width: =Min(560, Parent.Width)`, right-docked (`:31-39`); the header is themePrimary, `Height: =46`, with the title **`"Report Error"`** (`:41-72`) and a ✕ (Tooltip "Cancel") that sets `gblShowReportProblemPanel: false` (`:77-102`).
  - **Title field.** "Title" with a red `*` and a text input prefilled `If(!IsBlank(gblReportError), "Handled Error from the '"& …ErrorScreen & "' screen and the '"& …ErrorSource &"' control.","")` (`:145-213`).
  - **Description field.** "Description" with `*` and a rich-text editor prefilled with an HTML summary of user, timestamp, screen, source and message (`:232-316`).
  - **Buttons:**
    - "Cancel" (✕ icon);
    - **"Save"** (CheckMark icon), enabled only when both fields are non-blank (`:377-385`). Its flow call is **commented out, not live** (`:401-418`), so it only clears `gblReportError` and closes the panel. This is SOURCE DEFECT B-1 in `01-BUGS-FOUND.md`;
    - **"Clear Warning"** (Warning icon, width 130, `Visible: =!IsBlank(gblReportError)`), which sets `gblReportError` to `Blank()` (`:428-456`).

### 2.11 P10 · the month-cell popover inside the PCF

This is not a canvas control, but it is a popup the user sees on this screen.
- For an equal-distribution contract, clicking a month cell opens an info-only dropdown: **`Automatically distributed costs cannot be marked as paid or assigned payment date comments.`** (`GridRenderer.js:1268-1279`).
- Otherwise the dropdown offers "Set as paid" or "Set as unpaid", plus "Comments" (`:1281-1310`).
- The ••• row menu offers Edit, Comments and Delete (`ActionDropdown.js`, screenshot "three dots").
- The same text is in the shipped bundle (`_extracted/msapp/projectcosts/Resources/Controls/Dev.DevexCapexSummaryPCF.bundle.js`). See `14-PCF-CONTROLS.md`.

---

## 3. Code app implementation

### 3.1 The shared components

#### `components/ConfirmDialog.tsx` (424 lines)

This one component replaces both confirmation components.

**Prop mapping** (header comment, `:1-38`):
- `Title` → `title`, `Description` → `description`;
- `TextConfirmButton` → `confirmText`, `TextCancelButton` → `cancelText`;
- `WidthConfirmButton` → `confirmWidth`;
- `IconConfirmButton` → `confirmIcon`, `IconCancelButton` → `cancelIcon` (`"checkmark" | "delete" | "dismiss" | "none"`, `:255-263`);
- `BoxHeight` → `boxHeight`, `TextHeight` → `textHeight` (`:283-296`);
- `cmp_PopUp_Confirmation_New` → `variant="info"`, which adds the ⓘ block (`:163-171`, `:379-384`).

**Chrome** (`:50-246`):
- scrim 10 % (`:52`);
- card 450 px wide, 260 px fixed for the plain variant and 320 px default for `info` (`:66-84`);
- header 42 px, themePrimary (`:86-91`);
- title at 14.7 px (11 pt) semibold, white (`:92-97`);
- plain band 16/20/0/20, ⓘ band 16/10/16/10 (`:117-142`);
- ⓘ block `#E1ECF4`, square, no vertical padding, 12 px text (`:163-171`);
- buttons row 60 px with Confirm left of Cancel, 20 px apart (`:175-179`, `:392-431`);
- Confirm themePrimary with a hover to `hoverButton` (`:221-227`); Cancel 96 px, white with a themePrimary border (`:235-245`).

**Behaviour:**
- Fluent `Dialog` with `modalType="alert"` (`:355-359`). Escape calls `onCancel`; a backdrop click does nothing (alert dialogs ignore it). Focus is trapped inside.
- The header ✕ has `aria-label="Close"` and `data-testid="ico_PopUpConfirmation_BodyHeader_3"`, calls `onCancel`, and turns `themeLighter` **on hover** (`:99-108`, `:369-372`). It has no `title` tooltip.
- The buttons carry `aria-label={confirmText}` / `aria-label={cancelText}` and `data-testid="confirm-dialog-confirm"` / `"confirm-dialog-cancel"` (`:413-414`, `:424-426`).
- Optional props `destructive`, `busy`, `error`, `lockWhileBusy` and `canvasFooter` (D49) are **not used by any CAPEX dialog**. `canvasFooter` adds a top divider, a flat 4 px-radius surface and Land-Lease sizes (`:184-207`, `:311`). Its only caller is Land Lease (D49 §1).

**Tests:** `ConfirmDialog.test.tsx` (14 cases, no UT ids) pins the ✕-cancels behaviour, Confirm-then-Cancel order, width, bullets on separate lines, the ⓘ block, `BoxHeight`/`TextHeight`, and the plain and ⓘ padding.

#### `components/LoadingOverlay.tsx` (129 lines)

This replaces `cmp_PopUp_Loading`.
- Blocking mode: `position: fixed` scrim at 10 %, a 500 × 240 card with 5 px radius and no shadow (`:31-48`).
- The spinner box is 90 px with a label and 120 px without (`:50-61`). The spinner has `aria-label="Waiting"` (`:125`). The label is 14.7 px semibold, centred, `role="status"`, `aria-live="polite"` (`:63-74`, `:127-131`).
- `mode="inline"` is a code-app-only filler for a content area (`:80-84`, `:109-115`).
- Tests UT-LOADOVL-001 to 007.

#### Other shared surfaces

None of these is used by the CAPEX screen. A grep of `features/cost/capex-costs/` finds no reference to `useNotify`, `NoticeBar`, `WriteFeedback`, `PanelMessages`, `DisabledReason` or `UnsavedChangesGuard`.
- **`useNotify.tsx` / `AppToaster.tsx`.** These are the app's toast service: a top-end toaster, at most 4 visible, success and info for 5 s, warning for 10 s, and error until dismissed (`useNotify.tsx:52-57`, `AppToaster.tsx:15-24`).
- **`NoticeBar.tsx`, `WriteFeedback.tsx`, `PanelMessages.tsx`.** These are message-bar wrappers.

### 3.2 P2 Delete Contract: `Screen.tsx:977-987`

- **Trigger:** the PCF `"Delete"` action calls `setDeleting(id)` (`Screen.tsx:432`).
- **Copy:**
  - `title={MSG.deleteTitle}`, which is "Delete Contract";
  - `confirmText={MSG.deleteConfirm}`, "Confirm";
  - `cancelText={MSG.deleteCancel}`, "Cancel" (`panelRules.ts:454-470`);
  - `description={deleteContractDescription(line.description, subaccountName)}`, which gives `Are you sure you want to delete the costs for "${contractDescription}" of the selected Subaccount "${subaccountName}"?` (`panelRules.ts:491-497`).
- **Look:** default icons (✓ and ✕), plain variant, 450 × 260, not `destructive`. This matches the canvas, as D38 §3 asked.
- **Confirm** closes the dialog and calls `writes.deleteLine.mutate(line)` (`:984-987`).
- **`deleteCostLine`** (`data/capexWrites.ts:329-343`) deletes the comments, then each cost row, then the contract, all through `deleteRecord`. This ordering is marked DIVERGENCE (D38 §7 L-7).
- **Feedback** while the delete runs is the **blocking card `"Please wait, saving costs..."`** (`Screen.tsx:205`, `:1045-1049`; `SAVING_COSTS` is the fallback). A failure shows as raw text (§3.8).
- **Tests:** UT-CAPEXS-002 (copy) and UT-CAPEXS-008 (default dimensions); UT-CAPEXR-061 (comment collection).

### 3.3 P4 Relink / Cost Paid By confirmation: `Screen.tsx:999-1016`

- **Gate.** `commit()` opens the dialog when `needsLinkConfirmation` is true (`Screen.tsx:667-671`). `needsClusterLinkageConfirmation` (`rules.ts:1023-1036`) is the canvas `Or(...)`.
- **Flags** are derived from the form, not latched (`Screen.tsx:528-556`):
  - `clusterLinkageChanged` (`rules.ts:947-952`);
  - `costPaidByChanged`, which is `edit.payer !== storedLine.payer` (`Screen.tsx:536`);
  - `milestoneRelinkResetNeeded` (`rules.ts:970-978`), which returns true for `payments.some(p => p.paid) || paymentDateCommentCount > 0`. **The comment-count arm is not in the live canvas formula** (see §2.4 and GAP-POP-02).
- **Copy, title, label, width and heights** come from `clusterLinkageConfirmation` (`rules.ts:1093-1215`):
  - the three `locMsg` strings, verbatim, including the trailing space on `msg3` (`:1141-1144`);
  - the single-message and multi-message branches (`:1167-1180`);
  - the four-armed title (`:1196-1200`);
  - `BoxHeight` 200/250/280 and `TextHeight` 60/120/150 (`:1203-1204`);
  - "Confirm All" from the unfiltered count (`:1206-1212`);
  - width from `confirmButtonWidth` (`panelRules.ts:327-329`).
- **Look:** `variant="info"`, `confirmIcon="none"`, `cancelIcon="checkmark"` (`Screen.tsx:1002`).
- **Cancel** runs `setLinkConfirmOpen(false)`; the panel stays open (`:1015`).
- **Confirm** runs `setLinkConfirmOpen(false); persist()` (`:1016`). `persist()` closes the panel, then shows the saving card (`:605-606`), and passes `resetPaidAndPaymentDateComments: relinkResetNeeded` (`:649`).
- **The reset** in `saveCostLine` does two things (`capexWrites.ts:244-252`):
  - sets every paid month to unpaid, which matches the canvas `UpdateIf`;
  - **also deletes every "Comments to payment date" comment** on the contract. The live canvas does not do this (GAP-POP-03).
- **Tests:**
  - UT-CAPEXR-104, 107, 108, 109, 110, 111, 112, 117 and 119 (`rules.test.ts:859-1044`);
  - UT-CAPEXS-005 and 006;
  - the `Screen.test.tsx` cases "stops the save and asks when money sits in another cluster", "asks when Cost Paid By alone changes…", "titles the dialog Confirm Changes when the payer AND the link both moved" and "closes the panel when the relink dialog is confirmed, not before" (`:424-647`).

### 3.4 P3 Paid toggle on a cluster-linked cost: `Screen.tsx:1028-1036`

- **Trigger:** the PCF `"SetCostPaidUnpaid"` action (`Screen.tsx:434-451`). `resolvePaidTarget` (`rules.ts:846-855`) finds the cost row; if there is none, the user sees an `actionError` (§3.8). `paidToggleNeedsConfirmation` (`rules.ts:839-843`) returns `distribution === "individual" && linkedClusterOrder !== undefined`, which is the canvas test.
- **Copy:** `PAID_CONFIRM_TITLE` = "Cluster-linked Costs" and `PAID_CONFIRM_DESCRIPTION`, verbatim with U+2018/U+2019 (`panelRules.ts:259`, `:280-282`), marked SOURCE DEFECT for the title/body mismatch. `confirmText="Confirm"`; `cancelText` takes the default "Cancel".
- **Look:** `variant="info"`, `confirmIcon="none"`, `cancelIcon="checkmark"`, `boxHeight={200}`, `textHeight={75}` (`panelRules.ts:298`, `:308`).
- **Confirm** runs `writes.setPaid.mutate(paidRequest)` (`:1033-1035`). That calls `costRepository.setCostPaid` and then `capexWrites.setCostPaid`, which updates **only `vsb_costpaid` on the one cost row** (`costRepository.ts:317-322`, `capexWrites.ts:53-58`). **The contract's `Linked Cluster` is never cleared** (GAP-POP-01).
- **Feedback:** the saving card reads "Please wait, saving costs..." (`Screen.tsx:1045-1049`), where the canvas says "Please wait, saving...".
- **Tests:** UT-CAPEXS-007 (dimensions) and UT-CAPEXR-058 (gate). No test pins the `OnConfirm` write.

### 3.5 P5 Loading popup: `Screen.tsx:1045-1049`

- `busy` is `setPaid.isPending || saveLine.isPending || deleteLine.isPending` (`Screen.tsx:205`).
- The label is chosen in this order:
  1. `standardContractLoadingLabel(standardName)` (`panelRules.ts:250-251`), while a standard contract is being created (`Screen.tsx:416-420`);
  2. otherwise `savingLabel`, latched by `persist()` from `savingCostLabel(distribution)`: `SAVING_COST` "Please wait, saving the cost..." or `SAVING_COSTS` "Please wait, saving costs..." (`panelRules.ts:236-240`, `Screen.tsx:605`);
  3. otherwise `SAVING_COSTS`.
- **Order:** the panel closes before the write, as in the canvas (`Screen.tsx:590-606`). This is pinned by the `Screen.test.tsx` "the save spinner" cases (`:588-647`).
- **The overlay stays up** until the post-write invalidation has refetched. `invalidate` awaits `Promise.all([...invalidateQueries])` as the mutation's `onSuccess` (`useCostBook.ts:385-396`, `:401`, `:415`, `:420`). This matches the canvas, where the reload button runs before the spinner is cleared.
- **Comments** have their own `LoadingOverlay label="Saving comments..."` (`CommentsPanel.tsx:631`), raised after the panel is dismissed (`:459-460`).
- **Not produced by the code:**
  - "Please wait, checking validation" / "checking validations": validation is synchronous;
  - "Please wait, saving...";
  - "Please wait, loading cost ..." for Add Cost from Table, which navigates immediately (`Screen.tsx:711-715`);
  - "Please wait, loading data..." as the fallback for an empty grid. `LOADING_DATA` is used only for the inline Summary-tab loader (`Screen.tsx:692`). The `panelRules.ts:242` comment describes it as "what the Summary tab shows", which is not what the canvas formula at L18211-18215 does.

### 3.6 P6 Screen spinner

- **First load of a category:** `if (isLoading) return <LoadingOverlay mode="inline" label={LOADING_COST} />` (`Screen.tsx:301`). It replaces the whole screen body, tabs and toolbar included, with "Please wait, loading cost ...". The canvas P6 shows a spinner with no text over the same area.
- **Year change:** no spinner. The grid rebuilds from the cached book on the client (`Screen.tsx:230-235`, `PcfGrid.tsx:58-61`).
- **Tab revisit:** no spinner, because TanStack serves the cached data and refetches in the background.
- **Delete:** the blocking card, with the wrong text (§3.2).
- **The PCF's own placeholders** run inside the vendored renderer. "Loading project budget..." appears when `dataset.loading`, which is always false here (`PcfGrid.tsx:13`). A spinning **"Loading data…"** with `role="status"` appears when a category has no accounts after filtering (`GridRenderer.js:190-191`, `:1427-1437`). The canvas PCF behaves the same way.

### 3.7 P7 In-panel error strip: not implemented

There is no `cmp_ShowErrorInContract` equivalent and no "Total percentage is …" or "No cost is allocated." string anywhere in `src/` (grep). `canSaveContract` (`rules.ts:260-280`, `canPersistIndividual` at `:824-830`) **disables** Save instead, with no reason shown (GAP-POP-04; D38 §9 Q5; D39 §10 UX-9).

### 3.8 Notify equivalents

| # | Code behaviour | Where |
|---|---|---|
| N1 | `checkStandardContractClick` returns the verbatim text; the screen shows it with **`globalThis.alert(...)`**, a native browser modal | `standardContracts.ts:139-145`, `Screen.tsx:390-395`, UT-STD-022 |
| N2 | Same mechanism, verbatim text, `window.alert`. The option was already filtered out of the menu by `buildStandardOptions` (`standardContracts.ts:116-125`), so this only fires for a stale menu | `standardContracts.ts:146-150`, UT-STD-023 |
| N3 | `resolvePaidTarget` returns **`No monthly cost row found for the selected contract/month/year.`** (it adds "the "), shown as a persistent `<div className="canvas-error" role="alert">` at the bottom of the screen | `rules.ts:854`, `Screen.tsx:441-442`, `:1050` |
| N4 | The raw `DataError` message, e.g. `set cost paid failed: <SDK message>`, in the same `.canvas-error` div | `capexWrites.ts:54-57`, `platform/errors.ts:19-25`, `Screen.tsx:206`, `:1051-1053` |
| N5 | The raw `DataError` message (`delete CAPEX contract failed: …`) in the same div | `capexWrites.ts:340-342`, `Screen.tsx:1051-1053` |
| N6 | **Nothing.** `commit()` has `try { … } finally { setSaving(false) }` with no `catch`, after the panel is already dismissed. The rejection is unhandled and the user is told nothing | `CommentsPanel.tsx:450-519`, `:525` |
| N7 | The raw `DataError` message (`create CAPEX cost failed: …`) in the `.canvas-error` div. `persist()` swallows the rethrow on purpose (`Screen.tsx:651-654`). The verbatim canvas string already exists in `features/cost/add-costs-from-table/rules.ts:95` but is not used here | `Screen.tsx:642-657`, `:1051-1053` |
| N8 | Never shown. `buildStandardOptions` drops assumptions with no eligible cluster (`standardContracts.ts:126-127`), so the option never appears. `standardContractRefusal` (`:97-101`, UT-STD-014) holds the verbatim text but has no caller in `Screen.tsx` | n/a |

`.canvas-error` is `color: #a4262c; padding: 8px 20px; font-size: 13px` (`styles/canvas.css:275`). It has no dismiss control, no timeout and no `data-testid`. It stays until the same mutation runs again. The app's `useNotify` toast service is not used on this screen.

### 3.9 P8 Report Error: `features/shared/report-problem/ReportProblemPanel.tsx`

- Mounted once in `App.tsx:125` and opened from `AppHeader` ("Report Problem", `AppHeader.tsx:348`).
- A `FormPanel` with `width="narrow"`, title **"Report a problem"**, a warning MessageBar "This does not file a ticket yet…", empty Title and Description fields (`report-title` / `report-description`), a technical-details block, and the buttons **"Copy report"** (disabled until both fields are filled) and "Cancel" (`:81-145`).
- It has no "Clear Warning" button and no prefill from the last error.
- The SOURCE DEFECT B-1 is recorded in its header (`:1-21`).

### 3.10 P10 PCF popovers

The vendored renderer is unchanged (`GridRenderer.js:1247-1325`, `ActionDropdown.js:60+`), so these popovers have the same copy and behaviour. The ••• and Add buttons and the dropdown items have no `aria-label` or `data-testid` (see `05-UX.md`).

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-POP-C1 | P2 Delete dialog: trigger, title, description, captions, icons, 450 × 260 card | L7418-7421, L8092-8155; `cmp_PopUp_Confirmation.pa.yaml:69-255` | `Screen.tsx:977-987`; `panelRules.ts:454-497`; `ConfirmDialog.tsx:50-246` | UI | Covered | — | UT-CAPEXS-002, -008; D38 §3 resolved in code |
| GAP-POP-C2 | P4 Relink dialog: copy (both branches), title, Confirm/Confirm All, width, Box/Text heights, icon pair, Cancel keeps the panel open, close-then-spinner on Confirm | L19884-20178, L17574 (decoded lines 692-714 and 1466-1486) | `rules.ts:1093-1215`; `panelRules.ts:327-329`; `Screen.tsx:999-1016`, `:590-671` | UI/UX | Covered | — | UT-CAPEXR-107…119, UT-CAPEXS-005/006; D39 UX-1, UX-2, UX-8 |
| GAP-POP-C3 | P3 Paid dialog: gate, title, verbatim body (with the canvas mismatch), 200/75, icon pair | L7422-7437, L19864-19883 | `rules.ts:839-843`; `panelRules.ts:259-308`; `Screen.tsx:1028-1036` | UI | Covered | — | UT-CAPEXR-058, UT-CAPEXS-007; D39 UX-3 |
| GAP-POP-C4 | P5 Loader chrome and the save texts "saving the cost..." / "saving costs..." / standard-contract text; panel closes before the spinner | `cmp_PopUp_Loading.pa.yaml:21-83`; L17574 (decoded lines 719, 1491); L18237 | `LoadingOverlay.tsx:31-135`; `panelRules.ts:236-251`; `Screen.tsx:605-606`, `:1045-1049` | UI/UX | Covered | — | UT-LOADOVL-001…007; Screen.test "the save spinner"; D39 UX-7 |
| GAP-POP-C5 | P1 dead dialog not ported | L425-427 | none | — | Covered | — | Correct |
| GAP-POP-01 | P3 `OnConfirm` effect | Patches `'CAPEX Project Contracts'` `{'Linked Cluster': Blank()}`, then sets paid (L19875) | Only `vsb_costpaid` on one cost row (`Screen.tsx:1033-1035`, `costRepository.ts:317-322`, `capexWrites.ts:53-58`); the link stays | Functional | Missing | High | The dialog promises "will remove the … link"; the code does not remove it. `gap-analysis` S12 calls this COVERED |
| GAP-POP-02 | P4 trigger `locMilestoneRelinkResetNeeded` | Counts paid `CAPEX Costs` only (L11468-11479) | Also true when the contract has a "Comments to payment date" comment (`rules.ts:970-978`, `Screen.tsx:537-544`) | Functional | Divergent-unmarked | Med | UT-CAPEXR-104 pins the code version. The doc comment at `rules.ts:960-965` quotes a comment clause that is not in the live formula |
| GAP-POP-03 | P4 `OnConfirm` reset | `UpdateIf(…'Cost Paid' = false)` only; the `RemoveIf('Capex Comments', … 'Comments to payment date')` is commented out, not live (L20061-20065) | Also deletes every payment-date comment on the contract (`capexWrites.ts:248-251`) | Data | Divergent-unmarked | High | Irreversible data loss the canvas does not cause. The behaviour matches the **dead** P1 (L396-399). `gap-analysis` B11 asserts the canvas does it |
| GAP-POP-04 | P7 in-panel error strip | `Total percentage is over 100%` / `…below 100%` / `No cost is allocated.` after a failed Save (L19760-19834; decoded lines 1223-1230) | No strip; Save is disabled with no reason (`rules.ts:260-280`) | UX | Missing | Med | D38 §9 Q5, D39 UX-9, `gap-analysis` S15. The user cannot find out why Save is grey |
| GAP-POP-05 | Delete feedback | P6 spinner with no text over the content area (L8108, L19749-19759) | Blocking 500 × 240 card reading "Please wait, saving costs..." (`Screen.tsx:205`, `:1045-1049`) | UX | Divergent-unmarked | Low | Wrong text for a delete |
| GAP-POP-06 | Paid-toggle feedback | "Please wait, saving..." (L7665; "Please wait..." first, L19875) | "Please wait, saving costs..." (`Screen.tsx:1048`) | UX | Divergent-unmarked | Low | Rule 7 |
| GAP-POP-07 | Validation spinner | "Please wait, checking validation" / "…validations" (L17574, decoded lines 26 and 1237) | Not shown; validation is synchronous | UX | Missing | Low | Probably acceptable; needs a recorded decision |
| GAP-POP-08 | Loader fallback text | `If(CountRows(colFinatCostDataOptimized) = 0, "Please wait, loading data...", locSpinnerInformationText)` (L18211-18215) | `LOADING_DATA` used only by the Summary-tab inline loader (`Screen.tsx:692`) | UX | Partial | Low | The comment at `panelRules.ts:242` misdescribes the canvas |
| GAP-POP-09 | N3 "no monthly cost row" | Warning toast, `No monthly cost row found for selected contract/month/year.`, 500 ms (L7740-7744) | `…for the selected contract/month/year.` as a persistent red div (`rules.ts:854`, `Screen.tsx:1050`) | UX | Divergent-unmarked | Low | Rule 7 wording, plus a different surface. `gap-analysis` D13 calls it COVERED |
| GAP-POP-10 | N4 paid error | `Could not update paid status. Please refresh and try again.` (L7753-7757) | Raw `set cost paid failed: <SDK text>` (`errors.ts:19-25`, `Screen.tsx:1051-1053`) | UX | Divergent-unmarked | Med | Canvas copy lost; SDK text shown to the user |
| GAP-POP-11 | N7 save error | `Something went wrong saving the Capex data. Please refresh the page and verify your changes were saved correctly.`, 5000 ms (L17574, decoded lines 1151 and 1840) | Raw `DataError` text (`Screen.tsx:651-654`, `:1051-1053`) | UX | Divergent-unmarked | Med | The string already exists in `add-costs-from-table/rules.ts:95` (rule 17: reuse) |
| GAP-POP-12 | N5 delete error | `"Error: Costs could not be deleted. Internal error: originated on " & Source & ". Message: " & Message & HttpResponse` (L8136-8139) | Raw `DataError` text | UX | Divergent-unmarked | Low | The prefix copy is lost |
| GAP-POP-13 | N6 comments save error | `An error occurred while saving. Please try again.`; the panel stays open on failure (L10144-10215) | Panel already closed; `try/finally` with no `catch`; no message (`CommentsPanel.tsx:450-519`) | UX/Functional | Missing | High | A failed comment save is silent, the same bug class as rule 3. See `09-COMMENTS-PANEL.md` |
| GAP-POP-14 | N1/N2 standard-contract notices | Information/Warning toast, 500 ms (L7373-7389) | `globalThis.alert(...)`, a blocking native modal (`Screen.tsx:395`) | UX | Divergent-unmarked | Low | Text verbatim (UT-STD-022/023) |
| GAP-POP-15 | N8 "Standard cost was not created …" | The option is offered, then refused with a toast (L18610-18635, L18780-18796) | The option is hidden up front (`standardContracts.ts:126-127`); `standardContractRefusal` has no caller | UX | Divergent-unmarked | Low | The user never learns why an assumption is missing |
| GAP-POP-16 | Notification surface in general | Power Apps toasts that auto-dismiss (`NotifyTimeOut: 500` ms, `App.pa.yaml:L205`; 5000; default) | A persistent `.canvas-error` div with no dismiss and no testid (`Screen.tsx:1050-1056`, `canvas.css:275`); the app's `useNotify` (`useNotify.tsx:52-57`) is not used | UX | Divergent-unmarked | Med | Hard for Tosca to target. The 500 ms canvas timeout is itself questionable (§5) |
| GAP-POP-17 | P8 Report Error panel | Title "Report Error"; Title/Description prefilled from `gblReportError`; "Save" (closes only); "Clear Warning"; 560 px; 0.7 scrim (`cmp_ReportErrorRightPanel.pa.yaml`) | Title "Report a problem"; empty fields; "Copy report"; no Clear Warning; `narrow` panel (`ReportProblemPanel.tsx:81-145`) | UI/Functional | Partial | Low | Save→Copy is marked (B-1); the title wording, missing prefill and missing Clear Warning are unmarked. D39 UX-10 (not yet compared) |
| GAP-POP-18 | Dialog ✕ chrome | `Tooltip: ="Cancel"`; `HoverColor: =Self.Color`; `PressedColor: themeLighter`; name `ico_PopUpConfirmation_BodyHeader` (plain) / `_3` (New) (`:129-144`; `_New:145-160`) | `aria-label="Close"`, no tooltip, themeLighter **on hover**, testid `ico_PopUpConfirmation_BodyHeader_3` for both variants (`ConfirmDialog.tsx:99-108`, `:369-372`) | UI | Divergent-unmarked | Low | The plain Delete dialog carries the New component's icon name |
| GAP-POP-19 | Dialog button identities | `pcf_PopUpConfirmation_BodyButtons_Confirm` / `_Cancel` (plain), `…_Confirm_1` / `_Cancel_1` (New) | `confirm-dialog-confirm` / `confirm-dialog-cancel` for every dialog (`ConfirmDialog.tsx:414`, `:426`) | UX | Partial | Low | Rule 16 prefers canvas names. Safe only while one dialog is open at a time |
| GAP-POP-20 | Keyboard dismissal of dialogs | No Escape handling; scrim inert | Escape = Cancel; focus trap (`ConfirmDialog.tsx:355-359`) | UX | Code-app-only | Low | An improvement; the Cancel semantics match |
| GAP-POP-21 | Delete write set | Comments, then the contract; cost rows by cascade (`RemoveIf('CAPEX Costs')` is commented out, not live, L8122-8126) | Comments, each cost row, then the contract, via `deleteRecord` (`capexWrites.ts:329-343`) | Data | Divergent-marked | Low | D38 §7 L-7 |
| GAP-POP-22 | Uncaught errors | Fall to `App.OnError` → `gblReportError` → header ⚠ (`App.pa.yaml:L188-198`) | Thrown `DataError` → `.canvas-error` div; `lastError()` feeds the header ⚠ (`AppHeader.tsx:324`) | UX | Partial | Low | See `01-EDIT-COST-MODULE.md` |

**Counts.** 22 non-Covered rows, plus 5 Covered row groups.

| By status | Count | Rows |
|---|---|---|
| Missing | 4 | POP-01, 04, 07, 13 |
| Divergent-unmarked | 12 | POP-02, 03, 05, 06, 09, 10, 11, 12, 14, 15, 16, 18 |
| Partial | 4 | POP-08, 17, 19, 22 |
| Divergent-marked | 1 | POP-21 |
| Code-app-only | 1 | POP-20 |
| Covered (row groups) | 5 | POP-C1 … C5 |

| By severity (non-Covered) | Count | Rows |
|---|---|---|
| High | 3 | POP-01, 03, 13 |
| Med | 5 | POP-02, 04, 10, 11, 16 |
| Low | 14 | POP-05, 06, 07, 08, 09, 12, 14, 15, 17, 18, 19, 20, 21, 22 |

---

## 5. Open questions / not verifiable from source

1. **`NotifyTimeOut: 500`.** Does the canvas player really hide the Information, Warning and Error toasts (N1-N4, N8) after half a second? If so, users of the canvas app hardly ever read them. Before porting a "faithful" duration, check this in a live run.
2. **`IconConfirmButton: ="Text"`.** It renders no icon in the screenshot; confirm this is true for every PowerCAT Icon version in the solution.
3. **Divider line.** The relink screenshot shows a thin line between the description band and the buttons. Neither component's YAML defines a border there (`_New:222-237` has `BorderStyle: =BorderStyle.None` on the buttons container). It may be the scroll container's edge. Decide whether CAPEX should use `canvasFooter` (D49 §1, "Other screens").
4. **`cmp_PopUp_Loading` card width.** The YAML sets none; the code's 500 px comes from screenshot measurement (`LoadingOverlay.tsx:18-21`). Re-measure in a live run.
5. **P7 position.** It sits at the panel's bottom-left, beside the footer. Does it collide with the Save/Recalculate/Cancel row at narrow widths? Needs a live run.
6. **Is the paid dialog's unlink (GAP-POP-01) intended for un-paying too?** The canvas shows the dialog and clears the link even when the user picks "Set as unpaid" (L7422-7437 does not check the direction). Ask the product owner before porting.
7. **GAP-POP-03.** Was commenting out the `RemoveIf` in P4 (L20061-20065) a deliberate product change, made when P1 was retired? Bug 13772's note at L20067 suggests P4 was edited recently. The code currently reproduces the older behaviour.

## 6. Doc disagreements

| Doc | Claim | Source says |
|---|---|---|
| `gap-analysis/cost-capex-costs.md` S12 | Paid dialog "confirming clears the link for the whole contract", COVERED | The code does not clear the link (`Screen.tsx:1033-1035`, `capexWrites.ts:53-58`) |
| `gap-analysis/cost-capex-costs.md` B11 | Relink `OnConfirm` "optionally resets paid rows and payment-date comments", COVERED | The live canvas removes no comments (L20061-20065 are commented out, not live). Only the dead P1 did (L396-399) |
| `gap-analysis/cost-capex-costs.md` U9 | The code's delete dialog says "Delete Cost" / "Delete" / "Delete this cost and its monthly values?" | It now says "Delete Contract" / "Confirm" with the verbatim description (`panelRules.ts:454-497`). The row is stale |
| `gap-analysis/cost-capex-costs.md` D13 | No-row paid case COVERED | Wording differs ("the selected") and the surface differs (red div vs toast) |
| `gap-analysis/cost-capex-costs.md` S16 | Spinners COVERED | Delete and paid feedback use the wrong text (GAP-POP-05, 06) |
| `02-OPEN-DECISIONS.md` D38 §2 H-2 | `capexWrites.ts` calls the generated `delete()` directly | Every CAPEX delete now goes through `deleteRecord` (`capexWrites.ts:290`, `:338`, `:340-342`). The entry lags the code |
| `rules.ts:955-965` (doc comment) | `locMilestoneRelinkResetNeeded` includes `CountRows(Filter('Capex Comments', …)) > 0` | The live formula (L11468-11479) has only the paid-cost count |
| `panelRules.ts:242` (doc comment) | `LOADING_DATA` is "what the Summary tab shows before its totals land" | In the canvas it is the popup loader's fallback whenever `colFinatCostDataOptimized` is empty (L18211-18215) |
| `Screen.tsx:990`, `:1019` (comments) | Cite `:19853-19980` / `:19833-19852` | Those are `CapexScreenCode.txt` lines. The `.pa.yaml` instances are at L19884 and L19864 (`rules.ts:1061-1062` acknowledges this) |
| `ConfirmDialog.tsx:3-4` | "the Capex screen's several instances … (7 instances of `cmp_PopUp_Confirmation` alone)" | The CAPEX screen has 2 instances of `cmp_PopUp_Confirmation` (L303 dead, L8088) and 2 of `_New` (L19864, L19884). The 7 must be an app-wide count |
