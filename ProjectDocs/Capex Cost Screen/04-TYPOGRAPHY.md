# 04 — Typography: fonts and text formatting on the DEVEX/CAPEX Costs screen

Gap prefix: **GAP-TY**. Sibling files: colours are in `03-THEMES.md`; geometry (X, Y, widths
and heights) is in `02-UI.md`; dialog and loader content is in `06-POPUPS.md`; validation logic
is in `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`; the comments panel's behaviour is in
`09-COMMENTS-PANEL.md`.

## 1. Scope

This file covers:
- every font, size, weight, italic, alignment, wrap, auto-height and padding property on the
  screen's text controls;
- every `Text(…, "<format>")` and every other number or date formatting expression;
- the `fn_Numeric` and `fn_Percentage` components;
- locale handling (`Language()`);
- the font-family question (Open Sans against Segoe UI).

For each one it also covers how the code app reproduces it.

### What was read

**Canvas** (`ProjectDocs/_extracted/msapp/projectcosts/Src/`):
- `App.pa.yaml` L205: `gblAppSizes`, the `gblAppStyles.*.Font` values, and `gblCurrentUser`
  `Language` / `Lang`;
- `Components/fn_Numeric.pa.yaml` (whole file, 189 lines);
- `Components/fn_Percentage.pa.yaml` (whole file, 25 lines);
- `Components/cmp_Header.pa.yaml`, extract of its font properties;
- `Capex Costs Screen.pa.yaml`:
  - every `Font`, `Size`, `FontSize`, `FontWeight`, `Weight`, `FontItalic`, `Align`,
    `VerticalAlign`, `Wrap`, `AutoHeight` and `Padding*` row (from the same line extract as
    `03-THEMES.md` §1);
  - every `Text(` with a format string, every `Language()`, `Round*` and `DateValue` (grep);
  - the ranges L212-236, L1300-1334, L2788-2806, L7200-7233, L7834-8080, L8203-8300,
    L9281-9335, L10299-10316, L10439-10530, L10926-10960, L11590-11606, L11728-11749,
    L11906-12148, L12609-12686, L13195-13230, L13316-13442, L13620-13656, L17506-17575.

**PCF:**
- `features/cost/capex-costs/pcf/css/TableConnectedToDataversePCF.css`, font declarations
  (byte-identical to the vendor copy, `03-THEMES.md` §2.5);
- `pcf/ui/GridRenderer.js` L929-969 and L1371-1418.

**Code app** (`ProjectCosts-CodeApp/src/`):
- `domain/locale.ts`, `domain/numeric.ts` (whole);
- `domain/powerFxNumeric.ts`, `domain/numberInput.ts`, `domain/dates.ts` (headers and exports);
- `domain/canvasDate.ts` (whole);
- `theme/tokens.ts`, `theme/fluent.ts`, `styles/global.css`, `styles/canvas.css`;
- `features/cost/capex-costs/`:
  - `Screen.tsx`, `CommentsPanel.tsx` (styles);
  - `rules.ts` L103-106, L242-249, L380-479, L503;
  - `panelRules.ts` L70-120;
  - `comments.ts` L152-235;
  - `pcfGridFormat.test.ts`, `rules.test.ts` L388-405 and L1120-1165;
- `features/cost/costing/model.ts` L279;
- `app/SessionContext.tsx` L30, L99;
- `components/CanvasFields.tsx`.

**Prior docs:**
- `02-OPEN-DECISIONS.md` D17 (a), D49 §1;
- `gap-analysis/cost-capex-costs.md` S8, S9;
- `03-pcf-inventory.md` L326-330;
- `PCF-RENDERER-PORT.md`.

**Unit convention.**
- A classic control's `Size` is in **points**; 1 pt = 4/3 px.
- A modern control's `Size` or `FontSize` is in **px**.

This is inferred. It agrees with the code app's own conversions: "8pt … not 10px"
(`canvas.css:16-17`) and "11 pt = 14.67 px" (`AppHeader.tsx:374`), and with the 14 px
`Text@0.0.51` default measured in `canvas.css:146-150`.

---

## 2. Canvas implementation

### 2.1 `gblAppSizes.Font`, the classic type ramp

`App.pa.yaml:L205`, in the block commented `// Sizes for classic controls`:

```powerfx
Font: { ExtraExtraSmall: 8, ExtraSmall: 9, Small: 10, Medium: 11, Large: 12,
        ExtraLarge: 14, ExtraExtraLarge: 16 }
```

| Token | pt | px (inferred) | Live use on this screen |
|---|---|---|---|
| ExtraExtraSmall | 8 | 10.67 | 12 month-box error labels (L13340 …) |
| ExtraSmall | 9 | 12 | Summary names and sums (L7863, L7913, L7967, L8004); footer version (L8075) |
| Small | 10 | 13.33 | none live (15 uses, all in the hidden old grid L3760-L4282) |
| Medium | 11 | 14.67 | Year "Allocated Cost" label (L13210); 12 month captions (L13651 …); year header button (L12684); left-nav `FontSize` (L2376) |
| Large | 12 | 16 | Year number (L12632) |
| ExtraLarge / ExtraExtraLarge | 14 / 16 | 18.67 / 21.33 | none |

Literal sizes on live controls:

| Value | Unit | Controls |
|---|---|---|
| `Size: =9` | pt, so 12 px | the 12 panel error labels: `…_ErrorMessage_2/8/9/12/13/14/15/16`, `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1`, `…StartDate…`, `…EndDate…`, `…Link_to_Cluster_Label_ErrorMessage`, at L10444 … L12190 |
| `Size: =10` | pt, so 13.33 px | `lbl_Draft_Edit_Comment_Warning` (L9568) |
| `Size: =11` | pt | `html_Warning_OnEditFromPCF` (L12495) |
| `Size: =13` | px | `modernDropdown1` (L8356) |
| `Size: =14` | px | 18 comment `ModernText` labels (L8342 … L9669) |
| `FontSize: =14` | px | the two filter checkboxes (L8365, L8380) |
| `FontSize: =15` | px | the panel Save (L17570) and the comments Save (L10132) |
| `FontSize: =16` | px | `btn_SaveCost_Execute____` (L17672), which is `Visible: =false` |

