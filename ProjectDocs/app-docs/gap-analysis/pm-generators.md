# Gap analysis — PM · Project Generators Screen

- **Canvas:** `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Generators Screen.pa.yaml` (17 513 lines, 640 controls, solution 1.21.709). Canvas citations are `Control.Property @ YAML line`.
- **Code:** `ProjectCosts-CodeApp/src/features/pm/generators/` — `Screen.tsx` (S:), `rules.ts` (R:), `hooks.ts` (H:). Citations are `file:line`.
- **Context:** D14 says this screen is "UI built, not connected". Every hook returns `notConnected()` (H:166-240), so all writes are disabled. Rows about writes therefore judge **the rules and the hook checklist**: is the payload shaping in `rules.ts`, and is the query or write described correctly in the `hooks.ts` JSDoc?
- **Method:** I read the whole YAML, every block scalar to its end, with commented formulas skipped (SKILL §1–2). Components used: `cmp_Header`, `cmp_Left_Navigation`, `cmp_PopUp_Confirmation`, `cmp_PopUp_Information`, `cmp_PopUp_Loading`, `cmp_ReportErrorRightPanel` and `fn_Numeric` (as `fn_Numeric_Generators`; `fn_Numeric_Production` is referenced but lives on another screen). Globals come from `App.pa.yaml`: `colPVModulesSuppliers` / `colInverterSuppliers` / `colSubstructuresSuppliers` (App:1506-1546), `gblAppResx` (App:1630-1633: `InputBlank` = "Input must not be blank", `Numeric` = "Numeric value without decimals"), and `gblAppConstants.DefaultMaxLength` 55 (App:1184).
- **Logical names:** `ProjectDocs/reference/dataverse-attributes.json` has **none** of this screen's tables (only 23 entities). `dataverse-entities.json` has the entity sets only. The column names in `rules.ts` cite `sol/customizations.xml`. I spot-checked them against `src/generated/models/Vsb_pvmoduletypeinprojectsModel.ts`.
- **Replace Generator / Replace PV Module (1.21.753)** are not in the 1.21.709 YAML. They are listed as "not in source" and not scored.

Status key: **COVERED** / **PARTIAL** / **MISSING** / **WRONG** (differs from canvas; both sides quoted).

---

## 1. Data — reads (tables, filters, sort, lookups)

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| D1 | Re-read the project: `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` — `SCREEN.OnVisible @63` | H:21-25 `useGeneratorsProject` checklist ($select incl. FID, end/start date, PM, OBU, plantPvCapacity); stub H:166 | PARTIAL (not connected) |
| D2 | `CanEditSelectedProject = And(DataSourceInfo(Projects, CreatePermission), Coalesce(RecordInfo(project, EditPermission), false))` — `OnVisible @63` | H:81-83 `useGeneratorPermissions` describes record privileges but not the **CreatePermission on Projects** conjunct; stub H:236 | PARTIAL |
| D3 | Planning: `LookUp('Project Plannings', Project = …)` into `gblRecordProjectPlanning` and `locProjectPlanning` — `OnVisible @63` | H:26-28 (`vsb_isheightlimitationforwtg`, `vsb_heightlimitationm`, `$top=1`); stub H:170. `vsb_projectplannings` is **not registered** | PARTIAL |
| D4 | WTG types: `Sort(Filter(GeneratorTypeInProjects, Project = …), 'Created On', Ascending)` with `IsFolded = true` — `OnVisible @63` | H:43-44 filter only; **no `$orderby=createdon asc`** in the checklist | PARTIAL |
| D5 | PV types: `SortByColumns(Filter(PVModuleTypeInProjects, Project = …), "createdon", Asc, "vsb_name", Asc)` — `OnVisible @63` | H:48-52 filter and $select; **no orderby** | PARTIAL |
| D6 | Inverter / Substructure / Storage / Hydrogen / Substation types: `Filter(<T>, Project = …)` (unsorted) — `OnVisible @63` | H:53-68 checklists. All five tables are **not registered** | PARTIAL |
| D7 | Turbines: `Filter(GeneratorInProjects, AsType(ModuleTypeInProject, GeneratorTypeInProjects).GeneratorTypeInProject in col…)`, `Index = Value(Last(Split(Name,"_")))` — `OnVisible @63`, `…GeneratorsList.Items @2104` sorted by `Index` | H:45-47 (`_vsb_moduletypeinprojectid_value in (…)`); S:365-374 groups and sorts by `index`; R:557 `turbineIndex` | COVERED (shape) / PARTIAL (stub) |
| D8 | Catalogue: `ClearCollect(colGenerators, Generators)`, then `Filter(Not(IsBlank(FID)), vsb_earliestphaseout > FID)`, sorted by `vsb_displayname`, with `IsAvailabile` = country ∈ `vsb_countryavailability` — `OnVisible @63` | R:325-377 `isAvailableInCountry` / `isOrderable` / `projectCatalog`; H:29-35 adds **`statecode eq 0`**, which the canvas does not filter on | WRONG (canvas: no status filter; code: `statecode eq 0`). Low risk; needs a decision |
| D9 | Inflation: `'Estimation Price Inflations'` for FID year and FID year − 1, `AccumulatedIndex = prev + (curr − prev) * Month(FID)/12` — `OnVisible @63` | R:459-468 `accumulatedIndex`; H:36-39. `vsb_estimationpriceinflations` **not registered** | COVERED (rule) / PARTIAL (data) |
| D10 | Device costs: `ClearCollect(colDeviceCosts, 'Device Costs')`, the **whole table with no country filter**, then `LookUp(…, 'Device Type' = "Modules" / "Inverter" / "Mounting systems fix" / "Mounting systems tracker").'Device Cost [EUR/MWp]'` — `OnVisible @63` | H:40-42 filters by `_vsb_country_value eq <countryId>`; R:160 `DEVICE_TYPE` | WRONG (canvas: first row per type, any country; code: country-filtered). The code is probably the intent. See Q6. `vsb_devicecosts` **not registered** |
| D11 | ISO currency: `If(Not(IsBlank(gblRecordSelectedProjectCountry.'ISO Currency Code')), …, "EUR")` — e.g. `lbl_…CostPerInverter.Text @4160` | R:2190 `isoOrEur`; S:652 | COVERED |
| D12 | PV supplier list: `Filter(colPVModulesSuppliers, Not("Imported" in 'Display Name'))`, where `colPVModulesSuppliers` = `PVModules` minus "Other Supplier", then "Other Supplier" appended (App:1506-1519) — `cmb_…PvModuleType_Fields_Supplier.Items @7543` | R:2055 `pvSupplierOptions(pvQ.data)`: distinct suppliers **already on the project's PV types**; S:487 | WRONG (canvas: `PVModules` catalogue; code: project rows). `vsb_pvmodules` **not registered** and has no hook |
| D13 | Inverter and substructure supplier lists from `colInverterSuppliers` / `colSubstructuresSuppliers` (`Inverters` / `Substructures`, plus `FullDisplayName`) — `@9411`, `@8552`. Types: `Choices('Inverter Type')` (multi-select), `Choices('Substructure Type')` | No hook. S:1243 passes `options={[]}` | MISSING (low: both panels are unreachable, see B4) |
| D14 | Land-lease costs flagged AllWTG: `Filter('Land Lease Project Costs', Project = …, AllWTGAllocated = Yes)` — `btn_Trigger_New_AllocateWTGs_To_Land_Lease.OnSelect @17510` | H:72-74 checklist; H:221 stub; R:1865 `planTurbineAllocation` | PARTIAL |
| D15 | Plant PV capacity check `gblRecordSelectedProject.'Plant PV Capacity [MWp]'` (substructure cost message, add-substructure guard) | H:134 `plantPvCapacity` field, never rendered | PARTIAL |

