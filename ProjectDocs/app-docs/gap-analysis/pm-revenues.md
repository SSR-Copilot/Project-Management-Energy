# Gap analysis — Project Revenues Screen (PM)

> **Historical (written before D33).** This report describes the screen *before* it was connected,
> and most MISSING / WRONG rows below were fixed on 20 Oct 2026. For the current state read
> `02-OPEN-DECISIONS.md`: **D33** (connected; the card gallery), **D57** (29 Oct 2026: Fabric
> `Assumptions Revenues SQL` connected; the live-canvas visual parity pass). The open questions are
> in `PM-OPEN-QUESTIONS-2026-10-20.md` (V1–V9).

- **Canvas:** `ProjectDocs/_extracted/msapp/projectmanagement/Src/Project Revenues Screen.pa.yaml`. It is 12 771 lines and 289 controls, and it was read in full with only styling properties filtered out. "L" = a line in this file.
  - Components used: `cmp_Header`, `cmp_Left_Navigation`, `cmp_Information_Button`, `cmp_PopUp_Confirmation` ×3, `cmp_PopUp_Information`, `cmp_PopUp_Loading`, `cmp_ReportErrorRightPanel`, `fn_Numeric` (IsInteger / IsOneDecimal / IsTwoDecimal / IsThreeDecimal) and `fn_Common` (IsValidCurrency).
  - Globals: `gblAppResx` (App.pa.yaml:1625-1634): `Numeric` = "Numeric value without decimals", `NumericOneDecimals` / `NumericTwoDecimals` / `NumericThreeDecimals` = "Numeric value with maximum of one / two / three decimals".
  - `colRevenueSubaccounts` = `Sort('Revenue Subaccounts', Order)` (App.pa.yaml:604-609).
- **Code:** `ProjectCosts-CodeApp/src/features/pm/revenues/`
  - `Screen.tsx` (1 116 lines), `rules.ts` (1 943), `hooks.ts` (374)
  - `rules.test.ts` (105 `it`), `Screen.test.tsx` (7 `it`)
- **State:** UI built, not connected (D14). Every hook returns `notConnected()`. Save, Delete and Confirm have no write. Known items: D15 f/g; Fabric SQL source D15 j / D2.
- **Version drift:** the code ports the Italy changes from **solution 1.21.753** (gap register `10-solution-1.21.753-gap-register.md` G-03 / G-03a), but the YAML on disk is **1.21.709**. Rows marked **[753]** differ from the on-disk YAML for that reason.
- **Reference coverage:**
  - `dataverse-attributes.json` holds only `vsb_Project` and `vsb_CountryInflationProfile` of this screen's tables. Every `PROJECT_COL` name was checked and matches.
  - `REVENUE_COL` / `FLAG_COL` / `BALANCING_COL` / `HEDGE_VOLUME_COL` (`hooks.ts:115-189`) cannot be verified from the reference.

Legend: COVERED / PARTIAL / MISSING / WRONG. A WRONG row quotes canvas vs code.