`TextCanvas1` (L435-451, `Size: =14`) and `Text1` (L19835-19863) are `Visible: =false` debug
labels.

### 2.2 Font family

| Source | Font | Controls (count, lines) |
|---|---|---|
| `gblAppStyles.Label.Font` / `gblAppStyles.ButtonTransparent.Font` | `Font.'Open Sans'` (`App.pa.yaml:L205`) | 74 + 1 classic labels and buttons. Live ones: Summary (L7852, L7892, L7956, L7993), footer (L8067), month captions and errors (L13330, L13643 …) |
| `gblAppColors.Label.Font` / `gblAppColors.ButtonTransparent.Font` | `Font.'Open Sans'` | 3 + 1: the year-gallery labels and button (L12622, L12671, L13201) |
| `Font: =App.Theme.Font` | the app theme's font (`Theme: =PowerAppsTheme`, `App.pa.yaml:L207`), **Segoe UI (inferred)** | 18 comment-panel `ModernText` labels and `txt_Read_Comment_Resolved_Tag` (L8620 … L9953) |
| No `Font` set, modern control | theme font, **Segoe UI (inferred)** | tab list, toolbar button, toggles and dropdowns; every panel caption (`Text@0.0.51`), text input, radio, checkbox, toggle and dropdown; both Save buttons |
| No `Font` set, classic `Label@2.5.1` | classic default **(not in the YAML; inferred Open Sans)** | panel header title (L10299), panel error labels and asterisks, comments header `Label1` (L8205) and breadcrumb `Label5` (L8282), `lbl_Draft_Edit_Comment_Warning` |
| PCF stylesheet | `'Segoe UI', sans-serif` (CSS L30, L731, L1017, L1056, L1300, L1312, L1372, L1398); everything else `inherit` | the whole grid and its body-level menus |
| `cmp_Header` | `con_cmp_Header_Title_4` / `…_Version_4` `Font.'Segoe UI'` (cmp_Header L443, L473); the other header labels set none | header |

So the canvas screen is **mixed**:
- classic labels are Open Sans;
- modern controls and the PCF grid are Segoe UI (inferred for the modern controls).

`cmp_Hotfix_CDN_FluentUI` (L2300) loads only the `CustomFabricMDL2Icons` icon font
(`Resources/Controls/css/CreatorKit.Hotfix.HotfixCDNFluentUI.fonts.css`, 20 `@font-face`, all
icon glyphs), not a text face.

### 2.3 Weights, italics, alignment, wrap and padding by region

**Tabs.** `tab_Costs_ContentAssignableAccountCategories` (L2431-2516) is a `ModernTabList@1.0.1`
with:
- `FontWeight: =""` (blank);
- `Size: =0`;
- `TabSize: =TabSize.Medium`.

A blank weight and a zero size mean the control's defaults apply **(inferred)**. The selected
tab's emphasis comes from the control itself.

**Toolbar.**
- `btn_…_AddCostFromTable` (Button@0.0.45) sets no font properties (L2558-2819).
- The toggles (L2886-2904), dropdowns (L2905-2945) and year buttons (L2946-3063) set none either.
- All of them take the theme defaults.

**Summary tab** (L7834-8009):

| Control | Weight | Size | Align | Padding | Wrap / AutoHeight |
|---|---|---|---|---|---|
| `lbl_Costs_ContentCostsSummary_AccountCategory_Name` | Semibold — the `|-` block at L7893-7898 is `=//If(` … `FontWeight.Semibold` … `//)`; only `FontWeight.Semibold` is live | ExtraSmall | (left) | `PaddingLeft` block L7903-7909, live value `10`; X 10 | `Wrap: =false`, `AutoHeight: =true` |
| `lbl_…_AccountCategory_Sum` | `FontWeight.Semibold` (L7853) | ExtraSmall | `Align.Right` | Left 0, Right 4 | false / true |
| `lbl_con_…_TotalSummary_Name` ("Total CAPEX") | Semibold (L7994-7995) | ExtraSmall | (left) | Left **0**; X 10 | false / true |
| `lbl_con_…_TotalSummary_Sum` | Semibold (L7957) | ExtraSmall | Right | Left 0, Right 4 | false / true |

**Footer.** `lbl_Costs_FooterVersion` (L8053-8080): ExtraSmall, `PaddingLeft: =10`,
`Wrap: =false`, `AutoHeight: =true`, `Text: =""`.

**Add/Edit panel.**

