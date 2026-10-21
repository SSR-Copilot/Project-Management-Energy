# Gap analysis — Admin Milestones Screen

Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Milestones Screen.pa.yaml` (2776 lines, read in full; `Lnnn` = YAML line).
Code: `ProjectCosts-CodeApp/src/features/admin/admin-milestones/` (`Screen.tsx`, `rules.ts`, `hooks.ts`, `rules.test.ts`, `Screen.test.tsx`).
Metadata checked against `ProjectDocs/reference/dataverse-attributes.json`, `.power/schemas/dataverse/milestonesstandardassumptions.Schema.json`, `src/generated/models/Vsb_milestonesstandardassumptionsesModel.ts`.

## Status summary

| Status | Count |
|---|---|
| COVERED | 42 |
| PARTIAL | 11 |
| MISSING | 12 |
| WRONG | 12 |
| **Total rows** | **77** |

Main findings:
1. **Two logical names in `rules.ts` are wrong.** The primary key is `vsb_milestonesstandardassumptionsid`, not `…assumptionid` (rules.ts:63). The "Sales End" column is `vsb_salesduration`, not `vsb_salesend` (rules.ts:75). UT-ADMILE-006 (rules.test.ts:139-140) locks in the wrong name. Saves would fail or write nothing.
2. **The Countries sort columns in the hooks checklist do not exist.** `vsb_order` and `vsb_key` are not columns. Canvas `Order` = `Value(Key)`, and `Key` is `vsb_title` (hooks.ts:11-13). The sort has to be numeric and done client-side.
3. **Read-only grid cell formats differ from canvas in 4 of 9 columns** (FID default 0.75, Cluster 5 success rate is the literal 1, Operational Lifetime shows "-", Sales Start/End second line is "-"). BESS renders as "Bess".
4. **Save is not wired.** `onSave={onClose}` (Screen.tsx:321). There is no loading overlay, no mutation and no verbatim save texts.
5. **Input `data-testid`s use logical names instead of canvas control names** (Screen.tsx:299). Per-cell invalid styling, `MaxLength` 256 and the editor's `Coalesce(…,"0")` initial values are missing.
6. **The plan's flow blocker is not real.** The flow call is commented out. Only the read-only `Fabric Sync Jobs` badge needs a table that is not registered.

---

## 1. Requirements vs implementation

### Data

| # | Requirement (canvas `Control.Property`) | Code (`file:line`) | Status |
|---|---|---|---|
| D1 | Country axis = the whole `Countries` table, `AddColumns(Countries, Title, Name, Order, Value(Key), IsFolded, true)`, `SortByColumns(…,"Order",Ascending)` — `Screen.OnVisible` L26-46. `Key` = `vsb_title` (attributes.json). Sort is numeric and client-side, after the collect. | rules.ts:278 `sortCountries` sorts by `order` (OK). The checklist at hooks.ts:11-13 says `$orderby=vsb_order asc`, `$select … vsb_order, vsb_key`. Neither column exists on `vsb_country` (schema has `vsb_title`). A server `$orderby` on text would also sort "10" before "2". | **WRONG** |
| D2 | Country id and name (`ThisItem.Country`, `ThisItem.Name`) — `lbl_CountryGuid…Text` L993, `lbl_ClusterName…Text` L834-836 | hooks.ts:13 `vsb_countryid, vsb_name`; rules.ts:196-202 | COVERED |
| D3 | Per-country rows: `Filter('Milestones Standard Assumptions', Country.Country = GUID(...))` — `gal_MilestonesStandardAssumptions_AdminScreen.Items` L459-462; Edit `OnSelect` L307 | hooks.ts:17 `_vsb_country_value eq <id>` | COVERED |
| D4 | Primary key `'Milestones Standard Assumptions'` (used as `assumptionGuid`, L1384) = `vsb_milestonesstandardassumptionsid` (schema) | rules.ts:63 `id: "vsb_milestonesstandardassumptionid"`; hooks.ts:18 | **WRONG** |
| D5 | Column `'Sales End'` (Patch L2570; input `Value` L1890; grid `Durations.'Sales End'` L525) = **`vsb_salesduration`** (display name "Sales End") | rules.ts:75 `salesEnd: "vsb_salesend"`; hooks.ts:22; rules.test.ts:139-140 asserts `"vsb_salesend"`. The "DOCUMENTED DEFECT" comment at rules.ts:115-130 gets the mapping backwards. | **WRONG** |
| D6 | Other columns: Cluster 1-5, Final Investment Decision, Operational Lifetime, Sales Start, Technology (choice), Name | rules.ts:62-76 (`vsb_cluster1..5`, `vsb_finalinvestmentdecision`, `vsb_operationallifetime`, `vsb_salesstart`, `vsb_technology`, `vsb_name`). All match the schema. | COVERED |
| D7 | Pivot: `GroupBy(…, Technology, Techs)`, `Sort(…, vsb_technology, Ascending)`, `LookUp(Techs, Name="average duration [months]")` / `"success rate [-]"` — L455-531 | rules.ts:298-332; dataverseNames `MILESTONE_ROW_NAME` | COVERED |
| D8 | Editor galleries: `Sort(Filter(…, Name = "average duration [months]"), Technology)` L1326; same with `"success rate [-]"` L2041 | rules.ts:381-387 `durationRows`/`successRateRows` | COVERED |
| D9 | Recalculating badge reads `'Fabric Sync Jobs'` where `'Regarding Object' = ThisItem` (country), `'Job Status' in [In Delay, In Progress, Importing]` — `Icon3_1.Visible` L270-282 | rules.ts:517-523 is correct. hooks.ts:70 returns `notConnected`. **`vsb_fabricsyncjob` is not in power.config.json.** The column names are unverified: `vsb_regardingobject` (rules.ts:82) looks like a lookup, so it is probably `_vsb_regardingobject_value`. attributes.json has no entry for this entity. | PARTIAL |
| D10 | `'Job Type'.Name = "Portfolio Milestone Assumptions changed"` — L275 | rules.ts:96, 520. The hook plans `_vsb_jobtype_value` + FormattedValue (hooks.ts:29). That works without registering `Fabric Job Types`, but it has not been built. | PARTIAL |
| D11 | Save payload: `ForAll(locSelectedMilestoneAssumptions, Patch(…, Assumption, If(changed C1…), …))`. Field order is C1, C2, C3, C4, Sales Start, FID, Sales End (journal key `"Sales Completion"`), C5, OL, each through `Value(…)` — `pcf_but_…_Save.OnChange` L2450-2616 | rules.ts:472-501 `planSaveMilestones`: one update per changed row, only the changed columns, `Number(...)`. This is an acceptable divergence: the canvas also sends empty Patches for unchanged rows. It depends on D4/D5 being fixed. | COVERED |
| D12 | Save actually writes to Dataverse | Screen.tsx:321 `onSave={onClose}`. There is no mutation hook; hooks.ts:33-34 only documents it. | **MISSING** |
| D13 | After save, the grid reflects the new values. The canvas re-reads the data source implicitly (`//Refresh` commented out at L2618). | No query invalidation exists (no mutation). | **MISSING** |
| D14 | `Patch('Fabric Sync Jobs', Defaults(...))` in both confirmations is inside `/* */` (L2698-2722, L2746-2772) and must not be ported | rules.ts:34-44, 548-554 (disabled, not invented) | COVERED |

