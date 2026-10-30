# E2E parity report: Admin Milestones, Canvas first (29 Oct 2026)

Order of the run (standing instruction, 29 Oct 2026): **the Canvas app first, then the code app**, compared with the Canvas result.
Suite: `ProjectCosts-CodeApp/e2e/`. Prompt and rules: `ProjectDocs/instructions/E2E-PARITY-PROMPT.md`. Rule map: `ProjectDocs/app-docs/e2e/RULEMAP-admin-milestones.md`.
Account: the VSB account (`pac auth list`), full-access role. Environment: VSBCloud_DEV, Canvas Project Management app `67054ad6-e70b-4738-a3e6-125384fe2b4b`,
code app `807a2fba-665c-40f3-b158-ffe822aa7da4` through `pac code run` (local build).
Nothing was written to Dataverse: Edit is opened and cancelled, no test presses Save.

## Step 1: the Canvas run (reference)

`milestones.canvas.spec.ts` (2 tests, both pass) measured the real Canvas screen and wrote `e2e/reference/milestones.canvas.json` (structure and behaviour, no data values).
Measured at a 1920 x 1040 window:

| Item | Canvas, measured |
|---|---|
| Header strip | 32 px high, runs to the right edge (1674 px wide); label boxes at +20 from its left edge |
| Columns (width) | Technology 100, blank 110, Cluster 1 to 4 80, FID 60, Cluster 5 80, Operational Lifetime 160, Sales Start 80, Sales End 100 |
| Header text | 14 px, weight 600, Segoe UI |
| Technology name | 14 px, weight 400 |
| Sub-labels and values | 12 px, weight 400 |
| Data row | 55 px |
| Country row | 42 px high; name 14.6667 px, weight 400, Open Sans, colour rgb(11, 11, 11) |
| Country command bar | Edit and Apply (Apply is disabled); one more bar at the top: Apply All |
| Left menu on open | Project Gate and Standard Assumptions both expanded |
| Edit panel | title weight 600; heading 14 px bold, 30 px high; row labels and technology labels 14 px, 600, 40 px rows; inputs 60 x 32 |

Validation, as the Canvas shows it (message shown / Save enabled):

| Field | Input | Canvas |
|---|---|---|
| Duration | `abc`, `6.5`, `-1`, ` 6` | message "Enter a positive value without decimals", Save disabled |
| Duration | `0`, `7`, `101`, `1001` | no message, Save enabled |
| Success rate | `1.5`, `0.555`, `x`, `-0.1`, `0,5` | message "Enter a value between 0 and 1 with a maximum of 2 decimals", Save disabled |
| Success rate | `0`, `1`, `0.55`, `1.` | no message, Save enabled |

## Step 2: the code app, compared with the reference (E2E-MILESTONES-008)

First comparison: **3 differences nobody had explained**. All three were real parity bugs in the code app and are fixed:

| # | Canvas | Code app before | Fix |
|---|---|---|---|
| 1 | Application Settings opens with Standard Assumptions expanded | Only the group of the current screen opened, so Milestones needed an extra click | The admin rail opens both groups, as the Canvas does (`LeftNav.tsx`) |
| 2 | Data rows 55 px, no rule between rows, labels padded 4 px | Rows 61 px: the sub-label "Duration [months]" wrapped to three lines (wider default cell padding) and a row border | 4 px cell padding, no row border (`AssumptionsMatrix.tsx`) |
| 3 | Country name 14.6667 px | 14 px | 14.6667 px (`constants.ts`) |

Final run: the comparison passes, 6 documented differences confirmed and nothing unexplained.

Documented differences confirmed against the Canvas (the test fails if one of them stops occurring):

