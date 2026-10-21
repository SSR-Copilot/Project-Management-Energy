# Solution 1.21.709 → 1.21.753 — gap register

**Input:** `VSBCloud_managed (2).zip` — solution `VSBCloud` **1.21.753** (managed), three canvas
apps (`projectmanagement`, `projectcosts`, `gateconceptmigrationscripts`), 17 flows, 27
environment variables. The Project Management and Project Costs apps were unpacked and
analysed; **`gateconceptmigrationscripts` was ignored** (a migration utility, not part of either
app). The unpacked source is **not shipped** in this package — see "Reproducing" at the end.

**Baseline:** `ProjectDocs/Existing Solution/VSBCloud (3).zip` — solution 1.21.709, the version the skeleton and
these screen specs were written against.

**Target:** `ProjectCosts-CodeApp/skeleton-reference` only. `ProjectCosts-CodeApp/` is not changed;
what it would need is in `ProjectDocs/app-docs/1.21.753-REQUIRED-CHANGES.md`.

## Method

1. A structured diff of every `.pa.yaml` (control tree + every property), with serializer noise
   filtered out (control version bumps, quoting, property order). What survives is below.
2. `customizations.xml` diffed per entity and attribute; flows, environment variables and
   `Formulas/` compared byte for byte.
3. Each surviving delta was ported as a pure rule with a test, the 1.21.709 behaviour kept as a
   `…Canvas709` twin where a test still needs it, and canvas bugs marked `SOURCE DEFECT 1.21.753-n`.

## Solution level

| | 1.21.709 | 1.21.753 | disposition |
|---|---|---|---|
| tables | 91 | 92 — **+ `vsb_AnalyticsAppExplainUsers`** (20 attributes, 3 option sets) | not read by either canvas app → **not** added to `matrix.json`; add it if the Analytics-app hand-off (`VITE_ANALYTICS_APP_URL`) ever reads it |
| tables the apps read | — | Project Main now reads **`Base cases`** (`vsb_basecases`) for the Simulate gate | added to `matrix.json` (organization-owned, connected, read-only) → **86 tables** |
| flows (17) | | byte-identical | none |
| environment variables (27) | | identical | none |
| `Formulas/` | | identical | none |

## Canvas deltas

| # | app · screen | 1.21.753 change | skeleton disposition | tests |
|---|---|---|---|---|
| G-01 | PM · Project Main | Suite-bar command bar `Items`/`OnSelect`: **Simulate** always visible, enabled by selection; the old allow-list / Dev gate commented out; the real validation moved into `OnSelect` (technology, cluster-state order, a base case must exist) | `simulateGate` + `readSimulateInputs` (project + top-1 base case, then the state order); `SIMULATE_MSG`; MessageBar `simulate-notice`; `VITE_ANALYTICS_APP_URL` | UT-MAIN-038..041 |
| G-01b | PM · Project Main | parity found while there (skeleton was behind 1.21.709 too): captions "View Sharepoint Site", "View Teams", "Show Project Overview (Beta)", "Show Portfolio Overview (Beta)" with icon `View`; Portfolio always enabled; `colReportViewers` verbatim; keyword search = Project Name, **Project ID (`vsb_name`)**, Internal Project ID, Short Name | `rules.ts` constants and `keywordClause` | UT-MAIN-005, -017, -036 updated |
| G-02 | PM · General Data | `ProjectName` / `ShortName` `DisplayMode` → always Edit (the lock is commented out) | `fieldModes` (Short Name editable at any cluster); 1.21.709 in `fieldModesCanvas709` | UT-GDATA-032 updated, -058 |
| G-03 | PM · Project Revenues | Italian price zones renamed **`Italy_Centre-South` / `Italy_Centre-North`** (no spaces); assumptions sliced with `StartsWith(country, "Italy")` in `OnVisible`, Add Contract, the Label `OnChange` and the contract command bar; prices read from the project's own zone | `assumptionScope`, `selectCountryAssumptions`, `pricePoolFor`, zone map; hooks filter with `startswith` | UT-REV-005/-006 updated, -074, -075 |
| G-03a | | **SOURCE DEFECT 1.21.753-1** — the exact-COD-year price lookup now also requires `country = locAreaWithRegion`, which is blank outside Italy, so non-Italian projects always fall through to the year-vs-price fallback | reproduced only in `priceForYearCanvasParity(…, exactRegion)`; `priceForYear` keeps the exact match | UT-REV-075 |
| G-04 | PM · General Milestones | `btn_Project_Milestone_Save` — the same zone rename and Italy prefix slice for `recCountryAssumptions` / `recFilteredPrices` | `isInRevenueSlice`, `revenuePricePool` | UT-MSTONE-034/-035 updated, -057, -058 |
| G-05 | PM · Project Generators | **Replace Generator Type** and **Replace PV Module Type**: two new command-bar items and 181 new controls (two replace panels); phases Identify → Detach → Delete → Add → AllocateLandLease → Repoint; manual land-lease allocations moved by position, surplus removed; O&M costs re-pointed to the new bridge | `rules.ts` (`REPLACE_*`, `planReplaceLandLease`, `replaceWtgSaveable`, `replacePvSaveable`), `hooks.ts` (`replaceGeneratorTypeImpl`, `replacePvModuleTypeImpl`), two panels in `Screen.tsx` | UT-GEN-057..073, UT-GENR-001/-002 (mock backend) |
| G-05a | | **O&M dependency guard** — delete / deactivate a WTG type or PV module type is refused while an active O&M cost points at its bridge (`lbl_…PreventTotalCapacity_Information.Text`, popup resized) | `capacityGuardReason`, `opexDependencyMessage`, `useOpexDependency` | in UT-GEN-057..073 |
| G-05b | | delete type now removes **all** its units' land-lease allocations; a new PV module creates bridge + unit and backfills every AllWTG cost (`btn_Trigger_New_AllocateWTGs_To_Land_Lease`) | `hooks.ts` delete / `createPvBridgeAndUnit` | — |
| G-05c | | **SOURCE DEFECT 1.21.753-2** — the canvas replace also deletes the allocations of the turbine selected at the time, after capturing them for re-pointing; with a turbine selected the replace errors half-way | not reproduced: those allocations are re-pointed | UT-GENR-001 |
| G-06 | Cost · Capex Costs | `% Values` months are `RoundDown(total × v / 100, 0)` (was `Round`); the Save hands the shortfall to the **latest** positive month; an existing contract opens in percent mode only when its total ≠ 0 (`tmr_…EnrichLoader`) | `individualDistribution` (+ `…Canvas709`), `absorbPercentRemainder`, `enrichSchemeIsPercent` | UT-CAPEX-059..061 |
| G-06a | | `con_Costs_BodyRightSide.LayoutOverflowX = Scroll` | already equivalent — the capex `DataGrid` runs with `horizontalScroll` | — |
| G-07 | Cost · App `OnStart` | `gblAreaWithRegion` zone rename | no skeleton counterpart (the cost screens do not read Italian price zones) | — |
| G-08 | PM · Admin Contract | `btnGeneralPurposeReset` — `ShowColumns` by display name instead of logical name | no functional change | — |
| G-09 | both apps | modern-control version bumps only — PM: `modernCombobox` / `modernTextInput` 1.1.1 → 1.1.2, `modernDatePicker` / `modernRadio` 1.0.1 → 1.0.2; Cost: `modernDropdown` 1.0.2 → 1.0.3, `modernTabList` 1.0.1 → 1.0.2, `modernTextInput` 1.1.1 → 1.1.2. Data-source column references switched between logical and display names (`vsb_row_num` → `row_num` on App Loading, `vsb_name` → `Name` on Admin Cost) | no functional change | — |

