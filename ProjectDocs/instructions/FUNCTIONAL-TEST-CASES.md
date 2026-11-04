# Functional test cases: the Excel template, and how to fill and run it for a screen

The functional test catalogue for the code app is kept in the workbook
`VSBCloud-Functional-Test-Case-Template.xlsx` (workspace root, untracked, received 4 Nov 2026).
This file explains every part of that workbook, says where the template assumes the old mock
skeleton rather than this app, and gives the method to write, run and report the cases for any
screen.

**The canvas apps are the source of truth.** Project Management and Project Costs (the two canvas
apps, `ProjectDocs/_extracted/msapp/`) define the expected behaviour of every case. The code app is
the system under test. A case never takes its expected result from the code app's own source.

Read with: `E2E-PARITY-PROMPT.md` (inputs and run order), `TESTING-AND-HARNESS.md` (the parity
harness, D80), `CONVENTIONS.md` rules 7, 8, 10, 11, 13 and 16.

---

## Part 1. The workbook, sheet by sheet

Six sheets, 15 named ranges. Nothing is protected: the "do not edit" cells are protected by
convention and grey fill only.

| Sheet | Role | Rows ready |
|---|---|---|
| Read Me | ID scheme, rules, legend | |
| Summary | Live formulas only, nothing typed | |
| Test Cases | One row per case, holding the **latest run only** | 600 (rows 4–603) |
| Column Guide | Meaning, requirement and owner of each Test Cases column | |
| Execution Log | History: one row per case **per run** | 1,000 (rows 4–1003) |
| Lookups | Every dropdown list and the 23-screen table | |

### 1.1 ID scheme (Read Me)

| ID | Meaning |
|---|---|
| `FT-ACC-NNN` | Access and visibility: one case per screen × VSB role. Target 23 × 5 = 115 |
| `FT-BR-<CODE>-NNN` | One business rule on one screen. `<CODE>` is the screen code from Lookups |
| `UT-<PREFIX>-NNN` | The Vitest case that already pins the rule. It goes in "Pinned By" |

- Sample rows use `9xx` numbers. Delete them before import. The one exception is
  `FT-BR-ADGATE-002`, a real catalogue id kept as a documented known-fail case.
- Data validation on Case ID only accepts `FT-ACC-…` or `FT-BR-…`, and only a unique value.
- The FT-BR id must carry the screen's code: `MID(CaseID, 7, LEN(Code)+1) = Code & "-"`.
  A Capex case named `FT-BR-OPEX-…` turns red.

### 1.2 Test Cases columns (A–AH)

The header is row 3, the group band row 2, the data rows 4–603. Panes freeze at D4 and the autofilter
covers A3:AH603.