| Item | Canvas | Code app | Why |
|---|---|---|---|
| Apply (per country) and Apply All | shown, disabled | not drawn | D67 |
| Duration `101`, `1001` | accepted | rejected (column maximum 100 / 1000) | marked DIVERGENCE in `validateDuration` |
| Duration ` 6` (leading space) | rejected | accepted (spaces ignored) | marked DIVERGENCE in `validateDuration` |
| Success rate `0,5` | rejected (the canvas accepts only the language's separator, here `.`) | accepted (`.` and `,`) | marked DIVERGENCE in `validateSuccessRate` |

## Results

| Suite | Result |
|---|---|
| Canvas reference run, 2 tests | pass |
| Code app, 6 read-only tests (001 to 006) | pass |
| Code app compared with the Canvas reference (008) | pass |
| E2E-MILESTONES-007 (a non-admin user) | parked: needs a second account |
| Vitest, Milestones and navigation | pass |

## Findings outside Milestones (seen in the Canvas run, not changed)

| # | Finding | Next step |
|---|---|---|
| O5 | **Check List Settings tabs:** Canvas lists the country tabs alphabetically and opens on the first (Croatia PV, Croatia Wind, Finland PV ... Spain PV, then "..."). The code app opened on Germany Wind with a different order (Germany Wind, Germany PV, Poland PV ...) | Needs the Canvas sort formula checked and a Check List Settings run. Not changed |
| O6 | **Project Overview row count:** Canvas showed "Total Rows: 1142", the code app "1141" at different times | Compare at the same moment, with the same filters, before calling it a defect |
| O7 | The Canvas titles and labels use **Open Sans** for classic Labels (country names) and **Segoe UI** for modern Text, as measured | The Open Sans decision stays open (D48 finding) |
| O8 | Canvas Edit panel messages are 30 px high where the YAML says 14 px (they wrap); the code app keeps 14 px | Visual only, recorded |

## What this run proved, and did not

- Proved against the real Canvas app: the matrix geometry, text sizes and weights, the strip, the Edit panel sizes, and the validation outcome for 17 inputs.
- Not compared: colours, the panel footer buttons, hover and focus states, other zoom levels, the Cost Canvas app, the other 20 screens.
- A Save was never run, so the save payload (Power Fx `Patch` against the code app's `buildPatches`) is compared only through the rule map and unit tests.

## Numbers and language (audit and fix, 29 Oct 2026, D70)

Prompted by the Success Rate `0,5` difference: the Canvas reads and shows numbers with `Language()`. A read-only audit of the Canvas YAML (about 135 `Language()` sites, 190 more
implicit-locale `Text()` calls) against the code found:

| Group | Canvas | Code app | Result |
|---|---|---|---|
| Decimal separator rule | `Lower(First(Split(Language(), "-")).Value) = "en"` means ".", any other language means "," (fn_Numeric, fn_Common, fn_Numeric_With_Separtors; per-screen copies) | three engines: `powerFxNumeric` (same rule), `numeric` (Intl), `numberInput` (language / intl / both) | Same for en, de, fr, pl, es, it; differs for de-CH, es-MX, en-ZA, ja. Not merged (decision) |
| Boxes opening with stored numbers | `Text(n, fmt)` in the user's language | Generators, Planning, Grid Operator, Finance, Revenues opened in US text while validating in the user's language | **Fixed** (D70 rows 2 to 6) |
| Screens that never read the session language | n/a | Generators, Planning, Grid Operator | **Fixed** |
| Messages carrying a number | `Text(max, "#,##0")` (implicit), or a literal per language (Capex) | Contracts always German grouping; Capex always English | **Fixed** (D70 rows 7, 8) |
| Voltage on Grid Operator | comma banned on purpose ("dot should be used instead") | dot-only | Kept, and now protected by a test |
| Country conditions | Poland vs other: ceilings, PLN/EUR labels, ranges, base-rate defaults, units | reproduced on Finance, General Data, Revenues, Generators, Admin Cost, Capex, Land Lease, OPEX | No change needed (the agent found no differences); Capex message grouping was the one gap |
| Money conversion by exchange rate | none in any formula | none | Matches |
| Dates | literal patterns (`dd.mm.yyyy`, `dd.mm.yy`, `[$-en-US]mm/yyyy`, ...) | the same literals | Matches |

Left open: month and short-date pickers on some screens, `fmtPercentTotal` and a few OPEX / Land Lease helpers still hard-code en-US / en-GB, and the Capex month boxes parse with
`Number()` (from reading the code, not run). Nothing was run with a German browser yet; a Playwright run with `locale: "de-DE"` is the next step.
