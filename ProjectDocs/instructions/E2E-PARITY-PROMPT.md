# E2E parity prompt: Playwright, Canvas app vs Code app

This is the standing prompt for the Playwright suite that tests the Canvas apps and the Code app
(`ProjectCosts-CodeApp/`) side by side. It is run on request, before commits (see below).

## Standing rule: ask before every commit

Whoever works in this folder (a person or Claude Code) must, **before any commit or merge**, ask the
user: *"Do you want to run the E2E parity suite (Canvas vs Code app) for the screens in this change
first?"*

- Ask after `npm run verify` is green and the improvements log (file 13) is current, and before
  asking for commit approval.
- Do not run it silently: it needs a signed-in browser, live `VSBCloud_Dev` data and the inputs below.
- Do not skip the question because the change looks small. If the user says "skip", record that in the
  commit approval request and go on.
- Scope the run to the screens the change touches. A full run is only for a release or when asked.
- A failing parity row is reported to the user, not fixed silently, and not a reason to commit.

## The apps being compared (background from the product owner, 29 Oct 2026)

Two Canvas apps make up the product; the code app replaces both in one app.

| Canvas app | What it holds | Opened how |
|---|---|---|
| **Project Management app** (primary) | The Project Management screens AND the Application Settings (admin) screens in the same app. The Project Overview is the landing screen | directly |
| **Cost app** | The five cost screens (CAPEX/DEVEX, Add Cost from Table, OPEX, Land Lease, Contracts) | from the PM app: with a project selected, **Edit Costs** launches the Cost app with the project's GUID in the URL (`projectId=<guid>`), and the Cost app opens that project's data |

In the PM app, selecting a project enables **Edit Project** (opens the PM screens, General tab first, with the other PM navigation) and **Edit Costs**.
In the code app one app serves all of it: `Edit Costs` and `Edit Project` open a new tab of the same app with launch parameters
(`costScreen` / `pmScreen` plus `projectId`, CONVENTIONS rule 12).

**Canvas play links in VSBCloud_Dev** (from the product owner, 29 Oct 2026; also the defaults in `playwright.config.ts`):

- Project Management app (with Application Settings): `https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/67054ad6-e70b-4738-a3e6-125384fe2b4b?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1`
- Cost app: `https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/a/ab3554c5-a4fc-4436-8825-8a84484ec5ea?tenantId=e3bab30b-3902-4ce6-b575-f005f94c78c1`; add `&projectId=<guid>` to open a project, which is what **Edit Costs** does.

**Do not mix up the ids.** `807a2fba-665c-40f3-b158-ffe822aa7da4` is the CODE app (`power.config.json`), in VSBCloud_Dev
(`be41add6-6f60-ebb0-9c73-2480d6bc615d`). A link with that id, or with a `#/costs/...` route, is the deployed code app, not a Canvas app.
The Canvas apps have their own ids in each environment (the ids in the solution export do not exist in VSBCloud_Dev). For a comparison
run, get the two Canvas play links from the owner: one for the Project Management app, one for a Cost app opened for a named project.
Note: the deployed code app uses the same player frame name as a Canvas app, so the suite tells them apart by `data-control-name`
(Canvas) and `data-testid` (code app), never by the frame.

## Run order (standing instruction, 29 Oct 2026)

**Always run the Canvas app first, then the code app.** The canvas run is the reference: its results (texts, states, sizes, messages,
values) are recorded first, and the code app run is then compared with them. Do not run the code app first and compare it with the YAML
alone. A rule-map row is only "Matched" once the canvas browser run has confirmed it. Order of work for a screen: rule map from the
YAML, Canvas run, code app run, comparison, report.

## Inputs the user supplies each time (ask for what is missing)

1. Role(s) / test account(s) to use (full access, read-only, other).
2. The screen(s) or feature(s) in scope.
3. The existing **Canvas app URL** (Project Management and/or Project Costs).
4. The **Code app URL**: the `apps.powerapps.com/.../app/local?...` URL from `pac code run`
   (never bare `localhost:3000`), plus the `localhost:3000` address of `npm run dev`.
5. The test project in `VSBCloud_Dev` to use.

## THE PROMPT

You are a senior QA automation engineer. Build a Playwright (TypeScript) suite that tests my Canvas
app thoroughly. Then run the same scenarios on my Code app and report every difference.

### 1. Ground rules
1. Work in `ProjectCosts-CodeApp/e2e/`. Reports and docs go in `ProjectDocs/`.
2. Read first: `AGENT-GUIDE.md`, `CONVENTIONS.md`, `TESTING-AND-HARNESS.md`, and the canvas YAML of the screen under test.
3. Use `VSBCloud_Dev` only. Test data gets a `PW-` prefix and is deleted afterwards, even when the test fails.
4. Do not commit, merge or push. Do not change app code to make a test pass. Report app problems as findings.
5. Do not touch anything that depends on Fabric SQL. Mark it "not tested (Fabric)".