| Col | Column | Group | Required | Filled by | Allowed values / rule |
|---|---|---|---|---|---|
| A | Case ID | Identification | Yes | Author | FT-ACC-NNN · FT-BR-CODE-NNN, unique (validated) |
| B | Suite | Identification | Yes | Author | `FT-ACC` · `FT-BR`; must match the ID prefix (red if not) |
| C | Screen | Identification | Yes | Author | One of the 23 screens (dropdown `lst_Screen`) |
| D | Phase | Identification | Auto | Formula | Looked up from Lookups; "Unknown screen" if C is wrong |
| E | Screen Code | Identification | Auto | Formula | Looked up from Lookups; "?" if C is wrong |
| F | Title | Identification | Yes | Author | One line, at most 120 characters |
| G | Test Category | Scope & Design | Yes | Author | 15 values (§1.4) |
| H | VSB Role | Scope & Design | Yes | Author | 5 roles + "All roles (role-independent rule)" + "No VSB role (negative test)"; FT-ACC without a role turns red |
| I | Priority | Scope & Design | Yes | Author | P1 · P2 · P3 (§1.4) |
| J | Preconditions | Scope & Design | Yes | Author | State before step 1: role, selected project, data, mode |
| K | Test Data | Scope & Design | Cond. (when the case writes) | Author | Created data carries a run prefix |
| L | Test Steps | Scope & Design | Yes | Author | Numbered, one per line (Alt+Enter in the cell) |
| M | Expected Result | Scope & Design | Yes | Author | What the tester sees |
| N | Acceptance Criterion | Scope & Design | Yes | Author | A pass/fail statement (AND / equals / tolerance). Empty turns red |
| O | Expectation Source | Traceability | Yes | Author | 10 values (§1.4) |
| P | Canvas Control / Power Fx Ref | Traceability | Cond. (parity cases) | Author | Canvas control name (= `data-testid`) or `Screen.Property` |
| Q | Rule Function (TS) | Traceability | Cond. (FT-BR) | Author | `rules.ts` function or file path |
| R | Pinned By (UT ID) | Traceability | Cond. | Author | Must start `UT-` (validated). Blank is a gap, counted on Summary |
| S | Server Enforcement | Traceability | Cond. (access and refusal cases) | Author | 4 values (§1.4) |
| T | Execution Mode | Automation | Yes | Author | Automated · Semi-automated · Manual |
| U | Automation Status | Automation | Yes | Automation | 6 values (§1.4) |
| V | Automation Ref | Automation | Cond. (automated) | Automation | npm script, spec file or test title |
| W | Known Defect / Expected-Fail Ref | Automation | Cond. | Author | Defect id or short text. Automated as `test.fail()` so a fix flips it |
| X | Divergence Ref | Automation | Cond. | Automation | Register id of an intended canvas-vs-code difference |
| Y | Environment | Latest run | Cond. (once run) | Tester | 4 values (§1.4) |
| Z | Build / Solution Version | Latest run | Cond. | Tester | e.g. `1.21.753` |
| AA | Executed By | Latest run | Cond. | Tester | Person or pipeline |
| AB | Executed On | Latest run | Cond. | Tester | Date ≥ 1 Jan 2025 (validated), shown dd-mmm-yyyy |
| AC | Actual Result | Latest run | Cond. (Fail, Blocked, Expected Fail) | Tester | Free text |
| AD | Status | Latest run | Yes | Tester | Not Run · Pass · Fail · Blocked · Expected Fail · Skipped. Start every case as Not Run |
| AE | Parity Class | Latest run | Cond. | Automation | MATCH · EXPECTED · UNEXPECTED · NOT-COMPARABLE · N/A - not a parity run |
| AF | Defect Raised | Latest run | Cond. (Status = Fail) | Tester | Tracker id; a Fail without one turns red |
| AG | Evidence Link | Latest run | Cond. | Tester | Screenshot, trace or report path |
| AH | Comments | Latest run | No | Anyone | Manual-only reason, blockers. "SAMPLE" marks a sample row |

**Red cells (conditional formatting), the catalogue rules:**
1. Case ID duplicated, or not `FT-ACC-` / `FT-BR-`.
2. Suite does not match the ID prefix.
3. An FT-BR id that does not carry the screen's code.
4. Acceptance Criterion empty on a row that has an ID.
5. An FT-ACC case with no VSB Role.
6. Status Fail with no Defect Raised.

Status colours: green Pass, red Fail, amber Blocked, lavender Expected Fail, grey Skipped. Parity
UNEXPECTED is red.

### 1.3 Execution Log (A–N)

One row per case per run. The Test Cases row keeps only the latest run.

| Col | Column | Notes |
|---|---|---|
| A | Run ID | `RUN-YYYY-MM-DD-NN` (sample) |
| B | Cycle | `Cycle 1`, `Cycle 2`… |
| C | Case ID | Must exist on Test Cases |
| D | Screen | Formula from the Case ID; "Unknown case ID" (red) if not found |
| E | VSB Role | Dropdown |
| F | Environment | Dropdown |
| G | Build / Solution Version | |
| H | Executed By | |
| I | Executed On | Date |
| J | Status | Dropdown, same colours |
| K | Parity Class | Dropdown |
| L | Defect Raised | |
| M | Evidence Link | |
| N | Notes | |