## 1. Data

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| D1 | `OnVisible` L31-37: re-read `Projects`. Reads COD, FID, the 5 milestone dates, Country, Area, Technology, NetYieldP50, TotalCapacity, EndDate, 'Project ID', Cluster State (Name and `.Order`: L2983, L3012, L3060, L3113), 'Besitzer (Unternehmenseinheit)' | `hooks.ts:17-20`, `93-113`, `211-237`, `314-316` (`notConnected`) | MISSING | Column names are verified. Two defects: `countryCode` is mapped from the lookup's formatted **name** (`hooks.ts:219-221`, self-flagged), and `RevenueProject` has no **Cluster State Order** (`Screen.tsx:25-27`). |
| D2 | `OnVisible` L77-87: `ClearCollect(colProjectRevenueContracts, AddColumns(Filter('Project Revenues', Project = …), IsFolded, false))`; the gallery sorts on `'Created On'` ascending (L819) | `hooks.ts:26-30`, `333-335` | MISSING | The plan is right. The `IsFolded` UI state is not modelled (see B7). |
| D3 | `OnVisible` L88-94: `Filter('Balancing Prices', Project = …)`; sort `'Created On'` ascending (L3257) | `hooks.ts:31-33`, `338-340` | MISSING | |
| D4 | `locCountryRelatedAssumptions` (Add L729-742, Edit L978-991): Italy with a region → `Filter('Assumptions Revenues SQL', Or(country = "Italy", country = locAreaWithRegion))`, else `country = Country.Name`. The revenuetype check (L5453-5459) uses `country = Country.Name` | `rules.ts:315-342` `assumptionScope` = `startswith(country,'Italy')`; `hooks.ts:21-25`, `326-330` | WRONG [753] | On-disk: `Or(country="Italy", country=region)`. Code: `StartsWith(country,"Italy")`. The source is Fabric SQL and is not connected (D2). |
| D5 | `locAreaWithRegion` Switch L143-203: "Italy_Centre - South" / "Italy_Centre - North" (with spaces); key `"Valle d’Aosta"` (U+2019) | `rules.ts:266-291`: "Italy_Centre-South", and `"Valle d'Aosta"` (U+0027) | WRONG [753] + apostrophe | The zone spelling follows 1.21.753. The apostrophe differs on any version: the Dataverse value with U+2019 will not match the U+0027 key, so the region falls back to `null`. |
| D6 | Price (L5996-6391): exact `category = Text(Year(COD))`, else the clamp/nearest fallback that compares **prices to years** (SOURCE DEFECT); `Language()` re-pointing of the decimal separator | `rules.ts:689-778`; `Screen.tsx:257` uses `priceForYear(pricePoolFor(…))` | PARTIAL | The screen uses the corrected `priceForYear`, not `priceForYearCanvasParity`. `pricePoolFor` filters to the Italy zone [753]; on-disk L5999-6002 has no Italy branch. The divergence is not logged in D15. |
| D7 | p90 price L6394-6461: wind only | `rules.ts:785-790`; `Screen.tsx:258` | COVERED | |
| D8 | `Energy Yields` existence check (L1007-1016, L6912-6921): project, `'Consider Negative Prices' = Yes`, `Status = Active` | `hooks.ts:37-39`, `348-350` | MISSING | `vsb_energyyields` is not registered. |
| D9 | `Country Inflation Profiles` lookups, `Max(LookUp(…, Country, Year[, Area]).Inflation, 0)` (L7010-7019, L10300-10309, L10649-10671) | Rule exists (`rules.ts:920-948`); hook `hooks.ts:353-357` is **never called** from `Screen.tsx` | MISSING | |
| D10 | `First(colRevenueSubaccounts)` (L62; App.pa.yaml:604) | `hooks.ts:43-44`, `360-362` | MISSING | `vsb_revenuesubaccounts` is not registered. |
| D11 | `Currencies` lookup PLN/EUR (L7351-7362; payload `Currency: drp.Selected`) | `rules.ts:585-589`; `hooks.ts:45-47`, `365-367` | MISSING | The rule is fine; the id lookup is missing. |
| D12 | Edit: `Filter(RevenueIndividualHedgeVolumes, RevenueContract = …)` → rows `{Year, StartDate, EndDate, VolumeValue}` (L1468-1497) | `hooks.ts:34-36`, `343-345`; `Screen.tsx:232`, `324` | MISSING | |
| D13 | Contract `Patch('Project Revenues', …)` L4806-4995: Name, Project, Subaccount, Label, Description, Currency, Bidding/SQ/SQp90/CF/CFp90 (0 when the container is hidden), Tariff, Tariff p90, Start, DurY, DurM, End, Use Inflation, Inflation Start Year, Use Country Inflation, **'Inflation Country Area' = project Area** (L4865), Inflation Profile, **Owning Business Unit** (L4879), Consider Negative Prices, NegativePriceManualOverride, Hedge Type, Hedged Volume (else 0), FixedContractedmwhpa (else Blank) | `rules.ts:1585-1671` `buildRevenuePayload` | PARTIAL | `vsb_inflationcountryarea` and the OBU bind are missing from the payload. SQ p90 / CF p90 are gated on `showsGermanFitBlock` (`<> PV`), but their canvas containers are `= Wind` (L8634-8639, L9003-9007), so a German **Hybrid** FiT writes non-zero values where the canvas writes 0. |
| D14 | The 14 `Is … Standard Assumption?` flags in the payload (L4880-4976). Includes the SOURCE DEFECT: `'Is Use Custom Inflation…'` tests `.StandardAssumptionValue` (L4935) | `Screen.tsx:228` `const [, setFlags]`, so the value is **discarded**; no flag builder in `rules.ts` | MISSING | `buildRevenuePayload` takes `flags`, but nothing computes them. |
| D15 | After save (L4997-5056): Collect/UpdateIf the collection; **`RemoveIf(RevenueIndividualHedgeVolumes, contract)` for every hedge type**; then, for Individual, a `ForAll` Patch `{Year, RevenueContract, StartDate, EndDate, OBU, IndividualContractedmwhpa}` | Plan only, `hooks.ts:53-57` | MISSING | |
| D16 | Hedge 100 % pre-check query (L4740-4787) | `rules.ts:1099-1173`; `hooks.ts:48-51`, `370-374`; `Screen.tsx:233-235` | COVERED | Logic and query plan are ported. The data is not connected. |
| D17 | Balancing `Patch('Balancing Prices', …)` L4534-4595: Name `"Balancing Price "&n`, Project, Periods (P1…P10), Shift (first or sole period only, else Blank), Duration Year/Month, Price. **No start/end date, no OBU** | `rules.ts:1203-1215` (period, name, start helpers). No payload builder; `BALANCING_COL` has start/end/referenceCod (`hooks.ts:165-178`); the JSDoc says every create binds OBU (`hooks.ts:56`) | MISSING | Decide whether dates are written (see the questions). |
| D18 | Deletes: contract `RemoveIf('Project Revenues')` → collection → `RemoveIf(RevenueIndividualHedgeVolumes)` (L12704-12715); balancing `RemoveIf('Balancing Prices')` (L12670) | `Screen.tsx:1079`, `1092` only close the dialog; plan `hooks.ts:55` | MISSING | |
| D19 | Data-source registration | `TABLES` `hooks.ts:78-88` | MISSING | Not in `power.config.json`: `vsb_projectrevenues`, `vsb_balancingprices`, `vsb_revenueindividualhedgevolumes`, `vsb_energyyields`, `vsb_revenuesubaccounts`. Present: `vsb_projects`, `vsb_countries`, `vsb_countryinflationprofiles`, `vsb_currencies`. Plus Fabric 'Assumptions Revenues SQL'. |
| D20 | Logical names for the revenue tables | `hooks.ts:115-189` | PARTIAL | Not in `dataverse-attributes.json`; the names come from `customizations.xml`. |