### 2. Setup
1. `playwright.config.ts` has two projects, `canvas` and `codeapp`. Each takes its URL from an environment variable.
2. For the Code app, use the `apps.powerapps.com/.../app/local?...` URL that `pac code run` prints. Never use bare `localhost:3000`.
3. Sign in once in a `global-setup.ts` (MFA done by hand) and save `storageState.json`. Keep it git-ignored and store no passwords.
4. Add one helper for the canvas iframe. Add npm scripts `e2e:canvas`, `e2e:codeapp`, `e2e:compare` and `e2e:report`.

### 3. Locators, so one test runs on both apps
1. `byControl(name)` uses `data-testid` in the Code app and the control name or accessible label in the Canvas app.
2. Do not use CSS classes, XPath or changeable text.
3. Wait on conditions, never fixed sleeps. Add `waitForCanvasReady()`.

### 4. Test layers, in order
1. Smoke: the screen opens, with no console errors and no failed calls.
2. Navigation: menu items, deep links (`projectId`, `costScreen`, `pmScreen`), back and refresh.
3. Functional, from the live canvas formulas (skip commented-out ones):
   - loads and filters
   - hidden and disabled states
   - `Notify` messages
   - create, edit, delete and save, with a reload to confirm the change persisted
4. Validation and negative cases: empty fields, bad formats, boundaries, duplicates, double-click Save.
5. Data integrity: read each row back from Dataverse and check the columns, write order and Owning Business Unit.
6. Permissions: at least two roles.
7. Accessibility: `aria-label` and `data-testid` on every control, Tab order, and axe.
8. Visual parity at 75%, 100% and 125% zoom.
9. Hover hints compared with the canvas `Tooltip`.

### 5. Parity comparison
1. Write each scenario once as data in `e2e/scenarios/<screen>.ts` and run it on both projects.
2. Compare these areas:
   - text: exact match
   - controls: set, order and state
   - data: rows, counts, order and totals
   - behaviour
   - style: font, colour and spacing from `getComputedStyle`
   - layout
   - load time
3. Use `toHaveScreenshot` with a stated tolerance, masking dates and user names.
4. Classify every difference as one of these:
   - Defect.
   - Intentional improvement.
   - Canvas defect reproduced.
   - Unknown, needs a product owner decision.
5. Read `13-CODE-APP-IMPROVEMENTS-OVER-CANVAS.md` and `02-OPEN-DECISIONS.md` first, so known differences are not reported as new.

### 5a. Business logic and validation: Power Fx vs Code App TypeScript
Do this before the browser scenarios of each screen.
1. Build a rule map per screen, `e2e/rulemap/<screen>.md`. Each row has:
   - the canvas control and property
   - the live Power Fx, quoted verbatim
   - the code location (`rules.ts` function and `MSG` key)
   - the Vitest id and the Playwright id
   - the status
2. Read the formulas from `_extracted/msapp/<app>/Src/<Screen>.pa.yaml` and its `Components/`. Cover:
   - `OnSelect`, `OnChange`, `OnVisible` and `Notify` messages
   - `Visible`, `DisplayMode` and `ItemEnabled` gates (click-time validation is separate from the gate)
   - `Items` filters and sort order
   - calculations, dates and rounding
   - `Patch` and `Remove` payloads
   - hidden buttons run through `Select()`, timers, `fn_*` components
   - the flows and plugins the screen triggers (`04-flow-inventory.md`)
3. Mark each rule as one of these:
   - Matched.
   - Missing in code (a defect).
   - Extra in code (for decision).
   - Divergent. It needs a `SOURCE DEFECT` or `DIVERGENCE` marker, a `…CanvasParity` twin, a test and a decision entry. Otherwise it is a defect.
4. Prove each rule two ways:
   - A table test that feeds the same inputs to the code function and to the canvas, then compares outputs and messages. Inputs include valid, invalid, empty, boundary, null, negative and date edges.
   - A browser test that drives both apps with the same input.
5. Where the UI cannot drive a canvas rule, work out the expected value by hand from the YAML and say so.
6. Report canvas formulas with no code, and code rules with no canvas source.
7. Do not fix mismatches silently. List them and I decide.

### 6. Screens, in order
1. Admin and Application Settings.
2. Project Management, 11 screens.
3. Project Costs, 5 screens.

On a first run, do one screen end to end (rule map, then scenarios, then report) and show me before continuing.

### 7. Reporting
1. An HTML report plus `ProjectDocs/app-docs/E2E-PARITY-REPORT-<date>.md`.
2. The report has:
   - a per-screen summary
   - the classified difference list with screenshot pairs
   - coverage
   - the rule map counts (Matched / Missing / Extra / Divergent)
3. Keep traces and videos only for failures. Report a test that needs a retry as flaky, not green.

### 8. Quality bar
1. Tests are independent of each other.
2. Test ids are `E2E-<SCREEN>-NNN`.
3. Run the suite three times and show it is stable.
4. Add every improvement or finding to file 13.

### 9. Before you start, tell me
1. Which test accounts and roles you need.
2. Which test project to use in `VSBCloud_Dev`.
3. What you cannot automate (MFA, PCF grids, Fabric screens) and your workaround.
