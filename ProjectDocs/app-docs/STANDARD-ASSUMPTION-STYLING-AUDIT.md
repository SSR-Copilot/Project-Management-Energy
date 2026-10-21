# Standard-assumption styling audit (20 Oct 2026)

CONVENTIONS rule 20 (product owner, 20 Oct 2026): wherever the canvas ties a value to an "is
standard assumption" condition, the value renders in `palette.themePrimary` (#006eb9) and italic
while the condition holds, and normally once it is false. Decision record: `02-OPEN-DECISIONS.md` D35.

## Method

The canvas YAML of every screen and component (`ProjectDocs/_extracted/msapp/{projectmanagement,projectcosts}/Src/*.pa.yaml`
and `Src/Components/`, solution 1.21.709) was scanned for every control with a non-literal
`Italic` / `FontItalic`, or a `Color` / `FontColor` of the form `If(<…Standard…>, ColorValue(gblAppTheme.palette.themePrimary), …)`.
That gives 168 controls on 10 screens. No Admin screen and no shared component has one.

## The shared style

One definition, in `ProjectCosts-CodeApp/src/components/standardValue.ts`, exported from `@/components`:

- `useStandardValueClass()` returns `(condition, variant?) => className | undefined`.
- The variants are `"standard"` (blue + italic, the full canvas pair), `"blue"` (FontColor only) and
  `"italic"` (FontItalic only).
- The rule reaches a nested `input` / `textarea` / `button` / `td`, so it colours the real text of a
  Fluent `Input`, `Dropdown` or `DatePicker`, and every cell of a table row. A class on the Fluent
  root alone did not reach the text: General Data's and Land Lease's local copies showed italic
  but not blue.
- The field primitives take a `standard` prop: `CostField` (on the input, never the caption),
  `CostSelect`, `TextField`, `NumericField`, `TextAreaField`, `ReadOnlyField` and `TaggedDateField`.
- Tests: `components/standardValue.test.tsx` (UT-STDVAL-001…003).

Each condition is a pure function in that feature's `rules.ts`, with a test.

## Summary