### Behaviour

| # | Requirement | Code | Status |
|---|---|---|---|
| B1 | `OnVisible` `UpdateContext`: right panel hidden, loading false, text blank — L16-25 | Screen.tsx:100-103 initial state | COVERED |
| B2 | Every country starts folded (`IsFolded, true`) — L36-37 | Screen.tsx:100 `expanded = new Set()` | COVERED |
| B3 | `ico_Down`/`ico_Up.OnSelect` toggle `IsFolded`. `Visible = ThisItem.IsFolded` / `Not(...)` — L908-962 | Screen.tsx:136-141, 190-199 | COVERED |
| B4 | `ico_Down.OnSelect` also loads `locSelectedMilestoneAssumptions`; `btn_Select.OnSelect` sets the country — L878-879, 914-922 | Screen.tsx:179 loads rows lazily when open (hook not connected) | COVERED |
| B5 | Edit (`editCountryMilestoneAssumtions`) sets country + rows and opens the panel — `cmd_…_Country_CommandBar.OnSelect` L307 | Screen.tsx:142, 212, 217 | COVERED |
| B6 | Panel title uses `gal_CountriesMilestonesStandardAssumptions.Selected.Country` (L1058), which can differ from the clicked card (source quirk) | Screen.tsx:318 uses the clicked country. This is a better, acceptable divergence. | COVERED |
| B7 | Every input `OnChange` upserts `{assumptionGuid, tech, field, value}` keyed `(field, assumptionGuid)` in `col_MilestoneAssumtionsUpdates` — L1376-1406 and repeats | rules.ts:419-423; Screen.tsx:302-304 (boolean validity instead of sentinel strings) | COVERED |
| B8 | Close X (`closeKey`): `Select(Reset)`, panel hidden — `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_2.OnSelect` L1079-1089 | Screen.tsx:111, 320 (`onDismiss`) | COVERED |
| B9 | Cancel: `Select(Reset)`, hide, `Clear(col…)` — `pcf_but_…_Cancel.OnChange` L2659-2666 | Screen.tsx:111, 321 | COVERED |
| B10 | Save sequence: loading overlay with text, then ForAll Patch, then success/error text (`IfError`), then panel hidden and overlay off, then `Select(Reset)` (clear edits, reset galleries, `locSelectedMilestoneAssumptions: []`) — L2443-2629 | Screen.tsx:321 only closes the panel | **MISSING** |
| B11 | Apply All `OnSelect` sets `locIsVisibleApplyAll: true`, which shows the confirmation — L194 | Screen.tsx:123-125, 156-165 (unreachable: disabled) | COVERED |
| B12 | Apply (country) sets the context and shows the confirmation — L307 | Screen.tsx:143, 218 (unreachable) | COVERED |
| B13 | Live part of both `OnConfirm`: hide the confirmation, show the overlay with text, then `locAdminLoadingDialog: false` — L2690-2697, 2723; L2739-2745, 2773 | Screen.tsx:163 only closes. The texts are not ported (unreachable in both apps). | PARTIAL |
| B14 | `ForCountriestriggerFabricrecalculationsforProjects.Run(...)` is commented out (L2718, L2767) | rules.ts:577-581 shapes the arguments only; nothing calls it | COVERED |
| B15 | Header logo goes to `Navigate('Project Main Screen')` (L86); left nav `LeftAdminNavigationMenu` (L132-155) | App shell; navigation.ts:156 `MilestonesSettingsKey` goes to `/admin/milestones` | COVERED |