| Control | Font props |
|---|---|
| `lbl_GeneratorData_RightPanel_Form_PvModuleType_Header_Title_2` (L10299-10316) | `FontWeight.Semibold`, `PaddingLeft: =20`, no `Size` (classic default) |
| 13 field captions `lbl_…_Fields_Label_12/13/14/15/16/17/18/19/20/21/22`, `lbl_Add_Edit_Cost_Data_…_Link_to_Cluster_label`, `txt_Warning_OnEditFromPCF` (`Text@0.0.51`) | `Weight: ='TextCanvas.Weight'.Semibold` (L10518 … L12486), `AutoHeight: =true`, no size (default) |
| Asterisks `…_Label_Asterisk_*` | `Text: ="*"`, no font props |
| 12 panel error labels | `Size: =9`; `Wrap: =false` on the Total Costs, Average and Start/End labels (L10958, L11922, L11749) |
| Text inputs | `Align: =Align.Left` (L10473, L10561, L10694, L10816, L10965, L11670, L11756, L11929, L12199); Start/End `Placeholder: ="MM/YYYY"` (L11678, L11764) |
| `lbl_Production_CardHeader_LabelWithDescription_3` (year number) | `FontWeight.Bold` (L12623), `Size: Large` (L12632), `Wrap: =false`, `AutoHeight: =true`, `PaddingLeft: =0` |
| `lbl_Production_CardHeader_LabelWithDescription_4` (Allocated Cost) | `Size: Medium` (L13210), weight not set, so Normal; `Wrap: =false`; `PaddingLeft: =0` |
| 12 month captions `lbl_Costs_RightPanel_EditCostsInSubaccount_BodyContent_FirstMonth_24` … `_35` | `Size: Medium` (L13651 …), `Wrap: =false`, `AutoHeight: =true`, `PaddingLeft: =0`, `Tooltip: =Self.Text` |
| 12 month error labels `…FirstMonth_ErrorMessage_24` … `_35` | `FontWeight.Semibold` (L13331 …), `Size: ExtraExtraSmall` (L13340 …), `PaddingTop: =3`, `PaddingBottom: =0`, `AutoHeight: =true`, `Tooltip: =Self.Text` |
| 12 month inputs `txt_…_FirstMonth_24` … `_35` (TextInput@0.0.54) | `Type: ='TextInputCanvas.Type'.Text` (L13625), `Placeholder: ="0.00"` (L13623), `TriggerOutput: Delayed` |
| `html_Warning_OnEditFromPCF` | `Size: =11` (L12495); the HTML bolds "Warning:" with `<b>` (L12492) |
| Panel Save | `FontSize: =15` (L17570) |

**Comments panel** (L8156-10248):

| Control | Font props |
|---|---|
| `Label1` (header) | no `Size`, no `FontWeight`, so Normal; `PaddingLeft: =20` (L8205-8225) |
| `Label5` (breadcrumb) | `PaddingLeft: =20`; others 0 (L8282-8301) |
| `Text2` ("Sort by") | `Size: =14`, `AutoHeight`, paddings 0 (L8335-8343) |
| `modernDropdown1` | `FontWeight.Semibold`, `Size: =13` (L8353-8356) |
| `CheckboxCanvas1`, `CheckboxCanvas1_1` | `FontSize: =14`, `FontWeight.Semibold` (L8365-8381) |
| Read headers `lbl_Read_Header`, `lbl_Read_Header_Reply` | Size 14, `FontWeight.Lighter` (L9596, L8621) |
| Read titles (`…Type_Title`, `…Comment_Title(_Reply)`) | Size 14, Lighter (L9611, L9649, L8635) |
| Read values (`…Type_Value`, `…Comment_Value(_Reply)`) | Size 14, Semibold; `VerticalAlign.Top` on the comment values (L9671, L8657) |
| Draft headers `lbl_Draft_Edit_Header` (no weight) / `…_Header_Reply` (Lighter) | Size 14 (L9080, L8828-8833) |
| Draft titles (Type / Comment / Year / Month) | Size 14, Lighter (L9091 … L9275) |
| Draft dropdowns `drp_Draft_Edit_Type/Year/Month_Value` | `FontWeight.Semibold` (L9127, L9238, L9305) |
| Counters `lbl_Draft_Edit_Comment_Length(_1)` | Size 14, Lighter, `Align.Right` (L9517-9526, L8923-8932) |
| `lbl_Draft_Edit_Comment_Warning` | `Size: =10` (L9568) |
| `txt_Read_Comment_Resolved_Tag` | `Align.Center`, `FontWeight.Semibold`, no size (L9946-9954) |
| `btn_Add_Comment` | `Align: =Align.Left` (L8970) |
| Save | `FontSize: =15` (L10132) |

**Properties not used at all.** None of `Underline`, `Strikethrough`, `LineHeight`, `Overflow`,
`Upper()`, `Lower()` (for display) or `Proper()` appears on the screen (grep, 0 hits). The only
italics are:
- the 11 standard-contract `FontItalic` pairs (`03-THEMES.md` §2.13);
- the PCF's `.pcf-contract-link` (CSS L903).

Text is shown as written, with no casing transforms.

**Bulk counts** (all controls, live and hidden):
- `AutoHeight: =true` 106;
- `Wrap: =false` 73;
- `Align.Right` 45, mostly in the hidden grid;
- `Align.Left` 10;
- `Align.Center` 1;
- `VerticalAlign.Top` 3.

**PCF stylesheet type ramp** (rendered unchanged, `03-THEMES.md` §2.5):

| Element | CSS lines | Type |
|---|---|---|
| Root | L28-31 | `'Segoe UI'` 12px |
| Header cells | L78-79 | 12px / 600 |
| Account rows | L402-403 | 12px / 700 |
| Sub-account rows | L414-415 | 12px / 400 |
| Contract rows | L427-428 | 12px / 400 |
| Cluster pill | L328-330 | 11px / 500 / 14px |
| Expand toggle | L612-615 | 11px |
| Name | L866-868 | main 12px |
| Sub-name, meta tags | L877-886 | 10px |
| Contract link | L902-903 | 10px italic |
| Dots button | L1124-1128 | 10px / 700 |
| Grand total | L1089-1090 | 12px / 700 |
| Tooltips | L1017-1020 | 12px / 18px line |
| Month dropdown message | L1300-1302 | 13px |
| Loading text | L1398-1399 | 13px |
| Dropdown "after" glyph | L807 | 16px |

### 2.4 Text formatting expressions

