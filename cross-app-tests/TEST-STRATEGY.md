# VSBCloud Cross-App Regression Testing — Strategy & Implementation Plan

| | |
|---|---|
| **Document owner** | Engineering (migration workstream) |
| **Status** | Draft for review |
| **Version** | 1.0 |
| **Applies to** | `ProjectCosts-CodeApp/app/` vs. the VSBCloud Project Management and Project Costs canvas apps, in `VSBCloud_Dev` |
| **Supersedes** | Nothing — this is the first formal test strategy for cross-app parity. It extends, and does not replace, the existing unit/type/build gates documented in `../.claude/TESTING-AND-HARNESS.md` |
| **Tooling constraint** | Open-source `@playwright/test` only. No Microsoft Playwright Testing (paid cloud grid) and no third-party visual-diff SaaS (Percy/Applitools/Chromatic) — see §6 |

---

## 1. Purpose and scope

### 1.1 Purpose
Canvas-to-code-app migration carries a specific, recurring risk: a screen that passes every
unit test and type check can still **behave differently from the canvas app it replaces**,
because unit tests exercise the ported rule in isolation, not the live rendered behaviour
against real data. This strategy establishes an automated, repeatable way to open the real
canvas app and the real code app side by side, against the same live Dataverse data, and
prove they agree — or document exactly where and why they're allowed to differ.

### 1.2 In scope
- Functional, smoke, UI/UX (label-fidelity), typography/visual-consistency, numeric
  aggregation, and regression testing, as defined in §5.
- Cross-app comparison between the canvas apps and `ProjectCosts-CodeApp/app/` for every
  screen that exists in both today (Project Overview, CAPEX/DEVEX, Add Cost from Table, OPEX,
  Land Lease, Contracts).
- Canvas-only smoke/functional coverage for the 17 Project Management canvas screens that
  have no code-app counterpart yet, as a safety net ahead of their eventual migration.

### 1.3 Out of scope (for this version)
- CI/CD integration — explicitly deferred; this suite runs locally, on demand, until the
  team revisits that decision (§13).
- Load/performance testing, accessibility auditing, and security/penetration testing — each
  deserves its own strategy and is not folded into this one to keep responsibilities clear.
- Replacing or weakening the existing unit/type/build gates in `app/` — this is an **addition**
  above them, not a substitute.

### 1.4 Relationship to existing project governance
This document assumes and builds on `../.claude/`:
- `PROJECT-MAP.md` — which doc layer is ground truth for current app state.
- `CONVENTIONS.md` — label-fidelity, divergence-marking, and other rules this test suite
  enforces mechanically.