### 1.4 Lookups: every list

| Named range | Values |
|---|---|
| `lst_Phase` | Admin · Project Management · Project Costs |
| `lst_Suite` | FT-ACC · FT-BR |
| `lst_Role` | VSB - Application Administrator · VSB - Controller Own Data · VSB - Project Data All Countries · VSB - Project Data Own Country · VSB - Project Manager Own Projects · No VSB role (negative test) · All roles (role-independent rule) |
| `lst_Category` (15) | Access / Visibility · Navigation · Create · Edit · Delete · Activate / Deactivate · Validation · Calculation · Filter / Search · Cascade / Dependency · Data persistence · Flow call · Label parity (G-LABEL) · Accessibility (G-A11Y) · Timezone / Locale |
| `lst_Priority` | P1 Security, role access, data integrity, money totals: blocks QA sign-off · P2 Core screen behaviour: must pass before UAT · P3 Cosmetic or edge case: may be deferred with a reason |
| `lst_Source` (10) | security/matrix.json · app/buildPlan.ts · routes/AppRoutes.tsx · domain/session.ts · Feature rules.ts / plan.ts · Canvas source (.pa.yaml) · Canvas behaviour (captured) · GUIDE parity ref · Product decision · Source defect register |
| `lst_Server` (4) | Client only (mock models matrix) · Needs gsec.mjs on real environment · Verified on Dataverse · Not applicable |
| `lst_ExecMode` | Automated · Semi-automated · Manual |
| `lst_AutoStatus` (6) | Automated - passing · Automated - test.fail (known defect) · To automate · Manual only - reason in Comments · Skipped - missing flow definition · Skipped - missing data-testid |
| `lst_Env` | Local (mock) · CI (mock) · QA (Dataverse) · UAT (Dataverse) |
| `lst_Status` | Not Run · Pass · Fail · Blocked · Expected Fail · Skipped |
| `lst_Parity` | MATCH · EXPECTED · UNEXPECTED · NOT-COMPARABLE · N/A - not a parity run |
| `lst_Screen`, `tbl_ScreenCode`, `tbl_ScreenPhase` | The 23-row screen table (Part 3) |

The screen table also carries **Band** (XS–XL, the screen's size) and **Inferred** ("Yes" = the
screen was never seen in a recording, so capture the canvas behaviour before comparing).

### 1.5 Summary: what each figure means

All figures are formulas over Test Cases rows 4–603.
- **Catalogue:** total cases; FT-ACC; FT-BR; P1/P2/P3; per phase; per execution mode.
- **Latest run:** Not Run (counts blank Status too), Pass, Fail, Blocked, Expected Fail, Skipped.
  - **Executed** = Pass + Fail + Blocked + Expected Fail. Blocked counts as executed; Skipped does not.
  - **Pass rate** = Pass ÷ Executed.
  - UNEXPECTED parity differences are counted separately.
- **Catalogue health, target 0** (it "mirrors gate:ftcases"):
  - no Acceptance Criterion;
  - duplicate IDs;
  - a wrong prefix;
  - a screen that is not one of the 23;
  - an FT-BR code that differs from the screen code;
  - FT-ACC without a role;
  - Fail without a defect.

  The last row, FT-BR not pinned by a UT id, is a gap to close, not a failure.
- **Coverage by screen,** in migration order: cases, FT-ACC, FT-BR, P1, automated, each status, and
  Pass % of executed. A screen with 0 cases shows amber.
- **FT-ACC role coverage:** per role and phase. The target per role is 23, one per screen; Gap > 0
  means screens not yet covered for that role.

---

## Part 2. Where the template assumes the skeleton, and what to use in this app

The template was written for the retired mock-mode skeleton (`ProjectDocs/skeleton-reference/`,
solution 1.21.753). Checked against `ProjectCosts-CodeApp/` on 4 Nov 2026, these references do not
exist in this app:

