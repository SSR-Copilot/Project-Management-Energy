# E2E parity report — Land Lease (2–3 Nov 2026)

Written for: the product owner and the developers who review the Land Lease screen.

**Method.** Playwright, real Chrome, the VSB account, VSBCloud_Dev, one test project (passed at run time only; it is not
recorded anywhere). The **Canvas app ran first** and is the reference; the code app was then compared with it. Rule map:
`e2e/RULEMAP-land-lease.md` (97 rules). How to run: `ProjectDocs/instructions/TESTING-AND-HARNESS.md`, "Land Lease parity".

**The project's data.** 9 sub-account cards, in the same order in both apps; only card 0 "Locations" holds data (one period,
"Allocate All WTG"). States that need richer data (several periods, a one-time payment, an inflated contract) were reached
through the panels instead (Add Contract with the toggles switched on).

## Summary

| Layer | Tests | Result |
|---|---|---|
| Visual parity (visible text: size, weight, colour, position) | 11 states | **text differs systematically** (section 1); nothing missing |
| Validation (rule-map inputs typed into both apps) | 10 fields, 130 inputs | **33 differences**, all in 4 groups (section 2); the Canvas confirmed the rule map on 128 of 130 rows |
| Smoke, logs, accessibility, deep link, zoom | E2E-LANDLEASE-001…006 | **4 pass, 2 fail** as findings (section 3) |
| Write and data integrity (writes to DEV) | E2E-LANDLEASE-046, 047 | **both pass**: identical rows and columns, Owning Business Unit on every row; deletes clean |

No `PW-` row is left on DEV (checked in all three tables after the run).

## 1. Visual parity — 11 states

States: default; card open; row selected; empty card open; Add Contract panel (plain, One-Time Payment on, Inflation on,
Allocate-to-all toggled); Add Period panel; Edit panel; delete confirmation. Every canvas text is found in the code app
(nothing missing); the differences are in how text is drawn:

| Difference | Count | Canvas | Code app | Class |
|---|---|---|---|---|
| Column headers and panel captions | 150 | 13.33 px | 14 px | **Unknown, needs a decision** |
| Row values in the period table | 99 | 10.67 px | 11.33 px | Unknown, needs a decision |
| Row value colour | 99 | rgb(11, 11, 11) | #000 | Unknown, needs a decision |
| Panel field labels | 90 | 14.67 px | 15.47 px | Unknown, needs a decision |
| Start date and "No" values | 18 | Semibold 600 | 400 | Defect (canvas weight not transcribed) |
| Required `*` | 14 | 700 | 600 | Defect |
| Toggle captions (Inflation Profile, One-Time Payment, Country Inflation Profile) | 11 | rgb(36, 36, 36) | #000 | Defect |
| "Please fill in at least one commercial field…" | 5 | weight 100 | 400 | Defect |
| Save caption colour | 5 | rgb(89, 89, 89) | rgb(96, 94, 92) | Defect (minor) |
| Toggles and "Add One-Time payment", x | 6 states | 1669 px | 1679 px | Defect (10 px further right) |

The four size rows are consistent (every code size is the canvas size plus about half a point), which points to one shared
cause in the Land Lease styles rather than many individual ones. Not app differences (tool artefacts): empty strings (the
canvas icon-font glyphs), "Euro"/"SUM" only in the code app (the canvas shows a selected dropdown value in an input value,
not as text), and one `*` pairing.

## 2. Validation — 33 differences, 4 groups

The Canvas run confirmed the rule map's hand-derived outcomes on 128 of 130 inputs. The code app differs in:

| # | Input | Canvas | Code app | Fields | Rule map |
|---|---|---|---|---|---|
| V1 | a single space `" "` | its format message, Save off | trimmed to blank: no message; **Save on** for the five rate fields | all 10 | E12 — confirmed |
| V2 | `"1."` | accepted, Save on | the **range** message, Save off | 7 numeric fields | E13 — confirmed |
| V3 | a leading space (`" 2027"`, `" 01/2027"`) | format message, Save off | trimmed and accepted, Save on | Inflation Start Year, Due Date | E12 — confirmed |
| V4 | Inflation Start Year `2027` / `0000` | **Save off** for every input in that state | Save on | Inflation Start Year | **New, to check**: a canvas Save condition the code lacks, or a field the test's baseline does not fill |

All four are **Unknown, need a decision**: none has a `DIVERGENCE` marker or a decision record, so they stay unexpected in the
suite (CONVENTIONS rule 8). Messages are identical, word for word, wherever both apps show one.

Rule-map corrections from the Canvas run: the two V4 rows (`2027`, `0000`) — marked "to check" rather than corrected until V4
is explained.

## 3. Smoke, logs, accessibility, deep link, zoom

| Test | Result |
|---|---|
| E2E-LANDLEASE-001 no console errors, failed calls, HTTP errors | **Pass.** Four errors on the page belong to the Power Apps player / host and are recorded as host-only: the local-play permission check (403), the user's profile photo (404), the host's usage report for the Fabric SQL connection (404), and the Office telemetry config (TLS name mismatch on this network) |
| E2E-LANDLEASE-002 `[VSB]` request log | **Fail — finding:** ACTION and DATA lines appear, **no `[VSB] HTTP` line at all** under `pac code run` (D72 says every SDK request prints one, fed by the SDK's `networkRequest` metric). CA-28 |
| E2E-LANDLEASE-003 aria-label + data-testid on every control | Pass |
| E2E-LANDLEASE-004 no test id built from a display value | **Fail — finding:** the 9 card ids are `leasecard-<card name>` (e.g. `leasecard-Permanent Access Routes & Crane Pads`); CONVENTIONS rule 16 asks for a row id |
| E2E-LANDLEASE-005 deep link and refresh | Pass |
| E2E-LANDLEASE-006 zoom 75 / 100 / 125 % | Pass |

Also from the setup (rule 16): several code-app controls carry their own `lease-*` ids instead of the canvas control name
(`lease-currency`, `lease-otp`, `lease-years`, …), so the suite maps them explicitly.

## 4. Write and data integrity (DEV, approved by the user)

E2E-LANDLEASE-046: the same new contract, created through each app's own panel (Description, EUR/WTG 1000, 1 year 0 months,
the first Distribution Frequency, Allocate to all WTGs), wrote **1 header, 1 period and 5 WTG allocations in each app with no
column difference** (39 header columns, plus the period and allocation columns; ids, audit stamps and the run tag masked).
Every row has an Owning Business Unit (CONVENTIONS rule 4). E2E-LANDLEASE-047: deleting each contract through its own pop-up
left nothing behind. Not covered: a refused delete (CA-27 — the code app's Land Lease deletes do not surface a refusal; the
suite cannot force one).

## 5. Items needing a product decision

1. The text sizes and the row-value colour (section 1): adopt the canvas values, or keep the code app's.
2. V1–V3: trimmed spaces and `"1."` — keep the code app's behaviour (marked `DIVERGENCE` with a twin), or match the canvas.
3. V4: once explained, a defect or a divergence.
4. Rule-map findings not exercised by these runs (C4 Start Date standard flag, E2 unused `validateStartDate`, D5/F3 allocation
   rules, D1 currency reset): see `e2e/RULEMAP-land-lease.md` section 6.

## 6. Defects recorded

CA-27 (Land Lease, OPEX and Contracts deletes through the generated `delete()`, rule 14) and CA-28 (no `[VSB] HTTP` lines under
`pac code run`) in `01-BUGS-FOUND.md`. Not fixed: the parity setup reports app defects and does not change app code.
