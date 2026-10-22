# Session handoff — 19 Oct 2026: restructure, then Admin/PM redevelopment

Start a new chat by reading this file, then `gap-analysis/README.md` (the status table) and `gap-analysis/IMPLEMENTATION-BRIEF.md` (the binding rules for each screen). Re-check the code before you trust any line here.

## Layout (since 19 Oct)

- **`ProjectCosts-CodeApp/`:** the code repo, with no docs in it.
- **`ProjectDocs/`:** everything else.
  - `instructions/AGENT-GUIDE.md` is loaded by the root `CLAUDE.md`.
  - The skill is in `.claude/skills/canvas-yaml-to-codeapp/`.
- **Record of the restructure:** `RESTRUCTURE-2026-10-19.md`.

## Product-owner decisions (all in memory and in `02-OPEN-DECISIONS.md` D18–D21)

- **Before every build:** the four-item checklist in `CONVENTIONS.md` ("Before every build"):
  1. aria-label and data-testid on every control;
  2. the requirements from the canvas YAML, including the server flows and plugins and the hidden controls;
  3. reuse existing components and helpers;
  4. **no commit without approval**.
- **Scope:** redevelop the 16 Admin and PM screens (not the Cost screens, not Project Overview): rules, UI, a LIVE Dataverse connection, and docs. Do the Admin screens first.
- **Canvas bugs:** fix them and document each one. Apply / Apply All is out of scope (D20).
- **Remaining screens (004–006 and all PM):** run AUTONOMOUSLY and pause only on blockers.
  - Leave out for now: creating a project (it fires the Teams/SharePoint flow) and any action that starts an approval flow sending mail or Teams cards.
  - The Fabric SQL sources stay unconnected (D2).
  - Reserved decision numbers: D22 = 004, D23 = 005, D24 = 006, D25 = General Data, D26 = PM Milestones, D27 = Generators, D28 = Production, D29 = Checklist, D30 = Team, D31 = Planning, D32 = Grid Operator, D33 = Revenues, D34 = Finance.
- **Admin entry points** are role-gated, with a local-run bypass (`app/adminAccess.ts`).

## State at hand-off

- **Done and connected:** 001 Default Checklists (D18), 002 CAPEX Accounts (D19), 003 Milestones (D21).
- **Shared pieces built:**
  - `data/executePlan.ts` and `data/usePlanWrite.ts`;
  - `components/WriteFeedback.tsx` and `components/ReorderList.tsx`;
  - `app/useCurrentUser.ts`;
  - the CommandBar icons NumberedList, ActivateOrders and DeactivateOrders.
- **Tables registered:** 4 more (42 in total), for 001.
- **Done and connected:** 004 Admin Gates Approvals (D22).
  - Its targeted tests pass 97/97.
  - It added a shared `components/PeoplePicker.tsx` and `ES.aadUsers`.
  - **Product-owner answers (D22, recorded):** keep both Reset Gate and Save as the canvas has them; keep the non-Wind/PV banner; no Dataverse privilege planned. The people search still has to be tested live; it is item 1 of the smoke test below.
- **Done and connected:** 005 Admin Contract (D23).
  - Registered `vsb_bopcontractsstandardassumptiondevcocosts` (43 tables).
  - Read the two BoP plugins out of the solution zip's DLLs:
    - the DevCo-cost plugin sets `vsb_rootcapexaccount`;
    - the contract-delete plugin removes the template rows and the project rows built from the contract.
  - Shared additions:
    - `createdRowRef(n)` in `writePlan`/`executePlan`;
    - `FormPanel closeTestId`;
    - the `technologies` option on `buildCountryPicker`;
    - `CHOICE_ADMIN.bopContractTypes` corrected.
  - **Product-owner answers (D23, recorded):** keep the canvas delete wording; each rail follows its own canvas technologies.