| Template says | In this app | Use instead |
|---|---|---|
| Mock mode, `?mockRoles=<role key>` | No mock mode; every run reads real `VSBCloud_Dev` | A real signed-in account with the role. One saved session per account (`e2e/.auth/`) |
| `security/matrix.json` → `tests/functional/expected.json` | Not present (no privilege matrix, D1) | Expected access comes from the **canvas** `Visible` / `DisplayMode` / `ItemEnabled` formulas plus `domain/session.ts` (`canSeeAdminSection`, `canEditCountry`, `canEditSelectedProject`) |
| `gsec.mjs` (server refusal proof) | Not present | Server Enforcement = "Verified on Dataverse" when the case drives a real write as the role and the 403 is seen; otherwise "Not applicable" or "Client only" |
| `routes/AppRoutes.tsx`, `app/buildPlan.ts` | Not present | `src/app/routes.tsx`, `src/app/navigation.ts` |
| `privileges.forTable()`, `clearProject()` | Not present | The real function in the feature's `rules.ts` or `domain/session.ts` |
| `npm run ft`, `npm run gates`, `gate:ftcases`, `scripts/scenario.mjs` | Not present | `npm run parity -- --screen <slug>` (D80 harness), `npx vitest run <file> -t <UT id>`, `npm run check:labels`, `npm run check:canvas` |
| `parity/expected-divergences.json` | Not present | The manifest's KNOWN entries (`e2e/screens/<slug>/manifest.ts`, `e2e/lib/known.ts`), each citing a `DIVERGENCE` / `SOURCE DEFECT` marker and a D-number in `02-OPEN-DECISIONS.md` |
| Test data `PWTEST-<runId>`, a "QA environment" | The harness writes `PW-<runId>` rows on **DEV**, and `parity:sweep` deletes by that tag | `PW-<runId>` (keeps the sweep working); DEV only; never production |
| Environments: Local/CI (mock), QA/UAT (Dataverse) | Local = `pac code run` / `pa app run` against VSBCloud_Dev; DEV = the deployed app | Proposed Lookups additions: "Local (VSBCloud_Dev)" and "DEV (deployed)". Not added yet, needs approval |
| Build `1.21.753` | Canvas source on disk is solution **1.21.709**; the code app has no solution version of its own | Column Z: `code <git sha> · canvas 1.21.709`, e.g. `code b517659 · canvas 1.21.709` |
| Defect ids `DEF-0001` | The bug register is `ProjectDocs/app-docs/01-BUGS-FOUND.md` (`CA-NN`; canvas defects `A-1`, `C-6`…) | Defect Raised: the `CA-NN` id. New bugs are added there first |
| "Screen Code is the same as the UT- prefix" | True for 16 screens, not for all (Part 3) | Keep the template's code in FT-BR ids (the red-cell rule needs it); put the real UT ids in Pinned By |
| G-LABEL / G-A11Y gates | No G-LABEL; the label and identity gates are UT-LABELS and UT-CANVASID inside `npm run verify` | Label parity cases: the harness's text comparison plus `check:canvas` (C4 = `aria-label` vs canvas `AccessibleLabel`) |
| "Inferred" = Yes for Grid Operator, Opex, Land Lease, Add Costs | Land Lease and OPEX now have captured canvas references (`e2e/reference/<screen>/`, D80) | Treat Land Lease and OPEX as captured. The other two are still inferred |

None of this changes the workbook's structure. All 34 columns and all six red-cell rules apply as
they are. Only some dropdown values need a different meaning, or need adding.

---

## Part 3. The 23 screens: template code, canvas source, code app

Canvas files are in `ProjectDocs/_extracted/msapp/<app>/Src/`. Feature folders are under
`ProjectCosts-CodeApp/src/features/`. UT prefixes were counted from the test files on 4 Nov 2026.

