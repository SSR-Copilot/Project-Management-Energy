# DEVEX/CAPEX Costs screen — canvas vs code-app analysis (index)

## Purpose

This folder compares the VSBCloud Project Costs canvas app's **DEVEX/CAPEX Costs screen** with its
port in the Power Apps code app (`ProjectCosts-CodeApp/`). It covers the Add/Edit Cost panel, the
Comments panel, the `DevexCapexSummaryPCF` grid and the shared Cost-module shell.

- Files `01`–`14` each analyse one aspect and end with a gaps table.
- `15` merges, verifies and prioritises those gaps.
- Use the folder to plan fixes, write test cases, and put product questions to the product owner.

## Versions and date

| Item | Value |
|---|---|
| Canvas source | Solution **1.21.709**, unpacked at `ProjectDocs/_extracted/msapp/projectcosts/Src/` (`Capex Costs Screen.pa.yaml`, 20,178 lines, with `App.pa.yaml` and `Components/`). This is the version CONVENTIONS rule 16 names. |
| Code app | `ProjectCosts-CodeApp/`, commit **`a94ec68`** (branch `RounakDev1`) |
| Date | 27 Oct 2026 |

## Files

| File | What it covers | Gap prefix |
|---|---|---|
| `00-README.md` | This index | — |
| `01-EDIT-COST-MODULE.md` | The Cost module as a whole: session bootstrap, rail, header, routing, entry from PM's Edit Costs, cross-screen state | GAP-MOD |
| `02-UI.md` | Layout and geometry: frame, tab strip, toolbar, Summary card, grid region, Add/Edit and Comments panel layout | GAP-UI |
| `03-THEMES.md` | Colours: the `AppTheme` palette, standard-assumption blue/italic (rule 20), panel and dialog skins, hard-coded hexes | GAP-TH |
| `04-TYPOGRAPHY.md` | Fonts, sizes, weights and number/date/locale formatting of every visible string | GAP-TY |
| `05-UX.md` | Interaction and feedback, keyboard, accessibility, and Tosca identities (`aria-label` / `data-testid`) | GAP-UX |
| `06-POPUPS.md` | Every dialog, loader and notification (P1–P8, N1–N8): trigger, copy, chrome and effect | GAP-POP |
| `07-FUNCTIONAL-SCREEN-AND-GRID.md` | Screen-level business rules: load sequence, tabs, grid rows, PCF events, paid toggle, delete, standard contracts | GAP-FN |
| `08-FUNCTIONAL-ADD-EDIT-COST-PANEL.md` | The Add/Edit Cost panel: defaults, validations, distribution maths, Save/Recalculate, relink confirmation, write payloads | GAP-PNL |
| `09-COMMENTS-PANEL.md` | The Comments panel: threads, numbering, rights, save and delete, grid red dots | GAP-CMT |
| `10-COLLECTIONS-VARIABLES.md` | Inventory of the canvas globals, context variables and collections, mapped to code-app state | GAP-VAR |
| `11-DATAVERSE-TABLES.md` | Tables, columns, lookups, cascades, plugins and every write and read against Dataverse | GAP-DV |
| `12-NETWORK-CALLS.md` | Request shapes and counts per user action, caching and freshness, canvas vs code | GAP-NET |
| `13-OPTIMIZATION-AREAS.md` | Performance smells in both apps and a prioritised optimisation backlog | GAP-OPT |
| `14-PCF-CONTROLS.md` | The `DevexCapexSummaryPCF` grid and the other PCF/PowerCAT controls: contract, vendored port, identities | GAP-PCF |
| `15-GAP-ANALYSIS.md` | **Start here.** Consolidated register (CG-001–CG-095), verification log, conflicts, PO decisions, fix order, errata | CG |

## Suggested reading order

**Developer:**

1. `15` §2 and §3, then §7 (fix order).
2. For each item you pick up, read the owning analyst file:
   - `08` for the panel;
   - `07` for the grid and standard contracts;
   - `09` for comments;
   - `11` for writes.