- **Done and connected:** 006 Admin Cost (D24). **All six Admin screens are now connected.**
  - No table registered (all ten already were).
  - Corrected `ES.currencies` → `transactioncurrencies`, `CHOICE_ADMIN.costPaidType` and `CHOICE_ADMIN.thresholdType`.
  - Read the CAPEX-assumption deletion plugin: it removes the project CAPEX contracts and costs.
  - The screen is split into `Screen.tsx`, `DevexSection.tsx`, `OpexSection.tsx` and `styles.ts`.
  - The jsdom dialog lookups in the 004/005/006 screen tests now use `hidden: true`, which fixes the flaky "Unable to find button" failures.

- **Gate after 006:**
  - `.power` check (43 tables), typecheck, lint, label and canvas gates (0 issues) all clean; build OK.
  - Full suite 2,585 / 2,588. The 3 failures were load timeouts (001 UT-ADCHK-908, 002 UT-ADCAPEX-906, 006 UT-ADCOST-907).
  - 907 got a 30 s per-test limit; all three files then pass (154 / 154).
  - The global `testTimeout` raise still awaits the product owner's answer.
- **Gate after 005:** 43 tables, 0 problems; typecheck, lint, label and canvas gates clean; build OK; 2,602 tests.
  - No single full run was green. The two `npm run verify` runs each failed a few slow UI tests, then `--maxWorkers=2` failed one.
  - The failing test changed every run, and each one passes on its own.
  - Cause: 5 s timeouts and dialogs rendering slowly under load (OneDrive). 001–004 and Project Overview tests failed this way too.
  - Two dialog lookups were made to wait (`findByRole`).
  - Option, not yet approved: raise `testTimeout` in the Vitest config.

## Live smoke test owed (tell the product owner when it is time)

Run `npm run dev` + `pac code run --appUrl http://localhost:3000` and open the printed `apps.powerapps.com/.../app/local?...` URL:
1. **Admin Gates Approvals (D22, product owner asked to be told):** open Edit Approvers, type a name in each people picker, check the suggestions; open a gate that has a Portfolio Manager and check the name shows.
2. **Admin Contract (D23):**
   - Add a Development contract with one account, check it appears expanded, then reload.
   - Edit it: release the account and claim another.
   - Delete it.
   - Check that RootCapexAccount was filled in by the plugin (the card group heading shows a name).
3. **Admin Cost (D24):**
   - DEVEX/CAPEX: Add Cost, then edit it (change the subaccount), then delete it.
   - Land Lease: Add Contract Type, then Add Period, then edit Period 1 and check the cascade on Period 2, then delete Period 2.
   - Check that the currency preset is EUR (PLN for Poland).
4. The earlier screens 001–003 (add / edit / delete, reload).
- **Full `npm run verify` after 004: GREEN** (exit 0).
  - 42 tables, 0 problems.
  - Typecheck and lint clean.
  - Label gates: 0 missing, 0 duplicates. Canvas identities: 0.
  - **86 test files, 2,587 tests passed, 0 failed.**
  - Build OK.
- On this OneDrive checkout, tests that run longer than 5 s under heavy load can occasionally time out; `npx vitest run --maxWorkers=2` confirms.
- **Dev servers** (`npm run dev` and `pac code run`) may still be running from the old session; stop them before you restart.
- **Nothing is committed.** There is no git repo.

## Next

Admin is complete. The product owner should run the live smoke test above now (it covers all six Admin screens). Then start the PM screens with General Data (D25), using the brief. Note: creating a project and anything that starts an approval flow stay disabled (brief rule 4). Tip: when a screen's writes hit a plugin step, read that DLL's strings from `…WorkDev1/Existing Solution/VSBCloud (3).zip` → `PluginAssemblies/`, as done for 005. After each one, run `npm run verify`, update the gap-analysis status row, and report blockers to the product owner.

## 19 Oct (later): Project Overview UI pass (UI only, no behaviour change)

The product owner reported the Overview looked "scattered". It was checked against the canvas YAML (`Project Main Screen.pa.yaml`) and the live screenshot `…/Project-Management-Energy-WorkDev1-updated-1.21.753.part2of3/Project-Management-Energy-WorkDev1/Existing Solution/UI Screenshots/Main Overview Screen.png` (22 reference screenshots live in that folder, not in this workspace).