| # | Screen (template) | Code | Phase | Canvas `.pa.yaml` | Code app folder | UT prefixes in use | Route |
|---|---|---|---|---|---|---|---|
| 1 | Admin CAPEX Accounts | ADCAPEX | Admin | projectmanagement/Admin CAPEX Accounts | admin/admin-capex-accounts | ADCAPEX | /admin/capex-accounts |
| 2 | Admin Cost | ADCOST | Admin | projectmanagement/Admin Cost Screen | admin/admin-cost | ADCOST | /admin/cost |
| 3 | Admin Contract | ADCONTR | Admin | projectmanagement/Admin Contract Screen | admin/admin-contract | ADCONTR | /admin/contract |
| 4 | Admin Project Gates Approvals | ADGATE | Admin | projectmanagement/Admin Project Gates Approvals Screen | admin/admin-gates-approvals | ADGATE | /admin/gates-approvals |
| 5 | Admin Milestones | ADMILE | Admin | projectmanagement/Admin Milestones Screen | admin/admin-milestones | ADMILE | /admin/milestones |
| 6 | Admin Project Default Checklists | ADCHK | Admin | projectmanagement/Admin Project Default Checklists Screen | admin/admin-default-checklists | ADCHK | /admin/default-checklists |
| 7 | App Loading | APPLOAD | PM | projectmanagement/App Loading Screen | **not ported**: `app/SessionContext.tsx` + the `Landing` route | none | / |
| 8 | Project Main | MAIN | PM | projectmanagement/Project Main Screen | pm/project-main (Project Overview) | **OV**, OVUI | /projects |
| 9 | Project General Data | GDATA | PM | projectmanagement/Project General Data Screen | pm/general-data | GDATA | /project/general |
| 10 | Project General Milestones | MSTONE | PM | projectmanagement/Project General Milestones Screen | pm/milestones | MSTONE | /project/… |
| 11 | Project General Team | TEAM | PM | projectmanagement/Project General Team Screen | pm/team | TEAM | /project/… |
| 12 | Project General CheckList | CHKLST | PM | projectmanagement/Project General CheckList Screen | pm/checklist | CHKLST | /project/… |
| 13 | Project Planning | PLAN | PM | projectmanagement/Project Planning Screen | pm/planning | PLAN | /project/… |
| 14 | Project Generators | GEN | PM | projectmanagement/Project Generators Screen | pm/generators | GEN | /project/… |
| 15 | Project Production | PROD | PM | projectmanagement/Project Production Screen | pm/production | PROD | /project/… |
| 16 | Project Revenues | REV | PM | projectmanagement/Project Revenues Screen | pm/revenues | REV | /project/… |
| 17 | Project Finance | FIN | PM | projectmanagement/Project Finance Screen | pm/finance | FIN | /project/… |
| 18 | Grid Operator | GRIDOP | PM | projectmanagement/Grid Operator Screen | pm/grid-operator | GRIDOP | /project/… |
| 19 | Contracts | CONTR | Costs | projectcosts/Contracts Screen | cost/contracts | **CON**, CONTRACTS, CONPANEL, CONTOUCH, CONCHECK, CONUI | /costs/contracts |
| 20 | Capex Costs | CAPEX | Costs | projectcosts/Capex Costs Screen | cost/capex-costs (+ cost/costing) | CAPEX, **CAPEXR**, CMT, CLU, GRID, STD, CAPEXSAVE, CAPEXS, DIST, CWS, CAPEXPCF | /costs/capex |
| 21 | Opex Costs | OPEX | Costs | projectcosts/Opex Costs Screen | **cost/periods** (`OpexScreen.tsx`, `opexRules.ts`) | OPEX, OPEXUI | /costs/opex/om, /costs/opex/other |
| 22 | Land Lease Costs | LEASE | Costs | projectcosts/Land Lease Costs Screen | **cost/periods** | LEASE, **LAND**, LLUI, LLREC | /costs/land-lease |
| 23 | Add Costs from Table | ADDCOST | Costs | projectcosts/Add Costs from Table | cost/add-costs-from-table (+ cost/costing) | ADDCOST, ACSAVE, ACBG, ACPERF, ADDPERF, ACSHEET | /costs/add-from-table (a right panel over CAPEX since D62) |

