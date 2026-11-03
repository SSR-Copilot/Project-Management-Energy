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

## 5a. Extension, 3 Nov 2026 (later): the areas the first run did not cover

Added after the first run, at the user's request: three specs, all run against the same test project, Canvas first.

| Spec | What it compares | Result |
|---|---|---|
| `landlease.gates.parity` (E2E-LANDLEASE-050…054, read-only) | Enabled / disabled of the five commands with each of the 9 cards open and with a period selected; the Save gate of an empty and of a description-only new contract; what the Edit panel loads (text values, dropdown values, which dropdowns are enabled, the full option lists, toggle states); accessible names; hover texts | **Everything matches except the 4 predicted findings** below. Both apps enable "Add Standard Contract" only on cards 5 and 6, both keep Currency disabled in the Edit panel, both load the same values and option lists |
| `landlease.flows.parity` (E2E-LANDLEASE-060, writes PW- rows) | Each app, on its own tagged contract: S1 create; S2/S3 Add Period twice; S4 the gates and the delete prompt per period; S5 edit Period 2; S6 delete Period 3 only; S7 One-Time Payments 1 and 2 plus inflation; S8 take one generator off ("Allocate to all WTGs" off, one item unticked); S9 move Period 1's Start Date. Dataverse rows compared after every step | **Pass: identical rows after all nine steps** (header / periods / allocations 1/1/5 → 1/2/5 → 1/3/5 → 1/3/5 → 1/2/5 → 1/2/5 → 1/2/4 → 1/2/4), identical delete prompts; gates identical except the accepted D-entry (Add Period on any period in the code app, only on the last in the canvas) |
| `landlease.standard.parity` (E2E-LANDLEASE-070, writes rows) | "Add Standard Contract" on card 6 in each app, the imported rows compared, then deleted | **Pass: identical** (1 header "…Standard LL Temporary Areas - Germany - Wind", 1 period, 5 allocations, Owning Business Unit on every row) |

**Findings of the extension**

| # | Finding | Rule map | Class |
|---|---|---|---|
| X1 | Accessible names of the Duration years, Duration months and Distribution Frequency dropdowns: canvas `Year` / `Month` / `Month`, code app `Duration years` / `Duration months` / `Distribution Frequency` (rule 16) | H1–H3 confirmed | Defect (rule 16) |
| X2 | The period row's hover text: the canvas shows the row's description ("Allocate All WTG"), the code app none | H6 confirmed | Defect (minor) |
| X3 | The selected WTGs are listed in a different order in the Allocation field (canvas "RIHV_3, RIHV_4, RIHV_1, …", code app "RIHV_1, RIHV_2, RIHV_3, …"); the list items and the saved allocations are the same | new | Unknown, needs a decision (display only) |
| X4 | "Allocate to all WTGs" includes a PV module ("Test PV Module") in both apps | new | Same in both apps; product question (data or wording) |
| X5 | Moving Period 1's Start Date does not move the later periods in either app (Period 2 still starts 16 Feb 2030 after Period 1 moved to 20 Feb 2029) | new | Same in both apps; product question (overlap) |
| X6 | Add Period: the canvas carries the name, start date and contract fields over from the previous period but NOT the Distribution Frequency | new | Same in both apps (both require it) |

**Not reachable with this data:** C4 (the Start Date standard-assumption flag). A contract created with "Add Contract Type"
stores the flag as `false` in both apps, and only standard imports start with it `true` — but both apps disable Edit on a
standard contract (gate B5), so the case C4 describes cannot be driven through the UI here. Also not covered: a refused delete
(CA-27; the suite cannot force one) and the save-error path (F6).

**Harness fixes found by the extension** (in the suite, no app code changed): wait until the app's own "Saving / Deleting /
Loading …" message has gone before moving on (leaving earlier aborted a code-app save part-way); scope a command to its own
card's bar; read canvas dropdowns as native `<select>`s and the canvas date through its calendar; a 30 s action timeout so a
click on a disabled control fails instead of hanging; and **`vite.config.ts` no longer watches `e2e/`** — the dev server was
reloading the code app in the browser for every trace file Playwright wrote, which caused the intermittent code-app failures
(a dev-server setting only).

## 6. Defects recorded

CA-27 (Land Lease, OPEX and Contracts deletes through the generated `delete()`, rule 14) and CA-28 (no `[VSB] HTTP` lines under
`pac code run`) in `01-BUGS-FOUND.md`. Not fixed: the parity setup reports app defects and does not change app code.

## 7. After the fixes (D79, 3 Nov 2026, uncommitted)

The user then asked for the findings to be fixed in the code app (`02-OPEN-DECISIONS.md` D79). The same suites were
re-run on the fixed code, the Canvas recordings unchanged.

| Layer | Before | After |
|---|---|---|
| Visual, 11 states | about 550 differences (sizes, colours, weights, toggle x) | **18**, none of them new; listed below |
| Validation, 130 inputs | 33 differences (V1–V4) | **0** |
| E2E-LANDLEASE-002 request log | fail (CA-28) | **pass**: the HTTP lines arrive late and the test now waits for them. It then found the project GUID in an ACTION line, now `<id>` |
| CA-27 deletes | not surfaced | fixed, UT-PWRITE-032 / UT-LLDATA-014 |

What was changed to get there, beyond the decisions the user took:
- **The 13 px field gap is now 12 px, and the toggle rows are 30 px.** The run measured 76 px between canvas captions; the 13 px
  gap had drifted 1 px a field, 9 px by the footer.
- **The footer hint is 7 px higher.**
- **V4's cause is a canvas defect, now reproduced.** A Year change clears the typed custom %, found with a read-only Canvas probe.

The 18 left:
- **"Share of Revenues [%]", 10 states, 7 px.** The right-aligned header comes out narrower in Segoe UI than in the canvas Open
  Sans: a font difference, just over the 6 px tolerance.
- **The delete pop-up title and text, 15.6 / 15.4 px against 14.67 px (11 pt).** They come from the shared `ConfirmDialog`
  `canvasFooter`, which six screens use; not changed without a decision.
- **The empty card's commands, 9–17 px further right.** Present in the first run as well; not investigated.
- **One `*` pairing in the inflation state.** A tool artefact: the code app draws some asterisks with CSS `::before`, which the
  text capture does not read.

Still open from section 5a: X3, X4, X5, X6 (product questions).
