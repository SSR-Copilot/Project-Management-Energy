# Gap analysis: Project Planning Screen (PM) vs `src/features/pm/planning`

Read-only analysis, 19 Oct 2026.

**Sources**
- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Planning Screen.pa.yaml` (Y:line). All 4490 lines were read. Commented-out formulas were skipped: Y:2794-2904, Y:3598-3626, Y:3462-3471, Y:4331-4339.
- Code: `ProjectCosts-CodeApp/src/features/pm/planning/` (S = Screen.tsx, R = rules.ts, H = hooks.ts, T = rules.test.ts, ST = Screen.test.tsx).
- Column names and lengths were checked in `ProjectDocs/_extracted/VSBCloud/customizations.xml`. `dataverse-attributes.json` has **no** entries for the planning tables; only `dataverse-entities.json` lists them.

**Status key**
- COVERED: matches the canvas.
- PARTIAL: some of it is there.
- MISSING: not implemented. Rows marked "(D14)" are missing by design: the data hook is not connected yet.
- WRONG: differs from the canvas. Rows marked "(D)" are a documented divergence (a code comment or D15).

## Status counts

| Status | Count |
|---|---|
| COVERED | 52 |
| PARTIAL | 21 |
| MISSING | 15 (7 are D14 hook or wiring work by design; 8 are real gaps: Notify strings, loading texts, leave guard, testids) |
| WRONG | 24 (7 are documented divergences "(D)"; 17 are undocumented or factual errors) |
| **Total rows** | **112** |

Rows with two verdicts are counted under the worse one: A7 counts as WRONG, and E4 counts as WRONG (D).

**Power Automate verdict: no flow calls.** The screen has no `.Run(`, no flow connector and no `Launch(`. The only side call is `Trace(...)` (Y:103-106). This agrees with plan 015 §12 ("None") and the rules.ts header (R:11).

---

## A. Data: tables, columns, filters, sort, lookups

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| A1 | Tables used: Projects, Project Plannings, Permits, Aquisition Statuses, Aquisition Types, Custom Choice Values (`colCustomChoiceValues` from App.OnStart) | Y:55, 83, 134, 151, 174; App.pa.yaml:612-624 | `TABLES` H:50-57 | COVERED |
| A2 | Tables registered in `power.config.json` | — | Only `vsb_projects` is registered (power.config.json:41). `vsb_projectplannings`, `vsb_permits`, `vsb_aquisitionstatuses`, `vsb_aquisitiontypes` and `vsb_customchoicevalues` are **not** registered. | MISSING (D14) |
| A3 | Project reload `LookUp(Projects, Project = gblRecordSelectedProject.Project)` | Y:52-58 | `usePlanningProject` → `notConnected` H:68-70 | MISSING (D14) |
| A4 | `CanEditSelectedProject = DataSourceInfo(Projects, CreatePermission) && RecordInfo(rec, EditPermission)` | Y:59-79 | `canEdit` field H:59-63, always false | MISSING (D14) |
| A5 | Planning row `LookUp('Project Plannings', Project.Project = …)` | Y:80-86 | `useProjectPlanning` H:72-74. The doc (H:15-22) has the right filter and `$top=1`. | MISSING (D14) |
| A6 | Planning column names: cooperation, cooperationpartner(55), cooperationdetails(**300**), legalplanninglookup, planningbasiscategory, permitprocedurelookup, planningbasisdetails(55), repowering, securedaccess(**100**), repoweringdetails(300), isheightlimitationforwtg, heightlimitationm | customizations.xml | `PLANNING_COL` R:46-65 and `PLANNING_LOOKUP` R:67-72. The nav names `vsb_LegalPlanningLookUp` / `vsb_PermitProcedureLookup` were verified. | COVERED |
| A7 | Permits `Filter(Permits, 'Project Planning'.'Project Planning' = gblRecordProjectPlanning.'Project Planning')`, **no sort** | Y:131-137, Y:2941-2947, Y:4350-4356 | The H:23-25 doc adds "`$orderby` submission date", which the canvas does not have. The hook is not connected. | WRONG (doc) + MISSING (D14) |
| A8 | Permit columns name, submissiondate (DateOnly, Behavior 2), submissiondatetype, approvaldate (DateOnly), approvaldatetype, projectplanning | customizations.xml | `PERMIT_COL` R:75-84 | COVERED |
| A9 | Aquisition Types `Filter(Type = UnderLaw 952850000 / InRem 952850001)`, sorted by `Order` | Y:146-167; App.pa.yaml:1215-1218 | `LLA_TYPE_VALUE` R:975-978. Doc at H:26-27. | PARTIAL (D14) |
| A10 | The type caption displayed is **`'Status Name'` (`vsb_statusname`)**. `vsb_name` is the "Id" column. | Y:2223, 2549, 3208-3209 | H:26-27 `$select` lists `vsb_name` and not `vsb_statusname`. The skeleton maps `name: vsb_name` (skeleton hooks.ts:218). | WRONG |
| A11 | Statuses `Filter(Project.Project = …, 'Aquisition Status Type'.Type = …)` per LLA kind, `SortByColumns(AddColumns(…, Order, 'Aquisition Status Type'.Order), "Order")` | Y:168-203 | `sortByTypeOrder` R:1161-1168 and the client partition at S:162-164. Doc H:28-31 proposes `$orderby=vsb_AquisitionStatusType/vsb_order`, which the Dataverse Web API does not support on a lookup path, so the sort must stay client-side. | PARTIAL |
| A12 | Aquisition column names: projectid (nav `vsb_ProjectId`), aquisitionstatustype, secured, required, aquisitionstatuspercentage (fraction) | customizations.xml | `AQUISITION_COL` / `AQUISITION_LOOKUP` R:92-108 | COVERED |
| A13 | Custom choices: `vsb_fieldname = "vsb_legalplanningbasis"` / `"vsb_permitprocedure"`, then `Or(IsBlank(vsb_Country), IsBlank(projectCountry), vsb_Country = projectCountry)`, `Sort(vsb_order)` | Y:1051-1068, Y:1196-1213 | `customChoiceOptions` R:1246-1262 COVERED. The H:32-36 filter `_vsb_country_value eq null or eq {countryId}` returns only neutral rows when the project has no country, but the canvas returns **all** rows then. | PARTIAL |
| A14 | Default selection for Cooperation, Category and Repowering is `LookUp(Choices(...), Value = rec.X)`. For Legal and Procedure it is `LookUp(colCustomChoiceValues, id = rec.lookup)`. | Y:835-839, 1023-1030, 1139-1143, 1187-1194, 1857-1861 | `toPlanningForm` R:584-601 | COVERED |
| A15 | Option values and labels: Yes/No/Unknown 952850000-2; Planning Basis Category 3 labels; Permit Date Type Plan/Actual; LLA type labels | customizations.xml optionsets | `YES_NO_UNKNOWN` R:1281-1285, `PLANNING_BASIS_CATEGORIES` R:1287-1298, `PERMIT_DATE_TYPES` R:910-913, `LLA_TYPE_LABEL` R:980-991. All labels match the option sets. | COVERED |

## B. Writes: payloads and their order

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| B1 | **OnVisible get-or-create:** if there is no planning row, `Patch('Project Plannings', Defaults, {Project, Name: 'Project Name', 'Owning Business Unit'})` | Y:87-100 | `buildPlanningSeedPayload` R:815-825 (T UT-PLAN-001). Not wired. | PARTIAL (D14) |
| B2 | **OnVisible acquisition seed:** for each LLA kind, if the collection is empty, `ForAll(types, Patch(Defaults, {Type, Project, Secured/Required/%: Blank, OBU}))` then reload. UnderLaw runs first, then InRem, all-or-nothing per kind. | Y:204-277 | `planAquisitionSeed` R:1186-1209 computes the **missing** set per type. The canvas parity is kept at R:1212-1217. | WRONG (D) |
| B3 | **Save** `Patch('Project Plannings', rec, {Project, Name, Cooperation, 'Cooperation Partner', 'Cooperation Details', 'Legal Planning' lookup, 'Planning Basis Category', 'Permit Procedure' lookup, 'Planning Basis Details', Repowering, 'Secured Access' (Blank if No), 'Repowering Details' (Blank if No), OBU, 'Is Height Limitation For WTG', 'Height limitation [m]' (If checked Value() else Blank)})` | Y:2741-2783 | `buildPlanningPayload` R:753-802. Project and OBU are sent on create only, which is harmless. Not wired: Save has no `onClick` (S:390-397). | PARTIAL (D14) |
| B4 | Text values are saved untruncated. The control caps cooperationDetails at 300. | Y:951, 2756 | R:760-761 `text()` slices to `MAX_LENGTH`. `cooperationDetails` is sliced to **55** (R:119), so a 300-character stored value would be **truncated on save**. securedAccess is sliced to 55; its column allows 100. | WRONG |
| B5 | Save order: loading on → Patch → Notify → `Concurrent` reload of the UnderLaw, InRem and Permits collections → clear validation → `locAllowPlanningReset:false` → loading off | Y:2734-2963 | Not wired | MISSING (D14) |
| B6 | **Permit Save** `Patch(Permits, If(IsBlank(sel), Defaults, sel), {'Project Planning', Name, 'Submission Date', 'Submission Date Type', 'Approval Date', 'Approval Date Type', OBU: planning.OBU})` → Notify → reload colPermits → close the panel and clear the selection | Y:4310-4362 | `buildPermitPayload` R:872-894 (planning bind and OBU on create only). The panel `onSave` only closes (S:418). | PARTIAL (D14) |
| B7 | **Permit Delete** `Remove(Permits, sel); Remove(colPermits, sel)` → Notify → clear the selection and close | Y:4421-4432 | `onConfirm` only closes (S:524). There is no rule for it; H:38-40 mentions `deleteRecord`. | MISSING (D14) |
| B8 | **Aquisition Save** (UnderLaw/InRem): close the panel, `LookUp` the row, `Patch {Secured: Value, Required: Value, %: IfError(Value(pct)/100, 0)` (InRem has no IfError)`, Project, Type, OBU}`, then reload only that LLA collection | Y:3733-3793, Y:3848-3905 | `buildAquisitionPayload` R:1100-1131. When Required = 0 the code stores **null**; the canvas UnderLaw stores **0** and InRem errors. Not wired (S:478-487 has no onClick). | WRONG (D) |
| B9 | **Clear & Save** `Patch {Secured, Required, %: Blank}` → reload the LLA collection chosen by `locLLAType` → close → `UpdateIf(colPlanningFormValidation, Name="AquisitionStatus", {Dirty:true})` | Y:3560-3666 | `buildAquisitionClearPayload` R:1146-1152. Not wired (S:473-476). The Dirty flag does not arm Save (see C10). | PARTIAL (D14) |
| B10 | Owning Business Unit is set on every create (rule 4) | Y:96, 219, 256, 4327 | R:796-799, 820-823, 889-891, 1125-1128, 1203-1206 | COVERED |

## C. Behaviour: OnVisible, OnSelect/OnChange, Navigate

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| C1 | OnVisible sequence: loading "Loading, Please wait..." → project → canEdit → planning → seed → Trace → tabs → locals → permits → types → statuses → seeds → validation table → Reset controls → loading off | Y:46-387 | No load sequence and no loading overlay. Hooks are `notConnected`. | MISSING (D14) |
| C2 | OnHidden resets the controls, `gblRecordProjectPlanning` and the collections | Y:21-45 | Local state is discarded when the component unmounts | COVERED |
| C3 | Tabs `["General","Repowering","Aquisition Status"]`. The default is `First`. OnChange sets `locSelectedTab`. | Y:108-120, 761-782 | `PLANNING_TABS` R:1269-1273 and `?tab=` S:129, 256-265 | COVERED |
| C4 | Cooperation OnChange only marks Dirty. It does **not** clear Partner or Details; hidden controls keep their values and Save writes them. | Y:842-850, 2755-2756 | `applyCooperationChange` R:473-481 **clears** Partner and Details, so Save writes null. The divergence is noted only in a code comment ("kept symmetrical"); there is no `DIVERGENCE:` marker and no D15 row. | WRONG |
| C5 | Repowering OnChange: No → `Reset(SecuredAccess); Reset(RepoweringDetails)`; Unknown → `Reset(SecuredAccess)`. `Reset` restores the **stored default** and does not blank. Only Save blanks, and only on No. | Y:1863-1886, 1931, 1983, 2768-2777 | `applyRepoweringChange` R:462-470 sets "" for both. On **Unknown** the code saves null for Secured Access; the canvas keeps the stored value. | WRONG |
| C6 | Toggle OnUncheck runs `Reset(txt_HeightLimit)`, which restores the stored value. Save writes Blank when unchecked. | Y:1551-1563, 2780 | `applyHeightToggle` R:484-488 sets "". Re-checking shows blank rather than the stored value. | PARTIAL |
| C7 | Height text formatting: `If(Int(x)=x, Text(x,"#"), Text(x,"#0.0#"))`. `"#0.0#"` **rounds**. | Y:1436-1451 | `formatOneToTwoPlaces` R:613-618 **truncates**: 1.235 gives "1.23", the canvas gives "1.24". 0 gives "0"; canvas `Text(0,"#")` gives "". | WRONG |
| C8 | Permit row click toggles `locSelectedPermit` | Y:1697-1700 | `togglePermitSelection` R:833-836, S:350 | COVERED |
| C9 | Command bar: newPermit sets `locSelectedPermit: Blank()`, opens the panel and resets 5 fields. editPermit opens. deletePermit opens the confirm dialog. | Y:1782-1801 | S:171-175. New does **not** clear the selection. | PARTIAL |
| C10 | Dirty = any `colPlanningFormValidation` row with Dirty = true, including the "AquisitionStatus" row set by Clear & Save | Y:2705-2710, 3659-3666 | `canSave` R:698-709 uses `isPlanningRowDirty` only. `isDirty` R:638-645 exists but is unused in S. | WRONG (D) |
| C11 | Leave guard: header logo and left nav `OnSelect`, when dirty, set `locLeavePlanningConfirmationDialog`. OnConfirm navigates to the selected nav target or to the Project Main Screen. | Y:412-425, 482-505, 4455-4479 | The dialog is rendered (S:527-535), but `leaveOpen` is never set true (S:149). There is no router blocker in the app shell. | MISSING |
| C12 | Edit icon (per LLA row) OnChange sets the entity, opens the panel, sets `locAquisitionStatusEntityPercentageVal` to the stored % and sets `locLLAType` | Y:2121-2129, 2444-2452 | S:221-227 `setAquisition({row, lla, draft})` | COVERED |
| C13 | Secured/Required OnChange: if both numeric, % = s/r (IfError gives 0 on the Required side); otherwise 0. Display: `IsError` or Required = 0 gives "N/A"; otherwise `RoundDown(x*100,0)`. | Y:3298-3312, 3394-3415, 3486-3501 | `securedPercent` R:1002-1012 returns "N/A" for blank or non-numeric input where the canvas shows 0. Documented in R:994-1000. | WRONG (D) |
| C14 | Aquisition panel close (X) and Cancel: reset the 4 inputs, then close | Y:3116-3126, 3937-3944 | `onDismiss` / `setAquisition(null)` S:469, 488 | COVERED |
| C15 | Permit panel close (X) and Cancel: close **and** clear `locSelectedPermit`; Cancel also resets the 5 inputs | Y:4007-4016, 4391-4402 | S:415, 419 close only. `selectedPermitId` is kept. | PARTIAL |
| C16 | Main Cancel/Reset resets 10 controls (**not** the toggle or the height field), clears `locSelectedPermit` and clears Dirty | Y:3008-3029 | `setEdited(null)` S:402 resets everything, the toggle and height included, and keeps the permit selection | PARTIAL |
| C17 | Header and left navigation components (`cmp_Header`, `cmp_Left_Navigation`) | Y:402-506 | App shell (AppHeader/LeftNav). Out of feature scope. | COVERED |
| C18 | Report-error panel `cmp_ReportErrorRightPanel` Visible = `gblShowReportProblemPanel` | Y:4436-4441 | App shell AppHeader help menu (AppHeader.tsx:15). Not verified to be the same panel. | PARTIAL |

## D. State gates: DisplayMode, Visible, ItemEnabled

| # | Requirement (canvas) | Citation | Code | Status |
|---|---|---|---|---|
| D1 | The lock banner is visible when any of these holds: Project ID blank, End Date blank, Total Capacity 0/blank, Net Yield p50 0/blank, or Cluster State blank/"Draft". One bullet shows per reason. | Y:575-591, 661-739 | `pageLock` / `isPageLocked` R:372-411, S:246-254 | COVERED |
| D2 | The banner Height switch tests `'Project Start Date'` | Y:527-567 | `pageLockCanvasHeightParity` R:414-424 | COVERED (D, layout only) |
| D3 | TabList is disabled when Draft or locked | Y:767-776 | `canSwitchTabs` R:673-674, S:258 | COVERED |
| D4 | General tab, Repowering tab and Aquisition container are each visible only when their tab is selected | Y:795, 1814, 2018 | S:267, 364, 380 | COVERED |
| D5 | Cooperation, Category, Procedure, Planning Basis Details, toggle and Permits command bar are disabled when locked (Draft is part of the lock) | Y:840, 1144, 1195, 1295, 1539, 1760 | `canEditPlanning` R:669-670 also folds in `canEdit` (stricter; documented at R:666-667) | COVERED |
| D6 | Repowering dropdown, Secured Access, Repowering Details and the height text have **no** DisplayMode, so they are always editable | Y:1852-1889, 1916-1934, 1965-1986, 1415-1416 | Disabled when `!editable` (S:368, 372, 375, 324). The effect is the same while the tab strip is locked; it differs only for a user without edit rights. | COVERED |
| D7 | Legal Planning Basis is editable only when the option count > 0 and the page is not locked | Y:1031-1050 | `canEditLegalPlanningBasis` R:680-681 | COVERED |
| D8 | Cooperation Partner is visible only for Yes | Y:877 | `showCooperationPartner` R:434-435 | COVERED |
| D9 | Cooperation Details is visible for Yes or Unknown, and **editable only for Unknown**. There is no lock check. | Y:937-941, 949 | R:438-443, S:281 (adds `!editable`) | COVERED |
| D10 | Secured Access is visible for Repowering Yes. Repowering Details is visible for Yes or Unknown. | Y:1913, 1958-1962 | R:446-451 | COVERED |
| D11 | The height container is visible when the toggle is checked | Y:1353 | `showHeightLimit` R:454 | COVERED |
| D12 | Save is enabled when canEdit && not Draft && 0 invalid && >0 dirty && error label hidden && (checked → height not blank) && not locked | Y:2694-2717 | `canSave` R:698-709. Error-label visibility follows the fixed rule (see E1). | COVERED |
| D13 | Cancel/Reset is enabled only when `locAllowPlanningReset && dirty>0` | Y:2977-2990 | Always enabled when connected (S:401). `canReset` R:739-741 is exported but unused. Documented (R:731-738). | WRONG (D) |
| D14 | Permit command bar ItemEnabled: Edit requires a selection and `RecordInfo EditPermission`; Delete requires a selection and `DeletePermission`; New is always enabled | Y:1762-1781 | `permitCommandState` R:859-869 | COVERED |
| D15 | Permit Save is enabled when Name, both dates and both date types are non-blank | Y:4290-4301 | `canSavePermit` R:839-847 | COVERED |
| D16 | Aquisition Save is enabled when both fields are non-blank, numeric, in 0-999, and Required >= Secured | Y:3692-3715, 3807-3830 | `canSaveAquisition` R:1069-1075 | COVERED |
| D17 | Aquisition Save_UnderLaw / Save_InRem visibility is chosen by type | Y:3798, 3910 | A single button with a conditional testid (S:478-487) | COVERED |
| D18 | Gallery % label Visible = `!IsBlank(Required)` | Y:2164, 2487 | `percentCell` R:1398-1399 returns "" | COVERED |
| D19 | LLA Type dropdown and % text are `DisplayMode.View` | Y:3197, 3483 | `ReadOnlyField` S:497, 510 | COVERED |
| D20 | The gallery Edit icon has no DisplayMode, so it is always enabled | Y:2100-2131 | S:221-227 | COVERED |

## E. Validation and Notify messages (verbatim)

| # | Canvas text | Citation | Code | Status |
|---|---|---|---|---|
| E1 | Height error: Visible = `And(notBlank, Not(IsTwoDecimal), Not(InRange 0..99999))`. Text: blank gives `gblAppResx.InputBlank`, a non-two-decimal value gives "Numeric value with maximum of two decimals", otherwise **un-negated** `InRange` gives "Please select a value between 0 and 99999." | Y:1382-1406; App.pa.yaml:1630,1633 | `validateHeightLimit` R:515-527 uses `Or` plus the negated range. The parity function is at R:530-543. | WRONG (D) |
| E2 | Rationale "fn_Numeric_Revenues is never instantiated → validation dead" | R:509-513, R:34-35 | False. The instance exists on `Project Revenues Screen.pa.yaml:274`, and canvas apps resolve control references across screens, so the canvas validation is live. | WRONG (doc) |
| E3 | Height OnChange `Valid = notBlank && IsTwoDecimal && InRange` | Y:1417-1433 | R:570-572 plus the blank gate at R:705-707 | COVERED |
| E4 | "Secured must be number." / "Secured must be between 0 and 100." / `"Secured" has to be lower than or equal to "Required".` | Y:3259-3286 | R:270, R:291 (**"…0 and 999."**), R:296. The canvas string is kept at R:330. | WRONG (D) for the range message, COVERED for the other two |
| E5 | "Required must be number" / "Required must be between 0 and 999." / `"Required" has to be higher than or equal to "Secured".` | Y:3356-3382 | R:301, 306, 311 | COVERED |
| E6 | Notify success "Project Planning data was successfully saved!" (1000 ms) | Y:2784-2788 | `SAVE_SUCCESS` R:337. Not wired. | COVERED (string) |
| E7 | Notify error `"Error: Project Planning could not be saved. " & "Internal error: originated on " & FirstError.Source & ". Message: " & FirstError.Message & FirstError.Details.HttpResponse` | Y:2789-2792 | `SAVE_ERROR_PREFIX` R:342 has no trailing space and no tail, and is labelled "NEW — no canvas equivalent" (R:338-341), which is false | WRONG |
| E8 | Notify "Permit was successfully added!" (2000 ms; shown on edit too) | Y:4344-4348 | Not present | MISSING |
| E9 | Notify `"Error: Permits could not be saved. " & …` | Y:4340-4343 | Not present | MISSING |
| E10 | Notify "Permit deleted." (2000 ms) and `"Error: Permit could not be deleted. " & …` | Y:4425-4426 | Not present (rule 14 needs the error path) | MISSING |
| E11 | Notify `"Error: assosiated Shareholder Entity could not be saved. " & …` (canvas typo; on Aquisition Save and Clear) | Y:3647-3650, 3764-3767, 3876-3879 | Not present | MISSING |
| E12 | Loading texts "Loading, Please wait...", "Project Planning will be saved, please wait...", "Saving Aquisition Status..." (`cmp_PopUp_Loading`) | Y:50, 2738, 3738, 3853, 4483-4489 | No `LoadingOverlay` on the screen | MISSING |
| E13 | Permit-incomplete message | — (canvas has none) | `MSG.permitIncomplete` R:320-321, marked NEW and unused in S | PARTIAL |

## F. UI: controls, captions, aria-label, data-testid, layout

Canvas `AccessibleLabel` / `AccessibilityLabel` is set on all 37 labelled controls, and it **equals the control name** in every case. Rule 16 says aria-label must be that value verbatim.

| # | Control (canvas name) | Caption / label (canvas) | Code | Status |
|---|---|---|---|---|
| F1 | `con_Milestones_Page_LockMessage_5` + `icon_milestones_lock_5` + 6 labels | "This page is locked. To unlock it, please complete the following sections:", "• General", "• Milestones", "• Generator", "• Production", "• Change the project status from Draft" (Y:643-733) | R:353-354, 372-408; S:247-252. The bullets have no testids. | COVERED |
| F2 | `tab_ProjectPlanning_DisplayProjectBodyRightContent` | Tabs "General", "Repowering", "Aquisition Status" | S:256-265, with aria-label and testid equal to the canvas name | COVERED |
| F3 | `drp_…_Cooperation`, `drp_…_LegalPlanningBasis`, `drp_…_PlanningBasisCategory`, `drp_…_PermitProcedure`, `drp_…_Repowering` | Labels "Cooperation", "Legal Planning Basis", "Planning Basis Category", "Permit Procedure", "Repowering" (Y:859, 1114, 1163, 1259, 1895) | Captions COVERED (R:130-149). `ChoiceField` S:116 renders **aria-label = caption**, not the canvas name, and ST UT-PLAN-904 pins `"Repowering"`. | WRONG |
| F4 | `txt_…_CooperationPartner`, `txt_…_CooperationDetails`, `txt_…_PlanningBasisDetails`, `txt_…_SecuredAccess`, `txt_…_RepoweringDetails` | "Cooperation Partner", "Cooperation Details", "Planning Basis Details", "Access to old plants secured", "Repowering Details" | Captions COVERED (R:1311-1322). `textField` S:188 uses **aria-label = caption** where it should be the `txt_…` name. | WRONG |
| F5 | **D15e, confirmed.** `txt_…_CooperationDetails.MaxLength` and the counter `lbl_…_CooperationDetails_Details` | `=gblAppConstants.DefaultLongMaxLength` = **300** (Y:951, Y:983; App.pa.yaml:1187; column max 300) | `MAX_LENGTH.cooperationDetails: TEXT_MAX_LENGTH.default` = **55** (R:119), so the counter shows "/55" (S:192) | WRONG |
| F6 | `txt_…_SecuredAccess` MaxLength | None in the canvas (Y:1916-1934); the column max is 100 | 55 (R:121) | WRONG |
| F7 | MaxLength for Partner (55), Planning Basis Details (55), Repowering Details (300) and their counters `{Len}/{max}` | Y:886/918, 1297/1320, 1971/2003 | R:118, 120, 122; `charCounter` R:1306. Secured Access has no counter (S:372). | COVERED |
| F8 | Multiline mode on Partner, Details, Planning Basis Details and Repowering Details (heights 64/140) | Y:887, 952, 1298, 1972 | Single-line `Input` (S:183). `TextAreaField` exists in `@/components` Fields.tsx:85. | PARTIAL |
| F9 | `tgl_HeightLimitation_ProjectPlanning` | Label "Height limitation WTG", LabelPosition Before (Y:1540-1541) | S:307-314 | COVERED |
| F10 | `txt_HeightLimit_ProjectPlanning` + `lbl_HeightLimit_Title_…` "Height limitation [m]" + asterisk "*" + `lbl_HeightLimit_ErrorMsg_…` | Y:1410-1511 | S:315-330 (Field required, validationMessage) | COVERED |
| F11 | `gal_…_Permits` + headers "Permit", "Permit Submitted", "Permit Approved" | Y:1582, 1730-1750 | S:336-343, R:952-962 | COVERED |
| F12 | Permit row cells `Text(date, "d/mm/yyyy")`; blank shows "" | Y:1628, 1639 | `permitDateCell` R:965-970 renders `formatDate` ("19 Oct 2026", domain/dates.ts:72-78) plus " (Plan)/(Actual)"; blank shows "—". Documented as "GUIDE q22" only. | WRONG |
| F13 | `btn_…_PermitsRowTransparent` (no AccessibleLabel) and `img_…_PermitsRowSelectionDot` | Y:1644-1708 | The row is a `TableRow onClick` (S:346-351) with no aria-label, no testid, no keyboard focus. The dot is replaced by a row highlight. | PARTIAL |
| F14 | `pcf_…_PermitsCommandBar` items "New Permit"/"Edit"/"Delete", icons Add/Edit/Delete | Y:1755-1781 | S:166-170, 334. aria-label COVERED. The Toolbar has no `data-testid` (CommandBar.tsx:91). | PARTIAL |
| F15 | Aquisition gallery column order: **Types · Secured · Required · Aquisition Status [%] · (Edit)**, read from the X chains at Y:2134-2342 | Headers "LLAs in personam"/"LLAs in rem", "Types", "Secured", "Required", "Aquisition Status [%]", "" | Captions COVERED (R:1325-1336). The order rendered at S:205-219 is **Types · Required · Secured · %**. | WRONG |
| F16 | Gallery cells: Name = Status Name with a tooltip; Secured/Required `If(x>=0,x,"")`; % `Value(%)*100` (no RoundDown; blank with Required>0 likely shows 0) | Y:2151-2224 | `countCell` R:1402 COVERED. `storedPercentToDisplay` R:1015-1022 rounds down and shows "N/A" for a blank %. There is no tooltip. | PARTIAL |
| F17 | `pcf_but_…_UnderLaw_Edit` / `…_InRem_Edit` (icon "Edit") | Y:2100-2131, 2423-2454 | S:221-227, aria-label and testid equal to the name. The testid is not unique per row (D15 table c). | COVERED |
| F18 | `pcf_…_ButtonsSave` "Save", tooltip "Save Planning data"; `pcf_…_ButtonsReset` "Cancel", tooltip "Reset values form fields back." | Y:2964-2967, 3030-3032 | Captions and tooltips COVERED (R:1385-1395). **aria-label = "Save"/"Cancel"** where rule 16 needs the pcf name (S:393, 403), and ST:72-73 keys on the caption. | WRONG |
| F19 | Permit panel: title "New Permit"/"Edit Permit"; labels "Name", "Submission Date", "Approval Date"; asterisks; date pickers (Submission `LongAbbreviated`, StartOfWeek Monday); radios Plan/Actual (horizontal) | Y:4020-4265 | R:923-944, S:426-461. Native `type="date"` replaces the Fluent DatePicker, with no LongAbbreviated format. | PARTIAL |
| F20 | Permit panel close command bar `pcf_com_…_NewEditPermitBodyHeader_CommandBar` (item "Cancel", tooltip "Cancel") | Y:3990-4017 | The FormPanel close button is "Close panel" / `panel-close` (FormPanel.tsx:18) | PARTIAL |
| F21 | `pcf_…_NewEditPermitBodyButtons_Save` "Save" (tooltip "Save Permit") / `…_Cancel` "Cancel" (tooltip "Cancel") | Y:4285-4405 | `PanelButtons` with testids COVERED. aria-label "Save"/"Cancel" is not the pcf names (CanvasFields.tsx:186-189). The "Save Permit" tooltip is unused (R:1368). | PARTIAL |
| F22 | Aquisition panel title `$"Aquisition Status - [{Type}]"` (the Type label is "LLAs in personam"/"LLAs in rem") | Y:3095 | `aquisitionPanelTitle` R:1361-1362, S:467 | COVERED |
| F23 | Aquisition panel labels "LLA Type", "Secured", "Required", "Aquisition Status [%] " (trailing space) | Y:3225, 3323, 3426, 3510 | R:1339-1347 | COVERED |
| F24 | `drp_…_AquisitionStatusType` (View) and `txt_…_Percentage` (View, MaxLength 3) | Y:3187-3220, 3477-3501 | `ReadOnlyField` S:497, 510 has no `testId` and aria-label = caption | MISSING (testid/aria) |
| F25 | `txt_…_Secured` / `txt_…_Requered`, **MaxLength 3** | Y:3297, 3393 | `CostField` S:498-509 with aria and testid = name COVERED, but **no maxLength** | PARTIAL |
| F26 | `pcf_btn_…_Cancel_1` "Clear & Save" (tooltip "Set secured and required field to blank."), `…_Save_UnderLaw` / `_Save_InRem` "Save", `…_Cancel` "Cancel" | Y:3667-3669, 3794, 3906, 3945 | Captions and testids COVERED (S:472-491). aria-labels are the captions, not the pcf names. R:1142-1144 claims the UI "labels it 'Clear' and confirms first", which is untrue. | WRONG |
| F27 | `cmp_ProjectPlanning_PopUp_ConfirmationDeletePermit`: Title "Delete permit?", Description `"Are you sure that you want to delete permit " & Name & "?"`, buttons "Delete"/"Cancel", icons Trash/Cancel | Y:4409-4434 | R:1365-1382, S:515-526 | COVERED |
| F28 | `cmp_PopUp_Leave_Planning_Confirmation`: "Unsaved data", "You have unsaved data. Do you really want to leave current form without saving?", "Yes"/"Cancel" | Y:4443-4481 | R:343-344, 1393-1394, S:527-535. Captions COVERED; the dialog never opens (C11). | COVERED (UI) |
| F29 | Layout: General = Cooperation form, then Planning-basis form, then Height block, then Permits. Repowering = 3 fields. Aquisition = two galleries. Footer = Save + Cancel. Two right panels. | Y:785-3032 | S:267-409 follows the same grouping | COVERED |
| F30 | Not-connected notice listing TABLES | D14 | S:243, ST UT-PLAN-901 | COVERED |
| F31 | Height error label + toggle + Permits container testids (`con_…_Permits`, `gal_…_Permits`, `con_…_AquisitionStatus_UnderLaw/InRem`) | Y:1566, 1582, 2040, 2363 | S:200, 333, 336 | COVERED |
| F32 | Lookup type caption in the panel and galleries uses Status Name | Y:3203-3211 | Depends on A10; the hook planned to map `vsb_name` ("Id") | WRONG (same root as A10) |
| F33 | Header/logo dirty check and the left-nav OnSelect use the same `colPlanningFormValidation` guard | Y:412-425, 482-505 | Same as C11 | MISSING |
| F34 | `rad_…SubmissionDateType` / `rad_…ApprovalDateType` group aria-label and testid = name | Y:4147-4173, 4226-4251 | `Choices name=` S:441, 455 (CanvasFields.tsx:160) | COVERED |
| F35 | `dte_…SubmissionDate` / `dte_…ApprovalDate` aria-label and testid = name | Y:4136-4143, 4216-4222 | `CostField name=` S:435, 449 | COVERED |
| F36 | `txt_…_NewEditPermitBodyContent_Name` (no MaxLength; column max 100) | Y:4085-4090 | S:428-432 | COVERED |

*Rows per section: A 15, B 10, C 18, D 20, E 13, F 36, for 112 in total. F32 and F33 repeat the root causes of A10 and C11 and are counted separately.*

---

## Proposed changes

### (a) UI: `Screen.tsx`

| # | Change | Size |
|---|---|---|
| a1 | Set aria-label to the canvas name (rule 16) on all 5 dropdowns (`ChoiceField` S:116 → `aria-label={testId}`), all 5 text inputs (S:188), footer Save/Reset (S:393, 403), and the aquisition Clear/Save/Cancel buttons (S:473-489). ST UT-PLAN-903/904 key on the captions, and rule 16 says "never change an existing value", so a PO decision is needed first (Q1). | M |
| a2 | Reorder the acquisition columns to Types · Secured · Required · Aquisition Status [%] · Edit (S:205-219) | S |
| a3 | Render Partner, Details, Planning Basis Details and Repowering Details as multiline (`TextAreaField`, Fields.tsx:85) | S |
| a4 | Add `testId` to the two `ReadOnlyField`s (`drp_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_AquisitionStatusType`, `txt_ProjectPlanning_RightPanel_AquisitionStatus_InpForm_Body_Percentage`). Add `maxLength={3}` to Secured/Required (S:498-509). | S |
| a5 | Permit rows: keyboard-selectable, per-row `data-testid={\`btn_ProjectPlanning_DisplayProjectBodyRightContent_PermitsRowTransparent-${p.id}\`}` and an aria-label | S |
| a6 | Clear the permit selection on New, on panel close/Cancel, and on footer Cancel (C9, C15, C16) | S |
| a7 | Wire the leave guard: compute `isDirty(...)` and use a react-router blocker (or a shell-level dirty registry) to open the existing leave dialog. There is no shell support today. | M |
| a8 | Add `LoadingOverlay` with the three canvas texts (E12), driven by query and mutation state | S |
| a9 | Show the "Save Permit" tooltip on the permit Save button. Give the permit panel close button aria-label "Cancel" (F20/F21; needs a PanelButtons/FormPanel option). | S |
| a10 | Use the Fluent `DatePicker` with the LongAbbreviated format for the permit dates (optional, F19) | M |
| a11 | Decide whether footer Cancel should follow `canReset` (D13) and whether it should keep the toggle and height values (C16) | S |

### (b) `rules.ts` (+ `rules.test.ts`)

| # | Change | Size |
|---|---|---|
| b1 | **D15e:** `MAX_LENGTH.cooperationDetails = TEXT_MAX_LENGTH.long` (300), R:119. Add a test next to T:604-612. This also stops the 55-character save truncation (B4). | S |
| b2 | `MAX_LENGTH.securedAccess`: 100 to match the column (the canvas sets none). Needs PO confirmation (Q4). Add a test. | S |
| b3 | `applyCooperationChange` (R:473-481): stop clearing, to match the canvas. Otherwise mark it `DIVERGENCE:`, add a parity twin and log it in D15. Update UT-PLAN-006..008. | S |
| b4 | `applyRepoweringChange` (R:462-470): on Unknown, revert Secured Access to the baseline value (Reset semantics) instead of ""; on No, clearing is fine because Save blanks anyway. Do the same for `applyHeightToggle` (revert to baseline on uncheck). These need the baseline as an argument. Update UT-PLAN-009/010. | M |
| b5 | `formatOneToTwoPlaces` (R:613-618): round instead of truncating; decide the canvas `Text(0,"#")` = "" edge case. Add a test. | S |
| b6 | `permitDateCell` (R:965-970): canvas format `d/mm/yyyy` with no type suffix and "" for blank. Otherwise log the GUIDE q22 divergence in D15. Update UT-PLAN-030. | S |
| b7 | Add the missing Notify strings, verbatim with citations: `PERMIT_SAVED` "Permit was successfully added!", `PERMIT_SAVE_ERROR_PREFIX` "Error: Permits could not be saved. ", `PERMIT_DELETED` "Permit deleted.", `PERMIT_DELETE_ERROR_PREFIX` "Error: Permit could not be deleted. ", `AQUISITION_SAVE_ERROR_PREFIX` "Error: assosiated Shareholder Entity could not be saved. ", `LOADING` (3 texts), plus a `notifyError(prefix, err)` that builds the "Internal error: originated on … Message: …" tail | S |
| b8 | Fix `SAVE_ERROR_PREFIX` (R:338-342): canvas text "Error: Project Planning could not be saved. " (trailing space), and remove the false "NEW" claim | S |
| b9 | Correct the comment at R:34-35 and R:509-513: `fn_Numeric_Revenues` lives on Project Revenues Screen:274 and the canvas validation is live. The `And`/`Or` fix stays a SOURCE DEFECT; log it in D15. | S |
| b10 | Correct the comment at R:1142-1144 ("labels it Clear and confirms first"), which contradicts the UI and the canvas | S |
| b11 | Log the undocumented divergences in `02-OPEN-DECISIONS.md` D15: B2 seed self-heal, B8 null vs 0, C10 Clear not arming Save, C13 N/A vs 0, D13 Cancel always enabled, E4 Secured "999". Rule 8 requires a D15 entry for each, and the code currently documents them only in comments. | S |
| b12 | `storedPercentToDisplay` (R:1015-1022): decide blank % with Required>0 ("0" as in the canvas vs "N/A") and RoundDown vs raw | S |

### (c) `hooks.ts`

**Tables not in `power.config.json`:** `vsb_projectplannings`, `vsb_permits`, `vsb_aquisitionstatuses`, `vsb_aquisitiontypes` and `vsb_customchoicevalues`. Only `vsb_projects` is registered. All five need `pac code add-data-source`, then a diff of `dataSourcesInfo.ts` (CONVENTIONS rule 9 footgun).

| # | Change | Size |
|---|---|---|
| c1 | Register the 5 tables and regenerate services | M |
| c2 | `usePlanningProject` with `$select` per H:10-14, plus `CanEditSelectedProject` = create privilege on `vsb_projects` && record edit privilege | M |
| c3 | `useProjectPlanning` with a guarded get-or-create using `buildPlanningSeedPayload` (B1) | M |
| c4 | `usePermits`: filter on `_vsb_projectplanning_value` with **no `$orderby`** (fix doc H:23-25), plus per-row edit/delete privilege for D14 | M |
| c5 | `useAquisitionTypes`: `$select` must include **`vsb_statusname`** (shown caption) as well as `vsb_type` and `vsb_order`. Fix doc H:26-27 and do not copy the skeleton's `vsb_name` mapping. | S |
| c6 | `useAquisitionStatuses` with a client-side type-order sort (`sortByTypeOrder`). Do not rely on `$orderby` over the lookup path (H:29). Seed with `planAquisitionSeed` or its canvas parity, as the PO decides (Q6). | M |
| c7 | `useCustomChoiceValues`: when `countryId` is null, **omit** the country clause (the canvas shows all rows); otherwise use `(_vsb_country_value eq null or eq {id})`, `$orderby=vsb_order` | S |
| c8 | Mutations in canvas order: planning Save (single PATCH, then invalidate aquisition×2 + permits); permit upsert, then refetch; permit delete through `deleteRecord`, surfacing failure (rule 14); aquisition Save/Clear, then refetch the one LLA kind. Each mutation wires the E-row Notify texts. | L |

---

## Open questions for the product owner

1. **aria-label vs Tosca.** The canvas AccessibleLabel equals the control name on every control. The code uses captions on the 5 dropdowns, the 5 text inputs, footer Save/Cancel and the acquisition buttons, and existing tests pin the captions. Should we switch to the canvas names (rule 16), or keep the captions ("never change an existing value")?
2. **Cooperation Details length (D15e).** Confirm 300 (canvas and column) and approve the fix. The current 55-character slice would truncate stored data on Save.
3. **Cooperation change.** The canvas keeps Partner and Details when Cooperation changes to No or Unknown, and saves them. The code blanks them. Which is wanted?
4. **Secured Access length and the Repowering Unknown case.** Max 100 (column) or 55? On Repowering = Unknown, should the stored Secured Access be kept (canvas) or blanked (code)?
5. **Permit date cells.** Canvas `d/mm/yyyy`, date only, or the GUIDE-q22 style "19 Oct 2026 (Plan)"?
6. **Acquisition seeding.** Should seeding be all-or-nothing per LLA kind (canvas) or fill missing types (code)? And with Required = 0, should Save store % = 0 (canvas UnderLaw) or null (code)?
7. **Secured range message.** "between 0 and 100" (canvas) or "between 0 and 999" (code)?
8. **Clear & Save arming Save.** In the canvas, Clear & Save marks the form dirty, which enables the planning Save button and the leave prompt. Should the code replicate that?
9. **Footer Cancel.** Should it be always enabled (code, citing GUIDE) or follow `locAllowPlanningReset && dirty` (canvas, disabled after a save)? Should it reset the height toggle and value (code) or leave them (canvas)?
10. **Permit success toast.** The canvas shows "Permit was successfully added!" after an edit too. Keep the text verbatim, or split it into added/updated?
11. **Acquisition column order.** Confirm the canvas order Types · Secured · Required · %.