Fixed in `features/pm/project-main/Screen.tsx` and `styles/canvas.css`:
- **Filter card:** the columns grew to a quarter each while every control stayed 232 px, so each pair sat at the left of its quarter with a wide gap after it. The controls now fill their column (canvas `Width: =Parent.Width-48`, funnel at `Parent.Width-35`).
- **Filter rows:** the first cell of each column is 56 px tall and the second 68 px, with its control 4 px lower (canvas `Y: =24` / `Y: =28`), so Status now lines up with Area and Capacity.
- "Select operator" no longer wraps onto two lines.
- The Capacity error now sits on the caption line (`lbl_…_Capacity_ErrorMessage`, `Y: =6`), not under the input.
- **Grid:** `canvas.css` striped the odd rows while the screen striped the even ones, so no row was white. Now one stripe (`themeLighter`), starting on the first row as on the screenshot. The selected row is `neutralLight`.
- **Column widths:** moved from `nth-child` CSS into a `COLUMN_WIDTH` table in the screen, about 1720 px fixed, as the live grid.
- Capacity and Project ID are right-aligned (cell and header) and Approval is centred (`ColHorizontalAlign`).
- **Spacing:** the page gap and padding are 4 px (canvas `LayoutGap`/`Padding`); the pager footer uses the canvas 10 px gaps.
- Removed the stray `> div:first-of-type` border, which landed on whichever child came first (sometimes the notice bar).

Not changed, by design: the canvas `columns_Items` also lists `vsb_totalcapacity` (captioned "Technology") and `loc_wMW` (Weighted Capacity), but the live grid shows neither, so neither is rendered. Remaining small differences from the screenshot:
- the approval state is a coloured dot, not the check/cross icon;
- the disabled filter funnels have no grey box;
- the Project Manager picker has a filled field, not an outlined one.

Gates: typecheck, lint, label and canvas gates clean; `project-main` + `ScreenRoutes` + `pcfCascade` tests 164/164. The full `npm run verify` has not been run yet. Nothing is committed.

## 20 Oct 2026: all PM screens redeveloped (D25–D34)

- **Done and connected (reads and writes):** General Data (D25), Milestones (D26), Generators (D27), Production (D28), Checklist (D29), Team (D30), Planning (D31), Grid Operator (D32), Revenues (D33) and Finance (D34). All 16 Admin/PM screens are now done; see the status table in `gap-analysis/README.md`.
- **Tables:** 81 registered (43 → 81), each added one at a time with the primaryKey count checked.
- **D25 answers applied:**
  - the shareholder typo is corrected;
  - option values are pinned to the generated enums;
  - the tax fallback runs for Germany only;
  - the map is parked until an Azure Maps key is available.
- **Two screens write on visit, as the canvas does:**
  - Checklist creates trackings and copies the default checklists;
  - Planning creates the planning row and the acquisition rows.

  Finance also sets Debt Financing on visit while the column is blank.
- **Open questions:** all of them are in `gap-analysis/PM-OPEN-QUESTIONS-2026-10-20.md`.
- **Next:**
  1. The PO answers the questions.
  2. Apply the answers.
  3. Live smoke test of every PM screen with `pac code run`.
  4. PO approval, then commit.
- **Note:** CONVENTIONS "Before pushing to DEV" still says `check:power` must report 38 registered; it is now 81.
- **Nothing is committed.**

## 20 Oct 2026 (later): PO answers applied, plus the cross-screen sweep (D35)

- **PO answers:** all are in `gap-analysis/PM-OPEN-QUESTIONS-2026-10-20.md` (bottom). The "build" items are implemented:
  - X1 leave guard, X4 test timeout 30 s, X5 Overview visuals;
  - M4 foundation cost always added (Milestones and Generators, via `domain/foundationCost.ts`);
  - G2, G6/G7 (Replace + PV back-fill, ported from the 1.21.753 gap register and skeleton), G9;
  - L3, L4, R1, R2, V6.
