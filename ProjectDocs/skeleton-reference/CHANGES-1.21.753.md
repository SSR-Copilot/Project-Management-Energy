# What changed for solution 1.21.753 (14 Oct 2026)

Input: `Project-Management-Energy-WorkDev1.zip` (this skeleton at 1.21.709 parity) and
`VSBCloud_managed (2).zip` (solution **1.21.753**). Output: this skeleton brought to 1.21.753,
the canvas accessibility identities carried over, and the reusable `cmp_NestedCountryPickerColumn`.
The deltas and their dispositions are in
`../migration-plans/10-solution-1.21.753-gap-register.md`; this file is the change log.

`ProjectCosts-CodeApp/` is untouched (564 of 564 files byte-identical to the input). What it
would need is in `../ProjectCosts-CodeApp/docs/1.21.753-REQUIRED-CHANGES.md`.

## Verified state

| | input | this package |
|---|---|---|
| `tsc --noEmit` (G-TYPE) | clean | clean |
| `eslint` (G-LINT) | clean | clean |
| `vitest run` (G-UNIT) | 1,727 in 41 files | **1,784 in 44 files** |
| `vite build` (G-BUILD) | clean | clean |
| G-IDS | 0 findings, 1,270 ids | 0 findings, 1,324 ids |
| G-MATRIX | 85 tables | **86 tables**, consistent |
| G-OWN | 0 new, 21/38 creates write the BU | 0 new, **25/42** (every new create writes it; 16 baselined, unchanged) |
| G-LABEL | 0 new | 0 new (67 baselined, unchanged) |
| **G-A11Y** | — | **new** — 0 new, 320 wired, 220 baselined |
| `scripts/scenario.mjs` | 31 steps, 0 problems | 31 steps, 0 problems |
| rendered DOM audit (15 routes) | — | 175 canvas `data-testid`s on first paint; 0 `aria-label`s that are a canvas name |

`npm run gates` exits 0. `npm run gates:phase` still exits 1 on purpose (strict baselines).

## 1. Solution 1.21.753 ported

- **Project Main** — Simulate gate moved into `OnSelect` (technology, cluster order, a Base case);
  `Base cases` (`vsb_basecases`) added to `entities.ts`, `repos.ts` and `matrix.json`
  (organization-owned, `connected`, read-only — a **matrix change**: +1 table, +17 read grants,
  2,031 → 2,048). Captions, report viewers and the keyword fields corrected to the canvas.
- **General Data** — Project Name and Short Name editable at every cluster.
- **Revenues / Milestones** — Italian price zones `Italy_Centre-South` / `Italy_Centre-North`,
  prefix slicing of Italian assumptions, per-zone price pools; SOURCE DEFECT 1.21.753-1 kept in a
  `…CanvasParity` twin.
- **Generators** — Replace Generator Type / Replace PV Module Type (rules, hooks, two panels,
  mock-backend test), O&M dependency guard, allocation clean-up on delete, PV bridge + unit +
  AllWTG backfill on create; SOURCE DEFECT 1.21.753-2 not reproduced.
- **Capex Costs** — `% Values` round down, remainder to the latest positive month, percent mode on
  open only with a non-zero total.
- **Mock backend** — `<Nav>@odata.bind` mirrored to `_<nav>_value` on POST/PATCH.

## 2. `cmp_NestedCountryPickerColumn`

`src/components/cmp_NestedCountryPickerColumn.tsx` (composition), `.model.ts` (pure behaviour),
`.test.tsx` (UT-NCP-001..015). Inputs `countries`, `nestings`; event `onSelect`; outputs
`selectedCountry`, `selectedNestedValue` (first child by default, as a canvas gallery's
`Selected` is). A WAI-ARIA tree (`tree` / `treeitem`, `aria-expanded`, `aria-selected`), testids
from the canvas names (`gal_Countries-<key>`, `Button2-<key>`, `gal_CountryNestedChilds-<key>-<value>`).
Used by Admin Contract, Admin Cost and Admin Project Gates Approvals. The React identifier is
`NestedCountryPickerColumn` (JSX treats a lower-case tag as an HTML element); the canvas spelling
is exported as an alias.

## 3. G-A11Y — canvas AccessibleLabels

New: `scripts/extract-accessible-labels.mjs`, `scripts/check-a11y.mjs`,
`reference/canvas-accessible-labels.json`, `reference/a11y-baseline.json`, `src/a11y/`,
`docs/G-A11Y.md`; npm scripts `a11y:extract`, `gate:a11y` (in `gates`), `gate:a11y:strict`
(in `gates:phase`). `aria-label` = caption, `data-testid` = canvas name — the opposite of
ProjectCosts-CodeApp's convention for `aria-label`; see `docs/G-A11Y.md` §1.

Shared components gained optional identity props, all additive: `NumericInput` /
`PercentageInput` / `CurrencyInput` / `TextFieldWithCount` (`a11y`, `testId`), `CommandBar`
(`Command.a11y`), `FormPanel` (`closeA11y`, `saveA11y`, `cancelA11y`), `RecordFooter`
(`saveA11y`, `cancelA11y`), `StatTiles` (`Stat.a11y`); `LoadingOverlay` and `ReportErrorPanel`
carry their component identities.

Wired across 16 screens and 2 components (320 of 540 distinct controls). `.github/workflows/ci.yml` is not touched; `npm run
gates` runs the gate, and `docs/G-A11Y.md` has the step to add if the workflow lists gates
one by one.

## 4. Smaller fixes

- **Finance** — the DSRA/DSRF card's own Activate / Deactivate (`dsraCardToggle`, UT-FIN-105);
  without it `toggleDsraStatus` was unreachable.
- **Label corpus** — `reference/canvas-labels.json` rebuilt from the 1.21.753 source;
  `scripts/extract-canvas-labels.mjs` now defaults to
  `Existing Solution/VSBCloud_1.21.753/msapp/*/Src` and writes workspace-relative paths.
- **Canvas source not shipped** — the unpacked 1.21.753 `.pa.yaml` is not in the package (by
  request). Both extractors now refuse to run, and write nothing, when the source is absent, so
  the committed corpora cannot be overwritten by a partial read. How to restore it:
  `../migration-plans/10-solution-1.21.753-gap-register.md`, "Reproducing the analysis".
- **Docs** — `README.md`, `CLAUDE.md` and `docs/SECURITY.md` updated for 86 tables / 2,048
  grants; `CLAUDE.md` rule 11 states the accessibility identity rule.

## Not done, on purpose

- `vsb_AnalyticsAppExplainUsers` (new in 1.21.753) is not in `matrix.json` — neither canvas app
  reads it.
- The 220 baselined accessibility identities — each entry names its owner and reason; most
  are controls the code app deliberately does not render (hidden dispatch buttons, separators)
  or screens' detail fields not built yet.