## 2. Data — writes (Patch / Remove / Collect payloads and order)

All writes are absent by design (D14). The status says whether the **rules / checklist** model the canvas correctly.

| # | Canvas write sequence | Code | Status |
|---|---|---|---|
| W1 | **Save WTG type** (`pcf_btn_…_Form_Buttons_Save.OnChange @15214`), in order: (1) re-`LookUp(Generators, Supplier, Turbine Type, Hub Height, Not(IsBlank(phaseout)))`; (2) if `'Is Height Limitation For WTG'` and not approved and limit < height, open the approval popup; (3) `Patch(GeneratorTypeInProjects, …, {Project, Generator, 'Number of Generators', 'Cost per WTG' = Value(txt_Cost) [= Text(locGeneratorCostsPerWtg,"#0.00")], 'Generators Cost' = n×cost, 'Generators Capacity' = n×'Specific Capacity', OBU})`; (4) `DeviceTypesInProjects` shadow row via `btn_AutomatedFlow_TriggerWork_ForWTG_PV @68` `{Name, TypeInProject, OBU}` if none exists; (5) N × `Patch(GeneratorInProjects, {Name "WTG <Short>_<max+i>", ModuleTypeInProject, 'Effective Capacity' = Specific Capacity, OBU, 'Total Height', 'Hub Height excl. Foundation Plinth [m]'})`; (6) out of country: `RequestModulePermission.Run` and set the state to Pending; otherwise patch the project roll-up `'Plant WTG Capacity/Cost'` over eligible types; (7) land-lease allocation for AllWTG costs | R:488 `costPerWtg`, R:505 `generatorTypeTotals`, R:569 `buildTurbineNames`, R:591 `newTurbineHeights`, R:700-724 roll-up, R:1768 permission payload, R:1806 pending fields, R:1865 allocation; H:85-92 lists the batch. The `Text(…,"#0.00")` 2-dp rounding of cost per WTG is **not** ported (R:497 returns unrounded) | PARTIAL |
| W2 | **Save turbine** (`pcf_btn_…_Generator_Buttons_Save.OnChange @11631`): `Patch(GeneratorInProjects, {Name, ModuleTypeInProject, 'Effective Capacity', 'Hub Height excl. Foundation Plinth [m]', OBU, 'Foundation Plinth [m]', 'Total Height'})`; then the apply-to-all `UpdateIf`s (capacity; hub height + Total Height; plinth + Total Height); then re-band the type from its children and patch the type; the project roll-up; allocation if new | R:609 `editedTotalHeight`, R:627 `recomputeTypeFromChildren`, R:663 `planApplyToAll` (**does not carry `'Total Height'` in the hub-height / plinth patch**, R:674-677) | PARTIAL (apply-to-all patch misses Total Height: canvas `{…, 'Total Height': Value(txt_Total_Height)}` @11727/@11755) |
| W3 | **Delete turbine** (`cmp_…ConfirmationDeleteGeneratorInProject.OnConfirm @15799`): per allocation, remove the allocation if its cost has >1 WTG, otherwise remove the `'Land Lease Project Costs'` row; `Remove(GeneratorInProjects)`; re-band the type ('Cost per WTG' 0 when count 0); project roll-up | R:1900 `planTurbineDeletion`, R:627 | PARTIAL |
| W4 | **Delete WTG type** (`…DeleteGeneratorType.OnConfirm @15626`): remove the land-lease costs of the allocations of **`locSelectedGeneratorInProject`** (sic) and the `'Opex Project Costs'` of the first DeviceType; cancellation flow if `FlowRunId`; `Remove(GeneratorTypeInProjects)`; roll-up; then `Select(btn_SetDefaultSeletected_Item)` | R:1825/1844 cancellation; H:87-92 prose only | PARTIAL (canvas filters land lease by a turbine, not the type; see Q1) |
| W5 | **Activate / deactivate** (`…ConfirmationChangeStatus.OnConfirm @16145`): toggle the type `Status`, propagate to every turbine (`Patch(GeneratorInProjects, ShowColumns(col, GeneratorInProject, Status))`), roll-up | R:1923 `planStatusToggle` | PARTIAL |
| W6 | **Save PV type** (`…PvModuleType_Buttons_Save.OnChange @7973`): `Patch(PVModuleTypeInProjects, {Project, Label, PVModule = cmb.Selected, 'Other Supplier', 'Degradation 1st Year', 'Degradation Remaining Years', 'Cost per Power' = Modules device cost, 'Capacity [MWp]', 'Cost [EUR]' = cpp×cap, OBU})`; the DeviceType shadow; **a `GeneratorInProjects` row** `{Name = PV type Name, ModuleTypeInProject = PV type, OBU}`; project `'Plant PV Capacity'` and `'Plant PV Cost'` (PV + inverter + substructure) | R:2066 `buildPvTypeFields` writes `vsb_label`, **`vsb_type` = supplier**, capacity, costs, degradation. No `vsb_pvmodule` bind, no `vsb_othersupplier`, no shadow `GeneratorInProjects` row | WRONG (canvas: `PVModule: cmb.Selected` [`vsb_pvmodule` lookup] + `'Other Supplier'`; code: `PV_TYPE_COL.supplier: "vsb_type"` R:1947, the hidden "Module Type" text column) |
| W7 | **Delete PV type** (`…DeletePVModuleType.OnConfirm @15466`): cancellation; `Remove`; `'Plant PV Capacity'`; **recompute every substructure cost** (`Fixed`/`Tracker` × new plant PV capacity); `'Plant PV Cost'`; `Select(btn_SetDefault…)` | R:543 `substructureCost` (`"fix"\|"tracker"`, default fix; canvas default arm is **0**) | PARTIAL / WRONG (default: canvas `Switch(…, "Fixed", …, "Tracker", …, 0)`; code: an unknown type falls to fix) |
| W8 | **Save inverter** (`@10175`): `{Project, Inverter, 'Inverter Label', 'Other Supplier', 'Inverter Types' (multi), Warranty, Number, Nominal Power, 'Costs per Inverter' = devCost×kW/1000, 'Inverter Type Cost', OBU}`; RequestModulePermission if other supplier, else `'Plant PV Cost'` | R:530 `inverterCosts`, R:1779 payload | PARTIAL (unreachable in the canvas; see B4) |
| W9 | **Save substructure** (`@8918`): `{Project, Substructure, 'Other Supplier', Label, 'Substructure Types', 'Substructure Cost' = Fixed/Tracker × Plant PV Capacity, OBU}`; permission flow or `'Plant PV Cost'` | R:543, R:1788 | PARTIAL (unreachable) |
| W10 | **Delete inverter / substructure** (`@15377`, `@15288`): cancellation (both send `ModuleType.Inverter`, sic), Remove, `'Plant PV Cost'` | R:1825 maps substructure → substructure module type | PARTIAL (the code "fixes" the canvas ModuleType; undocumented) |
| W11 | **Save BESS / Hydrogen / Substation** (`@12319`, `@13043`, `@13762`): `{Name, capacity (+ 'Energy Capacity [MWh]' for BESS), Supplier, Type (BESS/H2 from hidden `colDummyTypes`; Substation none), Project, OBU}` → `'Plant Storage / Hydrogen / Substation Capacity'` | R:748-753 sums only. **No payload shaping**, and `SimpleTypeRow` has no energy capacity | MISSING |
| W12 | **Delete BESS / Hydrogen / Substation** (`@16315`, `@16298`, `@16281`): Remove → capacity roll-up → `Select(btn_SetDefault…)` | Not modelled beyond the sums | MISSING |
| W13 | **Cancel request permission** (card `pcf_btn_…Buttons_Reset_1 / _PVModule_Reset / _Inverter_Reset / _Substructure_Reset.OnChange` @2634/@3780/@4448/@5107): `Requestpermissioncancellation.Run(email, appId, JSON({ModuleTypeGuid, ModuleType, Name, FlowRunId, FlowApprovalId}))`, then state = Canceled (Dataverse Patch **only for WTG**; PV/inverter/substructure patch the collection only) | R:1825 `buildCancellationPayload`; no UI, no hook | PARTIAL (rule) / MISSING (UI) |
| W14 | OBU on every create: `'Owning Business Unit': gblRecordSelectedProject.'Besitzer (Unternehmenseinheit)'` (all patches) | H:90-91 notes rule 4; R:122 `PLANT_LOOKUP.owningBusinessUnit` | PARTIAL |

