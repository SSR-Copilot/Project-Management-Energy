# Gap analysis — Grid Operator Screen (PM)

- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Grid Operator Screen.pa.yaml` (1 713 lines, read in full). "L" = line in this file.
- Components used: `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Confirmation`, `cmp_ReportErrorRightPanel`, `fn_Numeric` (IsOneDecimal / IsThreeDecimal, `Components/fn_Numeric.pa.yaml`). Globals: `gblAppConstants.DefaultMaxLength = 55` (App.pa.yaml:1184), `gblAppResx.NumericOneDecimals` / `NumericThreeDecimals` (App.pa.yaml:1629/1631).
- Code: `ProjectCosts-CodeApp/src/features/pm/grid-operator/` — `Screen.tsx` (197 lines), `rules.ts` (789), `hooks.ts` (48), `rules.test.ts` (50 `it`), `Screen.test.tsx` (4 `it`).
- State: UI built, not connected (D14). Both hooks return `notConnected()`; Save has no handler.
- `ProjectDocs/reference/dataverse-attributes.json` has **no `vsb_GridOperator` entity**, so none of the column logical names in `rules.ts:45-61` can be verified against the reference (rules.ts says they came from `customizations.xml`). `vsb_gridoperators` is **not** in `power.config.json`; `vsb_projects` is.

Legend: COVERED / PARTIAL / MISSING / WRONG (WRONG quotes canvas vs code).

## 1. Data

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| D1 | `Screen.OnVisible` L23-29: re-read `gblRecordSelectedProject` = `LookUp(Projects, Project = …)`; fields used: `'Project ID'`, `'End Date'`, `'Project Start Date'`, `'Total Capacity'`, `'Net Yield p50'`, `'Cluster State'.Name`, `'Besitzer (Unternehmenseinheit)'` | `hooks.ts:42-44` returns `notConnected(NO_PROJECT)`; query plan in JSDoc `hooks.ts:10-14` | MISSING | Expected under D14. Plan defect: the JSDoc `$select` lists `vsb_internalprojectid` ("Internal Project ID"), but the canvas tests `'Project ID'`, which is **`vsb_name`** in `dataverse-attributes.json` (vsb_Project). The other columns check out (`vsb_enddate`, `vsb_projectstartdate`, `vsb_totalcapacity`, `vsb_netyieldp50`, `vsb_clusterstate`). |
| D2 | `OnVisible` L30-50: `CanEditSelectedProject = And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(gblRecordSelectedProject, EditPermission), false))` | `hooks.ts:36-40` `canEdit: false` | MISSING | No privilege-check helper is named. Needs a decision on how the code app derives "create on Projects AND edit on row" (RetrievePrincipalAccess or role check). |
| D3 | `OnVisible` L54-60: `gblRecordGridOperator = LookUp('Grid Operators', Project.Project = gblRecordSelectedProject.Project)` (one row or blank) | `hooks.ts:46-48` returns `null`; plan `hooks.ts:15-21` (`$top=1`, `_vsb_projectid_value eq`) | MISSING | Plan is right in shape. The `vsb_projectid` lookup name is unverified (not in the reference). |
| D4 | Column display names: Operator, 'Voltage level [kV]', 'Expansion Required', 'Expansion Details', 'Substation Construction Required', 'Substation Operator', 'Length/Diameter internal/external cabeling', Project, 'Owning Business Unit' | `rules.ts:45-67` `GRID_OPERATOR_COL` / `GRID_OPERATOR_LOOKUP` | PARTIAL | Mapped, but not checkable against `dataverse-attributes.json` (the entity is missing). Add the entity to the reference or confirm via `pac code add-data-source` schema diff. |
| D5 | `drp_…GridExpansionRequired.Items = Choices('Grid Expansion Required')` L817; `drp_…SubstationConstruction.Items = Choices('Substation construction required')` L964 | `rules.ts:710-717` `YES_NO_UNKNOWN` from `CHOICE_PROCESS.yesNoUnknown` (`dataverseNames.ts:174-178`, 952850000/1/2) | PARTIAL | These are two option sets. The code assumes both have the same Yes/No/Unknown values and labels. Not verifiable from the reference. The labels are hard-coded, not metadata labels. |
| D6 | Save `pcf_…ButtonsSave.OnChange` L1555-1576: `Patch('Grid Operators', If(IsBlank(rec), Defaults(…), rec), {Project, Operator, 'Voltage level [kV]': Value(…), 'Expansion Required': .Selected.Value, 'Expansion Details', 'Substation Construction Required', 'Substation Operator', 4× cabeling Value(…), 'Owning Business Unit': project.'Besitzer (Unternehmenseinheit)'})` | `rules.ts:649-676` `buildPayload` | PARTIAL | All 10 data columns are present. DIVERGENCE: `Project` and `Owning Business Unit` are bound only on create (`rules.ts:667-674`), but the canvas writes both on every save. This is not logged in 02-OPEN-DECISIONS. The payload is never executed (no mutation). |
| D7 | Save L1578-1584: re-`LookUp('Grid Operators', …)` after the Patch | none | MISSING | Needs a query invalidation after the mutation. |
| D8 | Data source registration | `TABLES = [ES.projects, ES.gridOperators]` `hooks.ts:32` | MISSING | `vsb_gridoperators` is not in `power.config.json`. |

## 2. Behaviour

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| B1 | `OnVisible` L64: `locGridOperatorTabSelected = "operatorTab"` on every visit | `Screen.tsx:67-68` `parseTab(params.get("tab"))` | PARTIAL | DIVERGENCE (documented at `rules.ts:18-19`, not in D15): the tab persists through `?tab=` instead of resetting on each visit. |
| B2 | `tab_…TabList.OnSelect` L552-553 | `Screen.tsx:151` | COVERED | |
| B3 | `OnVisible` L79-137: seed of the 10-row `colGridOperatorFormValidation` (Dirty false, Valid true) | `rules.ts:290-316` `validateForm` + `touched` (`Screen.tsx:77`) | COVERED | Derived state replaces the collection. |
| B4 | `OnVisible` L138-152: reset all 10 inputs when there is no record | `rules.ts:479-502` `toForm(null)` → `emptyForm()` | COVERED | |
| B5 | Field `OnChange` → `UpdateIf(col, Name=…, {Valid, Dirty: true})` (L645, 749, 818, 883, 965, 1020, 1131, 1238, 1344, 1450) | `Screen.tsx:87-90` `setField`; `rules.ts:517-525` `dirtyFields` (diff to baseline) | PARTIAL | DIVERGENCE: in the canvas, any edit stays dirty even if typed back to the original value; the code compares with the baseline instead. The canvas Operator handler updates the `"GridExpansionRequired"` row (L648, a SOURCE DEFECT); the code fixes it (`rules.ts:507-516`), but D15 does not list it. |
| B6 | Save L1551-1600: `IfError(Set(Patch…); Set(LookUp…); UpdateContext({locAllowGridOperatorReset:false}); UpdateIf(col,true,{Dirty:false}); Notify(success), Notify(error))` | `Screen.tsx:165-172` has no `onClick`; no `useMutation` in `hooks.ts` | MISSING | Expected under D14. The skeleton reference has a `useMutation` (`skeleton-reference/…/hooks.ts:197`). |
| B7 | `Notify("Grid operator data was saved successfully!", Success, 1000)` L1591-1595 | `rules.ts:175` `SAVE_SUCCESS` (constant only, never rendered) | MISSING | |
| B8 | `Notify("Error: Grid operator data could not be saved. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse, Error)` L1596-1599 | `rules.ts:176-180`: JSDoc "NEW — no canvas equivalent: … the canvas only had the success toast"; `SAVE_ERROR_PREFIX = "Error: Grid operator data could not be saved."` | WRONG | The canvas does have this error Notify. The code comment is wrong, and the canvas text continues "Internal error: originated on …". The code also never renders it. |
| B9 | Cancel `pcf_…ButtonsReset.OnChange` L1645-1662: reset 10 inputs + `Dirty:false` | `Screen.tsx:91` `onCancel` | COVERED | |
| B10 | Leave guard: `cmp_…Header.OnLogoClick` L184-197 and `cmp_…Left_Navigation.OnSelect` L254-277 open `locLeaveGridOperatorConfirmationDialog` when any row is dirty | `Screen.tsx:78` `leaveOpen` is never set true; there is no router blocker; `rules.ts:534-537` `shouldPromptOnLeave` is unused | MISSING | Needs `useBlocker` (or the shell's equivalent) driven by `shouldPromptOnLeave`. |
| B11 | `cmp_PopUp_Leave_…OnConfirm` L1679-1703: close, then Navigate to the left-nav target or 'Project Main Screen'; `OnCancel` L1677-1678 closes | `Screen.tsx:186-194`: both buttons only close | MISSING | Confirm must let the blocked navigation proceed. |
| B12 | Header, left-nav expand, report-problem panel (`cmp_ReportErrorRightPanel_GridOperator` L1707-1713, `gblShowReportProblemPanel`) | App shell (`components/AppHeader.tsx`, `features/shared/report-problem/ReportProblemPanel.tsx`) | COVERED | Shell-owned. |

## 3. State gates, validation and messages

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| S1 | `con_Milestones_Page_LockMessage_6.Visible` L347-363: `IsBlank('Project ID') OR IsBlank('End Date') OR TotalCapacity 0/blank OR NetYieldP50 0/blank OR ClusterState blank/"Draft"` | `rules.ts:359-403` `pageLock` / `isPageLocked`; `Screen.tsx:138` | COVERED | |
| S2 | Bullet labels + Visible L414-513: title "This page is locked. To unlock it, please complete the following sections:", "• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft" | `rules.ts:330-331`, `368-398`; `Screen.tsx:142-143` | COVERED | All verbatim. The `hint` strings are code-only and not rendered. |
| S3 | Lock `Height` L301-339 tests 'Project Start Date' (SOURCE DEFECT vs Visible) | `rules.ts:347-357`, `409-419` | COVERED | Resolved to 'End Date'. This is a layout-only formula. |
| S4 | `tab_…TabList.DisplayMode` L538-547: Disabled if Cluster State blank/"Draft" or the lock is visible | `rules.ts:470-471` `canSwitchTabs`; `Screen.tsx:150` | COVERED | |
| S5 | Operator-tab field `DisplayMode` (L632-641, L739-748, L807-816, L870-879): same expression; **no** `CanEditSelectedProject` term | `rules.ts:453-458` `canEditField` adds `canEdit`; `Screen.tsx:81,95` | PARTIAL | DIVERGENCE: the code also disables fields for a user without edit rights (`rules.ts:449-451`). It is not logged in D15. |
| S6 | Grid Connection fields (L954-1481) have **no** `DisplayMode` | `rules.ts:436-447` gates them the same way | PARTIAL | DIVERGENCE pending product sign-off (`rules.ts:446`), but it is not in 02-OPEN-DECISIONS D15. |
| S7 | `pcf_…ButtonsSave.DisplayMode` L1508-1533: CanEdit AND ClusterState<>"Draft" AND no Valid=false row AND ≥1 Dirty AND 4 cabling error labels hidden AND lock hidden | `rules.ts:578-586` `canSave`; `Screen.tsx:84` | COVERED | It also blocks on the voltage error, a documented fix (`rules.ts:572-577`). |
| S8 | `pcf_…ButtonsReset.DisplayMode` L1614-1627: `locAllowGridOperatorReset AND ≥1 Dirty`; `locAllowGridOperatorReset` becomes false after a save (L1585) | `rules.ts:616-622`; `Screen.tsx:85` passes `allowReset: true` (hard-coded) | PARTIAL | The `allowReset` state is missing. In the canvas, Cancel stays disabled for the rest of the visit after a save. |
| S9 | `lbl_…GridVoltage_ErrorMessage` L701-732: "Value must be numeric." when not blank AND (not IsNumeric OR contains ",") | `rules.ts:154`, `231-237`; `Screen.tsx:118` | COVERED | |
| S10 | Length error labels L1072-1124, L1286-1337: `gblAppResx.NumericThreeDecimals` ("Numeric value with maximum of three decimals") first, then "Please select a value between 0 and 99." | `rules.ts:156`, `163`, `248-255` | COVERED | |
| S11 | Diameter error labels L1179-1231, L1392-1443: `NumericOneDecimals` ("Numeric value with maximum of one decimals"), then "Please select a value between 0 and 999." | `rules.ts:158`, `168`, `266-273` | COVERED | The SOURCE INCONSISTENCY with the "#0.0#" display format is noted at `rules.ts:260-264`. |
| S12 | `fn_Numeric.IsOneDecimal/IsThreeDecimal` branch on `Language()` ("en" → ".", else ","); `IsNumeric`/`Value` are locale-dependent | `Screen.tsx:82` `validateForm(form, touched)` with no language (the default is "en-US", `rules.ts:293`) | PARTIAL | The session locale is not passed, so a German user is validated as en-US. The skeleton passed `language` (`skeleton-reference/…/Screen.tsx:92`). |
| S13 | Numeric `Valid` row = `And(Not(IsBlank), IsNumeric)` (a blank, touched numeric field blocks Save with no message) | `rules.ts:295-302` | COVERED | |
| S14 | Load-error / loading state (CONVENTIONS rule 19; screen `LoadingSpinner` L19) | none in `Screen.tsx` | MISSING | It is due when the screen is connected (D17 i). |

## 4. UI

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| U1 | `tab_…TabList` AccessibleLabel "tab_GridOperator_DisplayProjectBodyRightContent_TabList" (L536) | `Screen.tsx:152-153` | COVERED | |
| U2 | Tab captions "Grid Operator" / "Grid Connection" (L65-73) | `rules.ts:688-691`; `Screen.tsx:155` | COVERED | |
| U3 | Field AccessibleLabel = the control name, e.g. `="txt_GridOperator_DisplayProjectBodyRightContent_GridOperator"` (L630, 736, 800, 868, 957, 1015, 1128, 1235, 1341, 1447) | `Screen.tsx:106`, `124`: `aria-label={label}`, i.e. "Grid Operator", "Grid voltage level [kV]" … | WRONG | CONVENTIONS rule 16 says use the literal AccessibleLabel verbatim. It should be `aria-label={FIELD_CONTROL[f]}`. The canvas-identity gate does not catch it because the expression is computed. |
| U4 | `data-testid` = control names | `rules.ts:750-761`; `Screen.tsx:107`, `125` | COVERED | |
| U5 | Save/Cancel `AccessibilityLabel` = "pcf_GridOperator_DisplayProjectBodyRightContent_ButtonsSave" (L1506) / "…ButtonsReset" (L1612) | `Screen.tsx:168`, `178`: `aria-label={SCREEN_MSG.save}` = "Save" / "Cancel" | WRONG | Rule 16. The `data-testid` values are right. |
| U6 | Save/Cancel text "Save" / "Cancel", tooltips "Filter projects details list view." (sic) / "Reset values form fields back." (L1601, 1604, 1663, 1665) | `rules.ts:764-779`; `Screen.tsx:164-183` | COVERED | |
| U7 | Button icons `IconName "CheckMark"` / `"Cancel"`; Save primary fill, Cancel outline (L1535-1547, L1613-1641) | `Screen.tsx:165-181`: no icons | PARTIAL | |
| U8 | Field captions verbatim (L664, 777, 845, 902, 992, 1051, 1159, 1266, 1372, 1478) | `rules.ts:726-747` | COVERED | The canvas spelling "cabeling" is kept. |
| U9 | Operator, Grid expansion details, Substation operator are `Mode: Multiline`, Height 64 (L644, 882, 1019) | `Screen.tsx:119` renders all text fields as a single-line `<Input>` | WRONG | Should use `TextAreaField` from `@/components` (rule 17). |
| U10 | `MaxLength: gblAppConstants.DefaultMaxLength` (55) on the 3 text inputs (L643, 881, 1018) | No `maxLength` on the input; truncated only in the payload (`rules.ts:638-639`) | PARTIAL | A user can type more than 55 characters (the counter shows e.g. 70/55). |
| U11 | Counter `$"{Len(value)}/{DefaultMaxLength}"`, right-aligned on the label row (L668-679, 906-917, 1034-1045) | `rules.ts:720-721`; `Screen.tsx:128` renders it below the input | PARTIAL | The text is right but the placement is not. |
| U12 | Placeholder "0" on voltage + 4 cabling inputs (L761, 1143, 1250, 1356, 1462) | `Screen.tsx:121` | COVERED | |
| U13 | Display `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0#"))` (voltage, diameters) / `"#0.0##"` (lengths) (L763-768, 1145-1150, 1252-1257, 1358-1363, 1464-1469) | `rules.ts:196-208`: "Truncate rather than round" | WRONG | Power Fx `Text(1.2345,"#0.0##")` **rounds** (1.235); the code returns `1.234`. The comment cites the spec test UT-GRIDOP-005 rather than the canvas. Needs a decision (see the questions). |
| U14 | Dropdown display of the `Value` field (L831-839, L978-986); `DefaultSelectedItems` from the record | `Screen.tsx:97-111` | COVERED | Depends on D5. |
| U15 | Lock banner `Fill: RGBA(89,89,89,1)`, white text and white lock icon, `PaddingLeft 20` (L299, 372, 410) | `Screen.tsx:45-49` `backgroundColor: palette.neutralLighter` (#f3f2f1), default text colour | WRONG | Dark grey with white text in the canvas; light grey with black text in the code. D17 f proposes a shared `PageLockNotice`. |
| U16 | Each tab is a single vertical column, `Width: Min(380, Parent.Width)` (L609, L936), fields stacked | `Screen.tsx:51-54` two-column grid `"1fr 1fr"` | WRONG | Layout differs from the canvas. |
| U17 | Button bar right-aligned, gap 10, height 50 (L1482-1500) | `Screen.tsx:57-61` | COVERED | |
| U18 | Leave dialog: Title "Unsaved data", Description "You have unsaved data. Do you really want to leave current form without saving?", "Yes"/"Cancel" (L1671-1704) | `rules.ts:181-182`, `775-778`; `Screen.tsx:186-194` | COVERED | Texts only; behaviour is B10/B11. |

## Counts

| Status | Count |
|---|---|
| COVERED | 24 |
| PARTIAL | 12 |
| MISSING | 10 |
| WRONG | 7 |
| **Total** | 53 |

## Proposed changes

### (a) UI — `Screen.tsx`
1. **S** — Set `aria-label` to the canvas AccessibleLabel: `FIELD_CONTROL[f]` for fields, and the `pcf_…ButtonsSave` / `pcf_…ButtonsReset` names for the buttons (U3, U5). Update `Screen.test.tsx`, which queries by role name "Save"/"Cancel" and `getByLabelText(FIELD_LABEL…)`.
2. **S** — Render Operator / Expansion details / Substation operator with `TextAreaField` (multiline, 64 px), with `maxLength={CHAR_MAX_LENGTH}` on all three (U9, U10). Move the counter to the label row (U11).
3. **S** — Use a single-column field stack, max-width 380 (U16). Use the lock banner colours `#595959` with white text and icon, or adopt the shared `PageLockNotice` from D17 f (U15). Add the CheckMark / Dismiss icons (U7).
4. **S** — Pass the session `language` into `validateForm` / `canSave` (S12).
5. **M** — Add a leave guard: router `useBlocker(shouldPromptOnLeave(form, baseline))`. The dialog's Confirm runs `blocker.proceed()` and Cancel runs `blocker.reset()` (B10, B11).
6. **S** — Add `allowReset` state, set false after a successful save (S8). Show a success toast `SAVE_SUCCESS` for 1 s, and an error MessageBar on failure (B6-B8). Add loading and error `EmptyState` (S14). Wire these when connecting.

### (b) `rules.ts` (+ tests)
1. **S** — Correct the `SAVE_ERROR_PREFIX` JSDoc (B8): the canvas has the error Notify. Decide whether to keep the full canvas suffix "Internal error: originated on {source}. Message: {message}{http}". If kept, add `saveErrorMessage(err)` + a test.
2. **S** — `formatDecimal`: decide between round (canvas) and truncate (spec) and align UT-GRIDOP-005 (U13). If canvas parity wins, use `pfxRound` from `domain/powerFxNumeric.ts`.
3. **S** — Optionally make `buildPayload` re-bind Project/OBU on update for canvas parity (D6), or log the divergence.
4. **S** — Move `pageLock` / `PAGE_LOCK_TITLE` to a shared rule (D17 f). This has no behaviour change.

### (c) `hooks.ts`
1. **M** — `useGridOperatorProject`: `vsb_projects` by id with the JSDoc `$select`, plus the CanEditSelectedProject evaluation (D1, D2). `vsb_projects` is registered.
2. **M** — `useGridOperator`: `fetchPage` on `vsb_gridoperators`, `$top=1`, `lookupEq('_vsb_projectid_value', id)`, `$select` = `GRID_OPERATOR_COL` (D3). **`vsb_gridoperators` is NOT in `power.config.json`**: run `pac code add-data-source -a dataverse -t vsb_gridoperator`, then diff `.power/schemas/appschemas/dataSourcesInfo.ts` and check every logical name in `GRID_OPERATOR_COL`, the lookup nav `vsb_ProjectId`, and both option sets (D4, D5, D8).
3. **M** — `useSaveGridOperator`: create or update with `buildPayload`, `unwrap`, guard on `canEdit`, invalidate the record query (D6, D7, B6).

## Open questions for the product owner
1. Grid Connection fields are editable on a locked or Draft project in the canvas. Keep the fix (gated like the Operator tab) or keep canvas parity? (S6; not yet in D15.)
2. Should fields also be read-only for users without edit rights on the project? The canvas only disables Save. (S5)
3. Number display: should a stored 1.2345 km show as "1.235" (canvas rounding) or "1.234" (spec truncation)? (U13)
4. Diameters display 2 decimals but validate 1 decimal, so a stored 12.75 blocks Save. Is the column 1 or 2 decimals? (`rules.ts:260-264`)
5. Should the save error show the canvas's technical suffix ("Internal error: originated on … Message: …"), or a plain message with details sent to telemetry? (B8)
6. Should the tab reset to "Grid Operator" on every visit (canvas) or persist through `?tab=` (code)? (B1)
7. Confirm that 'Grid Expansion Required' and 'Substation construction required' share the Yes/No/Unknown values 952850000-2. The reference JSON has no `vsb_GridOperator` entity. (D5)
