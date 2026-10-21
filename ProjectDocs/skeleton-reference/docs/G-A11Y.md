# G-A11Y — canvas AccessibleLabel → code-app `aria-label` + `data-testid`

**Status:** gate live from 14 Oct 2026 (solution 1.21.753). `npm run gate:a11y` is part of
`npm run gates`; `npm run gate:a11y:strict` is part of `npm run gates:phase`.

## 1. What the canvas does, and what we carry over

Every canvas control that sets `AccessibleLabel` renders it as `aria-label` in the player DOM.
Screen readers announce it and Tosca identifies the control by it. The 1.21.753 source sets it on
**541 controls** (540 distinct screen × control pairs: `cmp_Header` ships in both apps):

| kind (`reference/canvas-accessible-labels.json`) | count | what the value is |
|---|---:|---|
| `control-name` | 489 | a canvas control name, put there for Tosca (`cmb_Supplier_3`, `Drp_…_Tenor_YY`, `Icon5`) |
| `text` | 38 | a human caption (`"Supplier"`, `"Reset to 10%."`) |
| `reference` | 12 | `=<label>.Text` — the caption of a sibling label |
| `formula` | 2 | a computed value — the caption is owed by the code app |

The App Checker additionally flags 81 PM and 34 Cost controls with `acc-AccessibleLabelNeeded`
(no `AccessibleLabel` at all, e.g. every control in `cmp_NestedCountryPickerColumn`). Those
have no canvas identity to carry; the code app names them through Fluent labels.

### The decision (14 Oct 2026)

The code-app control renders

- **`aria-label` = the human caption** — the accessible name the control shows, and
- **`data-testid` = the control's own canvas name** — unique per screen, unlike the
  AccessibleLabel values, which copied controls share: 37 values appear on more than one
  control (`cmb_Supplier`, `cmb_Supplier_3` and `cmb_Supplier_6` all carry `"cmb_Supplier"`).

A screen reader therefore announces "Supplier", never "cmb_Supplier_3", and Tosca gets a stable,
canvas-traceable attribute.

> **This differs from `ProjectCosts-CodeApp/app/`**, which since the reversal recorded in
> `migration-plans/09-tosca-automation-conventions.md` puts the canvas name on `aria-label`
> *and* `data-testid`, so Tosca modules recorded against the canvas keep matching on
> `AriaLabel`. The skeleton keeps the accessible caption. Consequence for Tosca: modules for
> the skeleton identify by **`data-testid`** (add it as an identification property in XScan),
> not by `AriaLabel`. Both apps carry the same canvas name on `data-testid`, so a module keyed on
> `data-testid` works against either.

## 2. The pieces

| file | role |
|---|---|
| `scripts/extract-accessible-labels.mjs` (`npm run a11y:extract`) | reads `Existing Solution/VSBCloud_1.21.753/msapp/{projectmanagement,projectcosts}/Src/**/*.pa.yaml` and the App Checker SARIF; writes the corpus and the typed module. **That source is not shipped** — see "Regenerating" below |
| `reference/canvas-accessible-labels.json` | the corpus: one entry per control — screen, control, type, raw AccessibleLabel, kind, testId, caption, captionSource |
| `src/a11y/canvasA11y.generated.ts` | `[testId, caption]` per screen × control, `as const` — never hand-edit |
| `src/a11y/index.ts` | `canvasA11y(screen, control, caption?)` and `a11yFor(screen)` |
| `scripts/check-a11y.mjs` (`npm run gate:a11y`) | the gate |
| `reference/a11y-baseline.json` | owed wiring, each entry with `owner` + `reason` |
| `src/a11y/a11y.test.tsx` | UT-A11Y-001..006 — the helper and the shared components render the pair |

**Regenerating.** The package carries the corpus and the generated module, not the canvas
source. To regenerate (a new solution version), extract the two `.msapp` files from the solution
zip into `Existing Solution/VSBCloud_1.21.753/msapp/projectmanagement/` and `…/projectcosts/`
(a `.msapp` is a zip; `pac canvas unpack` gives the same `Src/`) and run `npm run a11y:extract`.
Without the source the extractor exits 2 and writes nothing, and the gate's source check reports
*skipped* — the committed corpus is still enforced. Steps:
`../../migration-plans/10-solution-1.21.753-gap-register.md`, "Reproducing the analysis".