- **New rule (PO):** CONVENTIONS rule 20, standard-assumption values in blue and italic. The shared `useStandardValueClass()` and a `standard` prop on the field primitives implement it. The audit is in `app-docs/STANDARD-ASSUMPTION-STYLING-AUDIT.md`.
- **Router:** now `createHashRouter` + `RouterProvider`, so the leave guard (`useBlocker`) works. Tests use `src/test/DataMemoryRouter.tsx`. This needs a live smoke test: deep links, the Edit Costs tabs, the rail and logo, and the back button.
- **Full `npm run verify`:** green — 89 files, 2,884 tests, 81 tables.
- **Open questions:** the D27 Generators follow-ups (6) and the D35 sweep (9). Nothing is committed.

## 20 Oct 2026 (later): Add/Edit Project, scrolling, UI layout pass

- **Add Project** creates a draft project (D25, PO N2). **Edit Project** navigates in place to `/project/general?projectId=` (PO N3); the old new-tab link lost its route. PM routes read `projectId` from the route only.
- **Scrolling:** PM and Admin routes now scroll the content area (`AppShell contentScrolls`, `.canvas-main-scroll`). Before, `canvas.css` clipped everything below the fold.
- **UI layout pass** of all ten PM screens from the canvas containers; see the "UI layout pass" bullets in D25–D34. Before/after shots are in the session scratchpad `preview-layout{A,B,C}/shots`.
- **Shared style:** `standardValue.ts` now outranks screen colour overrides, which fixes Finance's read-only tiles hiding the standard blue.
- **Follow-ups (tech debt, no PO decision needed):**
  - `FormPanel` has no custom width; panels use the nearest presets (canvas 360 / 700 / 760 / 1040).
  - `TextAreaField` cannot put its counter on the label row.
  - `general-data/pmLayout.ts` and the repeated dark lock box / bordered add-button styles should move to `@/components`.
  - The command bar wraps at 1366 on Generators.
- **Full `npm run verify`:** green — 89 files, 2,888 tests. Nothing is committed.
- **Dev-server note:** editing `vite.config.ts` makes a running `npm run dev` re-bundle and hang; restart it.

## 20 Oct 2026 (later): canvas parity from PO screenshots

- **Edit Project:** opens a new tab of the same app; under dev that is the local play URL. It sends `pmScreen` and `projectId`; CONVENTIONS rule 12 is updated.
- **PM command bars:** on Generators, Checklist, Production and Team they now sit in the screen body. `CommandBar` supports sub-menus (`parentKey`, the canvas `ItemParentKey`). On Generators, Add Others is a drop-down, and its status chips are pills.
- **PM and Admin shell (D35 §5):**
  - a back arrow, plus a logo click (`img_cmp_Header_Button`), both going to `/projects`;
  - a 24 px project name and a status line;
  - in the rail: no hamburger, and "Collapse Menu" at the bottom.

  The Cost shell is unchanged.
- **Field skin (D25):** filled-darker inputs; View vs Disabled (`readOnly`); the counter on the label row; `*` before the label; `align="right"`; people chips inside `PeoplePicker`; Municipality as a combobox; the Shareholding table at the canvas widths; a three-column stamp; the "General" band sticky.
- **Follow-up:** the PM screens' local Dropdowns (Planning `ChoiceField` and others) should adopt `useFieldControlClass` + `FIELD_APPEARANCE`.
- **Full verify:** green — 90 files, 2,905 tests. Nothing is committed.

## 20–21 Oct 2026: PO screenshot rounds, audits, zoom sweep (read this first in a new chat)

**State:** every PM screen (D25–D34) is redeveloped and connected. The last full `npm run verify` (21 Oct) is green: 92 files, 2,941 tests, 81 tables, build OK. **Nothing is committed and there is no git repo yet.** The PO's live smoke test and their approval are still owed before any commit.

**Done in this round** (details in `gap-analysis/PM-OPEN-QUESTIONS-2026-10-20.md`, decisions N4–N10, and in the D25–D35 entries of `02-OPEN-DECISIONS.md`):
- **Generators:** the command bar and icons match the canvas; Add Generator sits top-left; the turbine grid has "Generator Name" and "Actions" headers (N4).
- **Production:** pill chips and card styling.
  - **Edit panel (N10):** with one toggle on it is 680 px (`fieldsAndSide`); with both, 1040 px (`threeColumn`, both new `FormPanel` sizes). The side columns always open to the RIGHT. The Negative Prices rows are fluid, so the reset icons stay clear of the scroll bar.