## 2. Behaviour

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| B1 | `OnVisible` L116-130: tab = "Contracted Revenue" on every visit | `rules.ts:128-136`; `Screen.tsx:214-220` `?tab=` | PARTIAL | DIVERGENCE: the tab persists across visits. Not in D15. |
| B2 | `tab_….OnChange` L670-671 | `Screen.tsx:500` | COVERED | |
| B3 | `btn_Revenue_AddContract.OnSelect` L723-791: opens the panel with every field Reset. **The Type dropdown is empty**; the engine runs only on `Label.OnChange` | `Screen.tsx:294-299`: `setForm(applyAssumptions("PPA"))` | WRONG | Canvas: blank Type and no derived values. Code: pre-selects "PPA" and fills every field. |
| B4 | `drp_…Label_1.OnChange` L5436-7070, the standard-assumption engine: description, currency, start date, hedge type %, **standard Hedged Volume (`valuetype="hedgedvolume"`, L5873-5906)**, durations, price, p90, CF=1, 4-part inflation, end date, fixed reset, `locRevenuePriceActual`, negative-price state, std flags/values, and the country-inflation recompute when the toggle is on (L7006-7051) | `Screen.tsx:247-292`, `652-655`; `rules.ts:383-1035` | PARTIAL | Missing: the standard hedged volume (`emptyHedge()` at `Screen.tsx:281`; `rules.ts` has no `hedgedvolume` rule), the country-inflation recompute, and the flags (D14). |
| B5 | Edit (`pcf_…ContractCommandBar_3.OnSelect` L959-1497): rehydrate from the record (price from Bidding for German FiT else Tariff, `IsStandardAssumption` per field, hedge, inflation, currency, negative price) | `Screen.tsx:301-338`; `rules.ts:1723-1733` | PARTIAL | `setFlags(c.flags)` is discarded. The `std` flags per field are lost on edit. |
| B6 | Delete command → popup (L1498-1499) | `Screen.tsx:418` | COVERED | |
| B7 | Card fold/unfold `ico_…CardHeader_Up_1/_2.OnSelect` (UpdateIf `IsFolded`) L2863-2933 | none | MISSING | The table has no fold. Accept the divergence or add row expand. |
| B8 | Every field `OnChange` sets `locStandardAssumtionContract: false` (e.g. L7180, L7598, L7833, L8306, L9543, L10449, L11571, L12300). Description `Value` then strips `"Standard "` (L7207-7222) | `Screen.tsx:341-344` `patch` never clears `isStandardContract`; `rules.ts:565` `dropStandardPrefix` is unused | MISSING | So the "Standard " prefix is never dropped, and the description error (V9) can never fire. |
| B9 | Start date `OnChange` L7598: inflation start year = `Year(start)` (non-standard); end date with guard; regenerate Individual Volumes (`Select(btn_IndividualHedgeVolumeDuration_Recalculate)`) | `Screen.tsx:683-691` | PARTIAL | End date is covered. The inflation start year and the volume regeneration are missing. |
| B10 | Duration years/months `OnChange` L7815-7900, L7999-8070: end date with guard; months coalesce; regenerate volumes | `Screen.tsx:723-744` | PARTIAL | No volume regeneration. |
| B11 | `ico_SetCODDate_RightPanelRevenue_1.OnChange` L7568: re-derive the start date (IsStandard = true), end date, dirty, regenerate volumes | `Screen.tsx:694-713` | PARTIAL | The flag stays non-standard and the volumes are not regenerated. |
| B12 | German FiT: Tariff `Default = Bidding × CF` (L9438-9462). **Tariff p90 `Value = Bidding × CF_p90`** (L9904-9927). Bidding `OnChange` also refreshes `locRevenuePriceP90` (L8302-8318) | `Screen.tsx:763-766`, `791-794` recompute p50 only; p90 stays the static `form.tariffP90` (`Screen.tsx:819-826`) | WRONG | Canvas: p90 = Bidding × CF_p90. Code: p90 = the assumption p90 price, never recomputed. |
| B13 | Tariff `OnChange` L9515-9601 (non-standard on change, value when valid) | `Screen.tsx:817` | COVERED | |
| B14 | Correction factor p50/p90 `OnChange` L8912, L9098 | `Screen.tsx:791-805` | COVERED | |
| B15 | Site Quality p50/p90 `OnChange` L8543, L8712 (dirty only) | `Screen.tsx:773`, `781` | COVERED | |
| B16 | Inflation toggle OnCheck/OnUncheck L10434-10497 | `Screen.tsx:836-837` | COVERED | |
| B17 | Country Inflation toggle OnCheck L10265-10342: look up the inflation value and set it non-standard; OnUncheck L10343-10394 | `Screen.tsx:846-847` toggles only; `applyCountryInflation` (`rules.ts:935-948`) is unused | PARTIAL | |
| B18 | Inflation Start Year `OnChange` L10612-10705: when the country toggle is on, re-look-up the inflation (Italy adds `Area`) | `Screen.tsx:857` | PARTIAL | No lookup. |
| B19 | Custom inflation `OnChange` L10926-10959 | `Screen.tsx:875` | COVERED | |
| B20 | Negative-price toggle OnCheck/OnUncheck → `ManualOverride: true` (L11136-11172) | `Screen.tsx:891`; `rules.ts:993-994` | COVERED | |
| B21 | Re-sync icons `ico_SyncNegativePrice_RightPanelRevenue.OnChange` L11191-11284 and `Icon1.OnSelect` L11316-11413 (Visible when DisplayMode = Edit, L11427): reset to the assumption state, `ManualOverride: false` | none | MISSING | |
| B22 | `rad_ProjectRevenue_HedgeType.OnChange` L12296-12410: % keeps the hedged value; Fixed/Individual clear the others; Individual regenerates rows | `Screen.tsx:903-915`; `rules.ts:1021-1035` | PARTIAL | The code resets the % value to "" (`emptyHedge()`), which loses the standard value. |
| B23 | Individual volume row `OnChange` L12029-12067 | `Screen.tsx:961-965` | COVERED | |
| B24 | `pcf_…Save_1.OnChange` L12551-12560: Individual → confirm popup, else run the save; popup `OnConfirm` → save (L12738-12740) | `Screen.tsx:353-366`, `1095-1104` | PARTIAL | The confirm dialog's `onConfirm` only closes it. No save path. |
| B25 | Hedge > 100 % check and info popup (L4705-4787, L5115-5141) | `rules.ts:1134-1166`; `Screen.tsx:355-363`, `1106-1113` | COVERED | |
| B26 | Contract save (L4699-5114): spinner, Patch, refresh, Reset ×22, clear `loc*`, close the panel | none | MISSING | Due when connected. |
| B27 | Cancel / close icon (L5231-5284, L12589-12643) | `Screen.tsx:346`, `631`, `635` | COVERED | |
| B28 | `btn_Revenue_AddBlancing_Price.OnSelect` L2989-2998 | `Screen.tsx:370-373` | COVERED | |
| B29 | Balancing row Edit/Delete (`con_Main_Project_Overview_Header_SuitBar_CommandBar_1.OnSelect` L3461-3480) | `Screen.tsx:593-606` | COVERED | |
| B30 | Balancing duration `OnChange` L4002, L4103 | `Screen.tsx:1026-1043` | COVERED | The canvas handlers also overwrite contract `loc*` variables (copy-paste, no effect). |
| B31 | Balancing save `pcf_…Save_2.OnChange` L4522-4634 | `Screen.tsx:987` `onSave={() => undefined}` | MISSING | |
| B32 | Balancing Cancel / close (L4663-4672, L3580-3589) | `Screen.tsx:984`, `988` | COVERED | |
| B33 | Header logo / left nav `Navigate` (no dirty guard on this screen) L304, L361-375 | App shell | COVERED | |
| B34 | `OnHidden` L21-29 clears state | Unmount | COVERED | |

