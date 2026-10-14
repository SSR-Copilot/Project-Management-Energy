# TC-OV-000 — Phase 0 smoke: auth, frame-targeting, and deep-link behaviour

**Area**: Overview / infrastructure · **Type(s)**: Smoke
**Canvas screens**: PM app landing screen, Project Costs app landing screen
**Code-app screen**: `/projects` (Project Overview)
**Author**: (automation Phase 0) · **Date authored**: 2026-10-15 · **Last verified against canvas**: not yet run

## Purpose

This is not a parity test — it is the Phase 0 diagnostic TEST-STRATEGY.md §17 calls for,
proving three unverified assumptions before any real test case is built on top of them:

1. **Auth**: the saved `storageState` for each of the three apps actually reaches a
   logged-in, rendered app (not a login redirect).
2. **Frame-targeting**: each app's content is reachable through one of the selectors in
   `automation/fixtures/app-frame.ts`. If none match, the test fails with a clear message
   telling you to run `npx playwright codegen` and update that file.
3. **Deep-link behaviour**: whether each canvas app's landing screen honours its
   `?projectid=`/`?projectId=` query param to open straight into a project, or only opens a
   picker with the param available for a later read.

## Preconditions
- `npm run capture-auth` has been run once, successfully, for all three apps.
- The project named by `TEST_PROJECT_NAME` (default: "Revenue Individual Hedge Volume")
  exists and is readable in `VSBCloud_Dev`.

## Steps
1. Resolve the test project's GUID via the code app's own Project Overview search.
2. Open the code app at `/projects` — confirm it renders with no console/page error.
3. Open the canvas PM app at its bare play URL — confirm it renders with no console/page
   error, and record which screen it actually landed on.
4. Open the canvas PM app again, this time with `?projectid=<guid>` appended — record
   whether it landed on a project-scoped screen or still showed a picker.
5. Repeat steps 3–4 for the canvas Project Costs app, using `?projectId=<guid>` (capital I).

## Expected result
All three apps render without console/page errors. Steps 4–5's actual landing behaviour is
recorded as a finding — there is no presumed "correct" answer; whatever is observed becomes
the documented baseline for how Phase 1 tests should navigate each app.

## Findings (fill in after first real run)
- Frame selector that worked for the canvas apps: _TBD_
- PM canvas app deep-link behaviour: _TBD_
- Project Costs canvas app deep-link behaviour: _TBD_

## Known canvas-parity exceptions
Not applicable — this is an infrastructure test, not a behavioural comparison.