- **Cluster Check List:** a separate `ProjectStates` component; only the top-right refresh remains; the table minimum is 1060 px.
- **Planning:** the permit radios come before the date.
- **Revenue and Financing:** the layout follows the screenshots. Validation audits: `REVENUES-CONTRACT-VALIDATION-AUDIT.md` (93 formulas) and `FINANCE-VALIDATION-AUDIT.md` (134 formulas).
- **Command-row alignment:** a shared `components/commandRow.ts`, used everywhere.
- **Every right panel:**
  - the ✕ stays white with a hover highlight (N5);
  - no white strip on the left of the blue header (N9, `canvas.css`).
- **Shell:** the user badge sits inside the header on every screen (N7). Its margins are in the Griffel `userPill` style; Fluent drops plain class names passed with Griffel ones.
- **General Data:**
  - the grey "General" band is removed (DIVERGENCE, N6);
  - Placement uses the 300 px cells (N8);
  - the shared `fieldSkin.ts` `field` style has `alignContent: start`, so drop-downs line up with text inputs in every form.
- **Zoom sweep at 75–125 %** on 1920 and 1366 px screens: all PM screens pass, and so do the panels checked. The method is in the PM-OPEN-QUESTIONS "Zoom sweep" note: a scratchpad harness plus a headless Chrome probe.
- **Workspace:** the nested `WorkDev2/Project-Management-Energy-WorkDev1/` is deleted (PO approved). 7 OneDrive-locked files may remain; delete them in Explorer.

**Waiting on the PO:**
- **Z1:** Overview grid widths. Shrink Project Name / Project Manager to fit 1366 px at 100 %, or keep the canvas 1719 px? Recommended: shrink.
- G10–G15, S1–S10, S12, S13, V7–V9.
- P1 (parked; note the PV/WTG uncertainty validation differs).
- Fabric-dependent items stay untouched (F7, see memory).

**Running locally:** the 19 Oct `npm run dev` / `pac code run` processes (PIDs 30168, 36948) may still be alive and stale. Restart both from `ProjectCosts-CodeApp/`, then open `https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local?_localAppUrl=http%3A%2F%2Flocalhost%3A3000%2F&_localConnectionUrl=http%3A%2F%2Flocalhost%3A8080%2F`, or the URL `pac` prints.

**Known flakiness:** on the OneDrive checkout, a full verify sometimes times out on 1–2 test files, for example UT-ADCHK-908 and UT-GEN-903. Re-run those files alone (`npx vitest run <file> --maxWorkers=2`). They pass.

**Next:** apply the PO's answers to Z1 and the open questions as they arrive. After the PO smoke test and approval: `git init`, then commit, then the "Before pushing to DEV" checklist. Also update CONVENTIONS: its `check:power` count still says 38; it is 81.

## 22 Oct 2026: admin screens replaced, then canvas traceability restored

- **The workspace is now a git repo** (`master`), so the "nothing is committed / no git repo" lines above are history. Commit `864056b` replaced the six admin screens from branch RounakDev1; open points are in `09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md`, and the decisions are in D36.
- **Uncommitted, awaiting approval:**
  - D36 written;
  - canvas ids, verbatim citations and markers restored on all six admin screens (D36 §6);
  - `check-canvas-identities.mjs` tightened (it now reads `closeTestId` / `toggleTestId`);
  - the test-only checklist-approval repository methods removed;
  - `ReorderList` unexported;
  - the stale instruction docs updated (`check:power` is now 81 in CONVENTIONS).
- **Product owner:** decide the D36 §4 behaviours, the D36 §5 Apply bars, and the six contradictions in D36 §6.
- **Next:** shared-component test-id props (D36 §6), restore the dropped `…CanvasParity` twins, the admin live smoke test, then approval and commit.
- **Note:** "Application Insights" does not exist in this app. The canvas apps ship with `appinsightserrortracing: false` and no instrumentation key, so there is nothing to port.