| # | Where | Formula (verbatim) | What it shows |
|---|---|---|---|
| F1 | `lbl_Costs_ContentCostsSummary_AccountCategory_Sum.Text` L7864-7872 | `=Text(ThisItem.Sum, "###,###,###,##0") & $" {If(Not(IsBlank(gblRecordSelectedProjectCountry.'ISO Currency Code')), gblRecordSelectedProjectCountry.'ISO Currency Code', "EUR")}"` | Whole number with thousands grouping, then a space and the ISO code |
| F2 | `lbl_con_Costs_ContentCostsSummary_TotalSummary_Sum.Text` L7968-7973 | `=Text(Max(Sum(gal_Costs_ContentCostsSummary.AllItems, Sum),0), "###,###,###,##0") & $" {If(…ISO…, "EUR")}"` | Same, floored at 0 |
| F3 | `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1.Text` L10937 | `If(gblRecordSelectedProjectCountry.Name = "Poland", $"Value must be between 0 and {If(Lower(First(Split(Language(), "-")).Value) = "en", "2,250,000,000", "2.250.000.000")}", $"Value must be between 0 and {If(… = "en", "500,000,000", "500.000.000")}")` | Pre-formatted bound literal chosen by **language prefix**, with no full stop |
| F4 | `lbl_…FirstMonth_ErrorMessage_24…35.Text` L13341-13389 | `$"Value must be between 0 and {If(gblRecordSelectedProjectCountry.Name = "Poland", 2250000000, 500000000)}."` (Absolute branch); `$"Value must be between 0 and 100."` (% branch) | A **raw Number** interpolated, so `500000000.` with no grouping **(inferred: interpolation applies `Text(n)` with no format string)** |
| F5 | `txt_AddContract_RightPanel_AverageAmountPerPayment_1.Value` L11935-12145 | By Cluster: `If(locNumPayments = 0, Blank(), Text(txt_AddContract_RightPanel_TotalCost_1.Value / locNumPayments, "########0.0#"))` (L12081-12088); By Start and End Date: `Text(txt_…_TotalCost_1.Value / Max(Coalesce((RoundDown(((locEndYear - locStartYear) * 12 + (locEndMonth - locStartMonth)) / locFrequencyItem, 0) + 1), 1), 1), "########0.0#")` (L12128-12140) | **No grouping**, at least 1 and at most 2 decimals (`1000` → `1000.0`), in the user's decimal separator **(inferred)**; Blank when there are no payments or a field is invalid |
| F6 | `lbl_Production_CardHeader_LabelWithDescription_4.Text` L13211-13225 | `=$"Allocated Cost: {If(rad_…_DistributionScheme_1.Selected.Value = 'Distribution Scheme'.'% Values', Round(ThisItem.TotalUI, 1) & " %", Round(ThisItem.TotalSave, 0) & " " & Coalesce(gblRecordSelectedProjectCountry.'ISO Currency Code', "EUR"))}"` | Rounded number with no grouping (implicit number-to-text); `%` after a space |
| F7 | `lbl_…FirstMonth_24.Text` L13652 (and siblings) | `="January "&ThisItem.Year` … `"December "&…` | English month literal plus the year |
| F8 | `colFinatCostDataOptimized` subtitle, in `btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect` L1317-1325 | `$"Distribution from {Text(locDistributionDatesRecord1.StartDate, "mm/yyyy", Language())} to {Text(locDistributionDatesRecord1.EndDate, "mm/yyyy", Language())}"` | `MM/YYYY`, passed to the PCF as row text |
| F9 | `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1.Text` L11597-11602 | `"Start Date must be in or after " & Text(locCostAllowedStartDate, "mm/yyyy")` | `MM/YYYY` |
| F10 | `lbl_AddContract_RightPanel_EndDate_ErrorMessage_1.Text` / `.Visible` L11728, L11744 | `… DateValue("01/" & txt_…_StartDate_1.Value) >= DateValue("01/" & txt_…_EndDate_1.Value)` | A locale-dependent parse. `en-US` reads `01/MM/YYYY` as 1 = month and MM = day, but the ordering of the two values is preserved in both readings **(inferred)** |
| F11 | Comment headers L8627, L9603 | `$"Reply [{ThisItem.'Created By'.'Full Name'} - {Text(ThisItem.'Created On',"dd.mm.yyyy")}]"`; `$"Comment #{Text(ThisItem.SequenceNumber,"00")} [{…} - {Text(ThisItem.'Created On',"dd.mm.yyyy")}]"` | `dd.mm.yyyy` (in a date format string, `mm` means month); a two-digit sequence |
| F12 | `lbl_Draft_Edit_Header.Text` L9082 | `=$"Comment #{Text(ThisItem.SequenceNumber,"00")}"` | `Comment #01` |
| F13 | Counters L8933, L9527 | `=$"{Len(txt_Draft_Edit_Comment_Value_Reply.Text)} / 250"` | `n / 250` |
| F14 | `Label1.Text` L8215-8223, `Label5.Text` L8289-8297 | `With({_text: "Comments : " & locSelectedProjectContract.Name}, If(Len(_text) > 45, Left(_text, 45) & "...", _text))`; breadcrumb the same at 50 | Truncated with `...` |
| F15 | `drp_Draft_Edit_Month_Value.Items` L9307-9313 | `{Value: Int(ThisRecord.Value), MonthName: Text(ThisRecord.Value)}` over `Choices([@Month])` | The Dataverse choice label |
| F16 | `colProjectPeriods` in `OnVisible` L223-230 | `Name: Text(Date(2000, MonthNumber.Value, 1), "mmmm")` | Localised month name **(inferred)**; not bound to any visible control on this screen as far as the YAML shows. The copy in `btn_…_ShowNextYear.OnSelect` (L3026-3033) sits inside `/* … */` (L3009-L3051), so it is commented out, not live |
| F17 | `btn_…_AddCostFromTable.OnSelect` L2795-2806 | `locProjectStartingYear: Text(locCostAllowedStartYear)`, `locEndingYear: Text(Coalesce(Value(Text(gblSelectedProject.'Operations start date (COD)', "yyyy")) + 3, 2050))` | Year strings handed to the next screen |

### 2.5 `fn_Numeric` and `fn_Percentage`

`fn_Numeric_CC` (L19742) is the only instance on this screen. `fn_Percentage` is not used here.

The `fn_Numeric.pa.yaml` output functions:

- **`InRange`** (L84-91): `And(IsNumeric(candidate), And(Value(candidate) >= min, Value(candidate) <= max))`.
  Both ends are inclusive. `IsNumeric` and `Value` use the user's language.
