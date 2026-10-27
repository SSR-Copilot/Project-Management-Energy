# 03 — Themes: colours and styles on the DEVEX/CAPEX Costs screen

Gap prefix: **GAP-TH**. Sibling files: layout and geometry are in `02-UI.md`; fonts, sizes and
text formatting are in `04-TYPOGRAPHY.md`; dialog, loader and error-panel content is in
`06-POPUPS.md`; the panel's save path is in `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`; the comments
panel's behaviour is in `09-COMMENTS-PANEL.md`; the PCF controls' inputs are in
`14-PCF-CONTROLS.md`.

## 1. Scope

This file covers every colour and style property that the canvas **Capex Costs Screen** sets,
the theme globals those properties resolve to, and how the code app reproduces them. It
groups them by region: header, left nav, tabs, toolbar, grid (PCF), summary, footer, the
Add/Edit panel, the comments panel and pop-ups. It also lists the state colours, the
standard-assumption blue italic rule (CONVENTIONS rule 20) and the PCF grid's own stylesheet.

### What was read

**Canvas** (`ProjectDocs/_extracted/msapp/projectcosts/Src/`):
- `App.pa.yaml`:
  - L12-58, the `AppTheme` named formula;
  - L205 (`OnStart`): `gblAppTheme`, `gblAppThemeJson`, `gblAppSizes`, `gblAppStyles`,
    `gblAppColors` and `gblTableApprovalStateColors`;
  - L207, `Theme: =PowerAppsTheme`.
- `Capex Costs Screen.pa.yaml`:
  - every colour and style property in the file was extracted with a read-only line parser. It
    found 3,078 property rows on 355 controls, and each was read in context;
  - ranges read in full: L11-14, L2300-2570, L2810-3064, L3717-3731, L4288-4375, L6288-6312,
    L7200-7290, L7640-7660, L7769-8080, L8156-8420, L10249-10540, L10911-10995,
    L11895-12150, L12420-12510, L12596-12700, L13195-13450, L13600-13660, L17484-17697,
    L18155-18205, L19742-19760.
- `Components/cmp_Header.pa.yaml` L76-235, plus an extract of its style properties.
- `Components/cmp_Left_Navigation.pa.yaml`, extract of its style properties.

**PCF stylesheet**, all four copies hashed:
- `ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/TableConnectedToDataversePCF/css/TableConnectedToDataversePCF.css`;
- `ProjectDocs/_extracted/VSBCustomComponents/Controls/vsb_Dev.DevexCapexSummaryPCF/css/TableConnectedToDataversePCF.css`;
- `ProjectDocs/_extracted/msapp/projectcosts/Resources/Controls/css/Dev.DevexCapexSummaryPCF.TableConnectedToDataversePCF.css`;
- `ProjectCosts-CodeApp/src/features/cost/capex-costs/pcf/css/TableConnectedToDataversePCF.css`.

**Screenshots** (`ProjectDocs/Existing Solution/UI Screenshots/`):
- `Cost App Landing Screen - Devex Capex Screen.png`;
- `… - Expanded Account Rows.png`;
- `… - Add Cost Panel.png`;
- `Cost App - Comment Panel contract Row - General Comment.png`.

**Code app** (`ProjectCosts-CodeApp/src/`):
- `theme/tokens.ts`, `theme/fluent.ts`, `theme/buttonStyles.ts`;
- `components/standardValue.ts`, `components/CanvasFields.tsx`, `components/ConfirmDialog.tsx`
  (style block), `components/LoadingOverlay.tsx` (style block), `components/AppHeader.tsx`
  (style block), `components/headerRules.ts`, `components/FormPanel.tsx`;
- `styles/global.css`, `styles/canvas.css`, `styles/pcfCascade.test.ts`;
- `features/cost/capex-costs/Screen.tsx` (styles L92-156, render L682-1057),
  `CommentsPanel.tsx` (styles L50-206, render L521-560), `gridRows.ts` L209 and
  `pcf/ui/GridRenderer.js` L726-764.

**Prior docs** checked:
- `app-docs/gap-analysis/cost-capex-costs.md` (U13, S8);
- `app-docs/02-OPEN-DECISIONS.md` (D36 hard-coded colour list, D38, D39, D49 §1);
- `app-docs/guide3-ui-notes-cost-app.md`;
- `migration-plans/03-pcf-inventory.md`;
- `app-docs/PCF-RENDERER-PORT.md`.

A note on reading the YAML. A property whose whole formula is a comment, such as
`Visible: =//true`, evaluates to Blank. For `Visible`, Blank means hidden. This was inferred
from Power Fx semantics, not from a live run. Three containers of the old hand-built grid
depend on it (§2.6).

---

## 2. Canvas implementation

### 2.1 The theme globals, verbatim

**`AppTheme`** is an App-level named formula, `App.pa.yaml:L13-58`. `OnStart` copies it with
`Set(gblAppTheme, AppTheme)` and stringifies it with
`Set(gblAppThemeJson, JSON(gblAppTheme, JSONFormat.Compact))` (`App.pa.yaml:L205`).
`gblAppThemeJson` is the `Theme` input of every PowerCAT control.

```powerfx
AppTheme = {
    palette: {
        themePrimary: "#006eb9",   themeLighterAlt: "#f2f8fc", themeLighter: "#cde4f4",
        themeLight: "#a4ceea",     themeTertiary: "#55a2d6",   themeSecondary: "#177ec2",
        themeDarkAlt: "#0065a8",   themeDark: "#00558d",       themeDarker: "#003f68",
        neutralLighterAlt: "#faf9f8", neutralLighter: "#f3f2f1", neutralLight: "#edebe9",
        neutralQuaternaryAlt: "#e1dfdd", neutralQuaternary: "#d0d0d0",
        neutralTertiaryAlt: "#c8c6c4", neutralTertiary: "#595959", neutralSecondary: "#373737",
        neutralPrimaryAlt: "#2f2f2f", neutralPrimary: "#000000", neutralDark: "#151515",
        black: "#0b0b0b", white: "#ffffff",
        akzent1: "#469bd7", akzent2: "#41aab4", akzent3: "#82a51e",
        akzent4: "#f5911e", akzent5: "#d20532", akzent6: "#af2887",
        hoverButton: "#CCE2F1",
        Grayscale00: "#0D0D0D", Grayscale10: "#6C6C6C", Grayscale20: "#E3E3E3",
        Grayscale30: "#F1F1F1", Grayscale40: "#FAFAFA", Grayscale50: "#FFFFFF",
        Error: "#B22727", Success: "#3C9856", SuccessLight: "#E9F3EC", Warning: "#EE940C",
        Green: "#82a51e", GreenDark: "#75941c", GreenLight: "#a0cb24"
    }
};
```

The layout above is reflowed onto fewer lines. All 42 keys and values are exactly as in the
source.

**`gblAppStyles`** — `App.pa.yaml:L205`, the `OnStart` block commented `// Colors below for
classic controls`. It is quoted here with each sub-record collapsed onto one line:

```powerfx
Set(gblAppStyles, {
    Error: ColorValue(gblAppTheme.palette.akzent5),
    Success: ColorValue(gblAppTheme.palette.akzent3),
    Warning: ColorValue("#EE940C"),
    Screen: { Fill: ColorValue(gblAppTheme.palette.Grayscale30),
              LoadingSpinerColor: ColorValue(gblAppTheme.palette.themePrimary) },
    Container: { BorderColor: Color.Transparent, BorderThickness: 0, Fill: Color.Transparent },
    Label: { BorderColor: Color.Transparent, BorderThickness: 0,
             Color: ColorValue(gblAppTheme.palette.black),
             DisabledBorderColor: Color.Transparent,
             DisabledColor: ColorValue(gblAppTheme.palette.Grayscale10),
             DisabledFill: Color.Transparent, Fill: Color.Transparent,
             FocusedBorderColor: Color.Transparent, FocusedBorderThickness: 0,
             HoverBorderColor: Color.Transparent, HoverColor: ColorValue(gblAppTheme.palette.black),
             HoverFill: Color.Transparent, PressedBorderColor: Color.Transparent,
             PressedColor: ColorValue(gblAppTheme.palette.black), PressedFill: Color.Transparent,
             Font: Font.'Open Sans' },
    ButtonTransparent: { BorderColor: Color.Transparent, BorderThickness: 0,
             Color: ColorValue(gblAppTheme.palette.Grayscale00),
             DisabledBorderColor: Color.Transparent,
             DisabledColor: ColorValue(gblAppTheme.palette.Grayscale10),
             DisabledFill: Color.Transparent, Fill: Color.Transparent,
             FocusedBorderColor: Color.Transparent, FocusedBorderThickness: 0,
             HoverBorderColor: Color.Transparent, HoverColor: ColorValue(gblAppTheme.palette.Grayscale10),
             HoverFill: Color.Transparent, PressedBorderColor: Color.Transparent,
             PressedColor: Color.Transparent, PressedFill: Color.Transparent,
             RadiusBottomLeft: 2, RadiusBottomRight: 2, RadiusTopLeft: 2, RadiusTopRight: 2,
             Font: Font.'Open Sans' },
    Icon: { BorderColor: Color.Transparent, BorderThickness: 0,
            Color: ColorValue(gblAppTheme.palette.themePrimary),
            DisabledBorderColor: Color.Transparent,
            DisabledColor: ColorValue(gblAppTheme.palette.Grayscale10),
            DisabledFill: Color.Transparent, Fill: Color.Transparent,
            FocusedBorderColor: Color.Transparent, FocusedBorderThickness: 0,
            HoverBorderColor: Color.Transparent, HoverColor: ColorValue(gblAppTheme.palette.themePrimary),
            HoverFill: Color.Transparent, PressedBorderColor: Color.Transparent,
            PressedColor: ColorValue(gblAppTheme.palette.themePrimary), PressedFill: Color.Transparent },
    Divider: { BorderColor: Color.Transparent, BorderStyle: BorderStyle.None, BorderThickness: 0,
               Color: ColorValue(gblAppTheme.palette.Grayscale20),
               DisabledColor: ColorValue(gblAppTheme.palette.Grayscale10),
               FocusedBorderColor: Color.Transparent, FocusedBorderThickness: 0,
               HoverColor: ColorValue(gblAppTheme.palette.Grayscale20),
               PressedColor: ColorValue(gblAppTheme.palette.Grayscale20) },
    Gallery: { BorderColor: Color.Transparent, BorderStyle: BorderStyle.None, BorderThickness: 0,
               Fill: Color.Transparent, FocusedBorderColor: Color.Transparent,
               FocusedBorderThickness: 0,
               LoadingSpinnerColor: ColorValue(gblAppTheme.palette.themePrimary),
               TemplateFill: Color.Transparent }
});
```

