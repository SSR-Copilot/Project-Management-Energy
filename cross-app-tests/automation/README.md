# VSBCloud cross-app regression tests

Implements `../TEST-STRATEGY.md`. Read that document first — this file is just the "how to
run it" operational quick-reference.

## One-time setup

```bash
cd cross-app-tests/automation
npm install
npm run install:browsers      # downloads Playwright's own Chromium/Firefox/WebKit, free
npm run capture-auth          # see below — this is the one step that must be done by a human
```

`capture-auth` opens three headed browser windows in turn (canvas PM, canvas Costs, the code
app). In **each one**, log in by hand — including MFA — wait for the app to actually render,
then switch back to the terminal and press Enter when prompted. This saves the authenticated
session to `.auth/*.json` (gitignored — never commit these, they hold live session tokens).

**Re-run `capture-auth` whenever a test fails with a login redirect** instead of the expected
screen — that redirect is the practical signal a saved session expired. There is no fixed
expiry to watch for; the failure itself is the signal.

## Running the suite

```bash
npm test                                           # everything
npx playwright test specs/overview                 # one area
npx playwright test --ui                            # Playwright's own interactive UI mode
TEST_PROJECT_NAME="Some Other Project" npm test     # swap the dynamic test project (§9)
npm run report                                      # regenerate reporting/REGRESSION-REPORT.md
```

Default test project: **"Revenue Individual Hedge Volume"**. No test hardcodes a GUID —
every run resolves the name dynamically via the code app's own Project Overview search
(`fixtures/test-project.ts`).

## If a test fails with "No known Power Apps player iframe selector matched"

This means `fixtures/app-frame.ts`'s candidate list doesn't match what's actually rendered
for that app. Fix it once, for everyone:

1. With a captured session in place, run `npx playwright codegen <the play URL>`.
2. Use the element picker to click into the app content; codegen's generated locator will
   show you the real iframe selector.
3. Add it to `CANDIDATE_SELECTORS` in `fixtures/app-frame.ts`.
4. Record the finding in the relevant `test-cases/*.md` file (start with
   `test-cases/overview/TC-OV-000-deep-link-behaviour.md`).

## Promoting a baseline

Never automatic. After reviewing `reporting/REGRESSION-REPORT.md` and confirming a result is
correct:

```bash
npm run promote-baseline -- TC-CAPEX-001
npm run promote-baseline -- --all     # prompts once per case with a result
```

## Project layout

See `../TEST-STRATEGY.md` §7 for the full rationale. Short version: `test-cases/*.md` is
WHAT to test, human-authored from an actual canvas walkthrough; `specs/**/*.spec.ts` is HOW,
citing the `TC-ID` it implements; `fixtures/` and `pages/` are shared plumbing; `reporting/`
is gitignored results plus a committed, human-promoted baseline.

## Current phase

**Phase 0 (scaffolding) is in place.** `specs/overview/overview.spec.ts` implements
`TC-OV-000` — a diagnostic, not a parity test, proving auth, frame-targeting, and recording
(not yet asserting) each canvas app's deep-link behaviour. **It has not yet been run against
the live apps** — that requires the interactive `capture-auth` step above, which only a human
holding valid credentials can do. Once it has, fill in `TC-OV-000-deep-link-behaviour.md`'s
"Findings" section with what was actually observed, update `fixtures/app-frame.ts` if the
default iframe selectors didn't match, and Phase 1 (the five migrated screens + Overview) can
start on solid ground.