### State gates, validation, messages

| # | Requirement | Code | Status |
|---|---|---|---|
| S1 | `CommandBar1.DisplayMode = DisplayMode.Disabled` — L181 | Screen.tsx:105-108; rules.ts:548 | COVERED |
| S2 | Country bar: Edit `ItemEnabled: true`, Apply `ItemEnabled: false` — L289-303 | Screen.tsx:212-213 (Edit also needs `connected`) | COVERED |
| S3 | `Icon3_1.Visible` = active job for this country (D9) | rules.ts:517; Screen.tsx:182, 204 | COVERED |
| S4 | Duration valid when `IsMatch(Self.Value, "^\d+$")`, no trim — L1360, 1388 | rules.ts:395 `.trim()` first, so `" 5"` passes in code but fails in canvas | PARTIAL |
| S5 | Success rate valid when `And(Not(IsBlank), fn_Numeric_MS.IsTwoDecimal, InRange(0,1))`. `IsTwoDecimal` switches on `Language()`: "en" uses `^[+-]?\d+(?:\.\d{0,2})?$`, any other language uses the comma form (fn_Numeric.pa.yaml L242-265) — L2068, 2102-2110 | rules.ts:402-407 supports `language`, but Screen.tsx:303 calls `validateEdit(kind, d.value)` with no language, so it is always en-US | PARTIAL |
| S6 | `lbl_…_Durations_InvalidMessage.Text` "Enter a positive value without decimals", `Visible` if any `"invalid duration"` — L1915-1916 | rules.ts:239; Screen.tsx:328-330 | COVERED |
| S7 | `lbl_…_SuccessRates_InvalidMessage.Text` "Enter a value between 0 and 1 with a maximum of 2 decimals" — L2373-2374 | rules.ts:241; Screen.tsx:334-336 | COVERED |
| S8 | Per-cell error styling: `BorderThickness` 1 and `BasePaletteColor` Error when invalid. This also applies to initially blank Cluster 1-4 cells, before any edit — L1358-1371 etc. | Screen.tsx:296-305 has no `validationState` / styling on `Input` | **MISSING** |
| S9 | Save `DisplayMode` Disabled if either invalid message is visible or `IsEmpty(col_MilestoneAssumtionsUpdates)` — L2420-2425 | rules.ts:433-437; Screen.tsx:321 | COVERED |
| S10 | Input `MaxLength = gblAppConstants.DefaultDefMaxLength` (= 256, App.pa.yaml L1186) | Screen.tsx:296-305 has no `maxLength` | **MISSING** |
| S11 | Input initial `Value`: Cluster 1-4 = raw value; FID, Cluster 5, Operational Lifetime, Sales Start, Sales End = `Coalesce(ThisItem.'…',"0")` — L1410, 1650, 1710, 1770, 1830, 1890 | Screen.tsx:269-273 `show()` gives `""` for null in every field | **WRONG** |
| S12 | Save overlay text "Milestone Standart Assumptions for '{locSelectedMilestoneAssumptionCountry.Name}' will be saved, please wait..." — L2447 | Not in rules.ts `MSG` | **MISSING** |
| S13 | Save result texts: "Milestone Standart Assumptions were successfully saved." (L2617) and "Error: Milestone Standart Assumptions could not be saved. Internal error: originated on {FirstError.Source}. Message: {FirstError.Message} {FirstError.Details.HttpResponse}" (L2619) | Not ported. rules.ts:263 `MSG.saveFailed` is new wording and unused. | **MISSING** |
| S14 | Apply overlay texts: "Milestone Standart Assumptions for all countried will be applied to all projects, please wait..." (L2695) and "Milestone Standart Assumptions for '{Name}' will be applied to all regarding projects, please wait..." (L2744) | Not ported (dead path) | **MISSING** |
| S15 | Permission: the canvas has no screen gate (nav-level only) | rules.ts:452 `canEditScope` exists but Screen.tsx never calls it (D15a: nav shown to everyone) | PARTIAL |