The PM routes are `/project/<screen>?projectId=<guid>`; take the exact segment from
`src/app/navigation.ts`. Parity manifests exist for Land Lease and OPEX (`e2e/screens/`). Rule maps
exist in `ProjectDocs/app-docs/e2e/RULEMAP-*.md`.

Not in the 23: the shared `report-problem` panel, and `Screen1` / `Screen2`, which are unused canvas
scaffolding.

---

## Part 4. Writing the cases for a screen

Work in this order. The canvas comes first at every step.

1. **Collect the canvas requirements** (`canvas-yaml-to-codeapp` skill, section 2). Use the live
   formulas only, never the commented-out ones (rule 10):
   - `OnVisible`, `Items`, `OnSelect` / `OnChange`;
   - `Visible` / `DisplayMode` / `ItemEnabled` gates (separate from click-time validation, rule 11);
   - `Notify` texts, `Patch` / `Remove` payloads;
   - hidden `Select()` buttons, timers, `fn_*` components, the flows and plugins the screen triggers.

   Reuse the screen's rule map (`RULEMAP-<screen>.md`) and coverage map when they exist.
2. **Cross-check the decisions** in `02-OPEN-DECISIONS.md`, `01-BUGS-FOUND.md` and file 13. Every
   intended difference is a known divergence, not a defect. Every reproduced canvas defect is
   expected behaviour.
3. **One FT-BR case per rule,** not per control. Pick the Test Category from the 15 values. Typical
   set for an editable screen:
   - Navigation and deep link;
   - load and Filter / Search;
   - each gate (Validation);
   - Create, Edit, Delete;
   - each Calculation and rounding rule;
   - Data persistence (read back, Owning Business Unit);
   - Cascade / Dependency;
   - Flow call;
   - Label parity, Accessibility, Timezone / Locale.
4. **FT-ACC cases: one per role** for the screen (5 rows). The expected result comes from the
   canvas formula that hides, shows or disables the screen and its commands, for example
   `Or(IsApplicationAdministrator, IsControllerOwnData)` for the admin menu. Cite it in column P.
5. **Fill the traceability columns:**
   - P: the canvas control name and property, e.g. `btn_…​.DisplayMode`.
   - Q: the `rules.ts` function.
   - R: the UT ids that pin the rule. Search the feature's `*.test.ts` for the function; blank means
     a gap.
   - O: "Canvas source (.pa.yaml)" for a formula; "Canvas behaviour (captured)" when the canvas
     reference run proved it; "Product decision" or "Source defect register" for a D-number or a
     bug id.
6. **Write the acceptance criterion** so a machine could judge it. Examples: "the read-back
   `vsb_totalcost` = the sum of the months (±0.01) AND `_owningbusinessunit_value` = the project's
   BU"; "the message text equals the canvas `Notify` text verbatim".
7. **Known defects and divergences:**
   - A case that exposes a known defect: W = the `CA-NN` / canvas defect id; U = "Automated -
     test.fail (known defect)"; the expected outcome is Expected Fail.
   - An intended difference: X = the KNOWN key in the manifest plus the D-number.
8. **Priority:** P1 for role access, data integrity, money totals and anything that writes; P2 for
   core screen behaviour; P3 for cosmetic and edge cases.
9. **IDs:** number each screen's FT-BR from 001 and FT-ACC globally. Never renumber an existing ID.
   Start every Status as Not Run.

## Part 5. Running the cases and recording the results

1. **Inputs, asked every run** (`E2E-PARITY-PROMPT.md`):
   - the role or test account;
   - the screens;
   - the Canvas and code app URLs;
   - the test project.

   The project ids are asked each time and kept in environment variables only
   (`PARITY_READ_PROJECT_ID`, `PARITY_WRITE_PROJECT_CANVAS`, `PARITY_WRITE_PROJECT_CODE`). Never
   write them into the workbook, a log or a file. Column K says "test project (asked at run time)".