- **`IsInteger`** (L92-102): `And(IsNumeric(candidate), Not(IsMatch(candidate, "[.,]", MatchOptions.Contains)))`.
  Any `.` or `,` fails, so a German "1.000" is not an integer.
- **`IsNumberOrBlank`** (L103-114): `Round(Value(Trim(candidate)), 2)` or `Blank()`. It returns a
  number, not a boolean.
- **`IsOneDecimal`** (L115-139), **`IsThreeDecimal`** (L140-164) and **`IsTwoDecimal`** (L165-189):
  each branches on `varLang = Lower(First(Split(Language(), "-")).Value)`. `"en"` uses the
  pattern `^((\+?)?\d+(|\.\d{0,n})?)`; anything else uses `,`.
  - Two-decimal is `^((\+|-?)?\d+…)`, which allows a sign.
  - `IsMatch` defaults to a complete match.

`fn_Percentage.IsPercentage` is literally `=true` (L25).

This screen calls `IsInteger`, `InRange` and `IsOneDecimal`, at:
- L10942-10953 (the Total Costs error label's `Visible`);
- L13347-13426 (each month error label).

### 2.6 Locale

**The canvas reads the language in two places only:**
- `Language()`, through the `fn_Numeric` branches and in F3/F8;
- `gblCurrentUser.Language` / `Lang` (`App.pa.yaml:L205`: `Language: Language(),
  Lang: Lower(First(Split(Language(), "-")).Value)`).

This screen does not read `gblCurrentUser.Lang`.

**Format strings take the user's language.** Every `Text(n, "<format>")` without a third
argument formats with the user's language: `,` is the grouping placeholder and `.` the decimal
placeholder, rendered locale-specifically **(inferred from Power Fx `Text` semantics)**. For a
`de-DE` user, F1 shows `19.700.000 EUR` and F5 shows `1000,0`.

No literal `"nl-NL"`, `"de-DE"` or `"en-US"` tag appears on the screen.

---

## 3. Code app implementation

### 3.1 Font family

**What the stack declares.**
- `theme/tokens.ts:102-103`: `fontFamily = "'Open Sans', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"`.
- `theme/fluent.ts:44` sets it as `fontFamilyBase`.
- `styles/global.css:40` repeats it on `body`, so that the PCF's body-level menus inherit it.

**No Open Sans face is loaded.**
- There is no `@font-face` and no font file in `src/`.
- `global.css:6-8`: "Drop the real Open Sans files into public/fonts and add an @font-face here
  if exact type fidelity is wanted".
- On a machine without Open Sans installed, every Fluent and canvas-CSS text therefore renders
  in **Segoe UI**.
- D49 §1 relies on this: "The canvas draws in Open Sans, which this app does not load, so the
  Segoe UI sizes are larger".

**The PCF stays on Segoe UI**, through its own CSS plus `canvas.css:247`
`.pcf-dropdown { font-family: 'Segoe UI', sans-serif; }`. This is pinned by
`styles/pcfCascade.test.ts:87`.

### 3.2 Sizes and weights by region

| Region | Code | Value vs canvas |
|---|---|---|
| Tabs | `canvas.css:183-184` | 14px; selected 600 — sampled |
| Toolbar | `canvas.css:193, 198, 204-205` | buttons 14px 600; dropdown triggers 400; switch labels 14px |
| Summary | `canvas.css:206-211` | table `font-size: 13px`; td 600, `padding: 9px 12px` (every cell, including "Total CAPEX"); last td right-aligned with `white-space: nowrap` (canvas: 12 px; name inset 10 / Total 0; sum right padding 4) |
| Panel header | `canvas.css:109` `.canvas-panel-header h2 { font-size: 18px; line-height: 26px }`; weight from Fluent `DrawerHeaderTitle` **(inferred semibold)** | — |
| Panel captions | `canvas.css:145, 151-152` | 14px, 600 (= `Text@0.0.51` Semibold default) |
| Panel inputs | `canvas.css:159` | 14px, `font: inherit` |
| Radio options | `canvas.css:174` | 14px, 400 |
| Panel errors | `canvas.css:280` `.canvas-field-error { font-size: 12px; font-weight: 400 }` | = 9 pt |
| Year gallery | `Screen.tsx:134-150` | year `fontWeightSemibold` + `fontSizeBase400` (16px); Allocated `fontSizeBase300` (14px); month caption `fontSizeBase300` (14px); month error `.canvas-field-error` (12px, 400) |
| Panel buttons | `CanvasFields.tsx:34, 66, 82` | Save, Cancel and Recalculate 15px; Recalculate semibold |
| Comments panel | `CommentsPanel.tsx:50-206` | breadcrumb `fontSizeBase400` (16px); head, read labels and counter `fontSizeBase300` (14px) with no weight set (400); values 14px semibold; warning `fontSizeBase200` (12px); resolved pill 12px semibold; checkboxes Fluent default (14px, 400); Sort-by `Field` label Fluent default |
| PCF | vendored CSS | identical (§2.3); `canvas.css:246` restores `line-height: normal` (pinned `pcfCascade.test.ts:73`) |

**Standard italic.** The italic half of rule 20 comes from `components/standardValue.ts:33`
(`fontStyle: "italic"`). Which controls carry it is covered in `03-THEMES.md` §3.6.

### 3.3 Formatting helpers in the code app

**`domain/locale.ts`:**
- `repairLanguageTag` (L54-70) cleans `navigator.language`, with a `DEFAULT_LOCALE = "de-DE"`
  fallback (L17).
- `localeInfo` (L72-97) derives the decimal and group separators **from `Intl`**. Any non-`.`
  decimal counts as `,`.
- `numberFormat` and `dateFormat` (L119-152) pool formatters.

**`domain/numeric.ts`** is the Cost port of `fn_Numeric` and `fn_Percentage`:
- `parseNumber` (L39-57) is the locale-aware `Value()`;
- `isDecimal` (L98-108) is anchored, with explicit sign handling;
- `isInteger` (L111-115) rejects any `.` or `,` (= canvas L92-102);
- `inRange` (L118-126) is inclusive;
- `numberOrBlank` (L132-138);
- `isPercentage` validates (SOURCE DEFECT B-2), with `isPercentageCanvasParity` (L154-156)
  returning `true`;
- `isOneDecimalCanvasParity`, `isTwoDecimalCanvasParity` and `isThreeDecimalCanvasParity`
  (L159-167) keep the canvas sign asymmetry;
- `round` (L176-183) rounds half away from zero, like Power Fx `Round`;
- `roundDown` and `roundUp` (L204-212).

**Other numeric and date helpers:**
- `domain/powerFxNumeric.ts` is a second port that uses the **language-prefix** rule
  (`langRoot`/`decimalSeparator`, L21-28). It is not imported by CAPEX. D17 (a) records the two
  libraries as backlog.
- `domain/numberInput.ts:12-16` documents the two separator rules as an "OPEN PRODUCT DECISION".
  It is not used by CAPEX.
- `domain/canvasDate.ts` (date-picker text formats) and `domain/dates.ts` (`fn_Common` date
  maths, `toMMYY`/`fromMMYY`, `formatDate` defaulting to `en-GB`) are **not imported by CAPEX**.
  The CAPEX screen has no date picker; the canvas uses `MM/YYYY` text boxes.

**CAPEX's own formatting:**

| Canvas item | Code | Test |
|---|---|---|
| F1/F2 summary amount | `rules.ts:103-106` `formatSummaryAmount` = `numberFormat("en-GB", { maximumFractionDigits: 0 })`, **fixed en-GB**; blank while loading; `Screen.tsx:697, 703` appends `" " + currency` | no UT id found |
| F3 Total Costs message | `rules.ts:401-412` `validateTotalCost(value, countryName, locale?)`: `en*` → en-GB grouping, otherwise de-DE; no full stop | UT-CAPEXR-047, -048, -049 (`rules.test.ts:389-405`) |
| F3 wiring | `Screen.tsx:481` `validateTotalCost(costValue, countryName)` **passes no locale**, so the message always uses en-GB grouping | Screen.test.tsx:300 expects `"… 500,000,000"` |
| F4 month message | `rules.ts:434-464` `validateMonthAmount`: `` `Value must be between 0 and ${grouped(max)}.` `` with `grouped` = en-GB / de-DE `Intl` grouping (L442-444, L461). `Screen.tsx:498` passes no locale | UT-CAPEXR-060…065 (`rules.test.ts:1124-1165`); UT-CAPEXR-062 pins `"500,000,000."` |
| F5 average amount | `rules.ts:242-245` `averagePayment` → number; `Screen.tsx:883-885` displays `amount(average)`, where `costing/model.ts:279` is `value === 0 ? "-" : numberFormat("en-GB", { maximumFractionDigits: 2 }).format(value)` | none for the display |
| F6 Allocated Cost | `panelRules.ts:70-78` `allocatedCostLabel`: `` `Allocated Cost: ${round(value, 1)} %` `` / `` `… ${round(value, 0)} ${isoCurrencyCode}` `` (JS number-to-string: no grouping, `.` decimal) | `Screen.test.tsx:678` ("refreshes the Allocated Cost figures") |
| F7 month captions | `panelRules.ts:80-92` `monthYearLabel` (English month array) | — |
| F8 PCF subtitle | `rules.ts:503` `` mmYYYY = `${MM}/${year}` `` | UT-CAPEXR-086 (`rules.test.ts:706`) |
| F9 Start Date message | `rules.ts` `validateStartMonthYear` with `mmYYYY` | Screen.test.tsx:288 |
| F10 End Date ordering | `rules.ts` `validateEndMonthYear` (numeric compare) | UT-CAPEXR-046 and its neighbours |
| `MM/YYYY` boxes | `panelRules.ts:96-120` `isoToMonthYear` / `monthYearToIso`; `Screen.tsx:869-876` `placeholder="MM/YYYY"` | `panelRules.test.ts:94, 110`; `Screen.test.tsx:280` |
| F11/F12 comment headers | `comments.ts:213-229` (`dd.mm.yyyy` built from local parts; `padStart(2, "0")`); `CommentsPanel.tsx:758` | UT-CMT-049 |
| F13 counter | `comments.ts:232-235` `` `${len} / 250` `` | UT-CMT-001, -002 |
| F14 truncation | `comments.ts:152-155` (45), `:164-166` (50) | UT-CMT-065, -066 |
| F15 month dropdown | `comments.ts` `commentMonthOptions` / `MONTH_NAMES` (English) | UT-CMT-068 |
| PCF grid numbers | vendored `GridRenderer.js:1371-1383` `formatCostValue` = `Intl.NumberFormat(navigator.languages, { minimumFractionDigits: 0, maximumFractionDigits: 3 })` (pooled); zero renders as a dash | `pcfGridFormat.test.ts:34-67` (no UT ids): matches upstream for 23 shapes, en-GB `1,234,567.891`, de-DE `1.234.567,891` |

**`SessionContext` locale.** `SessionContext` exposes `locale: localeInfo().tag`
(`app/SessionContext.tsx:30, 99`). `CapexCostsScreen` takes only `project` from `useSession()`
(`Screen.tsx:198`), so no CAPEX formatter receives the session locale.

**Panel number fields.**
- Total Costs is a `CostField type="number"` (`Screen.tsx:810, 827`).
- The month boxes are Fluent `Input type="number"` (`Screen.tsx:928-939`), with no placeholder.
- The browser's number input normalises what the user types to a `.`-decimal string. The canvas
  uses `TextInput` `Type: Text` plus the language-dependent `fn_Numeric` regexes.

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-TY-00 | Covered (group) | 1. Panel captions Semibold 14 px (`Text@0.0.51`, L10518 …)<br>2. Error labels 9 pt (L10444 …)<br>3. Save buttons 15 px (L17570, L10132)<br>4. `MM/YYYY` boxes, placeholder and messages (F8-F10, L11678, L11764)<br>5. English month captions (F7)<br>6. Comment header date `dd.mm.yyyy` and `#00` (F11-F12)<br>7. `n / 250` counter (F13)<br>8. 45/50 truncation (F14)<br>9. Allocated Cost rounding and ISO code (F6)<br>10. `fn_Numeric` `IsInteger` / `InRange` / `IsOneDecimal` semantics (§2.5)<br>11. Power Fx `Round` half away from zero<br>12. PCF grid type ramp and locale number format (§2.3, `GridRenderer.js:1371`)<br>13. No casing transforms anywhere | 1. `canvas.css:151-152`<br>2. `:280`<br>3. `CanvasFields.tsx:34, 66`<br>4. `panelRules.ts:96-120`, `rules.ts:503`<br>5. `panelRules.ts:89-92`<br>6-8. `comments.ts:152-235`<br>9. `panelRules.ts:70-78`<br>10. `numeric.ts:98-126` + parity twins<br>11. `numeric.ts:176-183`<br>12. vendored CSS/JS + `pcfCascade.test.ts`, `pcfGridFormat.test.ts`<br>13. — | UI | Covered | — | UT-CMT-001/002/049/065/066/068, UT-CAPEXR-046/060-065/067/086, UT-STDVAL-001-003 |
| GAP-TY-01 | Font family | Classic labels in `Font.'Open Sans'` (`gblAppStyles.Label.Font`, 74+ controls); modern controls and the PCF in the theme face, Segoe UI **(inferred)** (§2.2) | Stack starts with `'Open Sans'` (`tokens.ts:102`, `global.css:40`), but no `@font-face` is shipped, so everything renders in Segoe UI unless Open Sans is installed locally. The mixed canvas faces are not reproduced | UI | Divergent-unmarked | Med | Known: D49 §1, `global.css:6-8`. No `DIVERGENCE:` marker and no product decision. `tokens.ts:100` points to a non-existent `fonts.css` (§6) |
| GAP-TY-02 | Summary amount format | `Text(n, "###,###,###,##0")` in the **user's language** (F1/F2, L7865-7867, L7969) | `numberFormat("en-GB", …)` fixed (`rules.ts:103-106`): a German user sees `19,700,000` where the canvas shows `19.700.000` **(inferred)** | Functional | Divergent-unmarked | Med | The PCF grid in the same screen does follow the browser locale (`pcfGridFormat.test.ts:51-67`), so the two disagree with each other |
| GAP-TY-03 | Total Costs message locale | Bound literal by `Language()` prefix: `en` → `500,000,000`, other → `500.000.000` (F3, L10937) | The rule supports it (`rules.ts:401-412`, UT-CAPEXR-049), but `Screen.tsx:481` calls it without a locale, so it is always en-GB | Functional | Partial | Med | Wire `useSession().locale` (`SessionContext.tsx:99`) |
| GAP-TY-04 | Month range message | `$"Value must be between 0 and {If(Poland, 2250000000, 500000000)}."` interpolates a raw Number, so `500000000.` (F4, L13364-13368) **(inferred)** | `` `… ${grouped(max)}.` `` gives `500,000,000.` (`rules.ts:442-444, 461`); pinned by UT-CAPEXR-062 (`rules.test.ts:1139, 1143`) | UI | Divergent-unmarked | Med | Rule 7 (verbatim strings). The gap report S8 marks it COVERED (§6) |
| GAP-TY-05 | Average Amount per Payment | `Text(v, "########0.0#")`: no grouping, 1-2 decimals (`1000` → `1000.0`), language decimal separator; Blank when there are no payments (F5, L12084-12087, L12128-12140) | `amount(average)` = en-GB grouping, 0-2 decimals, `0` → `-` (`costing/model.ts:279`, `Screen.tsx:885`): `1,000` | UI | Divergent-unmarked | Med | The field is read-only, so this is display only |
| GAP-TY-06 | Month-box error typography | `FontWeight.Semibold`, 8 pt (10.67 px), `PaddingTop: =3` (L13331, L13340, L13336) | `.canvas-field-error` 12 px, 400 (`Screen.tsx:941`, `canvas.css:280`) | UI | Divergent-unmarked | Low | Colour in GAP-TH-05 |
| GAP-TY-07 | Month inputs | `TextInput` `Type: Text` with `Placeholder: ="0.00"` (L13623-13625) | Fluent `Input type="number"`, no placeholder (`Screen.tsx:928-939`) | UX | Partial | Low | |
| GAP-TY-08 | Year gallery type | Year `FontWeight.Bold` 12 pt (16 px) (L12623, L12632); Allocated 11 pt (14.67 px) Normal (L13210); month captions 11 pt (L13651) | Year semibold 16 px; Allocated and month captions 14 px (`Screen.tsx:134-150`) | UI | Partial | Low | |
| GAP-TY-09 | Summary type and inset | 9 pt (12 px) Semibold; names `PaddingLeft 10` + X 10, "Total CAPEX" `PaddingLeft 0` + X 10; sums `PaddingRight 4` (L7853-8008) | 13 px, 600, `padding: 9px 12px` on every cell (`canvas.css:206-210`) | UI | Divergent-unmarked | Low | The screenshot shows "Total CAPEX" inset less than the rows above it |
| GAP-TY-10 | Comments panel type | `FontWeight.Lighter` on headers, titles and counters (L8621, L8635, L9091 …, L9521); "Sort by" 14 px #595959 (L8336-8342); Sort dropdown 13 px Semibold (L8353-8356); filter checkboxes 14 px Semibold (L8365-8381); warning 10 pt = 13.33 px (L9568); resolved tag at the default size | No weight (400) on head, read labels and counter (`CommentsPanel.tsx:92-96, 106, 196`); Fluent `Field` label and Dropdown defaults (`:534-541`); Fluent `Checkbox` 400 (`:545-552`); warning 12 px (`:170`); pill 12 px (`:189`) | UI | Partial | Low | Behaviour in `09-COMMENTS-PANEL.md` |
| GAP-TY-11 | Comments header weight | `Label1` sets no `FontWeight`, so Normal (L8205-8225), as the screenshot shows | FormPanel header via `DrawerHeaderTitle` + `canvas.css:109` (18 px), Fluent semibold **(inferred)** | UI | Divergent-unmarked | Low | The Add/Edit panel header is Semibold in the canvas (L10306), so one shared FormPanel serves two weights |
| GAP-TY-12 | Decimal-separator rule | `fn_Numeric`: `"en"` prefix → `.`, any other language → `,` (`fn_Numeric.pa.yaml:L115-189`) | `numeric.ts` takes separators from `Intl` (`locale.ts:72-97`); differs for e.g. `de-CH` (Intl `.`) and `en-ZA` (Intl `,`) | Functional | Divergent-marked | Low | Recorded: D17 (a) "Two numeric libraries" and `numberInput.ts:12-16` "OPEN PRODUCT DECISION". No `…CanvasParity` twin for the separator choice |
| GAP-TY-13 | Number entry | `TextInput` Type Text; the typed text is validated with language regexes (§2.5) | `type="number"` on Total Costs and the months (`Screen.tsx:810, 827, 928`): the browser parses and normalises with its own locale | UX | Partial | Low | **(inferred)** behaviour of native number inputs; check a `de-DE` browser on the live app |
| GAP-TY-14 | % Allocated Cost decimal | `Round(x, 1) & " %"`: implicit number-to-text in the user's language, e.g. `12,5 %` for `de` **(inferred)** | `${round(value, 1)} %` → `12.5 %` always (`panelRules.ts:75-76`) | UI | Divergent-unmarked | Low | |
| GAP-TY-15 | Locale fallback | `Language()` is always defined in the canvas | `DEFAULT_LOCALE = "de-DE"` when the tag is missing or unusable (`locale.ts:17, 54-70`) | Functional | Code-app-only | Low | Defensive; documented in `app-docs/CHANGES-FROM-INPUT.md:115` |

---

## 5. Open questions and items not verifiable from source

1. **Modern-control font.**
   - What face does `PowerAppsTheme` give modern controls, and does `App.Theme.Font` resolve to
     Segoe UI? (§2.2)
   - This decides whether the code app's all-Segoe rendering matches half of the canvas screen
     (the modern controls and the PCF) and differs from the other half (the classic labels).
2. **Classic-label default font and size.** These labels set neither `Font` nor `Size`:
   - the panel header title (L10299);
   - the comments header `Label1` and breadcrumb `Label5`;
   - the error labels and asterisks;
   - `lbl_Draft_Edit_Comment_Warning`.

   Their defaults are not in the YAML. The code uses 18 px for both panel titles
   (`canvas.css:109`) and 16 px for the breadcrumb (`CommentsPanel.tsx:53`).
3. **Interpolation of a Number (F4).**
   - Confirm on a live canvas run that `$"…{500000000}."` renders without grouping.
   - Confirm that the implicit number-to-text in F6 uses the language's decimal separator.
4. **`Text()` without a language tag (F1, F2, F5).** Confirm the separators for a `de-DE` user
   on a live run. The code currently assumes en-GB for F1, F2 and F5.
5. **The month dropdown in comments (F15).**
   - It shows the Dataverse `Month` choice label.
   - If the environment has non-English labels, the code's English `MONTH_NAMES` would differ.
6. **Duplicate test ids (rule 13).** `rules.test.ts` uses **UT-CAPEXR-047** twice (L389 and
   L432) and **UT-CAPEXR-048** twice (L396 and L437). A failure report cannot point at one case.
   Not a typography gap, but found while citing tests.
7. **`pcfGridFormat.test.ts` and `pcfCascade.test.ts`** pin the vendored grid's formatting and
   fonts but carry no `UT-` ids.

## 6. Doc disagreements

1. **`app-docs/gap-analysis/cost-capex-costs.md` S8** marks the month messages "COVERED" and
   quotes the canvas text as `"Value must be between 0 and {max}."`.
   - The canvas `{max}` is a raw Number (F4).
   - The code prints a grouped `500,000,000.`, and UT-CAPEXR-062 pins that grouped form.
   - The wording is covered; the number formatting is not (GAP-TY-04).
2. **`theme/tokens.ts:98-101`** says Open Sans is "self-hosted in `src/styles/fonts.css` if the
   client supplies the files".
   - There is no `fonts.css`.
   - `styles/global.css:6-8` instead says to add an `@font-face` to `global.css`.
3. **`app-docs/02-OPEN-DECISIONS.md` D49 §1** says "The canvas draws in Open Sans".
   - That is true only of the classic controls, which carry `gblAppStyles.Label.Font`.
   - Every modern control and the PCF grid on this screen take the theme face or `'Segoe UI'`
     (§2.2).
4. **`migration-plans/03-pcf-inventory.md:328`** quotes the grid formatter as
   `Intl.NumberFormat(navigator.languages, { maximumFractionDigits: 3 })`.
   - The vendored code and its test oracle also pass `minimumFractionDigits: 0`
     (`pcfGridFormat.test.ts:25-27`).
   - Same output; the quote is incomplete.
5. **`features/cost/capex-costs/rules.ts:394-396`** says `Intl` reproduces "the `en-GB`/`de-DE`
   pair the canvas is choosing between".
   - The canvas picks between two hard-coded literals by language prefix (F3).
   - The code picks between two `Intl` locales. They agree for these two bounds, but the comment
     overstates the equivalence.
   - Because `Screen.tsx:481` passes no locale, the de-DE arm never runs in the app.