### UI

| # | Requirement | Code | Status |
|---|---|---|---|
| U1 | Header title `Project.Name: "Milestones"` — `cmp_Admin_Milestones_Header.Project` L87-95 | Screen.tsx:117; rules.ts:591 | COVERED |
| U2 | `CommandBar1` item "Apply All", icon `CheckboxComposite` — L184-191 | Screen.tsx:108 caption OK. No icon. Toolbar has no `data-testid="CommandBar1"`; the item is `command-applyAllCountryMilestoneAssumtions` (CommandBar.tsx:109). | PARTIAL |
| U3 | Country card label `lbl_ClusterName_…` = `ThisItem.Name` | Screen.tsx:187-189 | COVERED |
| U4 | Chevrons `ico_Down_…` / `ico_Up_…` (no AccessibleLabel, no caption) | Screen.tsx:190-199 (`aria-label` = country name, testids match) | COVERED |
| U5 | `cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar`: "Edit" (icon Edit), "Apply" (icon CheckboxComposite) | Screen.tsx:209-220 captions OK. The bar has no `data-testid`. Apply has no icon. | PARTIAL |
| U6 | `Icon3_1.Text` "Currently recalculating this countries projects Costs and standard assumed Milestone dates." (note `Height: =5`, so it is barely visible in canvas) — L267 | rules.ts:248; Screen.tsx:205-206 (tooltip + icon) | COVERED |
| U7 | Grid header row: "Technology", "" (blank), "Cluster 1".."Cluster 4", "FID", "Cluster 5", "Operational Lifetime", "Sales Start", "Sales End" — L326-447 | Screen.tsx:226-228; rules.ts:603-607 | COVERED |
| U8 | `lbl_SubLabelsValue_…` "Duration [months]\nSuccess Rate [-]" — L752-754 | Screen.tsx:235 | COVERED |
| U9 | Cluster 1-4 cells `$"{record.Duration}\n{record.SuccessRate}"` — L657-744 | Screen.tsx:236-243 | COVERED |
| U10 | FID cell `$"{Coalesce(record.Duration, 0.75)}\n{record.SuccessRate}"`, success rate = literal 1 — L609-619, 506 | rules.ts:315 has SR=1. The 0.75 default is missing (Screen.tsx:240 shows `""`). | **WRONG** |
| U11 | Cluster 5 cell `$"{record.Duration}\n1"` (the second line is the literal **1**) — L561-571 | Screen.tsx:240 shows the success row's `vsb_cluster5` | **WRONG** |
| U12 | Operational Lifetime cell `Coalesce(Text(D),"-")` / `Coalesce(Text(SR),"-")` — L781-791 | Screen.tsx:240 gives `""` for blanks, not `"-"` | **WRONG** |
| U13 | Sales Start and Sales End cells `$"{Coalesce(Text(D),"-")}\n-"` (the second line is always "-") — L585-595, 633-643 | Screen.tsx:240 shows success-row values and `""` | **WRONG** |
| U14 | Technology text `Text(ThisItem.Technology)` (choice label: Wind, PV, Hybrid, **BESS**, Hydrogen, Hydro, Substation) — L767, 1900, 2358 | rules.ts:335-339 gives "Bess" for 952850003 (generated model has `'BESS'`) | **WRONG** |
| U15 | Panel title "Edit Milestones for {Name}" — L1058 | rules.ts:272; Screen.tsx:318 | COVERED |
| U16 | "Cluster Durations [months]" (L1141) and "Cluster Probabilities - Success Rate [-]" (L1928) | rules.ts:266-268; Screen.tsx:326, 332 | COVERED |
| U17 | Duration row labels: Cluster 1-4, "Final Investment Decision", Cluster 5, "Operational Lifetime", "Sales Start", "Sales End" (L1183-1308). Success rows Cluster 1-4 only (L1970-2024). | rules.ts:146-182; Screen.tsx:290-293 | COVERED |
| U18 | Panel column header per technology (`lb_…_TechniqueLabel.Text`) | Screen.tsx:283-285 (same BESS issue as U14) | COVERED |
| U19 | Input names `txt_Admin_MilestoneAssumption_Form_Fields_{Durations\|SuccessRates}_{Cluster1..4\|FID\|Cluster5\|OperationalLifetime\|SalesStart\|SalesEnd}_Input` | Screen.tsx:299 builds `…_Durations_vsb_cluster1_Input`, `…_vsb_finalinvestmentdecision_Input`, and so on | **WRONG** |
| U20 | Inputs have no `AccessibleLabel`, so the visible caption is the fallback | Screen.tsx:298 `aria-label={label}` ("Cluster 1"), repeated for every technology and in both sections (not unique) | PARTIAL |
| U21 | Save "Save" / Cancel "Cancel" (`pcf_but_…_Save`, `pcf_but_…_Cancel`). Icons CheckMark and Cancel. Save `Tooltip` "Filter projects details list view." is a copy-paste source defect. | Screen.tsx:321-323; CanvasFields.tsx:186-189 (aria + testid match) | COVERED |
| U22 | Close `pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_2`, icon-only item "Home" / ChromeClose | FormPanel.tsx:18 `aria-label="Close panel"`, `data-testid="panel-close"` | PARTIAL |
| U23 | Panel title label `lblAdmin_ProjectGates_Approvals_Form_Title_2` | No testid on the title | **MISSING** |
| U24 | `lbl_…_Durations_InvalidMessage` / `lbl_…_SuccessRates_InvalidMessage` testids | Screen.tsx:329, 335 have no `data-testid` | **MISSING** |
| U25 | Confirmations: Title "Apply to All Countries" / `$"Apply to {Name}"`, the Description verbatim, "Confirm"/"Cancel" — L2683-2733 | Screen.tsx:156-165; rules.ts:243-245, 615-619 | COVERED |
| U26 | Confirmation control names `cmp_Admin_MilestoneAssumptions_ApplyAll_Confirmation` / `…_Apply_Confirmation` | One shared `ConfirmDialog` with generic ids (ConfirmDialog.tsx:286, 298) | PARTIAL |
| U27 | Loading overlay `cmp_Admin_MilestoneAssumptions_Loading` (`InformationText = locAdminLoadingDialogText`) — L2671-2678 | Not used (`LoadingOverlay` exists in `@/components`) | **MISSING** |
| U28 | Hidden `but_…_Reset` (AccessibleLabel "Reset", `Visible: false`), logic only | Folded into `closePanel` Screen.tsx:111 | COVERED |
| U29 | Editor gallery names `gal_Admin_MilestoneAssumption_Form_Fields_Durations_MilestoneInputs` / `…_SuccessRates_MilestoneInputs` | Screen.tsx:279 table has no `data-testid` | **MISSING** |
| U30 | `gal_CountriesMilestonesStandardAssumptions`, `con_Main_…`, `gal_MilestonesStandardAssumptions_AdminScreen` | Screen.tsx:129, 185, 223 | COVERED |

