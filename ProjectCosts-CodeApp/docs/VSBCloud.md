# VSBCloud — Canvas to Code App Build Specification (index)

Full deliverable: single self-contained HTML, published as an artifact
(`VSBCloud Code App Build Specification`), also delivered as a file in the conversation.

Derived from the **VSBCloud 2** solution export (September 2026), not from the earlier
v1.21.647 export used for the proposal and complexity matrix.

## Measured baseline (v2 export)

| | Project Management | Project Costs | Total |
|---|---:|---:|---:|
| Screens in scope | 18 | 5 | 23 |
| Control instances | 3,735 | 1,052 | 4,787 |
| Lines of Power Fx | 100,152 | 44,724 | 144,876 |
| Formula properties | 48,725 | 17,114 | 65,839 |
| Substantive blocks (≥10 lines) | 1,194 | 389 | 1,583 |
| Dataverse tables declared | 82 | 37 | 119 |
| Connected SQL/Fabric sources | 6 | 1 | 7 |
| Canvas components | 16 | 11 | 27 |

Including the two app shells and the 27 components: **5,063 controls, 152,774 lines Power Fx,
69,071 formula properties, 1,661 substantive blocks**.

Property mix: layout 43,229 (63%) · other 19,213 (28%) · bindings 2,933 (4%) ·
visibility 2,464 (4%) · events 1,232 (2%).
Substantive blocks by kind: event 552 · binding 476 · visibility 291 · other 250 · layout 92.

## Complexity bands (XS <8, S 8–22, M 22–45, L 45–70, XL ≥70 substantive blocks)

XL (8): Project Generators (190), Project Finance (186), Capex Costs (180),
Project Revenues (122), Admin Cost (117), Project Production (96),
Project General Data (88), Contracts (80).
L (4): Project General CheckList (66), Opex Costs (65), Land Lease Costs (61),
Project General Milestones (45).
M (7): Admin Contract (43), Project Planning (43), Admin Milestones (43),
Admin Project Gates Approvals (41), Project Main (27), Admin CAPEX Accounts (26),
Grid Operator (23).
S (2): Project General Team (16), Admin Project Default Checklists (16).
XS (2): App Loading (6), Add Costs from Table (3).

## Flow disposition (17 flows, 672 actions)

**None can be absorbed into app code.** Every flow either waits on an approval webhook or is
triggered by a Dataverse row change.
- Replace with Dataverse custom API: 3 flows, 38 actions (5.7%)
- Keep as flow, called from the app: 8 flows, 499 actions (74.3%)
- Keep as flow, server-triggered: 6 flows, 135 actions (20.1%)

Four flows the apps call are **missing from the export**
(`SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`,
`SynchroniseRecalculationCapexStandardCost`, `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation`);
four of the 17 exported flows have no app call site.

## Component library

10 React components replace the 27 canvas components (four canvas popups collapse into one
`ConfirmDialog`, three into one `LoadingOverlay`), plus 12 new ones the rebuild needs —
virtualised `DataGrid`, `CommandBar` (19 screens), `FormPanel`, `YearGrid`, `AppShell`,
`SpreadsheetImport`, themed `IconButton` (replacing 141 PowerCAT Icon instances), and others.
Reach leaders: `AppHeader` 21 screens, `ConfirmDialog` 21, `LeftNav` 20, `LoadingOverlay` 20,
`NumericInput`/`PercentageInput` 16.

The four `fn_*` behaviour components become pure TypeScript in `src/domain/`, including
`fn_Calculate_P75_P90`: `p75 = Round(p50 + (-0.674490 * p50 * u), 0)`,
`p90 = Round(p50 + (-1.281551 * p50 * u), 0)`.

## Test coverage

**991 unit test cases** across the 23 screens, typed Rendering / Binding / Rule / Validation /
Permission / Calculation / Integration / Error / Edge. Largest: Finance 104, Revenues 74,
Production 58, Capex 58, Contracts 57, Generators 56.

## Known defects in the source (decide before building)

Documented, not silently fixed. The load-bearing ones:
1. Finance `OnVisible` unconditionally patches `'Financing Options' = 'Debt Financing'`,
   apparently overwriting a user's All-Equity choice on every visit.
2. Revenues price fallback compares prices to years (`Abs(Value(ThisRecord.pv) - Value(recYear))`);
   the year lives in `category`, not `pv`.
3. `MarginDSRA` reads `category = "margin dsrf"` — no `"margin dsra"` lookup exists anywhere.
4. Deactivating a CAPEX account sets its subaccounts to **Active** (reads as an inversion bug).
5. Every `Fabric Sync Jobs` write and both Admin flow calls are inside `/* */` comments, and
   both Apply buttons ship `DisplayMode.Disabled` — `Apply and Apply All Trackings` rows are
   still written, recording work that never runs.
6. Admin screens have **no server-side gating** — access is client-side hiding only
   (`IsApplicationAdministrator` or `IsControllerOwnData` on nav items).
7. `calculateUncertainty` is algebraically wrong by operator precedence (call sites commented out).
8. Cost app `fn_Numeric` regexes are unanchored, so `"12.34abc"` validates;
   `fn_Percentage.IsPercentage` is literally `=true`.
9. `ReportDevOpsBug.Run` is commented out in both apps' `cmp_ReportErrorRightPanel`.
10. Add Costs from Table deletes contracts with historical costs silently (guard commented out).
11. `DefaultProjectCostsMarginValue = 10` and `Capex Project Cost Margins` are dead — every
    reference commented out; the only live margin is the BoP contract margin.

## Build sequence

Stage 0 foundation → Stage 1 component library (M0, gates everything, ≤3 people) →
Stage 2 vertical slice on Grid Operator → Stage 3 screens in six dependency waves →
Stage 4 flows and custom APIs → Stage 5 parity/performance/role testing → Stage 6 cutover.

Wave order: project context → general section → technical (Generators before Production) →
financial (build Project Finance early and re-baseline on it) → admin/master data →
Cost app. Milestones must precede Generators (FID date drives generator pricing);
admin master data must precede the Cost app (standard assumptions flow downstream).

## Reproducing the analysis

Working directory `/home/claude/vsb2` in the originating session:
`analyze.py` parses `Src/*.pa.yaml` into `corpus.json` / `summary.json`;
`brief.py "<Screen Name>"` prints a per-screen brief; `build_doc.py` assembles
`out/*.md` into the HTML. Note the YAML needs
`yaml.SafeLoader.add_constructor("tag:yaml.org,2002:value", ...)` — a bare `=` value is
otherwise parsed as the YAML 1.1 value tag and the file fails to load.