## 3. State gates, validation and messages

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| S1 | Lock bullets L534-612; the 5th is "• Change the project status from Draft" (L606) | `rules.ts:247`: "• Cluster State" | WRONG | D15 f. The rule is shared with Finance. |
| S2 | Lock title "This page is locked. To unlock it, please complete the following sections:" L516; Visible L449-465 | `rules.ts:228-253`; `Screen.tsx:485-494` | COVERED | |
| S3 | `tab_…DisplayMode` L656-665, gallery L802-811 and command bar L918-927: **Disabled** (still visible) when Draft or locked | `Screen.tsx:496-624` `{!locked ? … : null}` hides the tabs and both grids; no Draft gate on the tabs | WRONG | Canvas: disabled and visible. Code: not rendered. |
| S4 | `btn_Revenue_AddContract.DisplayMode` L712-717: Draft/lock only | `Screen.tsx:403`; `rules.ts:1750-1754`: also requires `canEdit && hasSubaccount` | PARTIAL | DIVERGENCE. The canvas opens the panel and reports a missing subaccount through the info button (L745-754). |
| S5 | Edit/Delete `ItemEnabled` = `RecordInfo(LookUp(…, locSelectedRevenueContract), Edit/DeletePermission)` (L935-953) | `rules.ts:1746-1758`; the mapper hard-codes `canEdit/canDelete: true` (`hooks.ts:279-280`) | PARTIAL | SOURCE DEFECT: the canvas tests the previously selected contract, not `ThisItem`. Record privileges are not projected. |
| S6 | `btn_Revenue_AddBlancing_Price.DisplayMode` L2983: `'Cluster State'.Order >= 4 AND CountRows < 10` | `Screen.tsx:408`: `< 10 && canEdit` | PARTIAL | No cluster-order gate (D1). |
| S7 | `con_ProjectRevenue_Balancing_Price_VisibilityMessage` Visible `Order < 4` L3012: "Balancing prices can be managed when the project has reached Cluster 4" | `rules.ts:1813` constant; not rendered (`Screen.tsx:25-27`) | MISSING | |
| S8 | Empty-info tag Visible `Order >= 4 && IsEmpty` (L3060); grid Visible `Order >= 4 && !IsEmpty` (L3113) | `Screen.tsx:571-620`: the grid is always shown, the info shows when empty | PARTIAL | |
| S9 | Balancing Edit/Delete `ItemEnabled` = newest row (L3438-3456) | `rules.ts:1761-1778` | COVERED | Adds `canEdit`. |
| S10 | `pcf_…Save_1.DisplayMode` L12438-12536 | `rules.ts:1479-1535` | PARTIAL | German-wind branch: the canvas requires Tariff_1 non-blank and **no Tariff p90 error**, and does **not** require Site Quality p90 non-blank. The code requires `siteQualityP90` non-blank (`rules.ts:1516`) and never checks the tariff p90 error. |
| S11 | `pcf_…Save_2.DisplayMode` L4498-4507 | `Screen.tsx:991-995` | COVERED | |
| S12 | Tariff_1 `DisplayMode` Disabled for German FiT with `<> PV` (L9463-9472) | `Screen.tsx:814` | COVERED | |
| S13 | Tariff p90 Disabled for Germany & FiT (L9767-9772) | `Screen.tsx:824` | COVERED | |
| S14 | `tgl_…InflationProfile_1.DisplayMode` Disabled for Germany & FiT (L10423-10431) | `Screen.tsx:835`: not gated | MISSING | |
| S15 | `tgl_…CountryInflationProfile_1` has no `Visible` (always shown); only the start-year and profile containers follow the inflation toggle (L10548, L10797) | `Screen.tsx:839-848` shows the country toggle only when `useInflation` | WRONG | Canvas: always visible. Code: hidden until inflation is on. |
| S16 | Country vs custom profile field Visible / DisplayMode (L10874-10908, L11043) | `Screen.tsx:859-877` | COVERED | |
| S17 | Negative-price toggle `Checked` / `DisplayMode` from state (L11133-11134) | `Screen.tsx:889-890`; `rules.ts:973-987` | COVERED | |
| S18 | Hedge containers Visible by radio (L11473, L11721, L11936) | `Screen.tsx:918-970` | COVERED | |
| S19 | Hedge radio `Items`: Individual only when start and durations are known (L12276-12295) | `rules.ts:1003-1008` | COVERED | |
| S20 | German FiT block visibility: Bidding/SQ/CF `<> PV`; SQ p90 / CF p90 `= Wind`; Tariff p90 `<> PV` (L8194-8206, L8450-8462, L8634-8639, L8803-8815, L9003-9007, L9689-9694) | `Screen.tsx:754-827` | COVERED | |
| S21 | Shift-of-COD container Visible: `Or(And(CountRows = 1, !IsBlank(selected)), IsEmpty)` (L3624-3631), i.e. also while **editing the only period** | `rules.ts:1238` `existingCount === 0`; `Screen.tsx:1001` | WRONG | The field is hidden when editing the sole first period. |
| V1 | Tariff: numeric → `gblAppResx.Numeric` = "Numeric value without decimals" (L9658); range "Please select a value between 0 and " & 750/150 & "." (L9668) | `rules.ts:1268-1272` `MSG.numeric = "Numeric value expected"` with JSDoc "NEW — no canvas equivalent"; range OK (`rules.ts:1321-1329`) | WRONG | The canvas does have a string. |
| V2 | Bidding Price: "Numeric value with maximum of two decimals" (L8403); "Please select a value between 0 and 100." (L8413) | `rules.ts:1334` → "Numeric value expected" | WRONG | |
| V3 | Site Quality p50/p90: literal "Numeric value with maximum of two decimals" (L8587, L8756); 0–100 | `rules.ts:1337` reuses Bidding ("Numeric value expected"); `Screen.tsx:768-782` passes **no `error`** | WRONG | Wrong text, and the message is not shown at all. |
| V4 | Correction factor: "Numeric value with maximum of three decimals" (L8958, L9198); range `"Please select a value between {0.5\|0,5} and 2"` (no trailing period) | `rules.ts:1343-1349` returns the range text for a decimal failure | WRONG | The range message is right. |
| V5 | Hedged Volume %: "Numeric value with maximum of one decimals" (L11675); 0–100 | `rules.ts:1354` → "Numeric value expected" | WRONG | |
| V6 | Fixed / Individual volume: "Number with no decimals", "The Hedged Volume may not exceed the project's Net Yield p50" (L11880-11888, L12117-12125) | `rules.ts:1277-1282`, `1364-1369` | COVERED | |
| V7 | Inflation Profile: "Numeric value with maximum of two decimals." (with a period, L11079); 0–100 | `rules.ts:1374` → "Numeric value expected" | WRONG | |
| V8 | Inflation Start Year: "Year value must be in format YYYY." (L10577) | `rules.ts:1287`, `1379-1382` | COVERED | |
| V9 | Description: "Standard is applicable only for system-prefilled contracts." (L7251; Visible L7253-7263) | `Screen.tsx:463-468` uses `SCREEN_LABEL.standardOnlyPrefilled` (right); `rules.ts:1292-1293` `MSG.standardDescription` is a different text marked NEW | PARTIAL | Never fires because of B8. Remove or align the `MSG` constant. |
| V10 | Balancing price: decimals → `NumericTwoDecimals`; range "Value must be between -25 and +50." (Poland) / "Value must be between -5 and +10." (L4387) | `rules.ts:1398-1407` → "Numeric value expected" and `between()` = "Please select a value between -25 and 50." | WRONG | |
| V11 | Shift of COD: non-integer → `gblAppResx.Numeric` ("Numeric value without decimals"); "Value must be between 0 and 24." (L3716-3733); bounds conflict L3735-3758 | `rules.ts:1421-1434` | WRONG | Non-integer message is "Numeric value expected". The bound choice is documented. |
| V12 | Subaccount error `$"Revenue Subaccount cannot be empty! {Char(10)} Write to support team."` (L751) | `rules.ts:1304`; `Screen.tsx:971-973` | COVERED | Rendered inline, not through the info button (U22). |
| V13 | Hedge > 100 % text (L5129-5135), title "Hedged Volume more than 100%" (L12754) | `rules.ts:1134-1140`, `1865` | COVERED | |
| V14 | Save error `Notify("Error: Contract could not be saved correctly. " & "Internal error: originated on " & …)` (L4620, L5059) | none | MISSING | |
| V15 | Spinner texts "Please wait, saving...", "Validating Hedged Volume...", "Deleting Contract...", "Please wait, deleting..." (L4525, L4707, L12699, L12665) via `cmp_ProjectRevenues_PopUp_Loading` (L12757-12763) | none | MISSING | |