## 3. Behaviour (OnVisible / OnSelect / OnChange / Navigate)

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| B1 | OnVisible resets every panel, popup and selection `loc*`; `locGeneratorsPageSize: 30` — `@63`. OnHidden clears all `col*` — `@15` | S:384-414 initial `useState`; R:174 `GENERATORS_PAGE_SIZE = 30` | COVERED |
| B2 | **Single selection across all seven galleries**: each card's `RowTransparent.OnSelect` blanks every other family's `locSelected…` and toggles its own (`@2925`, `@3915`, `@4658`, `@5317`, `@5949`, `@6524`, `@7100`) | S:298-303 / 384-386: `Selection = Record<PlantFamily, string\|null>`; `toggle` changes one family only | WRONG (canvas: one selected entity screen-wide; code: up to seven at once, so delete/edit commands for several families show together) |
| B3 | **Selecting a card also toggles its fold** (`UpdateIf(col…, Name = Selected.Name, {IsFolded: Not(…)})`). Every card starts **folded** (`IsFolded, true` in OnVisible); details hidden while folded (`…_Card.Height` @1344) | S:359-363 `folded[t.id] !== true` → WTG types **expanded by default**; folding only on WTG (S:674-684), independent of selection; the other 6 families always show their details | WRONG (canvas: all cards collapsed, click expands; code: WTG expanded, others never collapse) |
| B4 | Command bar `Items` (`@464`): addWTGType / addPVType (Add↔Edit) / **addInverterType & addSubstructureType `ItemVisible: false`** / BESS, Hydrogen, Substation (+ ParentKey "addOthers") / their deletes / Add Others / Delete Generator Type / Delete PV / Delete Inverter / Delete Substructure / Activate / Deactivate | R:809-923 transcribes every row, including the hidden inverter/substructure; S:534-547 | COVERED (+ D15c flat sub-menu DIVERGENCE) |
| B5 | `addWTGType` OnSelect clears `locSelectedGeneratorEntity / Inverter / Substructure / PvModule`, resets the cascade — `@791` | S:572-573 resets the form only; **selection kept** | PARTIAL |
| B6 | `addPVType` opens Edit when a PV row is selected (re-looked up); dirty flags reset — `@791` | S:574-585 prefill from `selectedPv` | COVERED |
| B7 | `addStorage / addHydrogen / addSubstation` open the panel **bound to the selected row** (Edit) — `@791` + fields `Value = locSelected…` (`@11871`, `@12678`, `@13399`…) | S:568 `openSimple` → `setSimpleForm({})`, **no prefill** | WRONG (canvas edits the selected record; code always opens blank) |
| B8 | `addOthers` itself has no Switch branch (no-op); children open the panels | S:591 `case "addOthers": openSimple("storage")` | WRONG (canvas: no action; code: opens the BESS panel) — side effect of D15c |
| B9 | Delete guards: `'Total Capacity' − <capacity> = 0` → `locPreventGeneratorCapacityPopUp`, else confirm. Applies to WTG type, PV, BESS, H2, Substation, the turbine delete (Effective Capacity) and **Deactivate** — `@791`, `@2177` | S:550-566, 592-633; R:1072, R:1103 (+1.21.753 O&M reason) | COVERED |
| B10 | Inverter / Substructure delete: no guard, confirm directly — `@791` | S:614-619 (SOURCE DEFECT comment) | COVERED |
| B11 | Add Generator (card bar) — `@1475`: select the type, new turbine with OBU, prefix `$"WTG {'Short Name'}_"`, **next index = `Max(colGeneratorsInProjectsTemporary, Index) + 1`** (all turbines of the project) | S:637-649 `next = max(siblings of this type) + 1` | WRONG (canvas: project-wide max; code: per-type max, so new names collide across types) |
| B12 | Turbine grid Edit (`OnChange @2177`, `EventColumn = "EditIcon"`): load the turbine, split the name into prefix + index, reset apply-all, open the panel | S:767-775 → `openTurbine(type, t)`; the prefix is always re-derived from the short name (S:1122) | PARTIAL (canvas keeps the turbine's own prefix `First(Split(Name,"_"))`) |
| B13 | Turbine grid Delete: guard, then confirm — `@2177` | S:776-786 | COVERED |
| B14 | Pagination: `UpdateIf(colGeneratorTypesPagging, …Page)`, container visible only when `Pages > 1` (`@1903`); `TotalRows` comes from the type's `'Number of Generators'` | S:721-742 always rendered; R:688 `pageCount`; R:2221/2228 texts | PARTIAL (the buttons always show; canvas hides the whole bar when ≤ 1 page) |
| B15 | Type panel cascade: Supplier → `Reset(cmb_Supplier_1)` / `Reset(HubHeight_1)`; Turbine Type → `Reset(NumberOfGenerator)` plus Dummy default height; Hub Height → `Reset(HubHeight_1)`, `Reset(NumberOfGenerator)` — `@14262/@14576/@14675` | S:450-457 clears turbineType/hubHeight; **does not clear numberOfGenerators / revisedHubHeight** | PARTIAL |
| B16 | Hub-height items filtered by **turbine type only** (`IsBlank(cmb_Supplier_1) \|\| vsb_turbinetype = …`), not by supplier — `cmb_Supplier_2.Items @14674` | R:418-423 filters by supplier **and** type | WRONG (minor; the canvas looks like a bug, see Q7) |
| B17 | Number of Generators OnChange computes `locGeneratorCostsPerWtg` (band + foundation × index), else 0 — `@14972` | R:488; S:427-430 `derivedCost` | COVERED |
| B18 | Country toggle OnSelect resets the cascade and validation — `@14131` | S:1046 | COVERED |
| B19 | Height approval popup: if `'Is Height Limitation For WTG'` and `IsBlank(approval)` and limit < height → `cmp_PopUp_Confirmation_WTGTypeHeightLimitation` / `…GeneratorHeightLimitation` (for **any** user who can press Save) — `@15214`, `@11631` | S:1031-1034, 1099-1102: popup only when `canOverrideHeightLimit` (PM), else **closes the panel without saving** | PARTIAL (in practice non-PMs are blocked by S5 anyway. On confirm the code only closes, S:1384) |
| B20 | Post-delete re-selection `Select(btn_SetDefaultSeletected_Item)`: first WTG type, else PV, else Hydrogen, else Storage, else Substation — `@137`, used after the WTG/PV/H2/BESS/Substation deletes | none | MISSING |
| B21 | Long-operation dialog `cmp_PopUp_Loading_Generators_Screen` with per-action texts (e.g. `$"PV Module '{label}' will be saved, please wait..."`, `$"Generator ""{DisplayName}"" will be saved, please wait..."`, `"{label} will be saved. Please waiting..."`) — `@16094` + every Save | S:937 `LoadingOverlay` for queries only | MISSING |
| B22 | Success / error `Notify` texts on every write (e.g. "Generator type was successfully saved for current project!", "PV Module type was successfully saved for current project!", "Error: … could not be saved. Internal error: originated on …") | R:1018 one banner constant only; R:2116/2121 NEW prefixes | MISSING |
| B23 | Add Substructure information dialog when Plant PV Capacity is blank or 0 ("Add Substructure information" / "Please add the module type first to calculate the cost correctly.") — `@791`, `cmp_PopUp_Common_Generators_Information @16102` | none | MISSING (low: unreachable, B4) |
| B24 | Navigate: header logo → `'Project Main Screen'` (`@225`); left nav `Navigate(TargetScreen)` (`@277`); `navigateBackKey` branch (dead: not in Items) | App shell (rail/header) | COVERED (shell) |
| B25 | Panel cancel / close icons reset fields and close (PV `@7229/@8222`, turbine `@10467/@11661`, BESS/H2/Sub `@11749…`) | S:416 `close`; forms re-seeded on open | COVERED |

## 4. State gates, validation and messages

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| S1 | Lock banner `Or(IsBlank('Project ID'), IsBlank('End Date'))`; bullets "• General" (`IsBlank('Project ID')`) and "• Milestones" (`IsBlank('Project Start Date')`) — `@337/@409/@427` | R:288-311; S:915, 926-935 | COVERED |
| S2 | Galleries and command bar `DisplayMode.Disabled` while the lock is visible — `@457`, `@1328`… | S:545 `enabled: connected && …`; gallery `disabled={!editable}` (`editable = connected`, S:916), **lock not considered** | PARTIAL (once connected, a locked project stays editable) |
| S3 | Body `con_…FirstColumn.Visible = !IsBlank('End Date')` — `@1319` | R:2138 `isBodyVisible`; S:914, 947 | COVERED |
| S4 | Add Generator `ItemEnabled = And(locGeneratorsGridTotalRows < 200, Status = Active)` + warning "Generators can only be added to an active generator type" + info button — `@1466/@1442/@1454` | S:667, 710-720; R:2204 (info button `ibut_…Checklist` not rendered) | PARTIAL |
| S5 | **PM-only height block** (type panel): label visible when catalogue hub height (or typed, when height = 0) + 0.5×rotor > limit, the limit is non-blank and `'Project Manager'.Id <> User().EntraObjectId`. It does **not** test `'Is Height Limitation For WTG'` — `lbl_…ErrorMessageProjectManager.Visible @15151` | R:1384 `heightBlocksSave` → R:1359 `heightLimitExceeded` returns false when `!isHeightLimitationForWtg` | WRONG (canvas: blocks non-PMs whenever a limit exists; code: only when the flag is on) |
| S6 | PM-only block (turbine panel) uses the **stored** `locSelectedGeneratorInProject.'Total Height'` — `@11560` | S:467-474 uses the computed height | WRONG (canvas stored; code live). Arguably a canvas bug, see Q3 |
| S7 | Type Save `DisplayMode`: no invalid rows, at least one dirty row, PM label hidden — `@15169`. The **Cost** row starts `Valid: true` and is set to `locGeneratorCostsPerWtg > 0` (field hidden) | R:1612-1634: `Cost = validateCostPerWtg(form.cost, …) ?? …`. `form.cost` is always `""` (S:305-308, no field) → `"Input must not be blank"` → R:1650 `canSaveType` is **always false** | WRONG (blocking bug: Save can never enable once connected. Tests pass only because they set `cost: "900000"`, rules.test.ts:346) |
| S8 | Number of Generators: blank → `gblAppResx.InputBlank` ("Input must not be blank"); non-integer → `gblAppResx.Numeric` ("Numeric value without decimals"); range → "Please select a value between 0 and 200."; the row also needs > 0 — `@14927` | R:1475-1488: non-integer → **"Value must be numeric."** | WRONG (text: canvas "Numeric value without decimals"; code "Value must be numeric.") |
| S9 | Number of Generators disabled until a hub height is selected (`DisplayMode @14965`); Turbine Type disabled until supplier; Hub Height until type | S:1056, 1065 for the combos; **number field never disabled** (S:1078-1083) | PARTIAL |
| S10 | Revised Hub Height `txt_…HubHeight_1` **visible only for a Dummy supplier** (`@14848`); range 1–200, two decimals, "Effective hub height needs to be a positive number below 200 m." | S:1072-1077 always rendered and marked required; R:1625-1628 | WRONG (canvas: Dummy only; code: always shown) |
| S11 | Supplier / Turbine Type / Hub Height error labels are filtered on `Name = "Generator"`, which never exists → **never shown** ("Value cannot be blank.") — `@14204/@14511/@14624` | S:1051/1058/1068 show "Input must not be blank" once dirty | WRONG (canvas: no message, text "Value cannot be blank."; code: shows "Input must not be blank"). Q8 |
| S12 | Turbine name validation: blank or "0" → "Value cannot be blank or '0'."; non-integer → "Value must be numeric."; duplicate **across `colGeneratorsInProjectsTemporary` (all project turbines)** → "The selected name for this WTG is already in use…" — `@10585/@10626` | R:1455-1469 texts correct; S:466 `otherIndices` = same type only | WRONG (scope: canvas project-wide; code per type) |
| S13 | Effective capacity: two decimals, `0.01…'Specific Capacity'`, "Value must be a numeric" / `"Please select a value between 0.01 and {Text(cap,"#.0#")} MW max."` (SOURCE DEFECT: checks GrossYield) — `@10759/@10778` | R:1521-1549 (corrected + parity fn); bound printed with `pfxRound(max,2)` | PARTIAL (format: canvas `"#.0#"` → "6.0"; code → "6") |
| S14 | Effective hub height 1–200, two decimals — `@11187/@11203` | R:1555 | COVERED |
| S15 | Foundation plinth: `IsMatch("^(-?(100(\.0+)?\|(\d{1,2}(\.\d{1})?)))$")` (comma variant for non-en), message "Foundation Plinth needs to be in range -100 to 100 with max 1 decimal"; blocks Save; default `Coalesce(Plinth, 0)` — `@10952/@10955/@11038` | R:1695-1700 allows blank, **two** decimals, no range; S:1147-1151 shows no error message | WRONG (canvas: −100..100, 1 dp, required; code: any 2-dp number or blank, silent) |
| S16 | Turbine Save `DisplayMode`: name/capacity/hub non-blank, 5 error labels hidden, ≥ 1 dirty row — `@11593` | R:1668-1702 | COVERED (except S6/S15) |
| S17 | Turbine form defaults: new → Effective Capacity = `Text('Specific Capacity',"#0.0#")`, Hub Height = `Text(Generator.'Hub Height',"#0.00")`, Plinth `0`; Total Height = formula only when dirty, else stored — `@10808/@11271/@11038/@11473` | S:641-647 new turbine: all `""` | WRONG (canvas pre-fills from the catalogue; code blank) |
| S18 | Apply-to-all checkboxes + warning "Are you sure you want to apply this change to all turbines of the selected WTG type?" + warning icon. **Plinth and hub-height boxes share `locApplyAllWTGHugHeights`** — `@10903/@11138/@11372` | S:1140-1171 three independent states | PARTIAL (canvas couples plinth and hub height; see Q4) |
| S19 | PV validation: Label blank → "Value cannot be blank."; Capacity two decimals 0–500 ("Numeric value with maximum of two decimals" / "Please select a value between 0 and 500."); Degradation 1st three decimals 0–100 ("Numeric value with maximum of three decimals" / "Please select a value between 0 and 100."); Remaining: "Value must be a number with three decimal" — `@7323/@7406/@7733/@7842` | R:2016-2046: "Input must not be blank", "Total Module Type Capacity [MWp] must be a positive number." (0.01–999 999), "Value must be a percentage between 0 and 100." | WRONG (ranges and all texts differ) |
| S20 | PV Save `DisplayMode`: no error label visible, label + capacity non-blank, supplier selected (+ Other Supplier text when supplier = "Other Supplier"); **no dirty requirement** — `@7949` | R:2049 `canSavePvType` requires `dirty.size > 0`; Other Supplier not in the gate | WRONG (canvas allows saving an unchanged edit; code does not. The Other-Supplier rule is missing) |
| S21 | PV MaxLength: Label 512, Capacity 6, Degradation 10, Other Supplier 512 — `@7343/@7447/@7774/@7670` | R:1992 `PV_MODULE_LABEL_MAX_LENGTH = 55` (+ length error); other fields none | WRONG (canvas 512; code 55) |
| S22 | PV Other Supplier field **visible only when supplier = "Other Supplier"** — `@7632` | S:1210-1213 always visible, required, not validated, not saved | WRONG |
| S23 | BESS / H2 / Substation validation and Save gate (dirty > 0 and no invalid): label blank "Value cannot be blank"; capacity two decimals 0–1000 (BESS power), 0–10000 (energy), **one** decimal 0–1000 (H2 / Substation); supplier blank; MaxLength 8/8/6/6 — `@11837…@13730` | S:1235 Save enabled whenever `connected`; S:1247-1251 no validation | MISSING |
| S24 | BESS / H2 / Substation **Type combos hidden** (`con_…StorageType.Visible = false` `@12190`, Hydrogen `@12914`, Substation `@13633`) | S:849, 860, 871 render a required, empty "BESS Type" / "Hydrogen Type" / "Substation Type" select | WRONG (canvas hidden; code shown) |
| S25 | Inverter / substructure panel validation (label, supplier, other supplier, type, warranty int 0–40, number int 0–1 000 000, nominal power 2 dp 0–1 000 000; "Supplier must be selected.", "Substructure Type must be selected.", "Value must be a integer"…); supplier `View` in edit mode | none (S:1240-1252 generic fields) | MISSING (low: unreachable, B4) |
| S26 | Command enablement per row (`ItemEnabled`): add = `CanEdit && !IsBlank(End Date)`; BESS/H2 `CanEdit && (selected \|\| count = 0)`; Substation without CanEdit (SOURCE DEFECT); deletes `RecordInfo(DeletePermission)` for WTG/PV/Inv/Sub only; Activate = EditPermission; Deactivate = Start Date && EditPermission — `@464` | R:809-923 one for one | COVERED |
| S27 | "Request permission" Save caption: type `If(Or(IsBlank(supplier), toggle), "Save", "Request permission")` — `@15215`; PV always "Save" — `@8183` | R:2329 `typeSaveLabel`; S:1026 | COVERED |
| S28 | Request-permission Cancel button visible when `FlowRunId` and `FlowApprovalId` are set and the state is not Approved (WTG/Inverter/Substructure); PV: state = 'Request Pending' — `@2701/@3847/@4515/@5174` | none | MISSING |

## 5. UI (controls, captions, aria-label, data-testid, layout)

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| U1 | Total capacity: `lbl_…PlantWtgCapacity` "Total Capacity [MW(p)]", value `'Total Capacity'`, `DisplayMode.View`, AccessibleLabel = control name — `@1285-1298` | S:939-945 `ReadOnlyField`; R:929 | COVERED |
| U2 | Command bar AccessibilityLabel `pcf_Generators_DisplayProject_Body_Form_CommandBar` — `@456` | S:921; R:2131 | COVERED |
| U3 | WTG card title `ThisItem.Generator.'Turbine Type'` (`@2868`); hover tooltip on the row button = **`ThisItem.Generator.DisplayName`** (`@2969`) | S:660, 686-689 tooltip = `typeSummaryTooltip` "supplier \| label MW \| …m Hub Height \| …m Total Height \|" (R:949, GUIDE-derived) | WRONG (canvas DisplayName; code a composed string) |
| U4 | WTG card **status label** `lbl_Generator_GeneratorStatus.Text = ThisItem.Status` (always visible) — `@2565/@2589` | none | MISSING |
| U5 | Request-state chip `ThisItem.'Request Permission State'` (WTG / PV / Inverter / Substructure; hidden for BESS/H2/Sub) — `@2749/@3726/@4562/@5221` | S:653-656 `permissionChip` on all families; R:1707 | COVERED |
| U6 | Height-limitation tag "Height Limitation" when any turbine `'Total Height' > limit` and the limit is non-blank — `@2797/@2857` | S:693-695; R:1397 | COVERED |
| U7 | WTG detail fields (visible): Supplier; Hub Height [m] (**Dummy supplier → first turbine's 'Hub Height excl. Foundation Plinth'**, format `Int? "#" : "#0.0#"`); Rotor Diameter [m]; Total Height [m] = **catalogue `Generator.'Total Height'`**; "Height Limitation [m]" = `gblRecordProjectPlanning.'Height limitation [m]'`; Number of Generators; Generators Capacity [MW] `Text(…,"#.0")`. Generators Cost hidden — `@1537-1881` | S:699-707, R:963-987 captions OK; hub = `fmtHubHeight(model.hubHeight)` (2 dp, no Dummy branch); total = R:936 `catalogTotalHeight` = hub + 0.5×rotor | WRONG (Total Height: canvas `Generator.'Total Height'` column [`vsb_totalheight`, already in R:69]; code computed. Dummy hub height branch missing. Formats differ) |
| U8 | Turbine grid columns: name (`ColDisplayName ""`, sortable), "Total Height" (`"#0.0#"`), "Effective Generator Capacity [MW]" (`"#0.0#"`), EditIcon / DeleteIcon (clickable only when the type is Active), InformationIcon when over the limit; tooltip "Generators list" — `@2104/@2325` | S:743-790; R:1001-1015, 2198-2215 | COVERED (sorting not offered: minor) |
| U9 | Pagination captions "Generators: N" (N > 1), "Page: X from Y" (Pages > 1); tooltips "Navigate to first page" / "previous" / "next"; AccessibilityLabels = control names — `@1914-2056` | S:722-741 aria-labels = control names, **no tooltips**; R:2221/2228 | PARTIAL |
| U10 | PV card visible fields: Supplier = `If(Other Supplier, Other Supplier, PVModule.Supplier, LookUp(PVModules…).Supplier)`; Total Module Type Capacity [MWp] `"#0.0"`; Degradation 1st / Remaining `[% per annum]` (`Int? "#" : "0.0#"`). Type/Size/Warranty/NumberOfModules/CostPerPower/Cost hidden. Title = Label; tooltip `$"{Name} {Other Supplier}"` — `@3090-3924` | S:959-969 captions OK; supplier = `r.supplier` (no Other-Supplier precedence); raw degradation numbers | PARTIAL |
| U11 | Inverter card: Inverter Type (multi-select joined with ","), Supplier (Other ?? Inverter.Supplier), Cost per Inverter [ISO] `"#,###.00"`, Number of Inverters, Total Inverter Type Cost [ISO], Nominal Power [kW], Warranty [y]; title = 'Inverter Label' — `@4051-4597` | S:970-983 captions OK; **5 of 7 cells blank** (`SimpleTypeRow` lacks the fields, H:69-71) | PARTIAL |
| U12 | Substructure card: Supplier, Substructure Type, Substructure Cost [ISO] `"#,##0.00"` + red "* Please add Module Type in order to calculate cost." + info "Please add Module Type in order to calculate cost." when Plant PV Capacity is blank/0 — `@4809-4971` | S:984-993 (type cell blank); no message or info button; cost via `fmtCurrency` (0 dp, "—" when blank, R:2103) | PARTIAL / WRONG (format: canvas `"#,##0.00"`; code no decimals) |
| U13 | BESS card: Power Capacity [MW] `"#,##0.00"`, Energy Capacity [MWh] `"#,##0.00"`, Supplier; title Name — `@5486-5888` | S:994-1003 energy cell `""`; `fmtCapacity` 1–2 dp | PARTIAL |
| U14 | Hydrogen / Substation cards: capacity `"#,##0.0"`, Supplier — `@6120/@6696` | S:1004-1017 | COVERED (format minor) |
| U15 | Card selection control: transparent row button + selection-dot image (AccessibleLabel `img_…RowSelectionDot`) | S:249-256 `Radio`, `aria-label={r.name}` (**bound data**, D16b) | PARTIAL |
| U16 | Fold icons `ico_…_Up` / `_Down` per family (AccessibleLabel = name) | S:674-684 WTG only, aria-label = turbine type label (bound data) | PARTIAL |
| U17 | Type panel captions: header "Add Generator Type"; filter message `"Generators available for {Country}"` / `"…not available for…"`; toggle caption "Show generator types which are available in my country and latest possible order date is valid"; "Supplier", "Turbine Type", "Hub Height [m]", "Number of Generators"; Save tooltip "Save Generator Type"; Cancel tooltip "Close" — `@13968-15274` | S:1022-1086; R:2298-2330 | COVERED (tooltips missing: minor) |
| U18 | Type panel hidden Cost field `con_…Fields_Cost.Visible = false` — `@14300` | not rendered | COVERED |
| U19 | Turbine panel: header `If(IsBlank(Name), "Add Generator", $"Edit Generator ""{Name}""")` with tooltip = Generator DisplayName; Generator Type (read-only), Generator Name + prefix label, "Effective Generator Capacity [MW]", "Apply to all WTG capacities", "Foundation Plinth [m]", "Apply to all WTGs" ×2, "Hub Height excl. Foundation Plinth [m]", "Total Height [m]" (disabled), PM message — `@10431-11560` | S:1089-1178; R:2333-2366 | COVERED |
| U20 | Turbine panel **Reset button `Visible: false`** — `btn_…Generator_Buttons_Reset.Visible @11587` | S:1103-1111 visible Reset button | WRONG (canvas hidden; code shown) |
| U21 | PV panel title "Add PV Module Type" / "Edit PV Module Type"; captions "Module Label", "Total Module Type Capacity [MWp]", "Supplier" (placeholder "Find supplier"), "Other Supplier", Degradation ×2 (**asterisks hidden** on both degradation fields `@7809/@7919`) | S:1181-1227 (degradation marked `required`, S:1216/1222); R:1956-1989 | PARTIAL (the required asterisk shows where the canvas hides it) |
| U22 | BESS/H2/Substation panel titles "Add BESS" / "Add Hydrogen" / "Add Substation" (no Edit arm); captions "BESS label", "Power Capacity [MW]", "Energy Capacity [MWh]", "Supplier", "Hydrogen label", "Hydrogen Capacity [MW]", "Substation label", "Substation Capacity [MW]" | S:840-873; R:2409-2450 | COVERED (aside from S24) |
| U23 | Confirmation popups: titles and descriptions verbatim ("Delete Generator Type?", "Are you sure to delete the WTG type: …? All related cost in O&M and Land Lease will be removed.", "Delete PVModule Type?", "Deactivate WTG?" / "Activate WTG?", …, "Height Limitation Exceeded") — `@15276-17339` | R:2453-2513; S:880-911, 1375-1385 | COVERED |
| U24 | WTG-type height popup text trims the display name: `Left(input, Len(input) - 2)` — `cmp_PopUp_Confirmation_WTGTypeHeightLimitation.Description @16646` | S:1033 passes the full `resolvedModel.displayName` | WRONG (minor) |
| U25 | Prevent-capacity popup: **one** title "Generator can’t be deleted/deactivated" (typographic ’) and **one** body "Before removing/deactivating the last generator, add/activate another one so that the project's capacity never drops to zero." — `@17392/@17475` | R:1023-1051 split into "Generator can't be deleted" / "…deactivated" and two bodies | WRONG vs 1.21.709 source (may be a 1.21.753 change; confirm) |
| U26 | "Cannot delete" information popup (`cmp_GeneratorData_PopUp_Information_GeneratorInProject @16074`): reachable only from commented code | not ported | COVERED (correctly omitted) |
| U27 | **aria-label = canvas AccessibleLabel** (= control name) for ~24 inputs: `cmb_Supplier`, `cmb_Supplier_1`, `cmb_Supplier_2`, `txt_…HubHeight_1`, `txt_…NumberOfGenerator`, `txt_…PvModuleType_Fields_Label` / `_PVCapacityMW` / `_DegradationFirstYear` / `_DegradationRemainingYears`, `cmb_…PvModuleType_Fields_Supplier`, `txt_…Storage_Fields_StorageLabel` / `_StorageCapacityMW_5` / `_6` / `_StorageSupplier`, `txt_…Hydrogen_Fields_HydrogenLabel` / `_HydrogenCapacityMW_2`, `txt_…Substation_Fields_*` (CONVENTIONS rule 16) | S:139, S:167: `InputField` / `SelectField` set `aria-label={label}` (the visible caption) | WRONG (canvas "txt_GeneratorData_RightPanel_Form_PvModuleType_Fields_Label"; code "Module Label"). The gate misses it because the label is an expression |
| U28 | data-testid = canvas control names (panel fields, Save/Cancel, galleries, pager) | S:1022-1372 names match the YAML; pager and turbine actions add `-${id}` | COVERED |
| U29 | Header (`cmp_Header`, Project header data, approval colours) and left nav (`cmp_Left_Navigation`) | App shell | COVERED |
| U30 | Report-problem panel `cmp_ReportErrorRightPanel_ProjectGenerators.Visible = gblShowReportProblemPanel` — `@16087` | shell / not on screen | COVERED (shell) |
| U31 | Load-error state (rule 19): no query `error` is rendered (hooks never error) | S:376-381 reads only `connected` / `isLoading` | MISSING (needed when connected) |

### Not in the 1.21.709 source (not scored)

Replace Generator Type and Replace PV Module Type panels (S:1257-1372, R:1139-1343) and the O&M dependency guard reasons (R:1086-1134). They are tagged `canvas-identity-ignore` and covered by UT-GEN-057..073.

---

## Counts

| Status | Count |
|---|---|
| COVERED | 34 |
| PARTIAL | 37 |
| MISSING | 12 |
| WRONG | 30 |
| **Total** | **113** (D15 + W14 + B25 + S28 + U31) |

A row with a split rating (D7, W7, U12, W13) is counted by its first rating. Counted with W7 and U12 as WRONG, the figures are PARTIAL 35 / WRONG 32.

---

## Proposed changes

### (a) UI layer — `Screen.tsx`

1. **[M]** Single selection screen-wide (B2). Replace `Selection` with `{family, id} | null`, and make selecting a card clear every other family. Fold and selection move together, and every card starts folded (B3), WTG included. Show detail cells only on an expanded card, for all 7 families.
2. **[S]** Revised Hub Height field shown only for a Dummy supplier (S10). Disable Number of Generators until a hub height is chosen (S9). Clear `numberOfGenerators` / `revisedHubHeight` in the cascade (B15).
3. **[S]** Hide the turbine Reset button (U20). Pre-fill new-turbine defaults: capacity = specific capacity, hub = catalogue hub height, plinth = 0 (S17). Keep the turbine's own name prefix on edit (B12).
4. **[S]** PV panel: show Other Supplier only when supplier = "Other Supplier", wire it into state and the save (S22). Remove the required asterisks on the degradation fields (U21). Add the MaxLengths 512 / 6 / 10 / 512 (S21).
5. **[M]** BESS / H2 / Substation panels: pre-fill from the selected row (B7). Remove the hidden Type selects (S24). Add per-field errors and the Save gate (S23, from new rules). Pass `maxLength` 8/8/6/6.
6. **[S]** `case "addOthers"` must not open a panel (B8). Extend the D15c divergence note.
7. **[S]** Add the WTG card status label (U4). Add the request-permission **Cancel** button per card, with the visibility rule (S28 / W13). Add the substructure "* Please add Module Type…" message and info button (U12). Add the Add-Generator info button (S4).
8. **[S]** Pager: hide the whole pager when pages ≤ 1, and add the tooltips (B14, U9).
9. **[S]** Tooltip on the WTG title = `Generator.DisplayName` (U3). Trim the last 2 characters of the display name in the type height popup (U24).
10. **[M]** Inputs: pass the canvas AccessibleLabel (control name) as `aria-label` wherever the YAML sets one (U27). The simplest fix is an `ariaLabel` prop on `InputField` / `SelectField`, defaulting to `name` for those ids. Better still, adopt `TextField` / `CostSelect` (D17e). Selection radios: use a configuration caption, not bound data (U15, D16b).
11. **[S]** Respect the lock (S2): `editable = connected && !isPageLocked(project)`, and disable the command bar while locked.
12. **[M]** Long-operation dialog and success/error toast surface for every write (B21, B22). Re-select after deletes with the `btn_SetDefaultSeletected_Item` order (B20). Render the load-error state (U31).
13. **[S]** The type-panel Save must take a derived cost: set `typeForm.cost` from `derivedCost`, or drop the Cost validation row (pairs with b1).

### (b) Business logic — `rules.ts` (+ `rules.test.ts`)

1. **[S] Blocking:** `validateTypeForm` Cost row. The canvas Cost row is `Valid = locGeneratorCostsPerWtg > 0` only (field hidden), so use `costRowValid(derivedCostPerWtg)` and ignore `form.cost` (S7). Add UT: "type Save enables with cost = '' and derived cost > 0". Also round cost per WTG to 2 dp (`Text(…,"#0.00")`, W1).
2. **[S]** `heightBlocksSave`: the PM block must not depend on `isHeightLimitationForWtg` (S5). Split it into `heightOverLimit` (limit non-blank) and `approvalRequired` (flag on). Turbine panel: decide stored vs live height (S6, Q3).
3. **[S]** Number of Generators non-integer text → "Numeric value without decimals" (`gblAppResx.Numeric`, S8). Supplier / turbine / hub "blank" messages: canvas never shows them (S11). Decide with the PO (Q8).
4. **[S]** Foundation plinth rule: −100..100, max 1 decimal, required (default 0), language-aware separator. Message "Foundation Plinth needs to be in range -100 to 100 with max 1 decimal" (S15). Wire it into `canSaveTurbine`.
5. **[S]** Turbine index scope: next index and duplicate check across **all project turbines** (B11, S12). Add a `projectIndices` argument.
6. **[S]** `validateEffectiveCapacity` bound format `"#.0#"` (S13).
7. **[M]** PV: ranges and texts per S19 (capacity 2 dp 0–500; degradation 3 dp 0–100; "Value cannot be blank."; "Value must be a number with three decimal" for Remaining). `canSavePvType` with no dirty requirement and the Other-Supplier conjunct (S20). `PV_MODULE_LABEL_MAX_LENGTH` 512 (S21). `buildPvTypeFields`: write the `vsb_PVModule@odata.bind` lookup and `vsb_othersupplier`, not `vsb_type` (W6). Add the shadow `GeneratorInProjects` row to the PV save plan.
8. **[S]** `pvSupplierOptions` from the `PVModules` catalogue, minus "Imported", with "Other Supplier" last (D12).
9. **[S]** `catalogTotalHeight` → `model.totalHeight` (`vsb_totalheight`; add it to `CatalogModel`). Dummy-supplier card hub height = first turbine's hub excl. plinth (U7). Per-card number formats (`#.0`, `#0.0`, `#,##0.00`, `#,##0.0`, `Int ? "#" : "0.0#"`); `fmtCurrency` 2 dp (U12).
10. **[S]** `LAST_CAPACITY_TITLES` / `_MESSAGES` per the 1.21.709 YAML, unless 1.21.753 is confirmed (U25).
11. **[S]** `planApplyToAll` must carry `'Total Height'` with the hub-height and plinth patches (W2). `substructureCost` default arm 0 for an unknown type (W7).
12. **[M]** New validators and payload builders for BESS / Hydrogen / Substation (S23, W11), and for inverter / substructure (S25) if those panels stay reachable.
13. **[S]** Hub-height cascade filter (B16): keep the supplier filter or match the canvas (Q7). Record the choice as a DIVERGENCE.

### (c) Data layer — `hooks.ts` (to connect)

**Tables in `TABLES` that are NOT registered in `power.config.json`:**
- `vsb_projectplannings`
- `vsb_invertertypeinprojects`, `vsb_substructuretypeinprojects`, `vsb_storagetypeinprojects`, `vsb_hydrogentypeinprojects`, `vsb_substationtypeinprojects`
- `vsb_devicecosts`, `vsb_estimationpriceinflations`

**Read by the canvas but not in `TABLES` at all:**
- `vsb_pvmodules` (PV supplier list)
- `vsb_inverters`, `vsb_substructures` (inverter / substructure suppliers)

**Registered already:**
- `vsb_projects`, `vsb_countries`
- `vsb_generators`, `vsb_generatortypeinprojects`, `vsb_generatorinprojects`, `vsb_pvmoduletypeinprojects`
- `vsb_devicetypesinprojects`, `vsb_landleaseprojectcosts`, `vsb_landleaseallocationwtgs`, `vsb_opexprojectcosts`

Flows not registered: `RequestModulePermission`, `Requestpermissioncancellation`.

1. **[S]** Register the 8 + 3 tables above with `pac code add-data-source`, and add `pvModules` / `inverters` / `substructures` to `ES_PLANT`.
2. **[M]** Read hooks: project (+ the `DataSourceInfo(Projects, CreatePermission)` conjunct, D2), planning, catalogue (no `statecode` filter unless the PO decides, D8), inflation, device costs (country filter decision, D10), and the 7 type lists with the canvas sort orders (D4/D5). Turbines with `$top` 30 paging. Extend `SimpleTypeRow`, or add family rows, with: inverter types / count / nominal power / warranty / cost per inverter; substructure types; BESS energy capacity; PV `otherSupplier` + `PVModule.Supplier`.
3. **[L]** WTG type save as one ordered `WritePlan`: type → DeviceType shadow → N turbines → permission flow **or** roll-up → AllWTG land-lease allocations, with OBU binds (W1, W14). Port the skeleton `persistGeneratorType` (`ProjectDocs/skeleton-reference/features/pm/generators/hooks.ts:549`) after fixing it against this report.
4. **[L]** Turbine save / delete with apply-to-all, type re-band and roll-up (W2, W3). Type delete with O&M and land-lease clean-up and cancellation (W4, see Q1). Status toggle with turbine propagation (W5).
5. **[M]** PV save / delete, including the shadow `GeneratorInProjects` row, the PV capacity / cost roll-ups and the substructure cost recompute (W6, W7).
6. **[M]** BESS / H2 / Substation save and delete with their capacity roll-ups (W11, W12). Inverter / substructure save and delete with the permission flow (W8–W10).
7. **[M]** Request-permission cancellation via the flow client, then patch the state to Canceled in Dataverse for **all** families (W13; the canvas patches the collection only for PV/Inv/Sub, see Q5).
8. **[S]** Permissions hook: `RecordInfo` Delete/Edit per selected row from record privileges (S26).

---

## Open questions for the product owner

1. **Delete WTG type and land lease.** `WTGsToDelete` filters `'Land Lease Allocation WTGS'` by `locSelectedGeneratorInProject` (a single turbine, usually blank), not by the type's turbines (`@15626`). So deleting a type does not delete its land-lease costs, although the dialog says "All related cost in O&M and Land Lease will be removed." Should land-lease clean-up cover every turbine of the type?
2. **Delete PV type.** The text promises O&M and land-lease clean-up, but the canvas removes neither. It also leaves the shadow `GeneratorInProjects` row that the PV save created (`@7973` / `@15466`). Should these be removed?
3. **Turbine PM height block** uses the **stored** total height (`@11560`). A new turbine, or an edit that raises the height, is not blocked for non-PMs, while an already-high turbine is. Should it use the live computed height (current code), or the canvas behaviour?
4. **Apply-to-all checkboxes.** Plinth and hub-height share `locApplyAllWTGHugHeights` (`@11141`, `@11375`), so ticking one ticks both. Is that intended, or should they be independent (current code)?
5. **Cancel request permission.** For PV / inverter / substructure the state is patched only in the local collection, not in Dataverse (`@3780`, `@4448`, `@5107`). The error text "Current project cannot be send to controlling for approval" is copied in from another screen. The canvas also sends `ModuleType.Inverter` when deleting a substructure (`@15288`). Fix all three?
6. **Device costs.** The canvas uses the first `'Device Costs'` row per device type, from any country (`OnVisible`). Should the rate be country-specific (current code)?
7. **Hub-height options.** These filter by turbine type only, ignoring supplier (`@14674`). Two suppliers sharing a type name would mix heights. Keep the supplier filter?
8. **Type-panel "Value cannot be blank." messages.** They are filtered on a non-existent row name `"Generator"`, so they never show (`@14204`). Show them, or keep them silent?
9. **Dead approval popup.** `cmp_GeneratorData_PopUp_ConfirmationHeightLimitationForGenerator` has a commented-out `Visible` (`@16637`). Its `OnConfirm` writes `'Effective Hub Height'` and skips Total Height and the DeviceType. Confirm it is dead, and that only `cmp_PopUp_Confirmation_WTGTypeHeightLimitation` is live.
10. **Unreachable Add / Edit Inverter and Substructure.** These are `ItemVisible: false`, but their galleries, selection and **Delete** are live. Should the inverter and substructure galleries stay visible, read-only and deletable?
11. **Substation permission.** `addSubstation.ItemEnabled` lacks `CanEditSelectedProject` (already a SOURCE DEFECT). Approve the fix (`fixSubstationPermission`)?
12. **Catalogue status filter.** The code adds `statecode eq 0`; the canvas shows inactive models too (D8). Confirm.
13. **Prevent-capacity popup.** The 1.21.709 wording is a single combined title and body. The code uses split titles. Confirm whether 1.21.753 changed this.

## Existing D15 items for this screen

- **D15c:** BESS / Hydrogen / Substation are rendered flat after "Add Others" (no sub-menu). Extend it to cover B8, where "Add Others" itself opens BESS.
- **D16b:** record-data `aria-label`s on `pm/generators` (the selection radios and fold buttons, U15/U16).
- **D16c:** non-unique per-row test ids on the WTG-card fields.
- **D17e:** local Dropdown wrapper, adopt `CostSelect`.
- **D17l:** `PanelFooter` duplicates `PanelButtons`.

New items to log under D15:
- S7 (type Save is blocked by the Cost row): **fix before connecting**.
- U27 (aria-label vs AccessibleLabel).
- S5 / S6 (height gate).
- W6 (PV supplier is written to `vsb_type`).
- B2 / B3 (selection and folding model).
- Q1–Q13.