2. **Canvas first, then the code app.** Every Automated FT-BR case maps to a harness state, gate,
   validation input or flow step of the screen's manifest. Run
   `npm run parity -- --screen <slug> --tier full --mode full`, with `PARITY_WRITE=1` only when the
   write flows are agreed. A screen with no manifest gets one first (`npm run parity:gen` drafts it
   from the YAML).
3. **Unit pins:** `npx vitest run <test file>` for the UT ids in column R. A failing pin makes the
   FT-BR case Fail, whatever the browser showed.
4. **Manual cases:** the tester follows column L in both apps and fills columns Y–AH.
5. **Mapping harness results to the workbook:**

| Harness outcome | Status | Parity Class |
|---|---|---|
| Both apps the same, test green | Pass | MATCH |
| A difference classed **new** | Fail (raise a `CA-NN`) or Blocked until the product owner decides | UNEXPECTED |
| A difference classed **known** (manifest KNOWN, D-number) | Pass | EXPECTED; Divergence Ref = the key |
| **artefact** (font metrics, icon glyphs) | Pass | MATCH, with a note in Comments |
| **not-captured** by one app | Blocked | NOT-COMPARABLE |
| **stale** known difference | Pass | MATCH; remove the stale KNOWN entry from the manifest |
| A test that passes only on the re-run (flaky) | Pass, with "flaky" in Comments | as above |
| Case written for a known defect, still failing | Expected Fail | as above |
| Not runnable (no role account, Fabric source, a flow without an agreed plan) | Blocked or Skipped, with the reason in Comments | N/A - not a parity run |

6. **Write the results:**
   - Test Cases columns Y–AH hold the latest run.
   - Execution Log gets one row per case, Run ID = `RUN-<date>-NN`.
   - Notes give the harness batch, e.g. `parity 20261104-1016`.
   - Evidence = `e2e/runs/<batch>/<screen>/summary.md` and the trace path.
7. **Report:** the Summary sheet (health checks at 0), plus a short run report
   (`ProjectDocs/app-docs/E2E-PARITY-REPORT-<date>.md`) covering:
   - counts per status and parity class;
   - each new difference with its classification;
   - the rule map counts;
   - the gaps (rules with no UT pin, cases left manual and why).

### Rules that hold for every run

- Never put personal data, row values or project GUIDs into the workbook: counts, labels and ids only.
- Never start a PM approval flow (Check List, General Data) without the test plan of
  `16-PM-FLOWS-IN-THE-CODE-APP.md` §7. It sends real mails, Teams cards and approvals.
- Fabric SQL reads are "not tested (Fabric)" unless the run is scoped to them.
- A failing case is reported, not fixed silently, and no commit follows from a run without the
  user's approval.
- Write the filled workbook as a new file per screen or run, e.g.
  `FT-<SCREEN CODE>-<date>.xlsx`. Never overwrite the template, and keep its formulas, validation
  and formatting. With openpyxl, load without `data_only` and save under a new name. Excel then
  recalculates the formulas when the file opens.

## Part 6. Open points for the product owner (4 Nov 2026)

1. **Role accounts.** FT-ACC needs one signed-in test account per VSB role (5). Today the harness
   has one saved session (one account), so every FT-ACC case except that account's role is Blocked.
2. **Lookups additions:** "Local (VSBCloud_Dev)" and "DEV (deployed)" in `lst_Env`. The template's
   own instruction is to add values on Lookups.
3. **Test data prefix:** `PW-` (what the harness and `parity:sweep` use) or the template's `PWTEST-`.
4. **Where the filled workbooks live:** `ProjectDocs/test-cases/<module>/`, used since 4 Nov 2026 for
   the Cost module (`ProjectDocs/test-cases/Cost/README.md`). The template itself is git-ignored at the
   workspace root.
5. **The sample rows** (`FT-ACC-901/902`, `FT-BR-*-901/902`) describe skeleton behaviour (mock mode,
   `npm run ft`). They are deleted from a working copy, except `FT-BR-ADGATE-002`. That row's
   premise is also skeleton-only ("the plan gates delete on canEdit"), so it is re-checked against
   the real Admin Gates Approvals delete gate before it is kept.
