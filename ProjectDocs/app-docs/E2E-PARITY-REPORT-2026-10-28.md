# E2E parity report: Admin Milestones (pilot), 28 Oct 2026

Suite: `ProjectCosts-CodeApp/e2e/` (Playwright 1.64.1, real Chrome). Prompt and rules: `ProjectDocs/instructions/E2E-PARITY-PROMPT.md`.
Rule map: `ProjectDocs/app-docs/e2e/RULEMAP-admin-milestones.md`. Environment: code app on `pac code run` against VSBCloud_Dev, signed in as the VSB account, full-access role.
Nothing was written to Dataverse: no test clicks Save.

## Scope of this run

| Layer | Done | Not done |
|---|---|---|
| Code app, read-only tests | 7 written, 6 run and pass, 1 parked (E2E-MILESTONES-007 needs a non-admin account) | |
| Canvas app side | rule map from the canvas YAML only | No Canvas run: the Canvas URL has not been given. Every "matches the canvas" claim below is against the YAML, not against the live canvas app |
| Visual diff, zoom, hover hints, permissions, other screens | | Not started (pilot is one screen) |

## Results (final run, 0 retries)

| Test | Result | What it proves | Rule map |
|---|---|---|---|
| E2E-MILESTONES-001 | pass | Opening Milestones raises no console error, failed request or HTTP 4xx/5xx from the route onward; no Apply or Apply to All control | B2, B3 |
| E2E-MILESTONES-002 | pass | Every country starts folded; title is the country name | A2, A3 |
| E2E-MILESTONES-003 | pass | Header texts; technology 14 px, sub-labels and values 12 px, header 14 px semibold; column widths 100, 110, 80, 80, 80, 80, 60, 80, 160, 80, 100; strip 32 px | A9, A10 |
| E2E-MILESTONES-004 | pass | Edit opens "Edit Milestones for <country>"; headings 14 px; Save disabled until a change | B1, B4, C1, C7 |
| E2E-MILESTONES-005 | pass | Duration "abc", "6.5", "-1" show the canvas message and disable Save; "1.5", "0.555", "x", "-0.1" show the rate message; "0", "1", "0.55", "0,5" are accepted | C2 to C7 |
| E2E-MILESTONES-006 | pass | Cancel on an untouched panel closes at once; on a changed one it asks before discarding | C8 |
| E2E-MILESTONES-007 | parked | Non-admin: Edit disabled, save refused | B5 |

Also run: 92 Vitest tests for Milestones and the shared gates pass.

## Findings

### Fixed in this session

| # | Finding | Where found | Fix |
|---|---|---|---|
| F1 | The Milestones matrix columns were about 1.6 times wider than the canvas (the table stretched to the window, so the 110 px blank-column fix of D68 had no visible effect) | E2E-MILESTONES-003 | A fixed-width layout with an empty trailing column takes the remaining width, as the canvas strip does (D68 row 11) |
| F2 | The header strip was 39 px, the canvas 32 px (a taller header button and a row border) | E2E-MILESTONES-003 | Header button pinned to 32 px, no row border (D68 row 12) |
| F3 | React warning "Each child in a list should have a unique key" from `SettingsTabStrip` (my overflow change) | console, while moving through Check List Settings | Key added; Check List Settings tests pass |
| F4 | After the merge the Vite dev server served an EMPTY `routes.tsx` (stale cache), so the app showed a blank page or "useSession must be used inside SessionProvider" | the blank page seen by the user | Dev server restarted, cache cleared. Not a code defect: typecheck, tests and build never see it |

### Open, not caused by this change (recorded, not fixed)

| # | Finding | Where | Note |
|---|---|---|---|
| O1 | `@griffel/react: A rule was not resolved to CSS properly` twice, for `.canvas-project-overview &.fui-Dropdown` and `... .fui-Dropdown__button` | Project Overview (landing screen) | A `makeStyles` selector Griffel cannot compile, so the Dropdown height / bottom-border rule is not applied. Pre-existing in `features/pm/project-main`; not touched today |
| O2 | One HTTP 403 and two 404 responses while loading the landing screen | landing and the other admin screens | The failing URLs were not captured in this run (the suite now records them, see `bad` in `lib/ui.ts`), so the source is unknown |
| O3 | Fluent "Keyborg instance is being disposed incorrectly" | development mode only | Known Fluent warning under React StrictMode; filtered as benign in the suite, with its reason |
| O4 | `npm run check:power` fails locally: 8 data sources added upstream are not in the local, git-ignored `.power/` | `npm run verify` | Regenerate `.power/` with `pac code add-data-source` (D54) |

### Rule map result (code app side, from the YAML)

13 matched, 13 divergent and marked, 0 missing. The three divergences that the browser run exercised (A5/A6 formatting, B1 gate, C2/C4/C6 validation) behave as the markers say.

## Not covered, to do next

1. Canvas side: needs the Canvas URL and a sign-in, then the same scenarios on the `canvas` project and a field-by-field comparison.
2. Visual parity (screenshots at 75, 100 and 125 % zoom), hover hints, permissions with a non-admin account.
3. Contract and Cost admin screens, then the other 20 screens.
4. A Save test: needs a disposable record; Milestones rows are shared master data, so none was written.