## 4. UI

| # | Requirement (canvas) | Code | Status | Notes |
|---|---|---|---|---|
| U1 | Heading "Revenue" (L645) | `rules.ts:1803`; `Screen.tsx:483` | COVERED | |
| U2 | Tabs "Contracted Revenue" / "Balancing Price" (L119-120) | `rules.ts:123`; `Screen.tsx:503-504` | COVERED | |
| U3 | TabList AccessibleLabel "tab_ProjectRevenue_DisplayProjectBodyRightContent" (L652) | `Screen.tsx:498-502` has the `data-testid` but **no `aria-label`** | MISSING | |
| U4 | `btn_Revenue_AddContract` / `btn_Revenue_AddBlancing_Price` (AccessibleLabel = name, L707, L2978); contract bar ItemKeys `editRevenueContract` / `deleteRevenueContract` (L932, L944) | `CommandBar` → `data-testid="command-add\|edit\|delete"`, `aria-label` = caption (`components/CommandBar.tsx:108-109`; `Screen.tsx:401-411`) | WRONG | Rule 16: canvas names exist. The same `command-add` id is reused on both tabs. |
| U5 | Card gallery `gal_…GridContracts_1`: card header `Label & " - " & Description` (L2840) and a per-card command bar `pcf_ProjectRevenues_Content_ContractCommandBar_3` (L917) | `Screen.tsx:508-567`: one table (Type and Description columns) plus a header command bar acting on the selected row | PARTIAL | DIVERGENCE documented in `Screen.tsx:11-15`, not in D15. |
| U6 | Card captions: "Currency", "Contract Start Date", "Contract Duration", "Contract End Date", "Bidding Price", `$"Inflation Profile {""\|"[%]"}"` (L2008), "Inflation Start Year", Site Quality / Correction Factor (p50), "… p90", Tariff captions, "Area", "Hedged Volume Type", "Hedged Volume" | `Screen.tsx:431-451` | PARTIAL | "Inflation Profile" is static; the canvas appends "[%]" per row for a custom profile. |
| U7 | Card value formats: dates `"dd.mm.yyyy"` (L1678-1681, L1877-1880); tariff `"#,##0.00"` + Language (L2463); SQ `"#"/"#0.0#"` (L2165-2170); inflation `"#0.00 "` or the country / `" Italy - "&region` (L2022-2038); hedged volume `"x %"` / `"#,##0 MWh"` (L2717-2751); currency = `'Currency Name'` (L1607-1610) | `Screen.tsx:526-562`: `formatDate(lang)`, `fmtPrice` (no grouping), SQ as 0.00, inflation `String(n)`, hedged volume without " %" / " MWh", currency shows the code "EUR" | WRONG | |
| U8 | Standard values in italic (FontItalic, e.g. L1669-1674, L1743-1751) | `Screen.tsx:428-429` | COVERED | The code also adds the themePrimary colour (rule 26). |
| U9 | Area cell = `ThisItem.'Inflation Country Area'`, Visible for Italy and UseCountryInflation (L2544, L2585) | `Screen.tsx:557` shows the project region on every row | PARTIAL | |
| U10 | Balancing headers "Name", "Shift from COD Date [Months]", "Start Date", "Contract Duration", "End Date", Balancing Price caption, "Actions" (L3148-3250) | `Screen.tsx:453-461` | COVERED | |
| U11 | Balancing cells: dates `"dd.mm.yyyy"` (L3358, L3407), shift `Coalesce(…,"-")`, duration text (L3375-3390) | `Screen.tsx:586-591` | PARTIAL | Dates use the locale format. |
| U12 | Balancing row actions = `con_Main_Project_Overview_Header_SuitBar_CommandBar_1` (AccessibilityLabel L3430), icon-only Edit/Delete, Tooltip "Home screen navigation" (sic, L3482) | `Screen.tsx:593-606`: text buttons, `aria-label` "Edit"/"Delete", `data-testid="revenues-balancing-edit-${id}"` | WRONG | Rule 16: the canvas name exists (append the row id). |
| U13 | Panel titles "Add Revenue Contract"/"Edit Revenue Contract" (L5215) and `{Add\|Edit} balancing price` (L3564) | `rules.ts:1883-1888`; `Screen.tsx:629`, `982` | COVERED | |
| U14 | Panel captions: Type, Description, Currency, dates, Contract Duration, Bidding/SQ/CF/Tariff/p90 formulas, "Inflation Profile", "Country Inflation Profile", "Inflation Start Year", "Custom Inflation Profile [%]", "Consider Negative Prices", "Provide Hedge Volume in ", hedge labels, "Individual Volume [MWh]"; placeholder "YYYY" | `rules.ts:147-215`, `1801-1933` | COVERED | The trailing space of "Provide Hedge Volume in " is trimmed (documented). |
| U15 | Required asterisks (SQ asterisks Visible false: L8496, L8673) | `Screen.tsx` `required` props | COVERED | |
| U16 | Field AccessibleLabel = control name on every txt_/drp_/dte_ (e.g. L5425, L7159, L7349, L7576, L7709, L7926, L8142, L8274, L8539, L8708, L8891, L9075, L9329, L9765, L10591, L10872, L10901, L11543, **L11786 FixedVolume → "txt_…_HedgedVolume_1" (sic)**, L3668, L3844, L3991, L4028, L4176, L4331) | `Screen.tsx:132`, `156`: `aria-label={label}` (the caption) | WRONG | Rule 16. The toggles are right (`Screen.tsx:833`, `843`). |
| U17 | `data-testid` = canvas names in both panels | `Screen.tsx:647-1056` | COVERED | Individual-volume rows repeat literal ids (D16 c). |
| U18 | Currency = disabled Dropdown showing `'Currency Name'` (L7346-7375) | `Screen.tsx:666-673`: disabled Input with placeholder "EUR"/"PLN" | WRONG | Code instead of name. |
| U19 | Contract End Date disabled, `Text(…, ShortDate, Language())` (L8139-8175) | `Screen.tsx:747-752` | COVERED | |
| U20 | Individual row: the disabled Year input shows the year or `"dd.mm.yyyy - dd.mm.yyyy"` (L11974-11990) | `Screen.tsx:948-953`: the range is the label and the input shows the bare year | PARTIAL | |
| U21 | Sync tooltips sit on the sync icons (L11285-11290, L11421-11426) | `Screen.tsx:881-893`: tooltip on the switch | PARTIAL | See B21. |
| U22 | Errors info button `cmp_Information_Button_RevenueEditForm_1/_2` over `colRevenuesFormValidationErrors` (L3498-3510, L5147-5159) | `Screen.tsx:971-973` inline alert | PARTIAL | |
| U23 | Dialogs: delete contract (L12688-12723), delete balancing (L12655-12681), confirm volumes (L12730-12741), info (L12748-12755): titles, descriptions, "Delete"/"Confirm"/"Cancel" | `rules.ts:1857-1880`, `1306`; `Screen.tsx:1067-1113` | COVERED | |
| U24 | Lock banner `Fill: RGBA(89,89,89,1)` with white text and lock icon (L401, L469-483) | `Screen.tsx:485-494` `MessageBar intent="warning"` | WRONG | D17 f proposes a shared `PageLockNotice`. |
| U25 | `colYearsForBalancingPriceDuration` = `Sequence(31,0)` → 0–30 (L99-115) | `rules.ts:1258-1259` → 0–35 | WRONG | D15 g. |
| U26 | Contract durations 0–35 years / 0–11 months, names `n & " year(s)"` (L7804-7814, L7988-7998) | `rules.ts:640-643`, `1923-1927` | COVERED | |
| U27 | Balancing months `Sequence(If(y=0,11,12), If(y=0,1,0))` (L4078-4102) | `rules.ts:1244-1248` | COVERED | |
| U28 | Load / error state (CONVENTIONS rule 19) | `Screen.tsx:568`, `612`: spinners only | PARTIAL | No `error` → `EmptyState`. |