### Code-only items checked against canvas

| # | Item | Code | Status |
|---|---|---|---|
| X1 | The canvas grid has 9 value columns plus a sub-label column, with one two-line row per technology | rules.ts:166 `SUMMARY_TABLE_FIELDS` (7 fields, "from screenshot") and rules.ts:358-378 `buildMilestoneSummaryRows` ("Wind — Duration [months]" rows) do not match the canvas. Screen does not use them. UT-ADMILE-031/033 test them. | **WRONG** |
| X2 | Table registration status | hooks.ts:4-6 says "None of this screen's tables is registered". `countries` (power.config.json:72) and `milestonesstandardassumptions` (power.config.json:160) **are** registered, with generated services. hooks.ts:41-45 is an orphan JSDoc claiming `fabricSyncJobs` is missing from dataverseNames, but it is there (dataverseNames.ts:21). | **WRONG** |

---

## 2. Proposed changes

### (a) UI — `Screen.tsx`

| # | Change | Size |
|---|---|---|
| a1 | Wire Save to `planSaveMilestones` plus a new `useSaveMilestones` mutation. Show `LoadingOverlay` with the verbatim save text (S12). Surface errors (rule 14/19) instead of the canvas's flash-and-hide. Close the panel and clear edits on success. | M |
| a2 | Render grid cells through a new `summaryCellText(entry)` from rules (fixes U10-U13). | S |
| a3 | Initial input value through a new rules helper (`Coalesce(…,"0")` for FID, C5, OL, Sales Start, Sales End) (S11). | S |
| a4 | Input `data-testid` from a canvas-name map (`Cluster1…SalesEnd`), not logical names (U19). | S |
| a5 | Per-cell `validationState="error"` from `validateEdit` on the displayed value, including initially blank cells (S8). | S |
| a6 | `maxLength={256}` on inputs (S10). | S |
| a7 | Pass `session.user.language` into `validateEdit` (S5). | S |
| a8 | Add testids: `CommandBar1`, `cmd_MilestoneStandardAssumptionsDetails_Country_CommandBar` (needs a `testId` prop on `CommandBar`), `lblAdmin_ProjectGates_Approvals_Form_Title_2`, both `…_InvalidMessage` labels, both editor galleries, both confirmations, and the close command (U2, U5, U22-U24, U26, U29). | S–M |
| a9 | Optional: icons CheckboxComposite (Apply/Apply All), CheckMark/Cancel (Save/Cancel). | S |
| a10 | Gate Edit/Save on `canEditScope` only if the PO decides to (S15). | S |