**`gblAppColors`** — `App.pa.yaml:L205`, set straight after `gblAppStyles`. Its `Icon`,
`Label`, `ButtonTransparent` and `Divider` records duplicate the `gblAppStyles` ones value for
value. `Gallery` adds `Header`. The keys that differ are:

```powerfx
Set(gblAppColors, {
    Screen: { Fill: ColorValue(gblAppTheme.palette.Grayscale30),
              LoadingSpinerColor: ColorValue(gblAppTheme.palette.themePrimary) },
    BorderColor: ColorValue(gblAppTheme.palette.Grayscale30),
    Transparent: Color.Transparent,
    Error: ColorValue(gblAppTheme.palette.akzent5),
    ErrorBg: ColorValue($"{gblAppTheme.palette.Error}20"),
    Success: ColorValue(gblAppTheme.palette.akzent3),
    SuccessLight: ColorValue(gblAppTheme.palette.akzent3),
    SuccessBg: ColorValue($"{gblAppTheme.palette.Green}20"),
    Warning: ColorValue(gblAppTheme.palette.Warning),
    GeneratorChangedData: ColorValue(gblAppTheme.palette.themePrimary),
    WarningBg: ColorValue($"{gblAppTheme.palette.Warning}20"),
    ButtonDisabledBg: ColorValue("#bdbdbd"),
    GallerySeparatorBg: ColorValue(gblAppTheme.palette.hoverButton),
    ApprovalClusterStates: {
        NotStarted: ColorValue($"{gblAppTheme.palette.Grayscale20}90"),
        InProgress: ColorValue($"{gblAppTheme.palette.Success}60"),
        Completed: ColorValue($"{gblAppTheme.palette.Success}"),
        Abandoned: ColorValue($"{gblAppTheme.palette.Warning}20"),
        Inactive: ColorValue($"{gblAppTheme.palette.Warning}20") },
    Gallery: { Header: ColorValue("#fdffff"), … the gblAppStyles.Gallery values … },
    …  Icon / Label / ButtonTransparent / Divider as in gblAppStyles
});
```

**`gblTableApprovalStateColors`** is set inside `Concurrent(...)` at `App.pa.yaml:L205`:
`Table({State:"Draft",Color:akzent2},{State:"Approving",Color:akzent4},{State:"Approved",Color:akzent3},{State:"Rejected",Color:akzent5})`.
The screen passes it to the header (`Capex Costs Screen.pa.yaml:L2327`,
`ApprovalStatesColor: =gblTableApprovalStateColors`).

**`gblAppSizes`** (`App.pa.yaml:L205`, `// Sizes for classic controls`) holds no colours. Its
`Font` ramp is covered in `04-TYPOGRAPHY.md` §2.1.

**App theme.** `Theme: =PowerAppsTheme` (`App.pa.yaml:L207`). Any **modern** control that sets
no `BasePaletteColor`, `Color` or `Appearance` takes its colours from this built-in theme, not
from `AppTheme`. For example, the toggles at L2886/L2896, the tab list at L2431 and the panel
checkboxes and toggles take the PowerAppsTheme brand blue. Which hex that is cannot be read from
source; the code app's own comment samples it as #0f6cbd from a screenshot (`canvas.css:181`).
**(inferred)**

**Two "Error" colours exist, and they are not the same.**
- `gblAppStyles.Error` and `gblAppColors.Error` are **akzent5 #d20532**.
- `palette.Error` is **#B22727**.

On this screen:
- 22 properties use `=gblAppColors.Error`: the panel's red `*` markers and the field error
  messages.
- 12 properties use `=ColorValue(gblAppTheme.palette.Error)`: the twelve month-box error labels.

Both counts come from the property extract.

### 2.2 Distinct colour values used on the screen

Counts come from the full extract of the YAML. "Generic" means one of the
`gblAppStyles.*` / `gblAppColors.*` records above.

| Property | Values (count) | Resolves to |
|---|---|---|
| `Fill` | `gblAppStyles.Label.Fill` (74), `Color.Transparent` (5), `ColorValue("#fdffff")` (5), `palette.white` (5), `Color.White` (3), `RGBA(231,231,231,1)` (3), `palette.themePrimary` (2), `RGBA(0,0,0,0.3)` (2), `RGBA(255,255,255,1)` (2), `palette.Grayscale40` (1), `RGBA(225,236,244,1)` (1), `RGBA(243,243,243,1)` (1), `RGBA(245,145,30,0.5)` (1), `gblAppColors.BorderColor` (1), Divider colour (5) | transparent / #fdffff / #ffffff / #e7e7e7 / #006eb9 / black at 30 % / #fafafa / #e1ecf4 / #f3f3f3 / akzent4 at 50 % / #F1F1F1 / #E3E3E3 |
| `Color` | `gblAppStyles.Label.Color` (48), `gblAppColors.Error` (22), `If(ThisItem.IsStandardContract, themePrimary, Label.Color)` (14), `RGBA(89,89,89,1)` (15), `palette.Error` (12), `RGBA(0,0,0,1)` (4), `palette.themePrimary` (3), `RGBA(255,255,255,1)` (2), `palette.white` (2), `Color.Transparent` (2), `gblAppColors.Warning` (1), conditional Warning/Error (1) | #0b0b0b / #d20532 / #006eb9 / #595959 / #B22727 / #000 / #fff / #EE940C |
| `FontColor` | `If(locSelectedCostRow.IsStandardContract, themePrimary)` (11), `palette.themePrimary` (3), `palette.white` (1) | #006eb9 / default / #fff |
| `BorderColor` | `gblAppStyles.Label.BorderColor` (73), `Color.Transparent` (8), `RGBA(125,125,125,1)` (4), `RGBA(0,0,0,1)` (3), `RGBA(0,0,0,0)` (2), `palette.themePrimary` (2), `palette.Grayscale20` (1), `RGBA(170,170,170,1)` (1), `RGBA(106,122,127,1)` (1), generic (10) | transparent / #7d7d7d / #000 / #006eb9 / #E3E3E3 / #aaaaaa / #6a7a7f |
| `BorderStyle` | `None` (71), `Solid` (5), `Dotted` (4), Divider (5) | — |
| `BorderThickness` | generic 0 (88), `0.5` (4), `1` (2), `2` (2), `0.05` (2) | — |
| `HoverFill` | generic transparent (≈85), `ColorValue("#E3E3E322")` (1), Divider colour (5) | Grayscale20 at alpha 0x22 |
| `HoverColor` | generic (57), `Self.Color` (2) | — |
| `HoverBorderColor` | generic (≈80), `palette.hoverButton` (2) | #CCE2F1 |
| `PressedColor` | generic (82), `palette.themeLighter` (1) | #cde4f4 |
| `DisabledColor` / `DisabledFill` / `DisabledBorderColor` | generic (≈80 each), `RGBA(255,255,255,1)` (1-2) | Grayscale10 #6C6C6C / transparent |
| `FocusedBorderColor` / `FocusedBorderThickness` | generic transparent / 0 (≈85), `FocusedBorderThickness: =4` (1, `img_Warning_OnEditFromPCF`) | — |
| `BasePaletteColor` | `palette.themePrimary` (31), `Color.Transparent` (2) | #006eb9 |
| `Appearance` | `ButtonAppearance.Transparent` (9), `Appearance.FilledLighter` (4), `Appearance.Outline` (4), `ButtonAppearance.Subtle` (2), `ButtonAppearance.Secondary` (1), `'ButtonCanvas.Appearance'.Transparent` (1), `'TextInputCanvas.Appearance'.FilledDarker` (1), `'Spinner.Appearance'.Primary` (1) | modern-control skins |
| `DropShadow` | `None` (62), `If(ThisItem.IsAccount, DropShadow.Light, DropShadow.None)` (1, hidden gallery) | — |
| `Radius*` | `0` (≈57 each), `1` (2: summary cards), `8` (2: comment draft cards), `20` (1: resolved tag), ButtonTransparent `2` | — |
| `IconColor` (PowerCAT) | `If(Self.DisplayMode = Disabled, palette.black, palette.themePrimary)` (2), the same with `palette.white` (1) | — |
| `Theme` (PowerCAT) | `gblAppThemeJson` (6) | — |