| Screen | Canvas controls | Already OK (swapped to shared) | Fixed now | Deliberate variant | Not applied / open |
|---|---|---|---|---|---|
| PM General Data | 6 | 6 (colour now reaches the input) | – | – | – |
| PM Milestones | 12 | 10 | – | – | 2 icon-only buttons (no text to style) |
| PM Generators | 4 | – | – | – | 4: the formulas are commented out (`/* … */`), nothing is live |
| PM Production | 4 | 4 | – | – | – |
| PM Revenues, cards | 13 | 8 | 5 (they were blue-only) — plus Currency, unconditional, also fixed | – | – |
| PM Revenues, panel | 13 | – | 11 | 1 of the 11 (End Date: italic only) | 2 in the balancing panel (Q) |
| PM Finance | 40 | – | 40 | – | – |
| Cost CAPEX | 25 | 5 (cluster checkboxes) | – | – | 6 panel inputs (Q); 14 grid labels in the vendored PCF grid (out of scope) |
| Cost Contracts | 3 | – | – | – | 3 (Q) |
| Cost Land Lease | 17 | 17 (16 rows + start date; the date's colour now reaches the input) | – | – | – |
| Cost OPEX | 31 | 30 rows (the cells now turn blue as well, see note) | – | – | 1: the start-date picker (Q) |
| **Total** | **168** | **80** | **56** | **1** (counted in Fixed) | **32 (12 open, 20 N/A or out of scope)** |

The Cost screens' behaviour was not changed beyond moving them to the shared style. Two visible
effects follow from that move:

- OPEX: the `td` style sets the cell colour to black, which hid the row's blue. The shared rule
  reaches the cells, so a standard row is now blue + italic, which is the canvas look (`Color` and
  `Italic` on every cell label).
- General Data cluster dates and the Land Lease start date: the colour now reaches the input text.

## Detail

| Screen | Control(s) | Condition (canvas) | Code condition (`rules.ts`) | Status |
|---|---|---|---|---|
| General Data | `dtp_Milestones_DisplayProject_Body_General_Content_{Cluster2…6,FiD}_1` (cluster-change panel) | `locCluster<n>DateStandardAssumption` / `locFidDateStandardAssumption` | `clusterPanelDateIsStandard` (UT-GDATA-908) | OK, swapped |
| Milestones | `dtp_…_{Cluster2…6,FiD,Sales_StartDate,Sales_CompletionDate,EndDate}`, `txt_…_Share_of_Farmdown` | `loc…StandardAssumption`, `locShareOfFarmdownStandard` | `classifyDerivedMilestones` / `isDerivedMilestone` | OK, swapped |
| Milestones | `but_…_Sales_Completion_Date`, `but_…_farmdown_Reset_1` | `FontItalic: locSalesCompletionDateStandardAssumption` (colour unconditional) | – | N/A: icon-only buttons |
| Generators | `txt_GeneratorData_RightPanel_Form_Fields_{Foundation_Plinth,Effective_HubHeight,Total_Height,HubHeight_1}` | the whole `Color` / `FontItalic` formula is inside `/* … */` | – | N/A: commented out (rule 10) |
| Production | `txt_ProductionSeasonalityYield{WTG,PV}_MonthValue` | `ThisItem.IsStandard` | `row.isStandard` (rules) | OK, swapped |
| Production | `txt_ProductionNegativePrice{WTG,PV}_YearValue` | `ThisItem.StandardAssumption` | `row.standardAssumption` | OK, swapped |
| Revenues cards | `txt_…_GridContracts_CardBody_Fields_{ContractStartDate_1,ContractDurationYears_1,…Months_1,ContractEndDate_1,BiddingPrice_1,CorrectionFactor_1,CorrectionFactor_p90}`, `HedgedVolume_1` | `ThisItem.'Is … Standard Assumption?' = …Yes` | `contractCardFields` → `"standard"` | OK, swapped |
| Revenues cards | `…_TarifPrice_1`, `…_TarifPrice_p90`, `…_Area`, `…_CountryInflationProfile_1`, `…_HedgedVolume_2` | the same flag on `FontColor` AND `FontItalic` | `contractCardFields` (UT-REV-139) | **Fixed**: they were blue-only (D33 read "no italic"; the canvas sets it) |
| Revenues cards | `…_Currency_1` | `FontColor: themePrimary`, `FontItalic: =true` (unconditional) | `"standard"` always | **Fixed**: it was blue-only |
| Revenues panel | `txt_…_Description_1`, `dte_…_ContractStartDate_1`, `txt_…_BiddingPrice_1`, `…_CorrectionFactor_1`, `…_CorrectionFactor_p90`, `…_TariffPrice_1`, `…_TariffPrice_p90`, `…_InflationStartYear_1`, `…_InflationProfile_1`, `…_HedgedVolume_1` | `locStandardAssumtionContract`, `locRevenue….IsStandardAssumption`, `locRevenueIsStandardAssumptions.Is…`; tariff: German FiT needs price AND correction p50 | `revenuePanelStandard` (UT-REV-913…915) | **Fixed** |
| Revenues panel | `dte_…_ContractEndDate_1` | `FontItalic` only; its colour is not conditional | `revenuePanelStandard().contractEndDate` | **Fixed**, italic-only variant |
| Revenues balancing panel | `dte_…_ContractStartDate_2`, `txt_…_BiddingPrice_2` | read the MAIN contract's `locRevenueContractStartDate` / `locRevenueStandardValues` | – | Open (Q): the balancing panel keeps no standard state, and the standards are Fabric SQL (X2) |
| Finance cards | `txt_EquityData_{FreeEquityEUR_1,ShareholderLoanEUR_1}`, `txt_VATFinancingData_{BaseRate_2,BankMargin_1}`, `txt_Decommissioning_Data_Display_Card_*_1` (6), `…_*_3…6` (DSRA/DSRF, 9) | `ParseJSON(<row>.'Is Standard Value' / 'Decommissioning Standard Assumption JSON' / 'DSRA/DRSF Standard Assumptions JSON')` | `financeCardStandard` (UT-FIN-911) | **Fixed** (was "not shown", D34) |
| Finance cards | `txt_SeniorDebt_Data_Display_Card_FinancialClose` | `'Senior Debt Standard Assumption JSON'.FinancialCloseDate` | `trancheFinancialCloseIsStandard` (UT-FIN-912) | **Fixed** |
| Finance panels | `txt_EquityData_FreeEquityEUR`, `cmb_VATFinancingData_BaseRate`, `txt_VATFinancingData_BankMargin`, `dte_SeniorDebt_Data_Financial_Close`, `txt/dte/cmb_DecommissioningData_*_1` (7), `txt/cmb/dte_DSRA_DRSFData_*` (9) | the panel's `locIs…` flags (`locMyRecord.*`, `locSelectedDSRA_DSRF_IsStandard.*`, `locIsFinancialCloseDateStandard`) | each form's `flags` (set and cleared by the rules' edit/reset functions) | **Fixed** |
| CAPEX | `chk_AddContract_RightPanel_SelectCluster{1…5}_1` | `locSelectedCostRow.IsStandardContract` | `edit.standard` | OK, swapped |
| CAPEX | `txt_AddContract_RightPanel_Description_1`, `rad_…_DistributionBy_1`, `txt_…_TotalCost_1`, `rad_…_CostPaidBy_1`, `tgl_…_ApplyVAT_1`, `tgl_…_Depreciation_1` | `locSelectedCostRow.IsStandardContract` | – | Open (Q): a Cost-screen change, not made in this sweep |
| CAPEX | `lbl_Costs_label_139…150`, `lbl_Costs_label_TotalCost`, `lbl__ProjectCostsInAccount_AccountName_2` | `FontColor: If(ThisItem.IsStandardContract, themePrimary, …)` (no italic) | the vendored PCF grid (`GridRenderer.js`, its own CSS) | Out of scope (PCF renderer) |
| Contracts | `txt_Contracts_List_Card_Body_Fields_Margins` | `ThisItem.'Is Margin Standard Assumption?'` | – | Open (Q) |
| Contracts | `txt_Contracts_RightPanel_NewEdit_{MarginFixedValues,MarginPercentage}` | `locIsStandardAssumtions` | `isMarginStandardAssumption` exists in the form | Open (Q) |
| Land Lease | the 16 row labels `lbl_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_*_2` / `_1` | `StartsWith(ThisItem.Name, "Standard")` | `row.standard` | OK, swapped |
| Land Lease | `dte_LandLease_RightPanel_NewEditCost_BodyContent_StartDate_1` | `locIsStartDateStandardAssumption = …Yes` | `startDateIsStandard` | OK, swapped |
| OPEX | the 30 row labels `lbl_OpexCosts_Content_Subaccounts_CardBody_CostsTableRow_*` | `StartsWith(ThisItem.Description, "Standard")` | `row.standard` | OK, swapped (the cells now turn blue as well) |
| OPEX | `dte_OpexCosts_RightPanel_NewEditCost_BodyContent_StartDate` | `locIsStartDateStandardAssumption = …Yes` | `panel.startDateStandard` exists | Open (Q): not styled |

## Open

1. CAPEX panel (6 inputs), Contracts margins (3) and the OPEX start date (1): style them now? Each
   one is a small change on a Cost screen. Each condition already exists in the code.
2. Revenues balancing panel (2): the canvas reads the main contract's standard state there. Port
   that, or leave it until the Fabric SQL standards (X2) exist?
3. The CAPEX grid labels are drawn by the vendored PCF renderer, which this sweep does not change.