### (b) `rules.ts` (+ tests)

| # | Change | Size |
|---|---|---|
| b1 | `MILESTONE_COL.id` becomes `vsb_milestonesstandardassumptionsid`, `salesEnd` becomes `vsb_salesduration`. Rewrite the "documented defect" block (rules.ts:115-130): the display name **is** "Sales End"; only the logical name says "duration". Fix UT-ADMILE-006 and the fixtures. | S |
| b2 | New `summaryCellText(label, entry)`: FID `Coalesce(D,0.75)` / 1; C5 `D` / literal 1; OL `Coalesce(D,"-")` / `Coalesce(SR,"-")`; Sales Start / Sales Duration `Coalesce(D,"-")` / `"-"`; C1-C4 `D` / `SR`. Add UT for each. | S |
| b3 | New `initialInputValue(field, kind, row)` returning "0" for the five coalesced duration fields. Add UT. | S |
| b4 | `technologyDisplayName` uses the generated label map (`Vsb_milestonesstandardassumptionsesvsb_technology`) or `vsb_technologyname`, so BESS renders as "BESS". Extend UT-032. | S |
| b5 | Delete `SUMMARY_TABLE_FIELDS`, `buildMilestoneSummaryRows`, UT-031 and UT-033 (non-canvas) (X1). | S |
| b6 | `isValidDuration`: drop `.trim()` to match `IsMatch` (or log a DIVERGENCE) (S4). | S |
| b7 | Add verbatim `MSG.saving(name)`, `MSG.saved`, `MSG.saveError(source,msg,details)`, `MSG.applyingAll`, `MSG.applying(name)`. Keep "Standart"/"countried" verbatim (rule 7). | S |
| b8 | `countryOrder(vsb_title)` = `Value(Key)`: numeric parse, blanks sort first as in Power Fx. Add UT. | S |
| b9 | Canvas input-name map for a4 (`FID`, `OperationalLifetime`, `SalesStart`, `SalesEnd`, …). | S |

### (c) `hooks.ts` (and tables)