## Counts

| Status | Data | Behaviour | State + Validation | UI | Total |
|---|---|---|---|---|---|
| COVERED | 2 | 17 | 14 | 12 | **45** |
| PARTIAL | 3 | 10 | 6 | 8 | **27** |
| MISSING | 13 | 5 | 4 | 1 | **23** |
| WRONG | 2 | 2 | 12 | 7 | **23** |

118 rows. Three of the WRONG rows are [753] version drift (D4, D5, part of D6) or already logged (S1 = D15 f, U25 = D15 g).

## Proposed changes

### (a) UI — `Screen.tsx`
1. **M** — Locked or Draft: render the tabs, grids and commands **disabled** instead of hiding them (S3). Add the Draft gate on the TabList. Use the shared lock banner style (U24; D17 f).
2. **S** — Fix `aria-label`s (U3, U16, U4, U12):
   - `TextInputField` / `SelectField` take the canvas name as `aria-label`.
   - The TabList gets `aria-label="tab_ProjectRevenue_DisplayProjectBodyRightContent"`.
   - Add/Edit/Delete use the canvas names (`btn_Revenue_AddContract`, `btn_Revenue_AddBlancing_Price`; the bar keys `editRevenueContract` / `deleteRevenueContract`). This needs a test-id prefix or override prop on `CommandBar` (D17 j).
   - Balancing row actions: `con_Main_Project_Overview_Header_SuitBar_CommandBar_1-${id}`.
   - Update `Screen.test.tsx` role queries.