### 2.3 Region by region: header and left navigation

These controls belong to `01-EDIT-COST-MODULE.md`. Only their colours are recorded here.

**Header** — `cmp_Costs_Header` (`Capex Costs Screen.pa.yaml:L2323`), component `cmp_Header`:

| Control (cmp_Header.pa.yaml) | Property | Value | Hex |
|---|---|---|---|
| `con_cmp_Header` L80-97 | `Fill` | `Switch(gblEnvironmentName, "Hotfix", ColorValue("#9831A850"), "Nightly", ColorValue("#AAAAAA60"), "Budgeting", ColorValue("#85AD3760"), "QA", ColorValue("#E66C3780"), RGBA(255,255,255,1))` | environment tint; white otherwise |
| `con_cmp_Header_Title` L223-227 | `Color` / `FontWeight` | `palette.themePrimary` / Semibold ("Cloud") | #006eb9 |
| `con_cmp_Header_Version` L196 | `FontWeight` | `FontWeight.Lighter` | — |
| `ico_cmp_Header_Info` L213 | `Color` | `Switch(gblEnvironmentName, "Dev", gblAppStyles.Error, "Nightly", gblAppStyles.Warning, "QA", gblAppStyles.Success, Color.Transparent)`; its `Visible: =//true` (L216) is comment-only | akzent5 / #EE940C / akzent3 |
| `rec_cmp_Header_Project_State` L270 | `Fill` | `LookUp(ApprovalStatesColor, State = Project.Approval)` colour, else `#ffffff` | akzent2/4/3/5 |
| `con_cmp_In_Header_UserName` L574 / `lbl_…` L591 | `Fill` / `Color` | themePrimary / white | #006eb9 / #fff |
| `shp_cmp_In_Image_UserBorder` L686-688 | `BorderColor` / `Fill` | palette.black / white | #0b0b0b / #fff |