- `MIGRATION-STRATEGY.md` — how a screen gets ported; this suite is the verification step
  §9 of that document gestures at ("verify against real Dataverse... click through the
  screen").
- `KNOWN-RISKS-AND-DECISIONS.md` — standing risks (non-transactional saves, canvas-parity
  deletion) that several test cases below exist specifically to guard.
- `TESTING-AND-HARNESS.md` — the reference nine-gate harness this suite is a concrete step
  toward (it implements the spirit of G-WALK and part of G-LABEL for this app, see §5).

---

## 2. Objectives and success criteria

| Objective | Success criterion |
|---|---|
| Catch cross-app behavioural drift before it reaches users | Every migrated screen has at least one passing functional parity test and one aggregation parity test before that screen is marked "done" in `docs/05-SCREEN-TRACKER.md` |
| Enforce label fidelity mechanically, not just by review | Every screen's command bar, panel titles, and key validation messages have an automated text-match assertion against the canvas |
| Make "is this still true" answerable in minutes, not a manual walkthrough | `npx playwright test` produces a single consolidated report inside the suite's own runtime, no manual screen-by-screen comparison required for a routine regression pass |
| Keep the suite trustworthy, not noisy | Flaky-test rate stays low enough that a red run is treated as a real signal (see §12.4 for the quarantine process that keeps this true) |
| Zero additional licensing cost | The entire suite runs on `@playwright/test`'s free, local capabilities — no paid service is a dependency of any test passing |

---

## 3. Roles and responsibilities (RACI)

| Activity | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Author a `test-cases/*.md` case from a canvas walkthrough | QA / feature developer doing the port | Tech lead | Product owner (for expected-behaviour disputes) | Team |
| Implement the matching `.spec.ts` | Developer | Tech lead | Case author | Team |
| Review & merge a new/changed spec | Peer reviewer (not the author) | Tech lead | — | Team |
| Promote a run's results to baseline | Tech lead or designated QA owner | Tech lead | Case author | Team |
| Refresh `storageState` auth files | Whoever has an active, licensed session | — | — | Team (if it blocks a run) |
| Own the Dataverse test-data posture (§8) | Tech lead | Product owner | Dataverse admin | Team |
| Triage a flaky test (§12.4) | Developer who hits it first | Tech lead | — | Team |

No single person should be the only one who can run or interpret this suite — the whole
point of putting it in the shared repo is that any teammate, in a fresh session, can execute
it (per the original request that started this workstream).

---

## 4. Definitions

- **Parity test** — a test that opens both the canvas app and the code app for the same
  underlying data and asserts they produce the same observable result. Only meaningful for
  screens that exist in both.
- **Canvas-only test** — smoke/functional coverage with no code-app counterpart to compare
  against yet (the 17 unmigrated PM screens).
- **Baseline** — the last human-confirmed-correct recorded result for a test case, committed
  to the repo. A baseline is a ticket that something was once verified correct, not a
  permanent exemption — see §11.3.
- **Divergence** — a *documented, approved* difference between canvas and code-app behaviour
  (per `.claude/CONVENTIONS.md` rule 8). A parity test must be able to express "expected to
  differ, and here's why," not just "match" or "fail."
- **Test project** — the Dataverse project a test run is pinned against for the duration of
  that run, resolved dynamically by name (§9), not hardcoded.

---

## 5. Test types, definitions, and acceptance criteria

| Type | Definition | Technique | Pass/fail rule |
|---|---|---|---|
| **Smoke** | The screen loads in both apps, renders its expected heading/nav, zero console errors, zero error boundaries | `page.goto()` + a stable-selector assertion + a registered `console`/`pageerror` listener that fails the test on any entry | Fail on any console error, page error, or missing landmark element |
| **Functional** | A user action produces the same end state in both apps | Drive the action in canvas, read the resulting value; drive the equivalent action in the code app; compare | Fail on any value mismatch not covered by a documented divergence |
| **UI/UX (label fidelity)** | Command bar entries, panel titles, field labels, and validation/confirmation message text match the canvas verbatim | DOM text assertions (`getByRole`, `getByText`, `toHaveText`) — not pixel comparison | Fail on any text mismatch; a corrected typo (per CONVENTIONS rule 7c) is the one allowed exception, and must cite the correction in the test case |
| **Typography/visual consistency** | Computed font-family, size, weight, and line-height of corresponding elements agree between apps, within a documented tolerance | `page.evaluate(() => getComputedStyle(el))` on both sides, structured-data comparison | Fail outside tolerance (see §5.1); this is **not** pixel screenshot diffing cross-app — canvas and Fluent v9 will never be pixel-identical and that is not the target |
| **Aggregation** | Totals/sums computed by canvas formulas match the code app's `rules.ts` output for the same data | Read + numerically parse both rendered totals (reusing `src/domain/numeric.ts` parsing rules), compare as numbers, not strings | Fail on any numeric mismatch beyond floating-point rounding tolerance (2 decimal places, currency-scale) |
| **Regression** | Any of the above, re-run on demand, diffed against the last approved baseline | JSON result per test case, diffed against `reporting/baseline/<TC-ID>.json` | Fail on result change from baseline; flag (not fail) on a result that still satisfies its pass rule but differs from baseline, for human review |

### 5.1 Typography tolerance
Font-family comparison is exact-match on the resolved family name. Font-size and line-height
tolerance is **±1px**, to absorb browser subpixel rounding — not to mask a real mismatch.
Font-weight is exact-match. Any tolerance change must be a reviewed decision, not a quiet
edit to make a failing test pass (same principle as "never loosen a gate to turn it green,"
already established for the unit-test gates in `.claude/TESTING-AND-HARNESS.md`).

### 5.2 How this maps onto the reference nine-gate harness
This suite is this app's first concrete implementation of **G-WALK** (a scripted walk that
catches what unit tests cannot, per `VSBCloud-Harness-Plan.md` §6.2) and a partial, automated
**G-LABEL** (label-fidelity check, currently review-only per `.claude/TESTING-AND-HARNESS.md`).
It does not implement G-MATRIX, G-OWN, or G-SEC — those remain separate workstreams.