3. **S** — Add Contract opens with an empty Type and runs the engine on the first selection (B3).
4. **M** — Contract form behaviour:
   - Clear `isStandardContract` and apply `dropStandardPrefix` on every field edit (B8).
   - Start date → set the inflation start year (B9).
   - Regenerate individual volumes on start/duration/Reset-to-COD changes (B9-B11).
   - Recompute the tariff p90 as Bidding × CF p90 (B12).
   - Show the country toggle always (S15). Disable the inflation toggle for Germany & FiT (S14).
   - Country toggle and start-year lookups via `useCountryInflationProfiles` + `applyCountryInflation` (B17, B18).
   - Re-sync button for negative prices (B21).
   - Keep the standard % on hedge-type switch (B22).
   - Pass `error` to the Site Quality fields (V3).
5. **S** — Keep the flags in state (`const [flags, setFlags]`) and pass them to the payload (D14, B5).
6. **S** — Balancing: show Shift of COD when editing the sole period (S21). Gate on Cluster State Order ≥ 4 and render the Cluster-4 message, info tag and grid visibility (S6-S8, needs D1).
7. **S** — Grid formats (U7, U9, U11, U18):
   - "dd.mm.yyyy" dates
   - "#,##0.00" tariff
   - " %" and " MWh" suffixes
   - currency name
   - per-row Area
   - inflation "#0.00" or the country text