**Left navigation** — `con_Costs_LeftNavigationMenu` `Fill: =Color.White` (L2364), with
`cmp_Left_Navigation` inside it.
- `icon_Left_Navigation_Expand` (component L137-143):
  - `Color`, `HoverColor`, `FocusedBorderColor` and `HoverBorderColor` are themePrimary;
  - `HoverFill` is hoverButton (#CCE2F1).
- `pcf_Left_Navigation_Menu` is a `cat_PowerCAT.Nav` themed by `Theme: =gblAppThemeJson`
  (component L152, L179).

### 2.4 Region by region: body, tabs and toolbar

| Control | Line | Property → value | Hex |
|---|---|---|---|
| screen | L12 | `Fill: =gblAppStyles.Screen.Fill` | Grayscale30 #F1F1F1 |
| `con_Costs_Body` | L2343-2344 | `DropShadow.None`, `Fill: =Color.Transparent` | — |
| `con_Costs_BodyRightSide` | L2407 | `Fill: =ColorValue(gblAppTheme.palette.white)` | #ffffff |
| `tab_Costs_ContentAssignableAccountCategories` (ModernTabList) | L2431-2516 | no colour property; `FontWeight: =""`, `Size: =0`, `TabSize.Medium` → PowerAppsTheme styling | theme default **(inferred)** |
| `con_Costs_ContentCostsInMonths` | L2523 | `Fill: =palette.white` | #ffffff |
| `con_Costs_ProjectCosts_TableCommandBar_Toggles` | L2545 | `Fill: =Color.Transparent` | — |
| `btn_Costs_ProjectCosts_TableCommandBar_AddCostFromTable` (Button@0.0.45) | L2562-2564 | `Appearance: ='ButtonCanvas.Appearance'.Transparent`, `BasePaletteColor` and `FontColor: =ColorValue(palette.themePrimary)` | #006eb9 |
| `tgl_Costs_ProjectCostbtn_ShowEmptyAccounts`, `tgl_Costs_ProjectCostbtn_ShowPlannedPaid` (Toggle@1.1.5) | L2886-2904 | **no** `BasePaletteColor` | PowerAppsTheme **(inferred)** |
| `tgl_…_ShowInactiveAccounts`, `tgl_…_FiscalYear` | L2823, L2865 | `BasePaletteColor: =themePrimary`, but `Visible: =//true` then `false` (L2858-2860, L2871-2873), so hidden | — |
| `drp_Costs_ProjectCostbtn_ShowCostPaidBy`, `drp_…_ShowSelectedYear` (ModernDropdown) | L2909, L2925 | `Appearance: =Appearance.Outline` | theme default |
| `btn_Costs_ProjectCostbtn_ShowPreviousYear` / `…NextYear` (ModernButton) | L2950-2951, L3002-3003 | `Appearance: =ButtonAppearance.Subtle`, `Color: =ColorValue(palette.themePrimary)` | #006eb9 |
| `con_Costs_ProjectCosts_TableCommandBar` (PowerCAT CommandBar, `Theme: =gblAppThemeJson` L3564) | L3064 | `Visible: =false` | not rendered |
| `con_Costs_ProjectCosts_GalleryNavigation` (two PowerCAT Icons, `Theme` L3668, L3699) | L3579 | `Visible: =false` | not rendered |

### 2.5 Region by region: the grid (PCF)

`DevexCapexSummaryPCF` (`vsb_Dev.DevexCapexSummaryPCF`, L7234-7655) is the live grid.
- **It receives no colour, font or theme input.** Its properties are `Cluster1Date` …
  `Cluster6Date`, `CollapseResetKey`, `CostPaidByFilter`, `Height`, `Items`, `OnChange`,
  `ShowEmptyAccounts`, `ShowPlannedCost`, `StandardContractOptions_Items`, `StartYear` and
  `Width` (L7238-7655). All of its styling comes from its own stylesheet.
- **The standard-contract flag is data, not style.** Each row of `colFinatCostDataOptimized`
  carries `IsStandardContract: If(CPC.'Is Standard Contract?' = …Ja, "true", "false")`
  (`btn_Capex_Cost_Refresh_Capex_Cost_Code.OnSelect`, L1331-1334). The PCF parser reads it and
  the stylesheet colours the row.

**`TableConnectedToDataversePCF.css` — palette summary.** All four copies are byte-identical
(SHA-256 `3F63148A…19DF0AB`, 47,178 bytes, 1,416 lines). The line numbers below are the same in
every copy.

| Element (selector) | CSS line | Colour | Palette match |
|---|---|---|---|
| Grid root `.pcf-budget-grid` | L28-31 | bg #fff, text #242424, `'Segoe UI'` 12px | white / — |
| Header cells `.pcf-table th` | L74-79 | bg #fff, text #595959 600, borders #E7E7E7 / #DBDBDB | neutralTertiary |
| Body cells `.pcf-table td` | L108-111 | text #242424, borders #E7E7E7 | — |
| Account row `.pcf-row-account` | L395-403 | bg #DCDCDC, text #242424 700 | — |
| Sub-account row `.pcf-row-sub` | L408-415 | bg #EDEBE9, text #333 | neutralLight |
| Contract row `.pcf-row-contract` | L421-428 | bg #fff, text #242424 | white |
| Paid month cell `.pcf-paid-cell` / hover / active | L166-178 | #D6E7B3 / #C6DD9A / #A8C676 | — (green family) |
| Paid total `.pcf-cell-total-paid` | L186-187 | #a3c068 | — |
| Unpaid hover / active | L192-198 | #E7E7E7 / #DCDCDC | — |
| Selected cell `.pcf-selected-cell` | L1261-1263 | #D6E7B3 | — |
| Cluster pill `.pcf-cluster-pill`, timeline | L318-375 | pill #E7E7E7 on #d0d0d0, text #595959; timeline #5C5C5C | neutralQuaternary, neutralTertiary |
| Tree connectors | L522-646 | #AAAAAA | — |
| Expand toggle `.pcf-toggle` | L607-652 | bg #f7f7f7, border #AAAAAA, text #595959; hover #eee / #777 | neutralTertiary |
| "Add" link `.pcf-add-btn`, `.pcf-add-menu-btn`, dots | L682-714 | #006EB9; active bg #cfe4f7 | themePrimary |
| Add dropdown, sub-menu, paid/unpaid menu | L225-264, L727-822, L1274-1327 | white, border #D0D0D0 / #e5e5e5, shadow rgba(0,0,0,.16/.12), hover #F3F2F1, info band #ecebe9, disabled #A6A6A6 | neutralQuaternary, neutralLighter |
| Contract "•••" button `.pcf-dots-btn` | L1119-1141 | bg #f7fbff, border #8ab6e8, text #006EB9; hover #edf6ff; active #cfe4f7 / #006EB9 | themePrimary |
| Contract "•••" menu `.pcf-dropdown` | L1152-1203 | white, #e5e5e5, item #333, hover #f5f5f5, disabled #A6A6A6 / #C8C8C8 | — |
| Name / meta text | L866-910 | main #242424; sub, meta and `[SPV]`/`[DevCo]` tags #777777 / #767676; contract link #006EB9 italic | themePrimary |
| **Standard contract** `.pcf-contract-standard`, `.pcf-row-standard *` | L922-938 | **#006EB9 `!important`**, no italic | themePrimary |
| **Red comment marker** `.pcf-name-dot`, `.pcf-month-comment-dot`, `.pcf-dot-badge`, `.pcf-dot-inline` | L958-959, L977-978, L1221-1234 | **#E23636** | — (not akzent5) |
| Comment tooltips | L1013-1062 | bg #ecebe9, border #D0D0D0, text #242424 | — |
| Empty value `.pcf-val-dash` | L1241 | #777777 | — |
| Grand total row `.pcf-row-grand`, `.pcf-grand-label` | L1085-1095 | #7D7D7D / #595959, text #fff 700 | neutralTertiary |
| Info icon, loading text, spinner | L1345-1408 | #A6A6A6; #9ca3af; spinner #006EB9 over rgba(0,110,185,.25) | themePrimary |

Five of the stylesheet's hexes equal `AppTheme` values: #006EB9, #595959, #d0d0d0, #f3f2f1 and
#edebe9. All the others are the vendor's own. The stylesheet hard-codes every colour, so a change
to `AppTheme` would never reach the grid.

### 2.6 Region by region: the hidden old grid (not live)

The hand-built grid that the PCF replaced is still in the YAML:
- `con_Costs_ProjectCosts_TableHeader` (L3717), `Visible: =//true` at L3730;
- `gal_Costs_ProjectCosts` (L4288), `Visible: =//true` at L4323;
- `con_Costs_ProjectCostsMonthSummary` (L6288), `Visible: =//true` at L6311.

Each of those formulas is comment-only, so it evaluates to Blank, and the control is hidden
(inferred, §1). Their styling is therefore **not live**:
- header fill Grayscale40 (L3722);
- account cards #fdffff with a Grayscale20 border and `DropShadow.Light` on account rows
  (L4372-4375);
- 14 labels with `Color: =If(ThisItem.IsStandardContract, ColorValue(gblAppTheme.palette.themePrimary), gblAppStyles.Label.Color)`:
  `lbl__ProjectCostsInAccount_AccountName_2` (L4446), `lbl_Costs_label_139` … `_150`
  (L4483 … L5967) and `lbl_Costs_label_TotalCost` (L6166);
- the month summary's #fdffff (L6323).

They are listed so that nobody ports them as live requirements.

### 2.7 Region by region: the Summary tab

`con_Costs_ContentCostsSummary` (L7769) is shown when
`IsBlank(tab_….Selected.'CAPEX Account List')` (L7783).

| Control | Line | Property → value | Hex |
|---|---|---|---|
| `con_Costs_ContentCostsSummary_AccountCategory` (gallery template) | L7806-7815 | `BorderColor`/`Thickness` Container (transparent, 0), `Fill: =ColorValue("#fdffff")`, `Radius*: =1` | #fdffff |
| `shp_…_AccountCategoryc_BottomLine` | L7817-7833 | Divider style (Grayscale20), **`Visible: =false`** | no row line |
| `lbl_…_AccountCategory_Sum` / `_Name` | L7834-7918 | `gblAppStyles.Label.*`: colour #0b0b0b, transparent fill | #0b0b0b |
| `con_Costs_ContentCostsSummary_TotalSummary` | L7924-7935 | same as the category card: #fdffff, radius 1 | #fdffff |
| `shp_lbl_…_TotalSummary_BottomLine` | L8010-8024 | Divider: `Fill: =gblAppStyles.Divider.Color`, `Height: =2`, visible | Grayscale20 #E3E3E3 |

### 2.8 Region by region: the footer

`con_Costs_Footer` `Fill: =ColorValue(gblAppTheme.palette.white)` (L8031).
`lbl_Costs_FooterVersion` (L8053-8080) uses the `gblAppStyles.Label` colours. Its `BorderColor`
is `=gblAppStyles.Label.Color` (L8057), but `BorderThickness` is 0, so no border shows. Its
`Text: =""` (L8076).

### 2.9 Region by region: the Add/Edit panel

The panel is `con_cost_RightPanel_Form_AddContract`, L10249-18205.

| Control | Line | Property → value | Hex |
|---|---|---|---|
| `con_cost_RightPanel_Form_AddContract` (scrim) | L10253-10255 | `BorderStyle.None`, `DropShadow.None`, `Fill: =RGBA(0, 0, 0, 0.3)` | black at 30 % |
| `con_GeneratorData_RightPanel_Form_PvModuleType_Context_2` | L10272 | `Fill: =Color.White` | #fff |
| `…_Header_2` | L10290 | `Fill: =ColorValue(gblAppTheme.palette.themePrimary)`, 48 high | #006eb9 |
| `lbl_…_Header_Title_2` | L10303-10306 | `Color`, `DisabledBorderColor` and `DisabledColor` `RGBA(255,255,255,1)`; `FontWeight.Semibold` | #fff |
| `ico_…_Header_Cancel_2` | L10321-10355 | `Color: =palette.white`, `HoverColor: =Self.Color`, `PressedColor: =ColorValue(palette.themeLighter)` | #fff / #cde4f4 |
| `…_Body_2` | L10377 | `Fill: =RGBA(255,255,255,1)` | #fff |
| `…_Fields_3` | L10396 | `BorderColor: =RGBA(0,0,0,0)` | — |
| Field captions `lbl_…_Fields_Label_12`… (Text@0.0.51) | L10518, … | `Weight: ='TextCanvas.Weight'.Semibold`, no colour → theme text colour | theme **(inferred)** |
| Asterisks `lbl_…_Label_Asterisk_*` | L10524, L10584, L10720, L10839, L11023, L11079, L11392, L11696, L11782, L11831, L12161, L12222 | `Color: =gblAppColors.Error` | akzent5 #d20532 |
| Field error labels `…_ErrorMessage_2/8/9/12/13/14/16`, `lbl_AddContract_RightPanel_StartDate_ErrorMessage_1`, `…EndDate…`, `…Link_to_Cluster_Label_ErrorMessage` | L10442, L10550, L10805, L10683, L11058, L11811, L12188, L11540, L11725, L11372 | `Color: =gblAppColors.Error` | #d20532 |
| `lbl_AddContract_RightPanel_TotalCost_ErrorMessage_1` | L10931-10934 | `If(Individual && Absolute, gblAppColors.Warning, gblAppColors.Error)`. Its parent `…_Fields_Label_15` is hidden in exactly that mode (L10925), so the Warning arm never shows | effectively #d20532 |
| `lbl_…_ErrorMessage_15` (Average Amount hint) | L11914-11920 | `Color: =gblAppColors.Warning`, but `Visible: =//…` then `false` | hidden |
| Text inputs (`txt_…_Description_1`, `…_TotalCost_1`, `…_StartDate_1`, `…_EndDate_1`, `…_AverageAmountPerPayment_1`, `txt_…_Fields_Label_37/38/39/40`) | L10474, L10562, L10695, L10817, L10967, L11671, L11757, L11930, L12200 | `BasePaletteColor: =ColorValue(palette.themePrimary)`; `…_TotalCost_1` also `Appearance: ='TextInputCanvas.Appearance'.FilledDarker` (L10966) | #006eb9 accent |
| `txt_AddContract_RightPanel_AverageAmountPerPayment_1` | L11931 | `DisplayMode: =DisplayMode.Disabled`, so the modern disabled skin (white box with a light outline in the screenshot) | — |
| Radios `rad_…_DistributionType_1`, `…DistributionScheme_1`, `…DistributionBy_1`, `…CostPaidBy_1` | L10595, L10730, L10849, L12233 | `BasePaletteColor: =themePrimary` | #006eb9 |
| Dropdowns `drp_Add_Edit_Cost_Data_RightPanel_Form_Link_to_Cluster`, `drp_AddContract_RightPanel_PaymentFrequency_1` | L11403, L11842 | `BasePaletteColor: =themePrimary` | #006eb9 |
| Checkboxes `chk_…_SelectCluster1_1`…`5_1`, toggles `tgl_…_ApplyVAT_1`, `tgl_…_Depreciation_1` | L11111-12395 | **no** `BasePaletteColor` | PowerAppsTheme **(inferred)** |
| `con_Warning_OnEditFromPCF` | L12426-12451 | `Fill: =RGBA(245, 145, 30, 0.5)`, padding 10. `Visible: =And(locSelectedProjectContract.'Is Edited from PCF?' = …Yes, locSelectedProjectContract.'Initial Contract Source' = …Powerapps, Not(IsBlank(locSelectedProjectContract)))` | akzent4 at 50 % |
| `img_Warning_OnEditFromPCF` | L12454-12474 | transparent borders and fills, `Image: =warning` | — |
| `Rectangle1_1` (column divider) | L12496-12503 | `Fill: =gblAppColors.BorderColor`, 1 wide | Grayscale30 #F1F1F1 |
| `gal_IndividualCost_Items_1` | L12532-12536 | transparent border, fill and focus | — |
| `con_Production_MainRow_3` / `con_Production_CardHeader_3` (year row) | L12589-12605 | transparent border; fill white / `ColorValue("#fdffff")` | #fff / #fdffff |
| `btn_Production_CardHeader_TransparentButton_3` | L12660-12683 | ButtonTransparent record; `HoverFill: =ColorValue("#E3E3E322")` | Grayscale20 at 13 % |
| `ico_Production_CardHeader_Down_3` (chevron) | L12690-12699 | `gblAppColors.Icon.Color` | #006eb9 |
| `con_ProductionDeatils_VerticalMain_3` | L13234-13237 | transparent border, thickness 1, white fill | #fff |
| Month error labels `lbl_Costs_RightPanel_EditCostsInSubaccount_BodyContent_FirstMonth_ErrorMessage_24` … `_35` | L13322, L13680, L14030, L14377, L14724, L15071, L15418, L15765, L16112, L16459, L16808, L17155 | **`Color: =ColorValue(gblAppTheme.palette.Error)`** | **#B22727** |
| Month inputs `txt_…_FirstMonth_24` … `_35` | L13435 … L17268 | `BasePaletteColor: =themePrimary` | #006eb9 |
| Footer `con_GeneratorData_RightPanel_Form_PvModuleType_Buttons_2` | L17490 | `Fill: =RGBA(255,255,255,1)` | #fff |
| `btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Save` (Button@0.0.45) | L17506-17575 | **no** `Appearance`/`BasePaletteColor` → default primary in PowerAppsTheme | theme **(inferred)** |
| `btn_SaveCost_Execute____` (PowerCAT) | L17670-17692 | `FillColor: =themePrimary`, `FontColor: =white`, `HoverFillColor: =hoverButton`, `HoverFontColor`/`HoverIconColor: =themePrimary`, `IconColor: =If(Disabled, black, white)`; **`Visible: =false`** | hidden |
| `pcf_btn_GeneratorData_RightPanel_Form_PvModuleType_Buttons_Cancel_2` (PowerCAT Icon) | L18159-18203 | `BorderColor`/`FontColor: =themePrimary`, `FillColor: =white`, `HoverBorderColor`/`HoverFillColor: =hoverButton`, `HoverFontColor`/`HoverIconColor: =themePrimary`, `IconColor: =If(Disabled, black, themePrimary)`, `Theme: =gblAppThemeJson` | #006eb9 / #fff / #CCE2F1 |

### 2.10 Region by region: the comments panel

The panel is `con_Capex_Comments_Right_Panel`, L8156-10248.

| Control | Line | Property → value | Hex |
|---|---|---|---|
| `con_Capex_Comments_Right_Panel` (scrim) | L8160-8161 | `DropShadow.None`, `Fill: =RGBA(0,0,0,0.3)` | black at 30 % |
| `Container3` | L8175 | `Fill: =Color.White` | #fff |
| `Container4` (header) | L8192 | `Fill: =palette.themePrimary` | #006eb9 |
| `Label1` (title) / `Icon2` (✕) | L8208 / L8229-8233 | `Color: =RGBA(255,255,255,1)` / `Color: =palette.white`, `HoverColor: =Self.Color` | #fff |
| `Rectangle1` (under breadcrumb) | L8277 | `Fill: =RGBA(231,231,231,1)`, 1 high | #e7e7e7 |
| `Container10` (filters) | L8323 | `Fill: =RGBA(243,243,243,1)` | #f3f3f3 |
| `Text2` ("Sort by") | L8336 | `Color: =RGBA(89,89,89,1)` | #595959 |
| `modernDropdown1` | L8349-8351 | `Appearance.FilledLighter`, `BorderColor: =RGBA(170,170,170,1)`, `BorderStyle.Solid` | #aaaaaa |
| `rec_Capec_Comment_Seprator` | L8495 | `Fill: =RGBA(231,231,231,1)` | #e7e7e7 |
| Read-card captions `lbl_Read_Header(_Reply)`, `lbl_Read_Type_Title`, `lbl_Read_Comment_Title(_Reply)`, `lbl_Draft_Edit_*_Title`, the counters | L8617, L8633, L8824, L8885, L8925, L9074, L9089, L9161, L9200, L9268, L9519, L9592, L9609, L9647 | `Color: =RGBA(89,89,89,1)` | #595959 |
| Read-card values `lbl_Read_Type_Value`, `lbl_Read_Comment_Value(_Reply)` | L8647, L9624, L9661 | `Color: =RGBA(0,0,0,1)` | #000 |
| Draft cards `con_Comment_Draft_Edit`, `con_Reply_Comment_Draft_Edit` | L9054-9062, L8807-8815 | `BorderColor: =RGBA(125,125,125,1)`, `BorderStyle.Dotted`, `BorderThickness: =0.5`, `Radius*: =8` | #7d7d7d |
| Comment text boxes `txt_Draft_Edit_Comment_Value(_Reply)` | L9175-9178, L8899-8902 | `Appearance.Outline`, `BorderColor: =RGBA(125,125,125,1)`, `Dotted`, `0.5` | #7d7d7d |
| `drp_Draft_Edit_Type_Value` | L9103-9107 | `FilledLighter`, `BasePaletteColor: =themePrimary`, `BorderColor: =RGBA(0,0,0,1)`, `Solid`, `1` | #000 border |
| `drp_Draft_Edit_Year_Value` / `drp_Draft_Edit_Month_Value` | L9216-9219 / L9284-9287 | `FilledLighter`, `BorderColor: =RGBA(0,0,0,1)`, `Solid`, `BorderThickness: =0.05` | #000 border |
| Delete buttons `btn_Draft_Edit_Delete(_Reply)` | L9499-9502, L8866-8869 | `ButtonAppearance.Transparent`, `BasePaletteColor`/`BorderColor`/`Color: =Color.Transparent` | — |
| Read-card action buttons (Edit, Delete, Check, Reply, Reset) | L8709, L8782, L9760, L9817, L9872, L9934, L10022 | `ButtonAppearance.Transparent` | icon colours from their SVGs |
| `con_Draft_Edit_Comment_Warning` | L9536 | `Fill: =RGBA(225,236,244,1)` | #e1ecf4 |
| `txt_Read_Comment_Resolved_Tag` | L9946-9964 | `BorderColor: =RGBA(106,122,127,1)`, `Solid`, `2`, `Fill: =RGBA(231,231,231,1)`, `Radius*: =20` | #6a7a7f / #e7e7e7 |
| `btn_Add_Comment` | L8970-8974 | `ButtonAppearance.Secondary`, `Color: =palette.themePrimary` | #006eb9 |
| `btn_Capex_Comment_Save` (Button@0.0.45) | L10092-10132 | default primary (theme) | theme **(inferred)** |
| `btn_Capex_Comment_Cancel` (PowerCAT) | L10228-10246 | `BorderColor`/`FontColor: =themePrimary`, `HoverBorderColor: =hoverButton`, `IconColor: =If(Disabled, black, themePrimary)`, `Theme: =gblAppThemeJson` | #006eb9 / #CCE2F1 |

### 2.11 Region by region: pop-ups, loaders and the error panel

The content of these belongs to `06-POPUPS.md`. On the screen itself:
- `cmp_ShowErrorInContract` passes `Color: =RGBA(0, 0, 0, 1)` (L19764);
- `spn_LoadingSpinnerCost` is `Appearance: ='Spinner.Appearance'.Primary` (L19752), the theme
  primary;
- the four `cmp_PopUp_Confirmation*` instances (L303, L8088, L19864, L19884) and
  `cmp_Costs_PopUpLoading` (L18206) pass no colour properties.

### 2.12 State colours

| State | Canvas source | Colour |
|---|---|---|
| Field error text, red `*` | `gblAppColors.Error` (§2.9) | akzent5 #d20532 |
| Month-box error text | `palette.Error` (§2.9) | #B22727 |
| Warning | `gblAppColors.Warning` (hidden on this screen); `con_Warning_OnEditFromPCF` Fill | #EE940C; akzent4 #f5911e at 50 % |
| Paid / unpaid month | PCF CSS only (§2.5) | #D6E7B3 family / #E7E7E7, #DCDCDC |
| Approval state (Draft / Approving / Approved / Rejected) | `gblTableApprovalStateColors` → header bar | akzent2 #41aab4 / akzent4 #f5911e / akzent3 #82a51e / akzent5 #d20532 |
| Draft or locked rows in the grid | The canvas sets no colour for these. The PCF has no Draft styling in its CSS, and locking is behavioural (see `07-FUNCTIONAL-SCREEN-AND-GRID.md`) | — |
| Red comment marker | PCF CSS `.pcf-*-dot` (§2.5) | #E23636 |
| Disabled controls | `gblAppStyles.Label.DisabledColor` / `ButtonTransparent.DisabledColor`; PowerCAT `IconColor` black when disabled | Grayscale10 #6C6C6C; #0b0b0b |

### 2.13 The standard-assumption blue italic pairs (CONVENTIONS rule 20)

**The panel has 11 live pairs.** The condition is always `locSelectedCostRow.IsStandardContract`.
`FontColor` has **no else branch**, so it is Blank when false and the control falls back to its
own default text colour.

| # | Control | `FontColor` line | `FontItalic` line |
|---|---|---|---|
| 1 | `txt_AddContract_RightPanel_Description_1` | L10475 | L10476 |
| 2 | `rad_AddContract_RightPanel_DistributionBy_1` | L10865 | L10866 |
| 3 | `txt_AddContract_RightPanel_TotalCost_1` | L10981 | L10982 |
| 4-8 | `chk_AddContract_RightPanel_SelectCluster1_1` … `5_1` | L11111, L11163, L11212, L11261, L11310 | L11112, L11164, L11213, L11262, L11311 |
| 9 | `rad_AddContract_RightPanel_CostPaidBy_1` | L12255 | L12256 |
| 10 | `tgl_AddContract_RightPanel_ApplyVAT_1` | L12334 | L12335 |
| 11 | `tgl_AddContract_RightPanel_Depreciation_1` | L12394 | L12395 |

The formula is `FontColor: =If(locSelectedCostRow.IsStandardContract,ColorValue(gblAppTheme.palette.themePrimary))`
with `FontItalic: =locSelectedCostRow.IsStandardContract`.

The pair has **no** `FontColor` on `rad_…_DistributionType_1`, `rad_…_DistributionScheme_1`,
`drp_…_Link_to_Cluster`, `drp_…_PaymentFrequency_1`, `txt_…_StartDate_1`, `txt_…_EndDate_1`,
`txt_…_AverageAmountPerPayment_1` or the month boxes. Those controls never turn blue.

**When the flag clears, the styling clears.** Every one of these live handlers runs
`UpdateContext({locSelectedCostRow: Patch(locSelectedCostRow, {IsStandardContract: false})})`
behind `If(locStandardContractChanged && locSelectedCostRow.IsStandardContract, …)`:

| Control | Handler | Line |
|---|---|---|
| Description | `OnChange` | L10492 |
| Distribution By | `OnChange` | L10895 |
| Total Cost | `OnChange` | L10994 |
| Cluster 1-5 checkboxes | `OnSelect` | L11134, L11185, L11234, L11283, L11332 |
| Link to Cluster | `OnChange` | L11489 |
| Payment Frequency | `OnChange` | L11866 |
| Cost Paid By | `OnChange` | L12274 |
| Apply VAT | `OnSelect` | L12350 |
| Depreciation | `OnSelect` | L12410 |

None of these lines sits inside a `/* */` block; this was checked by bracket count.

**The grid.** Only the PCF CSS styles standard rows: blue, no italic (§2.5, L922-938). The
14 blue-only labels of the old gallery (§2.6) are not live.

---

## 3. Code app implementation

### 3.1 Theme tokens

**Palette.** `ProjectCosts-CodeApp/src/theme/tokens.ts:12-55` (`palette`) holds all 42
`AppTheme.palette` keys, with identical names and hex values (checked key by key).

**There is no `gblAppStyles` or `gblAppColors` layer.**
- No alias such as `appColors.Error = palette.akzent5` exists. Each call site picks a raw
  palette key, or writes a hex directly in CSS.
- Code that needs the canvas's semantic "Error" must know that it is `akzent5`.
  `canvas.css:153-158` and `:279-280` get this right, as #d20532.
- `CanvasFields.tsx:43` (`hint`) and `headerRules.ts:16` use `palette.Error` (#B22727) instead.

**`gblAppThemeJson`.** It is gone. `tokens.ts:8-10` says so: there are no PowerCAT controls,
and the values feed Fluent through `vsbTheme`.

**Fluent theme** — `src/theme/fluent.ts:21-60`:
- `vsbBrand` maps the canvas blues onto the 16-slot ramp, with slot 80 = themePrimary #006eb9.
  Slots 10, 20, 30, 50, 130 and 150 are invented interpolations.
- `vsbTheme` overrides:
  - `colorNeutralForeground1` = neutralPrimary #000000;
  - `colorNeutralForeground2` = #373737 and `colorNeutralForeground3` = #595959;
  - `colorNeutralBackground1` / `2` / `3` = #ffffff / Grayscale40 / Grayscale30;
  - `colorNeutralStroke1` = Grayscale20 #E3E3E3 and `colorNeutralStroke2` = neutralLight #edebe9;
  - `colorPaletteRedForeground1` = palette.Error #B22727;
  - `colorPaletteGreenForeground1` = palette.Success #3C9856;
  - `colorPaletteDarkOrangeForeground1` = palette.Warning.
- Any Fluent control that uses brand colours (Switch, Checkbox, Radio accent, primary Button,
  focus) therefore shows #006eb9.

**Brand outline button** — `src/theme/buttonStyles.ts:15-23`: themePrimary text and four border
longhands. The CAPEX panel's Cancel does not use it; it uses `CanvasFields.tsx` `cancel` (§3.5).

### 3.2 The shared standard-value style

`src/components/standardValue.ts:30-69` exports `useStandardValueStyles` and
`useStandardValueClass`, with three variants:
- `standard` — themePrimary + italic;
- `blue`;
- `italic`.

The style reaches nested `input`, `textarea`, `button` and `td`.

Pinned by `components/standardValue.test.tsx`: UT-STDVAL-001 (no class while false),
UT-STDVAL-002 (CostField styles the input, not the caption) and UT-STDVAL-003 (Fluent roots).

Which primitives can carry it (`src/components/CanvasFields.tsx`):

| Primitive | `standard` prop | Lines |
|---|---|---|
| `CostField` | yes, on its `<input>` | :129-139 |
| `CostSelect` | yes, on the Dropdown | :156-163 |
| `Choices` (radio groups) | **no** | :178-202 |

### 3.3 Stylesheets

All plain CSS under `src/` (found by glob):
- `styles/global.css`;
- `styles/canvas.css`;
- `features/cost/capex-costs/pcf/css/TableConnectedToDataversePCF.css`;
- `features/cost/add-costs-from-table/spreadsheet/MySpreadsheet.css` (not this screen).

**PCF stylesheet — byte-identical.** `src/features/cost/capex-costs/pcf/css/TableConnectedToDataversePCF.css`
has the same SHA-256 as the Git clone, the extracted solution control and the msapp resource
copy (§2.5).
- `src/styles/pcfCascade.test.ts:41-53` pins it ("is identical to the vendor control's
  stylesheet"); this test has no UT id.
- The host compensates for what the control assumed Power Apps would provide, in
  `canvas.css:214-247`:
  - `line-height: normal` on `.canvas-pcf-host` and the body-level menus;
  - `font-family: 'Segoe UI'` on `.pcf-dropdown`.
- Both are pinned by `pcfCascade.test.ts:73`, `:87`.
- So every PCF colour in §2.5 renders unchanged. The standard flag reaches it through
  `features/cost/capex-costs/gridRows.ts:209` (`IsStandardContract: line.standard`) →
  `pcf/ui/GridRenderer.js:730` (`pcf-row-standard`) and `:764` (`pcf-contract-standard`).

**`styles/global.css`:**
- `body { background-color: #faf9f8 }` (L30), which is neutralLighterAlt as a literal;
- the font stack (L40), covered in `04-TYPOGRAPHY.md`.

**`styles/canvas.css`** holds the shell, tab, toolbar, summary, panel and field skins. Its values
are mostly screenshot-sampled literals (§3.4).

### 3.4 Region by region in the code app

| Region | Code | Colours |
|---|---|---|
| Shell background | `canvas.css:3` `.canvas-shell { background: #ebebeb }`; `main` white with `border: 1px solid #dedede` (`:40`) | #ebebeb (canvas Screen.Fill is #F1F1F1) |
| Header | `AppHeader.tsx:36-44` `backgroundColor: tokens.colorNeutralBackground1` (always white) with a bottom border `colorNeutralStroke2`; approval bar `AppHeader.tsx:138-145` akzent2/4/3/5, else white; user pill themePrimary / white, hover themeDarkAlt (`:90-111`); `canvas.css:9-38` | no environment tint |
| Left nav | `LeftNav.tsx:100-115` (hover hoverButton; selected Grayscale30 with a themePrimary left border); `canvas.css:50-67` (rail white with shadow; icons #006eb9; divider #0f6cbd; selected `#edebe9`) | — |
| Tabs | `canvas.css:177-185`: idle #424242, selected #242424 600, indicator `#0f6cbd` 3 px, strip border #f1f1f1 | hard-coded |
| Toolbar | `canvas.css:190-205`: buttons `#006eb9` 600 (Add Cost from Table, year arrows); dropdown triggers #242424; switch labels #242424; `Screen.tsx:711-742` | Switch on-colour = vsb brand #006eb9 |
| Grid | `PcfGrid.tsx` hosts the vendored renderer; `.canvas-pcf-host` (`canvas.css:212`) | §2.5, identical |
| Summary tab | `Screen.tsx:693-707`, `canvas.css:206-211`: td bg `#fcfefe`, `border-bottom: 1px solid #eee`, last td `border-right: 1px solid #eee`, last row `border: 1px solid #ddd`, text #242424 600 | differs from §2.7 |
| Footer | `canvas.css:46` `.canvas-shell footer { background: #fff }` | — |
| Panel chrome | `FormPanel.tsx:112-134` (Fluent `Drawer type="overlay"`, no custom backdrop); `canvas.css:107-135`: header `#006eb9`, white title and ✕, ✕ hover `rgba(255,255,255,0.2)`, footer `border-top: 1px solid #f0f0f0` | backdrop is Fluent's default **(inferred)** |
| Panel fields | `canvas.css:136-175`: Fluent inputs and `.canvas-field` inputs `#f4f4f4` with no border; caption 600 #242424; `*` and `.canvas-field-error` `#d20532` (`:157-158`, `:280`); invalid outline #d20532 (`:281-282`); focus outline `#0078d4` (`:161`); disabled inputs keep #f4f4f4 / #242424 (`:169`); radio `accent-color: #006eb9` (`:175`); `choicesDisabled` uses `tokens.colorNeutralForegroundDisabled` (`CanvasFields.tsx:91-95`) | — |
| Panel buttons | `CanvasFields.tsx`: Save is Fluent primary (brand #006eb9) (`:264-266`); Cancel white / themePrimary / border themePrimary, hover hoverButton (`:61-73`); Recalculate is Fluent primary, radius 5 (`:78-83`) | — |
| Panel year column | `Screen.tsx:109-117`: `borderLeftColor: tokens.colorNeutralStroke2` (#edebe9); year row transparent, `:hover` `palette.Grayscale40` (`:125-133`); chevron `palette.themePrimary` (`:139-142`); month error `.canvas-field-error` (`Screen.tsx:941`) | — |
| Standard styling in the panel | `Screen.tsx:161` `useStandardValueClass()`, applied **only** to the five cluster checkbox labels (`Screen.tsx:842`) | §3.6 |
| Comments panel | `CommentsPanel.tsx:50-206`: filters `#f3f3f3`; separator `#e7e7e7`; captions `#595959`; values `#000000`; draft card dotted 1 px `#7d7d7d`, radius 8; warning `#e1ecf4`; resolved pill `#e7e7e7` with a 2 px `#6a7a7f` border, radius 20; action icons and Add `tokens.colorBrandForeground1` (#006eb9); header through FormPanel (§ panel chrome) | — |
| Pop-ups | `ConfirmDialog.tsx`: backdrop rgba(0,0,0,0.10) (:52), header themePrimary (:90), description #323130 (:150), info band `#E1ECF4` (:167), footer divider `#edebe9` (:185), confirm themePrimary / hover hoverButton (:222-226), destructive palette.Error (:230-233). `LoadingOverlay.tsx:37-71`: scrim rgba(0,0,0,0.10), card white, label palette.black. Details in `06-POPUPS.md` | — |
| Write errors | `Screen.tsx:1050-1056` → `canvas.css:275` `.canvas-error { color: #a4262c }` | not a palette value |

### 3.5 Hard-coded values that should come from tokens

**Plain CSS cannot import `tokens.ts`,** and no CSS custom-property bridge exists (there is no
`--vsb-*` variable anywhere in `src/styles`). So every palette value in `canvas.css` and
`global.css` is a second copy:

| Literal | Equal to | Where |
|---|---|---|
| `#006eb9` | `palette.themePrimary` | `canvas.css:15, 57, 63, 64, 74, 108, 175, 185 (tab uses #0f6cbd), 193, 262, 311, 316, 354, 420` |
| `#d20532` | `palette.akzent5` | `canvas.css:158, 280, 282` |
| `#B22727` | `palette.Error` | `canvas.css:453` |
| `#e3e3e3` | `palette.Grayscale20` | `canvas.css:309, 412, 425` |
| `#edebe9` | `palette.neutralLight` | `canvas.css:64`, `ConfirmDialog.tsx:185` |
| `#f1f1f1` | `palette.Grayscale30` | `canvas.css:177` |
| `#faf9f8` | `palette.neutralLighterAlt` | `global.css:30` |
| `#0b0b0b` | `palette.black` | `canvas.css:33` |
| `#cce2f1` | `palette.hoverButton` | `canvas.css:73` |
| `#f3f2f1` | `palette.neutralLighter` | `canvas.css:90` |
| `#469bd7` | `palette.akzent1` | `canvas.css:410` |
| `#ee940c` | `palette.Warning` | `canvas.css:435` |
| `#6c6c6c` | `palette.Grayscale10` | `canvas.css:436` |
| `#595959` | `palette.neutralTertiary` | `CommentsPanel.tsx:93, 106, 196` |
| `#000000` | `palette.neutralPrimary` | `CommentsPanel.tsx:109` |

These are TSX literals, so they could use `palette` today.

Canvas-literal colours that have no palette key:
- `CommentsPanel.tsx`: `#f3f3f3`, `#e7e7e7`, `#7d7d7d`, `#e1ecf4`, `#6a7a7f`;
- `ConfirmDialog.tsx`: `#E1ECF4`.

Each one cites its `RGBA(...)` source, which is acceptable under rule 6. A shared
"canvas literal" token would stop them drifting apart: #e1ecf4 already appears twice.

Code-app-only literals with no canvas source:
- `#ebebeb`, `#dedede`, `#f4f4f4`, `#242424`, `#424242`, `#fcfefe`, `#eee`, `#ddd`, `#0078d4`
  and `#a4262c` (`canvas.css`);
- `rgba(0,0,0,0.10)` (`ConfirmDialog.tsx:52`, `LoadingOverlay.tsx:37`).

D36 in `02-OPEN-DECISIONS.md` (L1963-1970) already lists hard-coded colours for other screens.
The CAPEX files are not in that list.

### 3.6 The standard-assumption pairs in the code app

| Canvas pair (§2.13) | Code app | Status |
|---|---|---|
| Cluster 1-5 checkboxes | `Screen.tsx:842` `label={<span className={standardClass(edit.standard)}>…}` | Covered |
| Description | `Screen.tsx:773-776` `CostField` with **no** `standard` prop | Missing |
| Total Costs (two branches) | `Screen.tsx:808-811`, `:825-828` `CostField`, no `standard` | Missing |
| Distribution By | `Screen.tsx:819-823` `Choices`, which has no `standard` prop (`CanvasFields.tsx:178`) | Missing |
| Cost Paid By | `Screen.tsx:887-889` `Choices`, no prop | Missing |
| Apply VAT / Depreciation | `Screen.tsx:891-897` Fluent `Switch`, no class | Missing |
| PCF standard rows (blue, no italic) | `gridRows.ts:209` → vendored CSS L922-938 | Covered |

**Clearing the flag.** `Screen.tsx:316-319` `clearStandardFlag` runs only from the Description
`onChange` (`:776`) and the cluster checkbox `onChange` (`:846`).
- The canvas clears it from 12 handlers (§2.13).
- In the code app, editing Total Costs, Distribution By, Link to Milestone, Frequency, Cost
  Paid By, VAT or Depreciation leaves `edit.standard` true. The cluster labels stay blue italic
  as a result.
- The write consequence (`vsb_isstandardcontract` stays Yes) belongs to
  `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`.

**Tests.** Nothing in `features/cost/capex-costs/*.test.*` pins the panel's standard styling.
`Screen.test.tsx` has no standard-style assertion; every fixture has `standard: false`.

---

## 4. Gaps: Code app vs Canvas

| ID | Area | Canvas behaviour (cite) | Code app behaviour (cite) | Type | Status | Severity | Notes |
|---|---|---|---|---|---|---|---|
| GAP-TH-00 | Covered (group) | 1. `AppTheme.palette`, 42 keys (`App.pa.yaml:L13-58`)<br>2. PCF stylesheet: paid, unpaid, standard, comment dot, grand total and the rest (§2.5)<br>3. Panel header themePrimary with white title and ✕ (L10290-10326)<br>4. Panel and comments Cancel: PowerCAT white, themePrimary text and border, hoverButton hover (L18159-18166, L10228-10232)<br>5. Red `*` and field errors in akzent5 (`gblAppColors.Error`, §2.9)<br>6. Approval-state colours (`gblTableApprovalStateColors`, `App.pa.yaml:L205`)<br>7. Add Cost from Table and the year arrows in themePrimary (L2564, L2951, L3003)<br>8. Year chevron in themePrimary (L12693)<br>9. Comments: filter block #f3f3f3, separators #e7e7e7, captions #595959, values #000, dotted #7d7d7d radius 8 drafts, #e1ecf4 warning, resolved pill<br>10. Radio accent themePrimary (`BasePaletteColor` L10595…)<br>11. The old hidden grid's styling is correctly **not** ported (§2.6) | 1. `tokens.ts:12-55`<br>2. byte-identical vendored CSS + `pcfCascade.test.ts:41`<br>3. `canvas.css:108-120`<br>4. `CanvasFields.tsx:61-73`<br>5. `canvas.css:157-158`, `:280`<br>6. `AppHeader.tsx:138-145`<br>7. `canvas.css:193`<br>8. `Screen.tsx:139-142`<br>9. `CommentsPanel.tsx:61-190`<br>10. `canvas.css:175` | UI | Covered | — | `pcfCascade.test.ts` and `AppHeader.test.tsx` pin parts of this; the panel and comments colours have no test |
| GAP-TH-01 | Standard blue italic, Add/Edit panel | 11 live `FontColor`/`FontItalic` pairs: Description, Distribution By, Total Costs, Cluster 1-5, Cost Paid By, Apply VAT, Depreciation (L10475 … L12395, §2.13) | Only the 5 cluster labels are styled (`Screen.tsx:842`). Description, Total Costs, Distribution By, Cost Paid By, VAT and Depreciation render in normal colour (`Screen.tsx:773-897`) | UI | Partial | High | CONVENTIONS rule 20 (PO, 20 Oct 2026). The gap report (U13) marks this COVERED — see §6. No test |
| GAP-TH-02 | Standard flag clearing | `IsStandardContract: false` patched from 12 live handlers (L10492, L10895, L10994, L11134-L11332, L11489, L11866, L12274, L12350, L12410) | `clearStandardFlag` only from Description and the clusters (`Screen.tsx:316-319, 776, 846`); styling stays after other edits | UX | Partial | Med | Write side in `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md`. Rule 20: "clears the styling exactly when the canvas clears the flag" |
| GAP-TH-03 | Shared primitive | Radio groups carry the pair (L10865-10866, L12255-12256) | `Choices` has no `standard` prop (`CanvasFields.tsx:178-188`), so no screen can style a radio group | UI | Missing | Med | Rule 17: add it to `components/`, not the screen |
| GAP-TH-04 | Semantic colour aliases | `gblAppStyles` / `gblAppColors` define Error = akzent5, Success = akzent3, Warning = #EE940C (`App.pa.yaml:L205`) | No alias layer. Fluent `colorPaletteRedForeground1` = palette.Error #B22727 and `colorPaletteGreenForeground1` = palette.Success #3C9856 (`fluent.ts:56-57`); `headerRules.ts:16-18` maps Dev/Hotfix to palette.Error and QA to palette.Success (canvas: akzent5 / akzent3) | UI | Divergent-unmarked | Med | The confusion source behind GAP-TH-05. Recommend `appColors` in `tokens.ts` |
| GAP-TH-05 | Month-box error colour | `ColorValue(gblAppTheme.palette.Error)` = #B22727 on the 12 `…FirstMonth_ErrorMessage_24…35` (L13322 …) | `.canvas-field-error` #d20532 (`Screen.tsx:941`, `canvas.css:280`) | UI | Divergent-unmarked | Low | Size and weight in GAP-TY-07 |
| GAP-TH-06 | "Edited from PCF" warning banner | `con_Warning_OnEditFromPCF`, akzent4 at 50 % fill with a warning image and bold "Warning:" HTML (L12426-12495), visible when `'Is Edited from PCF?' = Yes` and `'Initial Contract Source' = Powerapps` | Not rendered; no reference in `features/cost/capex-costs/` | UI | Missing | Med | Behaviour in `08-…`; `vsb_iseditedfrompcf` is selected only in `data/addCostSheet.ts:72` |
| GAP-TH-07 | Header environment tint | `con_cmp_Header.Fill` Switch: Hotfix #9831A850, Nightly #AAAAAA60, Budgeting #85AD3760, QA #E66C3780 (`cmp_Header.pa.yaml:L80-97`) | Header always `colorNeutralBackground1` (`AppHeader.tsx:40`) | UI | Missing | Low | Shell; `01-EDIT-COST-MODULE.md` owns the header |
| GAP-TH-08 | Theme-default modern controls | Toggles `tgl_…_ShowEmptyAccounts`/`…ShowPlannedPaid` (L2886-2904), panel checkboxes and VAT/Depreciation toggles set no `BasePaletteColor`, so they use PowerAppsTheme blue (`App.pa.yaml:L207`) **(inferred)** | Fluent Switch and Checkbox use vsb brand #006eb9 (`fluent.ts:29`) | UI | Divergent-unmarked | Low | Needs a live sample; the tab indicator is already hard-coded to #0f6cbd from a screenshot (`canvas.css:181-185`) |
| GAP-TH-09 | Summary tab skin | Rows #fdffff, radius 1, **no** row line (`shp_…_BottomLine` `Visible: =false`, L7831), 2 px Grayscale20 line under Total CAPEX (L8010-8024) | `#fcfefe`; 1 px `#eee` under every row; `#eee` right border; `#ddd` box on the last row (`canvas.css:206-211`) | UI | Divergent-unmarked | Low | The screenshot shows faint row lines (§5) |
| GAP-TH-10 | Panel column divider | `Rectangle1_1` Fill `gblAppColors.BorderColor` = Grayscale30 #F1F1F1, 1 px (L12496-12503) | `tokens.colorNeutralStroke2` = #edebe9 (`Screen.tsx:110-112`, `fluent.ts:54`) | UI | Divergent-unmarked | Low | |
| GAP-TH-11 | Year row skin | Header Fill #fdffff (L12605); hover `#E3E3E322` (L12675) | Transparent; hover `palette.Grayscale40` #FAFAFA (`Screen.tsx:129-132`) | UI | Partial | Low | Visually close |
| GAP-TH-12 | Disabled Average Amount box | `DisplayMode.Disabled` (L11931): modern disabled skin, white with an outline in `…Add Cost Panel.png` | `.canvas-field > input:disabled` keeps the #f4f4f4 fill (`canvas.css:169`) | UI | Divergent-unmarked | Low | OPEX already has a disabled skin (`canvas.css:458-466`) that CAPEX does not use |
| GAP-TH-13 | Panel scrim | `Fill: =RGBA(0,0,0,0.3)` on both panels (L10255, L8161) | Fluent `Drawer` default backdrop; FormPanel sets none (`FormPanel.tsx:112`) **(inferred value)** | UI | Partial | Low | |
| GAP-TH-14 | Screen background | `Fill: =gblAppStyles.Screen.Fill` = #F1F1F1 (L12) | `.canvas-shell` #ebebeb (`canvas.css:3`); body #faf9f8 (`global.css:30`) | UI | Divergent-unmarked | Low | `canvas.css:1` cites the screenshots as the baseline |
| GAP-TH-15 | Body text colour | `gblAppStyles.Label.Color` = palette.black #0b0b0b (classic labels) | `colorNeutralForeground1` = #000000 (`fluent.ts:47`); captions #242424 (`canvas.css:152`) | UI | Divergent-unmarked | Low | |
| GAP-TH-16 | Comments panel control skins | Sort-by dropdown FilledLighter with #aaaaaa border (L8349-8351); Type dropdown with black 1 px border (L9103-9107); Year/Month with black 0.05 border (L9216-9219, L9284-9287); comment boxes dotted #7d7d7d (L8899-8902, L9175-9178); `btn_Add_Comment` `ButtonAppearance.Secondary` (L8972) | Fluent defaults: Dropdown (`CommentsPanel.tsx:535`), Textarea (`:827`), transparent Add button (`:620`) | UI | Partial | Low | `09-COMMENTS-PANEL.md` owns behaviour |
| GAP-TH-17 | Focus colour | Modern inputs take `BasePaletteColor: =themePrimary` (L10474 …), so the focus accent is #006eb9 **(inferred)** | `.canvas-field` focus outline `#0078d4` (`canvas.css:161`) | UI | Divergent-unmarked | Low | |
| GAP-TH-18 | Hard-coded hexes | Canvas reads every palette colour through `gblAppTheme` | 15 palette values re-typed as literals in `canvas.css`, `global.css`, `CommentsPanel.tsx` and `ConfirmDialog.tsx` (§3.5); no CSS variable bridge | UI | Code-app-only | Low | D36 lists other screens only |
| GAP-TH-19 | Write-error colour | No inline error text on the screen (errors go through `Notify`, see 05/06) | `.canvas-error` `#a4262c` (`canvas.css:275`, `Screen.tsx:1050-1056`), not a palette colour | UI | Code-app-only | Low | |

---

## 5. Open questions and items not verifiable from source

1. **PowerAppsTheme hex.**
   - Which brand colour do modern controls with no `BasePaletteColor` render in under
     `Theme: =PowerAppsTheme`? These are the tab list, two toolbar toggles, the panel checkboxes
     and toggles, and the Save buttons.
   - The code app's own note samples #0f6cbd for the tab indicator (`canvas.css:181-182`).
   - This needs a pixel sample from a live canvas run (affects GAP-TH-08).
2. **Comment-only `Visible`.** §2.6 relies on `Visible: =//true` evaluating to Blank, hence
   hidden. The screenshots show only the PCF grid, which agrees, but no live check was made.
3. **Summary row lines.**
   - The YAML (solution 1.21.709) hides the per-row divider (L7831).
   - `Cost App Landing Screen - Devex Capex Screen.png` shows faint separators between summary
     rows.
   - Either the screenshot comes from a later solution (1.21.753), or the gallery draws a
     default template separator. To settle on a live run.
4. **Fluent Drawer backdrop.** Its exact alpha was not read from the Fluent source here; it was
   taken as Fluent's default overlay (GAP-TH-13).
5. **Disabled modern TextInput skin.** Its exact colours are only visible in the screenshot
   (GAP-TH-12).
6. **PowerCAT `IconColor` black when disabled.** It is set on both Cancel buttons (L10236,
   L18167). The code app's Cancel is never disabled on this screen, so this was not compared.

## 6. Doc disagreements

1. **`app-docs/gap-analysis/cost-capex-costs.md` U13** marks the standard-assumption styling
   "COVERED".
   - Its evidence is `useStandardValueClass(edit.standard)` "on the cluster labels".
   - The canvas carries the pair on 11 controls, and the code styles 5 of them (GAP-TH-01).
2. **`components/standardValue.ts:13-14`** gives "the CAPEX account labels" as an example of the
   canvas `"blue"` (colour-only) variant.
   - Those labels (`lbl__ProjectCostsInAccount_AccountName_2`, `lbl_Costs_label_139…150`, L4446 …
     L6166) are inside `gal_Costs_ProjectCosts`, whose `Visible: =//true` (L4323) hides them.
   - The live colour-only standard styling on CAPEX is the PCF stylesheet (L922-938).
3. **`theme/fluent.ts:6-8`** says "the four slots the canvas never defined (`10`, `20`, `30`)".
   - That is three slots, not four.
   - Slots `50`, `130` and `150` are also invented, at `:26`, `:34` and `:36`.
4. **`theme/tokens.ts:98-101`** says Open Sans "is … self-hosted in `src/styles/fonts.css`".
   - No `fonts.css` exists under `src/`.
   - `global.css:6-8` says to add an `@font-face` there instead. See `04-TYPOGRAPHY.md`.
5. **`app-docs/guide3-ui-notes-cost-app.md:76`** describes "green accent bar at the leftmost
   edge of the rail" on the selected DEVEX/CAPEX item.
   - In `Cost App Landing Screen - Devex Capex Screen - Expanded Account Rows.png`, the selected
     rail item has a **blue** left marker.
   - The green vertical bar is the header's approval-state rectangle (`rec_cmp_Header_Project_State`,
     approval colour).
   - This is a screenshot reading, not a source fact.
6. **`app-docs/02-OPEN-DECISIONS.md` D36 (L1963-1970)** lists hard-coded colours "per file".
   - It does not include `canvas.css`, `CommentsPanel.tsx` or `ConfirmDialog.tsx`, which carry
     the CAPEX literals in §3.5.