---

## 6. Tooling and licensing compliance statement

| Component | Tool | License | Notes |
|---|---|---|---|
| Test runner | `@playwright/test` | Apache 2.0, free | Core dependency |
| Browsers | Chromium, Firefox, WebKit (Playwright-managed) | Free, bundled via `npx playwright install` | No paid browser farm |
| Visual diff (code-app-only regression, not cross-app) | Playwright's built-in `toHaveScreenshot()` | Included in `@playwright/test`, free | Used sparingly — see §5, not for cross-app comparison |
| Reporting | Playwright's built-in HTML reporter + a custom `generate-report.ts` | Free | No paid dashboard/reporting SaaS |
| Execution | Local developer machines, on demand | N/A | No Microsoft Playwright Testing subscription, no hosted CI minutes consumed (§13) |

**Explicitly excluded, and why**: Microsoft Playwright Testing (paid, cloud-scaled
parallelization — not needed at this suite's size), Percy/Applitools/Chromatic (paid visual
regression SaaS — their value proposition is cross-platform/cross-browser pixel diffing,
which this strategy deliberately avoids for cross-app comparison per §5's definition).

---

## 7. Architecture

```
cross-app-tests/
  TEST-STRATEGY.md                      # this document
  test-cases/                            # human-authored specs of WHAT to test
    overview/TC-OV-00x-*.md
    capex-costs/TC-CAPEX-00x-*.md
    add-costs-from-table/TC-ACFT-00x-*.md
    opex-costs/TC-OPEX-00x-*.md
    land-lease/TC-LAND-00x-*.md
    contracts/TC-CONTR-00x-*.md
    pm-canvas-only/TC-PM-00x-*.md         # the 17 unmigrated screens, smoke/functional only
  automation/                            # the Playwright project
    playwright.config.ts
    package.json
    tsconfig.json
    .auth/                               # gitignored — storageState files, live session tokens
    fixtures/
      cross-app.fixture.ts               # resolves the test project, builds all 3 target URLs
      test-project.ts                    # dynamic project resolution (§9)
      canvas-urls.ts                     # deep-link URL builders (§9)
    pages/
      canvas/<Screen>.page.ts            # Page Object Models, canvas side
      codeapp/<Screen>.page.ts           # Page Object Models, code-app side
    specs/
      <area>/<area>.spec.ts              # implements the matching test-cases/*.md
    reporting/
      baseline/<TC-ID>.json              # committed — last approved result
      results/<TC-ID>.json               # gitignored — latest run's output
      generate-report.ts
      REGRESSION-REPORT.md               # generated, gitignored (regenerate on demand)
    scripts/
      capture-auth.ts                    # interactive, human-run login capture
      promote-baseline.ts                # confirm-gated results/ → baseline/ copy
  README.md                              # how to run this suite, auth refresh procedure
```

This mirrors, deliberately, the `rules.ts`/`Screen.tsx`/`hooks.ts` split already convention
in `app/`: **Page Objects are the "hooks" layer** (impure, drives the browser), **comparison
logic is pure and unit-testable on its own** (e.g. the numeric-tolerance comparator, the
font-tolerance comparator — these should have their own `*.test.ts` under Vitest, not only be
exercised indirectly through a slow Playwright run), and **specs are composition only**,
calling into Page Objects and comparators rather than embedding assertions inline everywhere.

---

## 8. Test data management policy

- **No dedicated test project required.** All apps share the same Dataverse tables; any
  existing project works as long as one run uses the same project across all app visits.
- **Default project for bootstrapping and ongoing baseline comparisons**: **"Revenue
  Individual Hedge Volume"**, overridable via `TEST_PROJECT_NAME` env var — no test hardcodes
  a GUID (§9).
- **Do-no-harm rule for write-path functional tests**: a test that creates/edits/deletes data
  must clean up after itself in a `test.afterEach`/`afterAll`, restoring the project to its
  prior state, *unless* the test case explicitly documents that it targets disposable
  data created by the test itself (e.g., a throwaway comment thread created and deleted in
  the same test). Never leave a mutation on a real, shared project that a colleague might be
  looking at.
- **No production data, ever.** This suite only targets `VSBCloud_Dev`. If a staging/UAT
  environment is introduced later, this strategy must be revisited before pointing the suite
  at it — the do-no-harm rule gets stricter, not the same, in a shared non-dev environment.
- **Data that changes under the suite is a known risk, not a blocker.** `VSBCloud_Dev` is a
  live, shared environment — someone else may edit the chosen project between a canvas read
  and a code-app read in the same test. §12.3 covers the mitigation (tight read-compare
  windows, retry-on-mismatch-then-reread policy) rather than pretending the risk away.

---

## 9. Dynamic project resolution and deep-linking

```ts
// automation/fixtures/test-project.ts
const DEFAULT_PROJECT_NAME = process.env.TEST_PROJECT_NAME ?? "Revenue Individual Hedge Volume";

export async function resolveTestProject(page: Page, name = DEFAULT_PROJECT_NAME) {
  await page.goto(CODEAPP_PROJECTS_URL);
  await page.getByPlaceholder(/Search for Project Name/).fill(name);
  await page.getByText(name, { exact: false }).first().click();
  const projectId = new URL(page.url()).searchParams.get("projectId")
    ?? extractFromHash(page.url());
  if (!projectId) throw new Error(`Could not resolve project "${name}" to a GUID`);
  return { projectId, name };
}
```

```ts
// automation/fixtures/canvas-urls.ts
const ENV = "be41add6-6f60-ebb0-9c73-2480d6bc615d";
const TENANT = "e3bab30b-3902-4ce6-b575-f005f94c78c1";

// PM canvas: Launch(gblPMAppURL, {projectid: GUID(...)}) — lowercase, confirmed from source.
export const canvasPmUrl = (projectId: string) =>
  `https://apps.powerapps.com/play/e/${ENV}/a/67054ad6-e70b-4738-a3e6-125384fe2b4b` +
  `?tenantId=${TENANT}&projectid=${projectId}`;

// Project Costs canvas: Launch(gblCostAppLaunchUrl, {projectId: GUID(...)}) — capital I.
export const canvasCostsUrl = (projectId: string) =>
  `https://apps.powerapps.com/play/e/${ENV}/a/ab3554c5-a4fc-4436-8825-8a84484ec5ea` +
  `?tenantId=${TENANT}&projectId=${projectId}`;
```

`hint`/`sourcetime` are Studio-generated, ephemeral cache/analytics tokens, deliberately
dropped — the code app's own `projectManagementAppUrl`/`analyticsAppUrl` in `app/src/app/
navigation.ts` build this exact bare shape already, without those two params.

**Must be verified in Phase 0, not assumed**: whether each canvas app's landing screen
actually honours its deep-link param to open straight into the project, or only opens the
project picker with the param available for a later `Param()` read. Document the confirmed
behaviour in `test-cases/overview/TC-OV-000-deep-link-behaviour.md` once checked — don't leave
it as tribal knowledge in a comment.

---

## 10. Authentication

Per the team's decision: a saved `storageState`, captured interactively once, reused by every
automated run.

```
automation/.auth/
  canvas-pm.json       # gitignored
  canvas-costs.json    # gitignored
  codeapp.json         # gitignored
```

```ts
// automation/scripts/capture-auth.ts — run manually, headed: npx playwright test
// scripts/capture-auth.ts --headed
test('capture canvas PM session', async ({ page, context }) => {
  await page.goto(CANVAS_PM_BASE_URL);
  await page.waitForURL(/apps\.powerapps\.com/, { timeout: 120_000 }); // human completes
                                                                         // Entra login + MFA
  await context.storageState({ path: 'automation/.auth/canvas-pm.json' });
});
```

**Security guidelines (non-negotiable):**
1. `.auth/*.json` is in `.gitignore` at the `cross-app-tests/` level — these files contain live
   session tokens. Verify this with `git check-ignore` before the first commit touching this
   folder, not after.
2. Never log, print, or paste the contents of a `storageState` file anywhere — not in a PR
   description, not in a chat, not in a bug report screenshot that happens to show a cookie
   value in devtools.
3. Refresh procedure: when a run fails with a login-page redirect instead of the expected
   screen, that's the practical signal a session expired — re-run `capture-auth.ts`
   interactively. Don't pre-guess an exact expiry and don't script around MFA to avoid this
   step; the interactive step *is* the control that keeps this suite out of unattended-login
   territory the team explicitly chose not to pursue (§13).
4. Whoever captures a session must hold only the access level needed to view/interact with
   the screens under test — not elevated admin credentials, even if convenient. If a test
   needs admin-level canvas access to reach a screen, that's a finding for `.claude/
   KNOWN-RISKS-AND-DECISIONS.md`, not a reason to capture an admin session by default.

---

## 11. Test case management

### 11.1 Authoring a test case
Every `test-cases/<area>/TC-<PREFIX>-<NNN>-<slug>.md` follows one template:

```markdown
# TC-CAPEX-001 — CAPEX grid grand total matches canvas

**Area**: CAPEX/DEVEX · **Type(s)**: Aggregation, Regression
**Canvas screen**: Project Costs app → Capex Costs Screen
**Code-app screen**: /costs/capex
**Author**: <name> · **Date authored**: <date> · **Last verified against canvas**: <date>

## Preconditions
- Resolved test project (default: "Revenue Individual Hedge Volume")
- Both apps' storageState valid

## Steps
1. ...
2. ...

## Expected result
...

## Known canvas-parity exceptions
None currently. / <cite the SOURCE DEFECT / DIVERGENCE and its CONVENTIONS rule 8 record>
```

### 11.2 Traceability
Test IDs follow the `TC-<PREFIX>-NNN` scheme, one id per case, mirroring the `UT-<SCREEN>-NNN`
convention already in `app/`'s unit tests (`.claude/CONVENTIONS.md` rule 13). A `.spec.ts`
must cite its `TC-ID` in a comment at the top of its `test()` block. `generate-report.ts`
(§14) flags any `TC-*.md` with no matching spec, and any spec citing a `TC-ID` that doesn't
exist in `test-cases/` — the same "coverage gap and dangling citation both fail loudly"
principle the reference harness's G-IDS applies to unit tests.

### 11.3 Baselines are a ticket, not an answer
A baseline records "this was correct as of this confirmed run" — it is never promoted
automatically by a passing test, and it is never edited to make a failing comparison pass
without the human review in §14 actually happening. This mirrors the explicit rule already
established for this workspace's other gate baselines (`.claude/KNOWN-RISKS-AND-DECISIONS.md`,
and the reference harness's own baseline philosophy).

### 11.4 Review and approval workflow
1. Author writes `test-cases/<area>/TC-*.md` from an actual canvas walkthrough — not from
   memory, not from a migration-plans spec alone (those describe formulas, not confirmed
   runtime rendering).
2. A second person reviews the case for accuracy against the canvas before implementation
   starts — catching a wrong expected result here is far cheaper than debugging a false
   failure later.
3. Developer implements the `.spec.ts`, runs it locally, attaches the first `results/<TC-ID>.json`
   to the PR.
4. Reviewer approves the PR only after confirming the spec actually implements what the
   `.md` case says — a spec that silently tests something easier than its case is worse than
   no spec.
5. Tech lead (or designated owner) promotes the first confirmed-correct result to
   `baseline/<TC-ID>.json` via `promote-baseline.ts`, which requires an explicit confirmation
   prompt — never an automatic step in CI or in the dev's own run.

---

## 12. Development guidelines for automation code

1. **TypeScript strict mode**, matching `app/`'s own `tsconfig.app.json` posture — no `any`,
   `noUnusedLocals`/`noUnusedParameters` on. Automation code gets the same rigor as product
   code; it is the thing that decides whether product code is correct.
2. **Page Object Model, not inline selectors in specs.** Every screen gets one `*.page.ts`
   per app-side, exposing semantic methods (`openCapexGrid()`, `readGrandTotal()`) rather than
   leaking `page.locator('.some-class')` into spec files. A selector change then costs one
   file edit, not a grep-and-replace across every spec touching that screen.
3. **Prefer role/text-based locators over CSS/XPath.** `getByRole`, `getByText`,
   `getByLabel` — both because they're more stable against markup churn and because, for the
   canvas side specifically, generated class names are not something to rely on at all
   (`.claude/` already notes canvas controls are often best targeted by accessible name).
4. **No fixed-duration waits.** `page.waitForTimeout(ms)` is disallowed in review except with
   an inline comment justifying why Playwright's auto-waiting genuinely cannot express the
   condition (rare, and should be rarer still after writing one). Use
   `expect(locator).toBeVisible()`/`toHaveText()` with Playwright's built-in retry-until-timeout
   behaviour instead.
5. **Pure comparison logic lives outside Playwright and gets its own unit tests.** The
   numeric-tolerance comparator, the font-tolerance comparator, the deep-link URL builders —
   all pure functions, all tested with Vitest the same way `app/`'s `rules.ts` is, before
   they're ever exercised through a slow end-to-end run. A bug in the comparator itself is
   indistinguishable from a real app bug if the comparator is never tested on its own.
6. **One test, one concern.** A test asserting both "the label matches" and "the total
   matches" and "no console error occurred" makes a failure ambiguous about which concern
   broke. Split by test type (§5), not by screen alone — a screen can have a smoke test, a
   functional test, a label-fidelity test, and an aggregation test as four separate `test()`
   blocks sharing one fixture setup.
7. **No test depends on another test's side effects or execution order.** Each test resolves
   its own project (§9) and reaches its own starting state; Playwright's parallel/`.only`/
   reordered execution must never break a test that was written assuming it runs after
   another.
8. **Code review checklist for any PR touching `cross-app-tests/`:**
   - [ ] Spec cites a `TC-ID` that exists in `test-cases/`
   - [ ] No fixed-duration wait without a justifying comment
   - [ ] No hardcoded project GUID or project name outside the documented default
   - [ ] No credential, token, or `storageState` content committed
   - [ ] New Page Object methods are semantic, not raw selectors leaked into the spec
   - [ ] Any new divergence/tolerance is cited against a `CONVENTIONS.md` rule 8 record or an
     entry in `.claude/KNOWN-RISKS-AND-DECISIONS.md`, not invented ad hoc in the test

---

## 13. Execution policy

**Current decision: local-only, on demand.** No GitHub Actions wiring, no scheduled runs. This
keeps the suite's cost at exactly zero against the stated licensing constraint and avoids the
unattended-login question (§10) until the team is ready to revisit it.

```bash
cd cross-app-tests/automation
npx playwright install                   # one-time, per machine
npx playwright test                      # full suite
npx playwright test --project=capex      # one area
TEST_PROJECT_NAME="Other Project" npx playwright test   # swap the dynamic test project
```

**Who runs it, and when**: the developer who just ported or touched a screen, before marking
it done in `docs/05-SCREEN-TRACKER.md`; anyone, at any point, as an on-demand sanity check
that the canvas app hasn't drifted out from under the code app. This suite is **advisory**,
not a merge-blocking gate, for as long as it stays local-only — a red run is a strong signal
to investigate, not an automatic PR rejection, because no CI enforces it yet. Revisit this
when/if Phase 3 (CI) is taken up.

### 13.1 Roadmap note (not executed now)
If the team later wants scheduled/unattended runs, the two blockers to resolve first are the
auth model (§10 — would need the dedicated-service-account path the team deliberately did not
choose) and a free-tier CI budget check (private-repo GitHub Actions minutes, or a
self-hosted runner). Both are real asks with real tradeoffs; neither should be backed into
quietly by, say, scripting around the login form "just for convenience."

---

## 14. Reporting

Each spec writes `reporting/results/<TC-ID>.json`:

```json
{
  "id": "TC-CAPEX-001",
  "ranAt": "2026-10-20T09:00:00Z",
  "status": "pass",
  "canvasValue": "128450.00",
  "codeAppValue": "128450.00",
  "diff": null
}
```

`generate-report.ts` compares every `results/*.json` against `baseline/<TC-ID>.json` and
produces `REGRESSION-REPORT.md`:

- Summary table — pass/fail/new-divergence counts per area.
- Every failure, canvas value vs. code-app value, side by side.
- Every result that changed from baseline even while still technically passing — silent
  drift is a finding, not a non-event.
- Coverage gaps — any `test-cases/*.md` with no implementing spec.
- Dangling citations — any spec citing a `TC-ID` not present in `test-cases/`.

**KPIs to track over time** (informal at this stage, not a dashboard requirement):
pass rate per area, count of quarantined/flaky tests (§12.4... see below, renumbered as
needed), time-to-fix for a genuine regression once this suite caught it, and growth of
coverage (test-case count vs. migrated-screen count) as new screens land.

### 14.1 Flaky-test handling
A test that fails intermittently with no code change is quarantined (tagged `@flaky`,
excluded from the default run, tracked in an issue) rather than deleted or silently retried
into green. A quarantined test still counts against coverage in the report — it shows as
"needs attention," not as passing. Nothing in this suite should ever be made to pass by
retrying until it does; a retry that masks real nondeterminism (§8's shared-environment risk)
hides exactly the class of bug cross-app testing exists to surface.

---

## 15. Defect and divergence feedback loop

A test failure that turns out to be a **real bug** (not a test defect) gets logged in
`ProjectCosts-CodeApp/docs/01-BUGS-FOUND.md`, following that file's existing format, with a
reference back to the `TC-ID` that caught it. A test failure that turns out to be an
**intended divergence not yet documented** gets an entry in
`ProjectCosts-CodeApp/docs/02-OPEN-DECISIONS.md` and a corresponding "known canvas-parity
exception" added to the test case — never a silent loosening of the assertion. This closes
the loop back into the project's existing governance rather than letting this suite become an
island with its own undocumented tribal knowledge.

---

## 16. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shared `VSBCloud_Dev` data changes between a canvas read and a code-app read in the same test | Medium | False failure | Tight read-compare windows; a mismatch triggers one re-read before failing, not a silent pass |
| `storageState` expires mid-session, failing every subsequent test | Medium | Suite-wide false failures | Login-redirect detection surfaces this as a specific, named failure reason, not a generic timeout; documented refresh procedure (§10) |
| Canvas app itself changes (someone edits a formula/label in Studio) | Low–Medium | Baseline/test-case goes stale without anyone noticing | Each `test-cases/*.md` carries a "last verified against canvas" date (§11.1); a periodic (manual, for now) re-walk is a standing agenda item, not automated yet |
| Suite becomes noisy/flaky and gets ignored | Medium | Loses all value as a signal | Quarantine process (§14.1); treat a rising flaky count as itself a finding, not background noise |
| Automation code itself has a bug in its comparison logic | Medium | False pass or false fail, indistinguishable from a real result without inspection | Comparators are pure and separately unit-tested (§12.5) |
| Scope creep into CI/unattended execution without revisiting the auth decision | Low | Security/governance gap | §13.1 names the two blockers explicitly so this can't happen by accident |

---

## 17. Rollout phases

1. **Phase 0 — scaffolding.** Folder structure above, `playwright.config.ts`, the
   `capture-auth.ts` script, the dynamic project resolver and canvas URL builders, and **one**
   end-to-end smoke test (`TC-OV-000`) proving frame-targeting, auth, and both canvas deep
   links actually work against the real hosted apps — including resolving whether each
   canvas app's landing screen honours its deep-link param (§9).
2. **Phase 1 — the five migrated screens + Overview.** Author and implement smoke,
   functional, aggregation, and label-fidelity cases for each. This is the highest-value
   phase: it's the only one that can catch an actual migration regression today.
3. **Phase 2 — canvas-only coverage for the 17 unmigrated PM screens.** Smoke + functional
   only (no parity assertion possible). Safety net for future migration work and an
   early-warning system if the canvas app changes underneath the team.
4. **Phase 3 — CI (deferred).** Not started until the team revisits the auth model per §13.1.

---

## 18. Open items requiring sign-off before Phase 0 starts

1. Confirm "Revenue Individual Hedge Volume" is safe to read, and — for any write-path
   functional test — safe to mutate with cleanup, or provide a safer default project.
2. Confirm who holds the role in §3 of "promote baseline" owner for this initial rollout.
3. Confirm the font-tolerance values in §5.1 (±1px) are acceptable, or specify different
   ones, before any typography test is authored against them.