| # | Change | Size |
|---|---|---|
| c1 | Connect `useMilestoneCountries` over `Vsb_countriesService`: `$select vsb_countryid, vsb_name, vsb_title`, no server `$orderby`, map `order = countryOrder(vsb_title)`. The table is already registered. | S |
| c2 | Connect `useCountryAssumptions`: `$filter _vsb_country_value eq <id>`, `$select` the corrected columns (pk `…assumptionsid`, `vsb_salesduration`). The table is already registered. | S |
| c3 | `useSaveMilestones`: execute the `WritePlan` (updates to `vsb_milestonesstandardassumptionses`), then invalidate that country's key. | M |
| c4 | **Register `vsb_fabricsyncjob`** (missing from power.config.json). Verify its attribute logical names in the new schema (regarding-object lookup `_…_value`, job-type lookup, job-status choice), then connect `useActiveFabricJobs` using the job-type FormattedValue. `vsb_fabricjobtype` only needs registering if `$expand` is preferred. Until then, the badge hook can stay `notConnected` while c1-c3 go live. | M |
| c5 | Fix the stale header comment (hooks.ts:4-6, 11-13, 18, 22), remove the orphan JSDoc (hooks.ts:41-45), and keep `TABLES` honest. | S |
| c6 | Decide on the 30 s polling (hooks.ts:26). The canvas has no timer; it re-evaluates only on refresh. | S |

---

## 3. Flow-blocker verification

- Plan 003 §12 lists `ForCountriestriggerFabricrecalculationsforProjects` as a blocker. **This is not supported by the YAML.** Its only two call sites are inside `/* … */` block comments:
  - `cmp_Admin_MilestoneAssumptions_ApplyAll_Confirmation.OnConfirm` L2698-2722
  - `cmp_Admin_MilestoneAssumptions_Apply_Confirmation.OnConfirm` L2746-2772

  The `Patch('Fabric Sync Jobs', …)` and `LookUp('Fabric Job Types', …)` that feed the flow are in the same comments.
- Both entry points are also disabled in the live app: `CommandBar1.DisplayMode = DisplayMode.Disabled` (L181) and Apply `ItemEnabled: false` (L301). As shipped, the live `OnConfirm` only toggles the loading overlay on and off.
- The only **live** Fabric dependency is a read: `Icon3_1.Visible` (L270-282) filters `'Fabric Sync Jobs'`. That needs the table registered, not a flow.
- Plan tables that are not used: **Projects** appears only as a literal header record (L87-95). **Technologies** is not a table here (`Technology` is a choice column). **Fabric Job Types** is reached only through `'Job Type'.Name` (a lookup formatted value) and in commented code.
- **Verdict:** no flow blocks this screen. Viewing, editing and saving can be connected now on the two registered tables. The recalculation badge needs `vsb_fabricsyncjob` registered. Apply and Apply All stay disabled as shipped.

## 4. Open questions for the product owner

1. Apply / Apply All are dead in the shipped app. Should they stay visible and disabled, be hidden, or wait for a replacement (for example a single custom API that creates the job and starts recalculation)?
2. `Icon3_1` has `Height: =5` in the canvas, so it is practically invisible. Should the code app show the recalculating badge prominently, or match the canvas?
3. FID duration: the grid shows `0.75` when blank, but the editor pre-fills `"0"`. Which default is correct? Should the grid keep showing a value that is not stored?
4. Cluster 5's success rate is hard-coded as `1` in the grid, Sales Start/End show `-`, and the editor has no success-rate inputs for those fields. Is that intended, or should the stored success-row values be shown?
5. Save outcome: the canvas sets the success/error text and hides it in the same breath, so users never see it. May the code app show a persistent success/error message (rule 19)?
6. Should Edit/Save be limited to the user's editable countries (`canEditScope`)? The canvas lets every admin edit every country.
7. Duration validation: should `" 5"` (surrounding whitespace) be accepted? The canvas rejects it. Also, the message says "positive" but `0` is accepted. Keep that?
8. Input `aria-label`s: no AccessibleLabel exists, and the caption "Cluster 1" repeats for every technology and in both sections. May we add the technology and section (for example "Wind Cluster 1 duration") for Tosca and screen readers?
9. The verbatim typos "Standart" and "countried" in the overlay texts: keep them (rule 7) or correct them?
10. Is a partial connection acceptable (countries, assumptions and save now; the badge after `vsb_fabricsyncjob` is registered)?
