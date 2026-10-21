# Gap analysis — Project Production Screen

- Canvas: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Production Screen.pa.yaml` (9,472 lines, read in full: every block scalar to its end, commented formulas excluded). Cited as **Y:line**.
- Components used: `fn_Calculate_P75_P90`, `fn_Numeric(_With_Separtors)`, `cmp_PopUp_Confirmation`, `cmp_PopUp_Loading`, `cmp_Header`, `cmp_Left_Navigation`, `cmp_ReportErrorRightPanel`. Note that `fn_Numeric_Generators`, which lives on the Generators screen, is also referenced cross-screen.
- Code: `ProjectCosts-CodeApp/src/features/pm/production/`. `Screen.tsx` is cited as **S:**, `rules.ts` as **R:**, `hooks.ts` as **H:**. The tests are 76 rule tests (UT-PROD-0xx) plus 5 screen tests (UT-PROD-90x).
- Column names were verified against `ProjectDocs/_extracted/VSBCloud/customizations.xml`. `dataverse-attributes.json` does **not** contain `vsb_energyyield`, `vsb_pvseasonalityvalues`, `vsb_pvnegativeprices` or `vsb_projectrevenue`.
- State: UI built, not connected (D14). All hooks return `notConnected()` (H:119–154). Save, Delete and Status do nothing (S:394, 568, 577).
- The migration plan's §7 data-source list (012 plan:51) is wrong for this screen: it names Wind Mast Campaigns, Permits and other tables the YAML never touches.

Status legend: COVERED / PARTIAL / MISSING / WRONG (WRONG quotes canvas vs code).

## 1. Data

| # | Requirement (canvas) | Code | Status |
|---|---|---|---|
| D1 | `Energy Yields` for the project, `Sort(…, Name, Ascending)`, `IsFolded:true` (`OnVisible`, Y:42; reload in `btn_Load_StandardContracts_For_Project.OnSelect`, Y:8113–8127) | H:16–23 `orderby vsb_description asc` | WRONG — canvas sorts by `Name` (`vsb_name`); code plans `vsb_description`. |
| D2 | `$select` columns of `vsb_energyyield` | H:17–23, R:64–87 `YIELD_COL` | COVERED. All names are verified in customizations.xml, including `vsb_productionallocation` / `vsb_productionlossesp50` / `vsb_productionuncertaintyp75andp90` as bits. |
| D3 | `EnergyYieldRow` must carry the three radio modes so that Edit can restore them (`rad_*_Lossessp50/UncertaintyNet/Allocation.DefaultSelectedItems`, Y:3194–3208, 3531–3545, 5691–5705, 6020–6034) | R:189–206 has no mode fields; `formFor` S:156–165 resets them to defaults | MISSING. On Edit, the canvas shows the stored mode; the code always shows "Input losses" / "Input Uncertainty" / "Input Gross Yield". |
| D4 | Standard assumptions: `'Assumptions Revenues SQL'` where `country = project.Country.Name` and `valuetype = "seasonality"` / `"negativeprices"`, sorted by `category`. PV/WTG are `Value(x)*100` (locale-aware); negative prices are `Round(…*100, 1)` (`OnVisible` Y:42) | H:24–28, R:726–736 `parseFabricNumber` | PARTIAL. This is a Fabric source and is not connected (D15-j). |
| D5 | `locOAndMSubaccount = LookUp('Opex Subaccounts', Name="Operation & Maintenance")` (`OnVisible`) | H:45–47 | COVERED (planned) |
| D6 | Turbine list: `GeneratorInProjects` whose `ModuleTypeInProject` (as `GeneratorTypeInProjects`) belongs to the project (`OnVisible` `colGeneratorsInProjectsTemporary`) | H:41–44 `useTurbineCount` | COVERED (planned) |
| D7 | Stored seasonality on Edit: `LookUp('PV Seasonality Values', 'PV Energy Yield' = selected)`, used for **both** WTG and PV; months from `January…December`, flags from `ParseJSON('Standard Values JSON')` (Y:653–795, 846–990) | H:29–32, R:571–587 | COVERED (planned) |
| D8 | Stored negative prices on Edit: loaded **only if** `'Consider Negative Prices'`. It is the whole stored set, with `StandardReductionValue` taken from the standard (`.Wind` for WTG, `.PV` for PV) (Y:796–843, 991–1038) | S:257–268 merges stored rows onto a fresh 15-year COD curve | PARTIAL. Stored years outside COD…COD+14 are dropped from view. Undocumented DIVERGENCE. |
| D9 | Energy Yield **WTG** payload (`pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save_1.OnChange`, Y:5284). Fields: Project, Assessment, Description, `Wind Speed`, `Allocation`, Gross/p50/p75/p90 (×turbines for Each turbine), Losses/Uncertainty (blank for Each turbine), OBU, `Type=WTG`, losses-mode, uncertainty-mode, Consider Seasonality, Consider Negative Prices. Irradiation and Production Allocation are **not** written. | R:401–418 `deriveYieldFields`, R:421–442 `radioFields` | PARTIAL. The building blocks exist, but no payload builder chooses the per-technology column set. `deriveYieldFields` returns windSpeed **and** irradiation for both technologies. `radioFields` always includes `productionAllocation` (canvas: PV only). |
| D10 | Energy Yield **PV** payload (`pcf_btn_GeneratorData_RightPanel_Form_PVModuleType_Buttons_Save.OnChange`, Y:7964). Fields: Irradiation, Gross, Losses, p50, Uncertainty, p75, p90 (no turbine multiplier), OBU, `Type=PV`, Production Allocation, the two modes, both toggles. No Wind/Allocation. | as D9 | PARTIAL |
| D11 | Seasonality upsert `Coalesce(existing, Defaults)`: `Name: "Seasonality - "&Description`, lookup, 12 months, `'Standard Values JSON'` (`{"Jan":true,…}`), OBU. When the toggle is off, `Remove` the existing row (Y:5284, 7964) | R:590–602 `seasonalityFields`, R:571 | PARTIAL. Fields covered. The upsert-vs-remove decision and the OBU bind are not encoded. |
| D12 | Negative prices: `ForAll(colNegativePrices, Patch(Coalesce(match by Year, Defaults), {Name: "Negative Price - {Year}", lookup, Year, 'Net Yield p50 Reduction', 'Is Standard Value?', OBU}))`. When the toggle is off, `RemoveIf` all. The canvas never deletes orphan years. | R:648–681 | COVERED + DIVERGENCE: the code also deletes stored years outside the curve and skips unchanged rows. This is marked in R:641–647 but not logged in 02-OPEN-DECISIONS. |
| D13 | Revenue sync after save/delete/status (Y:5284, 7964, 9167–9212, 9241–9286) | R:692–708 `syncRevenueNegativePrices` | COVERED |
| D14 | External supersede: when `Assessment = External`, every **active Internal** yield of the same `Type` is set Inactive (Y:5284, 7964) | R:449–468 | COVERED |
| D15 | Recalc (`btn_Load_StandardContracts_For_Project.OnSelect`, Y:8014–9119) writes the Project roll-up: `Average(active WTG) + Average(active PV)` for Gross/p50/p75/p90, WTG average for Wind, PV average for Irradiation | R:482–521 | PARTIAL. Power Fx `Average` **ignores blank values**; `avg()` (R:482–486) counts a null as 0 in the denominator, so a yield with blank p75 lowers the average. Mark as WRONG once data is connected. |
| D16 | Standard-contract generation when `Net Yield p50 > 0 && Standard Cost Created = No`, in three families: Land Lease (Y:8270–8530), **Other OPEX** (`'Type Of Contract' = 'Opex Other'`, subaccount ≠ O&M, `Name: "Other OPEX Costs-{sub}-{desc}"`, periods 2+ linked via `'Parent Cost'`, Y:8531–8796), O&M per device type (Y:8797–9061) | R:1071–1189 land lease, R:1210–1311 O&M only | MISSING — the **Other OPEX** family has no builder at all. |
| D17 | Land-lease cost payload includes `Project`, `Subaccount`, `Currency`, OBU binds; the period `Aggregation` is mapped `'Opex Aggregation'.X → 'Land Lease Aggregation'.X` (Y:8504–8512) | R:1103–1127, R:1174 passes `a.aggregation` raw | PARTIAL. Lookup binds and Currency are not in `fields`. The aggregation is not translated between the two option sets (values not verified). |
| D18 | Generated dates: `'Start Date'` is a date | R:1172, R:1232 `toISOString()` | WRONG (rule 18, D17-o). The code writes a full ISO timestamp, and `new Date(cod)` (R:1001, R:1085, S:260) parses `yyyy-mm-dd` as UTC. |
| D19 | Flags after generation: `InitialP50Trigger=Yes`, `CapexStandardContractsCreated/CostsCreated/BoPStandardContractsCreated = No`. The flow call is commented out (Y:9062–9101) | R:1321–1328 | COVERED |
| D20 | Allocation generators = WTG generators **plus** PV module generators (`colGeneratorsInProject`, Y:8028–8097) | R:1076 `generators` param; `pvmoduletypeinprojects` not in `TABLES` (H:79–95) | PARTIAL |
| D21 | Delete: `Remove('Energy Yields', selected)`. Child seasonality/negative-price rows are not removed explicitly (Y:9236–9239) | none | MISSING (no delete plan). Cascade behaviour unknown (Q5). |
| D22 | Status change: Patch `Status` Inactive/Active, `Refresh`, sync, recalc (Y:9145–9214) | none | MISSING (no plan) |
| D23 | Permission `CanEditSelectedProject = DataSourceInfo(Projects, Create) && RecordInfo(project, Edit)` (`OnVisible`) | S:203 passes `canEdit: connected` | PARTIAL (D1). Not modelled. |

## 2. Behaviour

| # | Requirement | Code | Status |
|---|---|---|---|
| B1 | `OnVisible` (Y:42) runs in this order: init locs, refresh project, permission, collections, standard assumptions (Concurrent), **`locSelectedEnergyYield = First(colEnergyYieldsInProject)`** | S:187 `selectedId = null` | WRONG. Canvas: the first yield is pre-selected, so Edit/Delete/Activate are visible on entry. Code: nothing is selected. |
| B2 | `OnHidden` clears state (Y:15–41) | unmount | COVERED |
| B3 | Command `OnSelect` (Y:517–1077): `newProductionWTG`/`PV` open a blank panel with losses 15 / uncertainty 10 and the seasonality rows seeded from the standard | S:211–226, R:365 | COVERED |
| B4 | `editProductionWTG/PV` load the record, its seasonality and its negative prices | S:225–226, S:196–197 | PARTIAL (D3, D8) |
| B5 | Deactivate/Delete guard (`Net Yield p50 − selected p50 = 0 ∧ one active ∧ selected active`) → popup (Y:1040–1076) | S:228, R:1583–1593 | COVERED |
| B6 | Card `btn_Production_CardHeader_TransparentButton.OnSelect` selects only (it never folds) (Y:2341–2351). `ico_Production_CardHeader_Down/Up.OnSelect` toggle the fold **and** select (Y:2381–2440) | S:291–298, S:351–364 — one button selects and toggles | PARTIAL. Clicking the selected card collapses it in the code; in the canvas it does nothing. |
| B7 | WTG `txt_ProductionDataWTG_GrossYield.OnChange` / `TotalLosses.OnChange`: in "Input losses" mode, **`locNetYield50 = Gross × (1 − Losses/100)`** (Y:3107–3119, 3302–3306). PV is the same, with `Round(…,0)` from Gross (Y:5928–5931) | S:241–252 `effective` derives losses/p75/p90 only | MISSING. Net p50 is never derived. In "Input losses" mode the p50 field is disabled and empty, and `canSaveYield` (R:928–929) does not require it, so a save would write a **null p50**. |
| B8 | "Input Net Yield p50" mode: `Losses = (1 − p50/Gross) × 100` (Y:3112–3118, 3422–3428, 6238) | S:242–244, R:356–362 | COVERED |
| B9 | p75/p90 from p50 and uncertainty: `Round(p50 − z·p50·u, 0)`, with `"-1"` → blank (Y:3434–3450, 3819–3852, 6588–6621; `fn_Calculate_P75_P90`) | S:245–252, R:334–350 | COVERED |
| B10 | PV `txt_ProductionDataPV_Irradation.OnChange`: in "Input Irradiation" mode, **`Gross = Round(PlantPVCapacity[MWp] × Irradiation, 0)`**, then p50 from losses (Y:5788–5800) | none | MISSING. `ProductionProject` has no `plantPvCapacity` column (`vsb_plantpvcapacitymwp` is unverified). |
| B11 | Radio `OnChange` resets: losses radio blanks losses + p50 (PV also gross) and resets the inputs (Y:3214–3230, 6040–6061). Uncertainty radio blanks uncertainty, p75, p90 (Y:3551–3560, 6339–6348). PV allocation radio sets irradiation or gross to 0 (Y:5711–5718) | S:447–449, 465–467, 424–426 just set the mode | MISSING |
| B12 | Radios `DisplayMode` is View when editing (`rad_*_Assesment/Lossessp50/UncertaintyNet`, `rad_ProductionDataPV_Allocation`, Y:2800, 3209, 3546, 5552, 5706, 6035, 6334) | Assessment only (S:407). The others use `disabled={off}` | WRONG. Canvas: the modes are locked after create. Code: the modes can be changed on Edit. |
| B13 | Field `DisplayMode`: TotalLosses edits only in "Input losses"; p50 only in "Input Net Yield p50"; Uncertainty only in "Input Uncertainty"; p75/p90 only in "Input Net Yield p75/p90"; **PV Gross only in "Input Gross Yield"**; **PV Irradiation only in "Input Irradiation"** (Y:3300, 3418, 3623, 3787, 3962, 5786, 5921, 6122, 6235, 6410, 6581, 6731) | S:452, 459, 469, 475, 479; Gross S:441 and Irradiation S:429 are always editable | PARTIAL. The PV Gross/Irradiation gates are missing. |
| B14 | Seasonality toggle `OnCheck`: seed from the standard (discards stored values). `OnUncheck`: `Clear` (Y:4075–4183, 6824–6967) | S:483–485 toggles the flag only; `seasonEdits` survive | PARTIAL |
| B15 | Negative-price toggle `OnCheck`: seed 15 years from `Year(COD)`. `OnUncheck`: `Clear` (Y:4216–4262, 7000–7046) | S:257–269 always derives from the base | PARTIAL |
| B16 | Month edit: `UpdateIf(all, IsStandard → false)` then patch the row. Text is kept when it is not numeric (Y:4560–4603, 7261–7304) | R:547–557; S:514 `numericOr(d.value, 0)` | WRONG. Canvas keeps the typed text (`TextValue`). The code's controlled `Input value={String(number)}` turns "7." into "7" and "abc" into 0, so a decimal cannot be typed and invalid input never reaches `validateCellPercent`. The negative-price cells have the same problem (S:538–543). |
| B17 | Reset-all seasonality (`ico_ProductionSeasonalityYield{WTG}_MonthValueResetAll` / `{PV}_MonthValueReset_1`) (Y:4432–4470, 7133–7171) | S:495–502 | COVERED |
| B18 | Per-year negative reset to the standard (Y:5044–5074, 7721–7751) | S:545–550, R:1415–1424 | COVERED |
| B19 | Save order: close panel, show spinner "Please wait, saving....", then Patch the yield, then **Concurrent**(seasonality, negative prices, revenue sync), then supersede internals, then reset, then `Select(btn_Load_StandardContracts…)` (recalc, generation, flags), then hide spinner | S:394 just closes | MISSING. There is no `planSaveYield` WritePlan that fixes this order. |
| B20 | Panel close X (`pcf_CommandBar_ProductionDataWTG(_1).OnSelect`) and Cancel (`btn_Cancel_ProductionData*.OnChange`) close **without** confirmation (Y:2682–2691, 5325–5327, 5403–5412, 8004–8006) | S:232–235 shows the "Unsaved data" dialog when dirty | WRONG. Canvas: closes immediately. Code: a confirmation is added. SOURCE DEFECT: `cmp_PopUp_Leave_Procuction_Confirmation` is reachable only from logo/left-nav, and `colProductionFormValidation.Dirty` is never set true anywhere, so the canvas never shows it. Undocumented. |
| B21 | Logo / left-nav navigation with a dirty check (Y:167–180, 237–260) | shell; no navigation guard | PARTIAL (canvas guard is dead, see B20) |
| B22 | Flow calls | none live (`SynchroniseRecalculationCapexStandardCost` is commented out, Y:9082) | COVERED (R:31–42) |

## 3. State gates, validation, messages

| # | Requirement | Code | Status |
|---|---|---|---|
| G1 | Page lock `Visible = IsBlank('Project ID') ∨ IsBlank('End Date') ∨ Capacity 0/blank`, with bullets "• General", "• Milestones", "• Generator" and the title text (Y:312–430) | R:246–261, S:312–321 | COVERED |
| G2 | **Command bar `DisplayMode` Disabled while the lock is visible** (Y:458–463); gallery hidden and disabled (Y:1593–1614) | S:342 hides the gallery; S:208 enables commands without regard to the lock | PARTIAL. With a blank Project ID or End Date and capacity > 0, the code leaves the Add commands enabled. |
| G3 | Command `ItemEnabled = CanEdit ∧ Capacity ≠ 0`; visibility per type/status (Y:466–514) | R:285–319 | COVERED (canEdit = connected, see D23) |
| G4 | WTG Wind Speed: "Numeric value with maximum of two decimal" / "Please enter value between 0 and 15 " (trailing space); MaxLength 6 (Y:2927–2943, 2954) | none | MISSING (no validator, no message) |
| G5 | Gross Yield: WTG "Numeric value without Decimal", PV "Numeric value without decimal"; "Please select a value between 0 and 2,000,000."; MaxLength 10 (Y:3066–3095, 5891–5910) | none | MISSING |
| G6 | PV Irradiation: "Numeric value with maximum of three decimals" / "Please select a value between 0 and 3000."; MaxLength 10 (Y:5750–5775) | none | MISSING |
| G7 | Total Losses — WTG: derived < 0 gives "Please ensure Gross Yield > Net Yield p50"; then "…one decimals"; out of range also gives "Please ensure Gross Yield > Net Yield p50" (Y:3263–3289). PV: "…one decimals" / "Please select a value between 0 and 100." (Y:6093–6111) | R:782–793 (WTG behaviour for both) | WRONG for PV. Canvas PV range message: "Please select a value between 0 and 100."; code: "Please ensure Gross Yield > Net Yield p50". |
| G8 | Uncertainty — WTG: "…one decimals", 0–100. PV: "Numeric value with maximum of one decimal" (singular), range **0–3000**, "Please select a value between 0 and 3 000." (Y:3593–3612, 6380–6399) | R:795–801 (WTG only) | WRONG for PV. Canvas PV: range 0–3000 with the message above; code: 0–100 with "Please select a value between 0 and 100.". Likely SOURCE DEFECT (Q3). |
| G9 | Net p50: WTG "Numeric value without Decimal", PV "Numeric value without decimal"; "Please select a value between 0 and 2000000." (Y:3378–3407, 6195–6224) | R:808–816 | PARTIAL (the PV wording differs in case) |
| G10 | p75/p90 messages (Y:3736–3776, 3912–3951, 6531–6570, 6681–6720) | R:818–853, MSG R:745–772 | COVERED |
| G11 | Seasonality cell: "Must not be empty" / "Number (0–100) with max. one decimal", with the locale regex; total "Total must match 100%" shown when `Value(total) <> 100`; Save gate `Round(total,1) <> 100` (Y:4703–4751, 4829–4841, 5217–5224) | R:860–867, R:563, S:505–523 | PARTIAL. The message uses the rounded check, and cells never receive raw text (B16). |
| G12 | WTG Save gate: Description, Wind blank, 7 error labels, mode blanks, seasonality, negative regex (Y:5189–5266) | R:899–942 | PARTIAL. No Wind/Gross error check (no validators, G4/G5). |
| G13 | PV Save gate adds: **Irradiation blank when "Input Irradiation"**, plus the Gross and Irradiation errors (Y:7865–7946) | R:899–942 | MISSING for the irradiation checks |
| G14 | Description MaxLength 50 (Y:2864, 5619); NetYield MaxLength 15; Losses/Uncertainty MaxLength 6 | S:411–481 no `maxLength` | MISSING |
| G15 | Required asterisks: Gross when "Input losses" (PV: **and** "Input Gross Yield"); Losses, p50, Uncertainty, p75/p90 by mode; Irradiation when "Input Irradiation" (Y:3152, 3345, 3489, 3703, 3879, 4048, 5851, 5978) | S:430, 442, 451, 458, 469, 475, 479 | PARTIAL (the PV Gross condition is missing the allocation term) |
| G16 | Spinner texts "Please wait, saving...." and "Please wait, loading standard assumption contract..." (Y:8018, 8267) | R:1516 `UI.saving` only; not rendered | PARTIAL |
| G17 | Load-error state (rule 19) | S:607 loading only | MISSING (D17-i) |
| G18 | Description error label (integer 0–200) is a copy-paste with blank `Visible` (never shown) (Y:2837–2853, 5592–5608) | not ported | COVERED (log as SOURCE DEFECT) |

## 4. UI (controls, captions, aria-label, data-testid)

Canvas `AccessibleLabel`s on this screen are mostly **the control's own name** (Y:1172–6728, 44 entries). Rule 16 says the aria-label must equal them verbatim. The code mostly uses the visible caption instead. `check-canvas-identities` evidently does not see through `ReadOnlyField`/`TextField`/`NumericField`/`Choices`, so the gate stays green.

| # | Canvas control | Code | Status |
|---|---|---|---|
| U1 | `pcf_ProjectRevenues_Content_ContractCommandBar_1` (`AccessibilityLabel` = its name). Items "Add Production WTG", "Add Production PV", "Edit", "Delete", "Activate Production", "Deactivate Production" with icons Add/Edit/Delete/ActivateOrders/DeactivateOrders | S:204–210, 308–310 `ariaLabel="Production actions"`; item testids `command-<key>` | WRONG aria-label — canvas: "pcf_ProjectRevenues_Content_ContractCommandBar_1"; code: "Production actions". Activate/Deactivate icons missing (S:136). |
| U2 | Summary `txt_Production_DisplayProject_Body_Form_*` (6). Captions verbatim. Values come from the **stored project fields** with `Int()`-based formats ("###,###,###" / "###,##0.0#"; wind "#0.0##"; irradiation "###,##0.0##") (Y:1115–1582) | S:324–339 computes `projectYieldTotals` client-side; `fmtSummaryValue` shows "—" for 0 | PARTIAL. Captions and testids match. The values are recomputed instead of read from `vsb_projects` (DIVERGENCE, not logged), formats differ, aria-label is the caption instead of the control name. |
| U3 | Card label `lbl_Production_CardHeader_LabelWithDescription.Text = $"Production - {ThisItem.Type} {ThisItem.Description}"` (Y:2272) | R:1398–1399 `Production - ${description}` | WRONG — canvas: "Production - WTG North"; code: "Production - North". UT test pins the wrong text (rules.test.ts:1003). |
| U4 | `lbl_Production_Status` (Status), `lbl_Production_InternalExternal` (Assessment), `img_Production_CardHeader_RadioSelection`, `ico_Production_CardHeader_Down/Up` (Y:2294–2558) | S:359–363 | PARTIAL. The chevrons and the image are aria-hidden icons inside one button, so the `ico_…`/`img_…` testids are missing. Card testids are not row-suffixed (D16-c). |
| U5 | Detail labels "Description", "Gross Yield [MWh]", "Consider Seasonality", "Wind speed at Hub Height [m/s]" / "Irradiation [kWh/kWp]", "Net Yield p50 [MWh]", "Consider Negative Prices", "Total losses [%]", "Net Yield p75 [MWh]", "Uncertainty [%]", "Net Yield p90 [MWh]" in the 4-column order (Y:1698–2229) | R:1449–1472, S:366–380 | COVERED (captions and order) |
| U6 | Detail values: Seasonality / Negative Prices show the two-option **label** ("Yes"/"No", with "No" when blank) (Y:1844, 2012–2017); wind "0.0#" | S:378–379 `String(boolean)`; S:370 `fmtOneDecimal` | WRONG — canvas: "Yes"/"No"; code: "true"/"false". Wind is shown at 1 dp instead of up to 2. |
| U7 | Detail aria-labels: canvas `txt_ProductionDetails_*` names, including the source copy-paste errors (`txt_ProductionDetails_Seasonality` → "txt_ProductionDetails_Description", `…NegaticePricesPV` → "txt_ProductionDetails_NetYieldP50") | captions | WRONG (rule 16) |
| U8 | Panel title `$"{Add|Edit} Production {WTG|PV} {Description}"` (Y:2662, 5383) | R:1523–1527 | COVERED |
| U9 | Panel captions "Energy Yield Assessment", "Description", "Wind Speed at Hub Height [m/s]", "Irradiation [kWh/kWp]", "Gross Yield [MWh]", "Total Losses [%]", "Net Yield p50 [MWh]", "Uncertainty [%]", "Net Yield p75 [MWh]", "Net Yield p90 [MWh]", "Consider Seasonality", "Consider Negative Prices" | R:1474–1499 | COVERED |
| U10 | Panel field testids `txt_ProductionData{WTG|PV}_*`, `rad_*`, `tgl_*` | S:411–488 | COVERED (testids). aria-label WRONG: canvas uses the control names, e.g. "txt_ProductionDataWTG_GrossYield"; code uses captions. PV assessment canvas aria "rad_ProductionDataPV_Assessment" (double s) vs code name `rad_ProductionDataPV_Assesment`. |
| U11 | Radio options "Input losses"/"Input Net Yield p50", "Input Uncertainty"/"Input Net Yield p75/p90", "Input Irradiation"/"Input Gross Yield", `Choices('Yield Assessment')`, `Choices('Yield Allocation')` (WTG allocation View, default Whole plant) | S:139–143, 402–426 | COVERED |
| U12 | Info button `InfoButtonCanvas2` "Ensure that you already entered PV capacity…" (Y:5855–5858) | S:433–436 | COVERED |
| U13 | Seasonality block: "Seasonality", reset-all (tooltip "Reset to standard assumption."), per month a Month (view) and "Distribution [%]" input (italic when standard), "Total Sum [%]" (read-only); per-month reset `Visible:false` (Y:4345–4841, 7050–7521) | S:491–525 | PARTIAL. The month input testid `txt_ProductionSeasonalityYield{T}_MonthValue-{id}` is suffixed (fine), but there are no testids on Month/Total, and the `con_ProductionDataPV_SeasonalityYeildRightPanelBody` testid prefix is OK. |
| U14 | Negative Prices block: "Negative Prices", Year (view), "Reduction [%]", per-year reset (tooltip "Reset to standard assumption."); **no** header reset (Y:4845–5157, 7525–7834) | S:527–555 | COVERED |
| U15 | Footer Save (`Text = If(IsBlank(txt_GeneratorData_…_OtherSupplier), "Save", "Request permission")`, a cross-screen copy-paste) / Cancel; WTG AccessibilityLabels are their names (Y:5184–5328, 7861–8007) | S:394–398 PanelButtons, canvas testids | COVERED (log the "Request permission" branch as a SOURCE DEFECT). The aria "Save"/"Cancel" differs from the WTG AccessibilityLabel names. |
| U16 | `cmp_Delete_ProjectProd`: "Delete production?", `$"Are you sure to delete {Description}?"`, "Delete"/"Cancel"; icons CheckMark/Trash (Y:9223–9295) | R:1530–1536, S:559–570 | COVERED |
| U17 | `cmp_ActivateDeactivate_ProjectProd`: "Deactivate Production?"/"Activate Production?", `Are you sure you want to deactivate: {Description}?`, "Deactivate"/"Activate" (Y:9123–9221) | R:1542–1553 | COVERED |
| U18 | `cmp_PopUp_Leave_Procuction_Confirmation`: "Unsaved data", "You have unsaved data. Do you really want to leave current form without saving?", "Yes"/"Cancel" (Y:2569–2608) | R:1556–1561 | COVERED (text). Trigger is WRONG, see B20. `LEAVE_CONFIRMATION` (R:945–946) is a non-canvas string, unused. |
| U19 | Prevent popup: "Production can’t be deleted/deactivated", body text, "Close", plus close X `icn_PopUp_Common_Generators_PreventTotalCapacity_Cancel_1` (Y:9305–9471) | R:1564–1572, S:591–605 | PARTIAL (the X icon testid is missing; the surface testid is on the inner container) |
| U20 | `cmp_PopUp_LoadingSpinner_Production` with `locIsVisibleSpinnerText` | S:607 LoadingOverlay without text | PARTIAL |
| U21 | `cmp_ReportErrorRightPanel_ProjectProduction` (`gblShowReportProblemPanel`) | shell (D9) | COVERED by shell |
| U22 | Hidden controls (`btn_Seasonality_NegativePrice_Reset_Hidden`, `btn_Load_StandardContracts_For_Project` "Recalc", comment field `Visible:false`, hidden height label) | not ported | COVERED (correctly dropped) |

## 5. Counts

| Area | COVERED | PARTIAL | MISSING | WRONG |
|---|---|---|---|---|
| Data (23) | 8 | 9 | 4 | 2 |
| Behaviour (22) | 8 | 6 | 4 | 4 |
| Gates/messages (18) | 4 | 6 | 6 | 2 |
| UI (22) | 12 | 5 | 0 | 5 |
| **Total (85)** | **32** | **26** | **14** | **13** |

U10 (testids right, aria-labels wrong) is counted as WRONG.

## 6. Proposed changes

### (a) UI — `Screen.tsx`
1. **S** — Pre-select the first yield (sorted by Name) on load (B1).
2. **S** — Card header: the transparent button only selects; separate `ico_Production_CardHeader_Down/Up` buttons toggle (B6, U4).
3. **S** — Lock the Lossessp50, UncertaintyNet and PV Allocation radios on Edit (B12). Gate PV Gross and Irradiation by allocation mode (B13).
4. **M** — Derive Net p50 in "Input losses" mode and Gross from Irradiation × PV capacity. Apply the radio-change resets (B7, B10, B11). The logic goes through new rules.
5. **M** — Keep the raw text for the seasonality and negative-price cells (`TextValue`) and validate the text; store the number separately (B16, G11).
6. **S** — Rebuild seasonality and negative-price rows on toggle on; clear on toggle off (B14, B15).
7. **S** — Remove the unsaved-changes confirm on panel close, or log it as a DIVERGENCE (B20).
8. **S** — Disable the whole command bar while the page lock shows (G2). Add the Activate/Deactivate icons (U1).
9. **S** — Set `maxLength` on every field (G14). Fix the PV Gross required condition (G15).
10. **S** — Render the spinner texts (G16) and an `EmptyState` on load error (G17).
11. **S** — aria-labels: switch to the canvas `AccessibleLabel` names (U1, U2, U7, U10). Needs a D16-b decision, because Tosca may currently key on captions.
12. **S** — Detail values: Yes/No labels; wind "0.0#" (U6).

### (b) `rules.ts` (+ tests)
1. **S** — `productionRowLabel(type, description)` → `Production - {WTG|PV} {desc}`. Fix the test at rules.test.ts:1003 (U3).
2. **M** — Add `validateWindSpeed`, `validateGrossYield(tech)` and `validateIrradiation` with verbatim messages. Make `validateTotalLosses`, `validateUncertainty` and `validateNetYieldP50` technology-aware (PV wording and ranges). Extend `canSaveYield` with the PV irradiation checks (G4–G9, G12, G13).
3. **S** — `deriveNetP50(gross, losses, tech)` (WTG unrounded, PV `Round(…,0)`) and `grossFromIrradiation(capacityMWp, irr)` (B7, B10).
4. **S** — Add the radio modes to `EnergyYieldRow` and `formFor`, plus a `modesFromRow` rule (D3).
5. **M** — `buildYieldPayload(form, tech, ctx)`: the per-technology column set (WTG has no irradiation/production allocation; PV has no wind/allocation), plus the OBU, project, type and mode binds (D9, D10).
6. **M** — `planSaveYield` / `planDeleteYield` / `planStatusChange` as `WritePlan`s that fix the canvas order: yield, then seasonality and negative prices, then revenue sync, then supersede, then recalc, then generation, then flags (B19, D21, D22).
7. **M** — `buildOtherOpexContracts` (D16). Translate Opex → Land Lease aggregation and add the Currency/Subaccount/Project binds (D17).
8. **S** — `avg()` skips blanks the way Power Fx `Average` does (D15).
9. **S** — Write date-only values with `dateOnly`, and parse COD from local parts (D18).
10. **Docs, S** — Log in 02-OPEN-DECISIONS: D8, D12, U2 (recomputed summary), B20 and G8 (PV 0–3000).

### (c) `hooks.ts`
Tables **not in `power.config.json`**: `vsb_energyyield`, `vsb_pvseasonalityvalues`, `vsb_pvnegativeprices`, `vsb_projectrevenue`. `Assumptions Revenues SQL` is Fabric, not Dataverse (D15-j). Already registered: vsb_project, vsb_opexsubaccount, vsb_opexprojectcost, vsb_landleaseprojectcost, vsb_landleaseperiod, vsb_landleaseallocationwtg, vsb_countryinflationprofile, vsb_generatorinproject, vsb_generatortypeinproject, vsb_pvmoduletypeinproject, vsb_devicetypesinproject, vsb_opexlandleasestandardassumptions.
1. **S** — Order yields by `vsb_name` (D1). Add `ES_PLANT.pvModuleTypeInProjects` to `TABLES` (D20).
2. **M** — Register the four tables. Implement `useEnergyYields` / `useStoredSeasonality` / `useStoredNegativePrices` / `useProjectRevenues` / `useTurbineCount` / `useOandMSubaccount` / `useProductionProject` (add the stored roll-up columns and `vsb_plantpvcapacitymwp` once verified).
3. **L** — Mutations: save, delete, status and recalc + generation, which together are about 1,100 canvas lines. Run them as an ordered WritePlan, using `deleteRecord` for removes and `OwningBusinessUnit@odata.bind` on every create. Invalidate yields, project and revenues afterwards.
4. **M** — Fabric connector for `Assumptions Revenues SQL`, pending the D2-style decision.
5. **S** — Permission: compute `canEdit` from project privileges (D1/D23), not from `connected`.

## 7. Open questions for the product owner
1. **Summary tiles:** show the project's stored roll-up (canvas), or recompute it live from the yields (code)? Should blank or zero values show "—" or nothing?
2. **Unsaved-changes confirm:** the canvas never asks (its dirty flag is never set). Keep the code's new confirm on panel close, or drop it?
3. **PV uncertainty range:** the canvas allows 0–3000 with the message "0 and 3 000". Is that a defect (should it be 0–100 like WTG)?
4. **Radio modes after create:** the canvas locks losses, uncertainty and allocation modes once a yield exists. Confirm that this stays.
5. **Delete cascade:** when a yield is deleted, are its PV Seasonality / PV Negative Prices rows cascade-deleted by Dataverse, or must the app remove them?
6. **Negative-price years:** after a COD change, should stored years outside the new 15-year window be deleted (code) or kept (canvas)?
7. **Averaging:** should a yield with a blank p75/p90 count as 0 in the project average (code), or be skipped (Power Fx)?
8. **Other OPEX standard contracts:** confirm that this third generated family is still required. It is missing in the code.
9. **Fabric source:** how will `Assumptions Revenues SQL` be reached from the code app (D2/D15-j)?
10. **aria-labels:** switch to the canvas `AccessibleLabel` control names (rule 16), or keep the captions that Tosca may already use?