8. **M** — Wire the save/delete flows when connected: loading overlay texts, error notice text, panel close and resets (B24, B26, B31, D18, V14, V15). Add the load-error `EmptyState` (U28).
9. **S/M** — Decide on fold/expand (B7) and per-card command bar (U5) vs the table plus selection. Log it in D15.

### (b) `rules.ts` (+ `rules.test.ts`)
1. **S** — Make the messages verbatim (V1-V5, V7, V10, V11):
   - `gblAppResx.Numeric` "Numeric value without decimals" (tariff, shift of COD)
   - "Numeric value with maximum of two decimals" (bidding, SQ, balancing)
   - "Numeric value with maximum of three decimals" (CF)
   - "Numeric value with maximum of one decimals" (hedged %)
   - "Numeric value with maximum of two decimals." (inflation)
   - "Value must be between -25 and +50." / "-5 and +10." (balancing)
   - Drop or align `MSG.numeric` / `MSG.standardDescription`, and correct their "NEW" JSDoc.
2. **S** — `pageLock` 5th bullet → "• Change the project status from Draft" (S1; also Finance). `balancingYearOptions` 0–30 (U25). Both need a D15 decision.
3. **S** — `showsShiftOfCod(count, editingSole)` (S21). `canSaveRevenueContract`: drop the SQ p90 non-blank requirement and add the tariff p90 validation (S10).
4. **M** — `buildStandardFlags(state, visibility)` porting L4880-4976, including the `.StandardAssumptionValue` defect as a parity variant (D14). `buildRevenuePayload`:
   - add `inflationCountryArea` and the OBU id
   - gate SQ p90 / CF p90 on `= Wind` (D13)
5. **S** — `standardHedgedVolume(rows, tech)` (`valuetype="hedgedvolume"`), plus tests (B4).
6. **S** — `buildBalancingPayload` (Name, Period, Shift, durations, price; no dates/OBU unless decided) (D17). `ITALY_PRICE_REGION` accepts U+2019 "Valle d’Aosta" (D5).
7. **S** — Tests for each of the above (UT-REV-1xx). Fix the tests that pin the current wrong messages.

### (c) `hooks.ts`
1. **L** — Register `vsb_projectrevenues`, `vsb_balancingprices`, `vsb_revenueindividualhedgevolumes`, `vsb_energyyields` and `vsb_revenuesubaccounts`, none of which is in `power.config.json`. Verify all `*_COL` names against the generated schema (D19, D20). Then implement these queries: `useRevenueContracts`, `useBalancingPrices`, `useIndividualVolumes`, `useNegativePriceProduction`, `useRevenueSubaccount` and `useOverlappingContracts`.
2. **M** — `useRevenueProject`: add Cluster State Order (`vsb_projectstates` is registered) and the country **code** via `vsb_countries` (D1). `useRevenueCurrency` and `useCountryInflationProfiles` use registered tables (D9, D11).
3. **L** — `useRevenueAssumptions`: the Fabric SQL connector is undecided (D2 / D15 j). Without it the whole standard-assumption engine (B4) is inert.
4. **M** — Mutations:
   - The contract upsert, then delete all individual volumes and re-insert them in one `$batch` changeset (D13, D15).
   - Contract delete: the parent first, then the volumes, matching canvas order. Prefer volumes first or a server cascade; this needs a decision (D18).
   - Balancing upsert and delete (D17).
   - Record privileges for Edit/Delete (S5).

## Open questions for the product owner
1. **Version:** should the app follow 1.21.753 (Italy prefix slice, renamed zones, the zone-only price pool) or the 1.21.709 YAML on disk? Please confirm that 1.21.753 is the target and provide its YAML so the canvas-identity check runs against it (D4-D6).
2. Should Add Contract open with an empty Type (canvas), or default to PPA? (B3)
3. Should a locked or Draft page show the contracts and balancing grids read-only (canvas), or hide them? (S3)
4. Price fallback: should the screen use the corrected nearest-year selection or canvas parity (year-vs-price)? (D6)
5. The balancing-price Patch writes no start/end date and no Owning Business Unit. Are the dates computed server-side? Should the code app write them? (D17)
6. Tariff p90 for German FiT: should it be Bidding × CF p90 (canvas Value), or the p90 assumption price? (B12)
7. Card gallery with fold and a per-card command bar (canvas), or a table with row selection (code)? (U5, B7)
8. Should Add Contract stay enabled with no Revenue Subaccount, as in the canvas, where the error appears in the info button? (S4)
9. Contract Edit/Delete permission: the canvas evaluates the previously selected contract. Should the code use the row's own privileges? (S5)
10. D15 f/g: should the lock bullet text and the balancing year range be corrected to the canvas values?
11. Should individual volumes regenerate on every date or duration change (canvas), which wipes entered values? (B9-B10)