## Also delivered with this pass

| | what | where |
|---|---|---|
| A-1 | **`cmp_NestedCountryPickerColumn`** — the reusable country × child picker (unchanged between versions), now used by Admin Contract, Admin Cost and Admin Project Gates Approvals | `src/components/cmp_NestedCountryPickerColumn{.tsx,.model.ts,.test.tsx}`; UT-NCP-001..015 |
| A-2 | **G-A11Y** — every canvas `AccessibleLabel` (541) carried as `aria-label` (caption) + `data-testid` (canvas name); 320 of 540 distinct controls wired, 220 baselined with owner and reason | `docs/G-A11Y.md`, `scripts/check-a11y.mjs`, `src/a11y/`; UT-A11Y-001..006 |
| A-3 | Finance — the DSRA/DSRF card's own **Activate / Deactivate** (`con_DSRA_DSRF_Data_Deactivate`) was missing, leaving `toggleDsraStatus` unreachable (a pre-existing gap found while wiring A-2) | `dsraCardToggle`; UT-FIN-105 |
| A-4 | Mock backend mirrors `<Nav>@odata.bind` → `_<nav>_value` on POST and PATCH, so lookup round-trips (and the replace flows) are testable | `src/data/mock/mockBackend.ts` |
| A-5 | `reference/canvas-labels.json` regenerated from the 1.21.753 source with workspace-relative paths | `scripts/extract-canvas-labels.mjs` defaults |

## Open items (a decision, not a port)

| | item | canvas 1.21.753 | skeleton today | ProjectCosts-CodeApp |
|---|---|---|---|---|
| O-1 | Project Main **Dashboard** command | `viewDashboardFunctionality` has no `ItemEnabled` (always enabled), icon `BIDashboard` | gated on a selection, icon `DataBarVertical` — follows GUIDE p06 ("the other five are greyed") | always enabled (follows the canvas) |
| O-2 | `aria-label` content | the AccessibleLabel value (mostly a control name) | caption; canvas name on `data-testid` (`docs/G-A11Y.md`) | canvas name on both |

## Screen specs touched

`008-project-main`, `009-general-data`, `010-project-milestones`, `011-project-generators`,
`017-project-revenues`, `018-project-finance`, `019-capex-costs`, `004-admin-gates-approvals`,
`005-admin-contract`, `006-admin-cost` each carry a short **1.21.753 delta** section pointing here.

## Reproducing the analysis

The package ships the 1.21.709 solution (`ProjectDocs/Existing Solution/VSBCloud (3).zip`) but neither the
1.21.753 solution nor any unpacked `.pa.yaml`. To re-run the diff or regenerate a corpus:

1. Put `VSBCloud_managed (2).zip` anywhere and open it; `CanvasApps/` holds one `.msapp` per app.
2. A `.msapp` is itself a zip. Extract `vsb_projectmanagement_88aff_DocumentUri.msapp` into
   `ProjectDocs/Existing Solution/VSBCloud_1.21.753/msapp/projectmanagement/` and
   `vsb_projectcosts_ba045_DocumentUri.msapp` into `…/msapp/projectcosts/` (each gets `Src/`,
   `AppCheckerResult.sarif`, …). `pac canvas unpack` gives the same `Src/`.
3. `npm run a11y:extract` and `node scripts/extract-canvas-labels.mjs` (in `vsbcode`) read those
   folders by default. Without them both refuse to run and change nothing; the committed
   corpora (`reference/canvas-accessible-labels.json`, `reference/canvas-labels.json`) are what
   the gates use, and G-A11Y reports its source check as *skipped (canvas source not present)*.