3. Read `10` and `12` when you need state or request details.
4. Read `14` before touching `features/cost/capex-costs/pcf/`.

**Tester:**

1. `15` §2 (top 10) and §6 (open PO questions, so you know which behaviour is not yet decided).
2. `06` (every dialog and message, verbatim).
3. `05` (Tosca identities, and the 7 `aria-label` mismatches the gates miss).
4. `08` and `07`, to build test cases from the canvas formulas.
5. `02`, `03` and `04`, for visual checks.

## Conventions used in these files

**Citations:**

- `L1234` or `Capex L1234` is a line in `Capex Costs Screen.pa.yaml`.
- `Save › n` (or "decoded n") is line *n* of the decoded Save `OnSelect` (L17574). `Timer › n` is the
  same for `tmr_Capex_Initial_Load` (L782).
- `txt L…` is `CapexScreenCode.txt`, an older flattened copy. It is not ground truth (`15` §5.2).
- Code cites are `file.ts:line` under `ProjectCosts-CodeApp/src/` unless a fuller path is given.
- Commented-out (`/* */`, `//`) canvas formulas are never treated as live (CONVENTIONS rule 10).

**Statuses:**

| Status | Meaning |
|---|---|
| Covered | Parity |
| Partial | Part of the behaviour is present |
| Missing | Absent from the code app |
| Divergent-marked | Differs, with a `DIVERGENCE:` or `SOURCE DEFECT:` marker or a D-entry |
| Divergent-unmarked | Differs silently |
| Code-app-only | Exists only in the code app |

**Severities:**

| Severity | Meaning |
|---|---|
| High | Data loss or wrong stored data, a silent failure, or a broken PO rule |
| Med | Visible functional or UX divergence, or a rule 2/14/16/19 breach |
| Low | Cosmetic, an edge case, or a recorded divergence |

**Other markers:**

- **(inferred)** marks a statement drawn from platform behaviour, screenshots or reasoning rather
  than read directly in source.
- **Verdicts** in `15` are CONFIRMED, PARTLY, REFUTED, NEEDS LIVE RUN, or "analyst" (not
  re-verified).

## Headline counts (from `15`)

The raw counts:

- The 14 files raise **380 gap rows**.
- **305** of them are non-Covered gaps (16 High, about 77 Medium, about 212 Low).

They merge into **95 consolidated gaps**:

| Severity | Count | By type |
|---|---|---|
| High | 10 | Data 6, Functional 3, UI 1 |
| Medium | 37 | — |
| Low | 48 | — |
| **Total** | **95** | UI 23, UX 21, Functional 17, Data 26, Perf 8 |

Verification:

- All 17 named candidates were checked: 14 CONFIRMED, 2 confirmed in source but needing a live run,
  1 PARTLY.
- 34 further gaps were sampled: 33 CONFIRMED, 1 PARTLY.
- No gap was refuted outright. Several severities, line references and one prior decision's
  premise (D39 §3) were corrected.

Top issues:

- The relink dialog deletes payment-date comments the live canvas keeps.
- The paid confirmation never clears `'Linked Cluster'`.
- Standard-contract money is not pro-rated as in the canvas.
- `% Values` contracts cannot be edited correctly.
- A failed comment save is silent.
- `deleteComment` breaks rule 14.
- New contracts default to SPV.
- Comments have no author gate.
- Rule 20 styling is only partly applied.

## Caveat

- **Nothing here was verified against a live canvas run or against VSBCloud_Dev.** Every finding
  comes from reading source: the `.pa.yaml`, the code, the solution zip and the screenshots.
  Items marked NEEDS LIVE RUN or (inferred) must be checked through `pac code run` before a fix is
  called done (MIGRATION-STRATEGY step 9).
- These documents describe commit `a94ec68` and solution 1.21.709. Like the other app docs
  (`PROJECT-MAP.md`, layer 3), they **will lag the code over time**. Re-check a cited line before
  relying on it.