**Captions.** For a `control-name` value the extractor derives a caption: the control's own
`Text`/`Label` literal → the best-matching label sibling (name affinity) → grandparent level →
a screen-wide strong name match → the placeholder → the humanised control name. The
`captionSource` field says which. An AccessibleLabel equal to *any* control name on the screen
counts as a control name (`Icon5`, `Drp_SeniorDebtData_Tenor_YY`, `date_Checklist_…`).

### Usage

```tsx
import { a11yFor } from "@/a11y";
/** G-A11Y — this screen's canvas accessibility identities. */
const a11y = a11yFor("Project Generators Screen");          // module level, one per file

<Dropdown {...a11y("cmb_Supplier_3", REPLACE_LABELS.supplier)} … />
<NumericInput label={L.count} a11y={a11y("txt_…_NumberOfGenerator", L.count)} … />
{ key: "apply", label: "Apply", a11y: a11y("btn_Admin_Cost_Landlease_ApplyToLandlease", "Apply"), … }  // CommandBar
<FormPanel closeA11y={a11y("ico_…_BodyHeaderCancel", "Close")} saveA11y={…} cancelA11y={…} … />
<RecordFooter saveA11y={…} cancelA11y={…} … />
<StatTiles stats={[{ label, value, a11y: a11y("txt_Production_…_GrossYield", label) }]} />
```

`NumericInput`, `PercentageInput`, `CurrencyInput` and `TextFieldWithCount` take `a11y`;
`CommandBar` commands, `FormPanel`, `RecordFooter` and `StatTiles` take the props above. The
control argument is typed from the generated module, so an invented name fails `tsc`.

**The caption rule.** Pass the accessible name the control has *today* — its visible label
constant — whenever it differs from the corpus caption, even only in case. That keeps the
accessible name equal to the visible label (WCAG 2.5.3 *Label in Name*) and keeps every
`getByRole(…, { name })` test passing. Omit the caption only when the corpus caption is the
right human text. A choice by state is allowed when both names are literals:
`{...a11y(isFolded ? "ico_…_Down" : "ico_…_Up", typeLabel)}` (the gate counts every literal
control name in a bound file).

## 3. The gate

Five checks (`scripts/check-a11y.mjs` header has the detail):

1. **corpus-stale** — the corpus no longer matches the canvas source (re-extracted in memory).
2. **module-stale** — the generated module disagrees with the corpus.
3. **control-name-label** — an `aria-label="txt_…"` literal: a canvas name on `aria-label`.
4. **unknown-control** — an `a11y("…")` naming a control the screen's corpus lacks.
5. **unwired** — a corpus control with no reference. Fails only when not baselined; a baseline
   entry that is now wired (or gone) fails as stale, so the list cannot rot.

`--strict` fails baselined entries too (phase exit). `--update-baseline` rewrites the list,
keeping each surviving entry's owner and reason — never to turn a red build green.

### CI

`.github/workflows/ci.yml` is not touched by this change. `npm run gates` already runs the gate;
if the workflow lists gates individually, add:

```yaml
      - name: G-A11Y — canvas accessibility identities
        run: npm run gate:a11y
```

## 4. Coverage at 1.21.753

| screen | controls | wired | owed |
|---|---:|---:|---:|
| Project Finance | 137 | 70 | 67 |
| Project Generators | 111 | 52 | 59 |
| Project Revenues | 57 | 37 | 20 |
| Project General Data | 47 | 38 | 9 |
| Project Production | 40 | 31 | 9 |
| Capex Costs | 32 | 17 | 15 |
| Project General Milestones | 29 | 22 | 7 |
| Project Planning | 24 | 21 | 3 |
| Project General CheckList | 13 | 5 | 8 |
| Grid Operator | 12 | 11 | 1 |
| Project General Team | 5 | 2 | 3 |
| Project Main | 4 | 1 | 3 |
| Admin Cost / Opex Costs / Land Lease Costs | 4 / 3 / 3 | 4 / 3 / 3 | 0 |
| Admin Gates Approvals / Milestones / Default Checklists | 2 / 1 / 1 | 1 / 0 / 0 | 1 / 1 / 1 |
| App Loading | 1 | 0 | 1 |
| components (`cmp_*`) | 14 | 2 | 12 |
| **total** | **540** | **320** | **220** |

What the 220 owed entries are, by reason (each entry in the baseline names its own):

- **No element by design** — hidden dispatch buttons (`Visible: false`: the five panel Reset
  buttons, the deep-link `…Header_Redirect_*`, Project Main's Apply), decorative separators,
  lock glyphs and non-folding chevrons.
- **Not rendered in the compact code-app view** — the PV / inverter / substructure / storage card
  detail grids on Generators, the senior-debt card detail fields on Finance, Production's row
  detail fields, Revenues' grid detail fields.
- **Not implemented yet** — storage / hydrogen / substation panel fields, Capex's month-edit
  panel and "Show Selected Year", Finance's VAT base rate, energy yield / spot curve, fixed
  amount, repayment frequency and DSRF-only fields, `cmp_Project_States` (no stepper).
- **Shared-component hook missing** — `DataGrid` has no per-row attribute hook for its
  selection radio (Team, Planning row-selection dots).

## 5. Canvas defects found while wiring (corrected through the caption argument)

The canvas copied AccessibleLabels between controls in many places. The wiring uses the visible
label instead, and the testid stays the true control name:

- Generators — hydrogen card capacity reads "Generators Capacity [MW]", substation's "Total
  Module Type Capacity [MWp]".
- Capex Costs — `btn_Costs_ProjectCostbtn_ShowNextYear` carries the *Previous Year* text.
- Finance — gearing radio "This is Eror Message"; VAT amount "Other Bank"; five panel close
  icons labelled "Edit Equity", "Add Tranche", "Cancel", "Edit DSRF/DSRA", "Icon5"; the
  decommissioning total "Commitment Fee [%]"; `txt_SeniorDebtData_SwapRate` / `_SwapMargin` /
  `_BankMargin` write each other's columns (wired by the column each saves).
- Revenues — contract tariff "Bidding Price", tariff p90 "Site Quality p90", custom inflation
  "Area"; milestones' date pickers "Cluster1"–"Cluster6".
- Production — `rad_ProductionDataPV_Allocation` is the irradiation / gross-yield choice;
  `txt_ProductionDetails_WindSpeed` reads "Net Yield p50 [MWh]".
- General Data — the shareholder entity dropdown reads "hareholder Entity".
- Planning / Production — "Requered", "[km]" vs the code app's "(km)".

### Extractor defects fixed on 14 Oct 2026

- A control named with brackets, `txt_Revenue_BalancingPrice[EUR/MWh]`, did not open its own
  node, so its AccessibleLabel was filed under the label above it
  (`lbl_ProjectRevenues_…_BiddingPrice_2`). Brackets and `/` are now legal in names.
- AccessibleLabels equal to a control's own name but outside the known prefixes (`Icon5`,
  `Drp_…`, `icon_…`, `ibut_…`, `info_…`, `date_…`) were treated as captions. They are control
  names now and get derived captions; UT-A11Y-003 pins that no generated caption is a name.

## 6. Known limits

- A read-only value box is a `<span>`: `aria-label` on a generic element is not announced by
  screen readers. Tosca still finds it by `data-testid`; turning those boxes into read-only
  inputs is a UI decision, not this gate's.
- Repeating rows share a testid, exactly as canvas gallery templates share a control name. Tosca
  selects the row by index or by the row's own content.
- The cost app's `cmp_PopUp_Loading_1` has no separate element: the one `LoadingOverlay` carries
  `cmp_PopUp_Loading.spi_PopUpLoading_Spinner`.
