# Coverage map: the old Land Lease specs on the one-hour harness (D80, 3 Nov 2026)

Written for: the reviewer who checks, line by line, that moving Land Lease onto the generic harness lost no check.

**Where things are now.**
- `ProjectCosts-CodeApp/e2e/screens/land-lease/manifest.ts` is the manifest: data for the generic lanes in
  `e2e/harness/lanes/`. Since the review fixes of 3 Nov 2026 (section 10) the lane files carry their run order in their
  names: `1-visual`, `2-ux`, `3-validation`, `4-gates`, `5-flows`, `6-platform` (`.lane.ts`).
- `e2e/screens/land-lease/standard.lane.ts` holds the one check that no generic layer can express (070).
- `e2e/screens/land-lease/codeapp.lane.ts` holds E2E-LANDLEASE-004 as the old spec asserted it.
- The old specs are unchanged and still run as before. Nothing here edits or deletes them.

**How a check passes or fails now.** Lanes only record facts. `report.run.ts` compares them offline (`compare.ts`) and
writes `summary.md`. An old `expect({ unexpected, stale })` becomes a summary count: **new** for an unexpected difference,
**stale** for a KNOWN entry that no longer occurs. `run.mjs` exits with 1 when new + stale > 0. A difference that one app
could not record shows as **not-captured**, never as a pass.

**Key forms** (`compare.ts`):
- `visual.<state>["<text>"].<property>`
- `validation.<group>["<input>"].messages` or `.save`
- `gates.<state>["<command>"].enabled`
- `ux.<check>.<field>` (one key per field when both apps recorded an object of fields, e.g.
  `ux.save-gate-new-contract.empty`), else `ux.<check>.value`
- `flows.<flow>.<step>["<table>"][<i>].<column>`, or `.count`

## 1. `e2e/landlease.parity.spec.ts`, visible text (11 states)

| Old test / assertion | Now | Notes |
|---|---|---|
| "EXPLORE both apps": card titles in screen order, row count per card (printed only) | ux check `cards` (`[{ title, rows }]`, both apps), lanes canvas-C / code-A | Now compared, not only printed |
| "Canvas first": `collectTexts` per state into `e2e/reference/landlease.<state>.canvas.texts.json` | visual lane, Canvas (canvas-A): `visual/<state>` facts via `readers.ts` readVisual; promoted to `e2e/reference/land-lease/` after a full run | readVisual also adds the Canvas's native `<select>` values. The old run showed these as "Euro" / "SUM" extra in the code app; they are now paired with the code app's text |
| "code app": `compareTexts` per state, `landlease.<state>.diff.json`, matched / missing / extra counts | visual lane, code app (code-A): facts; `compare.ts` visualDiffs (size, weight, colour, x, y, `.missing`, `.extra`) in `summary.md` | Same pairing function (`lib/texts.ts` compareTexts, 6 px tolerance) |
| State `default` | `visual: default` | |
| State `card-open` (LANDLEASE_CARD) | `visual: card-open` | |
| State `row-selected` (card, row 0) | `visual: row-selected` | |
| State `empty-card-open` (only with LANDLEASE_EMPTY_CARD) | `visual: empty-card-open`, `needsEnv: "LANDLEASE_EMPTY_CARD"` | Without the variable: skipped, listed as "skipped: LANDLEASE_EMPTY_CARD not set" |
| State `new-contract-panel` | `visual: new-contract-panel` | |
| State `new-contract-otp-on` | `visual: new-contract-otp-on` | |
| State `new-contract-inflation-on` | `visual: new-contract-inflation-on` | |
| State `new-contract-allwtg-toggled` | `visual: new-contract-allwtg-toggled` | |
| State `new-period-panel` | `visual: new-period-panel` | |
| State `edit-panel` | `visual: edit-panel` | |
| State `delete-confirmation` | `visual: delete-confirmation` | Opened, never confirmed |
| Each state on a freshly opened screen | `manifest.reset` = `resetLease` between states, with no reload | **Method change.** The reset presses Escape, then cancels the pop-up and the panel. It clears a row selection, folds every open card and scrolls to the top. If that fails, it reloads in place. See risk R1 |
| A screenshot of each state in both apps (`e2e/parity-out/*.png`) | **Not ported**: a screenshot only when a test fails (`session.ts` `shot`) | Plan section 2: less output per run. Take screenshots by hand when a visual difference needs one |
| `LANDLEASE_STATES` (run some states only) | **Not ported** as a variable. Use `--grep "visual: <state>"` on the harness config | Lane tests are named per state |
| "No Canvas reference" line in the code app run | Compare mode: preflight requires a cached reference before any browser starts | |
| Report findings (section 7 of the 3 Nov report): "Share of Revenues [%]" x, 7 px | artefact `ll-share-of-revenues-x` (visual, that text, property x, at most 8 px) | Task requirement. Font artefact: Segoe UI vs Open Sans |
| Report: icon-font glyph texts, one `*` pairing | `COMMON_ARTEFACTS` common-glyph, common-asterisk (`screens.ts`) | Harness-wide |
| Report: delete pop-up title 15.6 / 15.4 px, empty card's commands 9–17 px | Still reported as **new** | No decision is recorded, as in the old suite (no KNOWN entry) |

## 2. `e2e/landlease.validation.parity.spec.ts`, 10 groups, 130 inputs

| Old test / assertion | Now | Notes |
|---|---|---|
| `GROUPS`: 10 groups, field, baseline, prefill, inputs in typed order | `manifest.validation`, built from the same `GROUPS` table (moved verbatim into the manifest): keys, fields, inputs and order unchanged | 130 inputs: 3 × 15 + 4 × 14 + 2 × 11 + 7 |
| group `euroMWh` (15 inputs) | `validation: euroMWh` | |
| group `euroMW` (15) | `validation: euroMW` | |
| group `euroWTG` (15), prefill FixedCosts 1000 | `validation: euroWTG` | Baseline skips EUR/WTG 1000 and types the prefill, as before |
| group `fixCosts` (14) | `validation: fixCosts` | |
| group `shareOfRevenues` (14) | `validation: shareOfRevenues` | |
| group `otpAmount1` (14) | `validation: otpAmount1` | |
| group `inflationProfile` (14) | `validation: inflationProfile` | |
| group `inflationStartYear` (11) | `validation: inflationStartYear` | |
| group `otpDueDate1` (11) | `validation: otpDueDate1` | |
| group `description` (7) | `validation: description` | |
| `openBaseline`: fresh screen → card LANDLEASE_CARD → row LANDLEASE_ROW → Edit | `baselineOf(g)`: `app.reload()` before every group except a page's first, then the same steps | A reload per group, as the old fresh screen. The canvas Cancel does not `Reset` every field, so a group must not reuse the previous panel |
| Baseline `otp`: One-Time Payment on, Due Date 12/2027, Amount 1000 | same in `baselineOf` | |
| Baseline `infl`: Inflation on, Start Year 2027, Profile 2.0 | same | |
| Baseline `rate`: EUR/WTG 1000 (not for euroWTG) | same | |
| `type`: click (forced on the Canvas), fill, Tab, wait | generic validation lane: `fieldInput`, click (forced on the Canvas), fill, Tab, then the wait of `validationWaitFor` | Canvas: `waitForStable` { pollMs 400, timeoutMs 10 000 }, as the old suite. Code app: `settle`. Set per screen with `validationWait` (item 4, section 10). Risk R4 is closed for validation |
| `visibleMessages` over the 12 `MSG` texts, exact visible lookups, sorted | `readers.ts` defaultReadValidation over `manifest.messages`: the 12 MSG texts **plus 4 from LEASE_MSG** ("Value cannot be blank", "Value must be a number with 1 decimal place", "Please fill in at least one commercial figure", the additional-periods warning) | **Wider**, as the task asks. A difference in one of the 4 now shows; before, it was invisible |
| `saveEnabled`: the Save control's button, `disabled` / `aria-disabled` | default reader: `locate(controls.save)`, its own button (descendant-or-self), enabled unless `disabled` or `aria-disabled="true"` | Read whether or not an overflow ancestor clips it, as the old spec (item 5, section 10). A Save with no button found reads as false, the same as the old `catch(() => true)` (disabled) |
| Canvas: `landlease.validation.canvas.json` | facts `validation/<group>` (Canvas), promoted to the reference | The vitest replay `landLease.canvasRecordings.test.ts` still reads the old flat file |
| Canvas: rule-map corrections, written to `landlease.validation.rulemap-corrections.txt` | **Ported.** The report hook `e2e/screens/land-lease/rulemap.report.ts` runs in the `report` project, after every lane. It calls `ruleMapCorrections` over the run's Canvas `validation/<group>` facts (compare mode: the cached reference's) and writes `<runDir>/rulemap-corrections.txt` | As in the old test, it reports and never fails on a correction. Gap G3 is closed |
| code app: `noteDiff` messages and save per input; `checkKnown(found, KNOWN = {})`; fail on unexpected or stale | `compare.ts` validationDiffs, keys `validation.<group>["<input>"].messages` / `.save`; `manifest.known` has no validation entry | Same key form, so an old KNOWN key would carry over unchanged |
| Screenshot per group and app | **Not ported** (failure screenshot only) | |
| Skip when no Canvas reference | compare-mode preflight | |

## 3. `e2e/landlease.gates.parity.spec.ts`, E2E-LANDLEASE-050…054

| Old test / assertion | Now | Notes |
|---|---|---|
| `cards` (titles in screen order) compared | ux `cards` (titles and row counts) | One ux value: any title or count difference shows the whole list |
| 050: each card opened in turn (opened, `leaseCommandStates`, folded), key `card <i> "<title>" open` | gate state `each-card-in-turn`: it writes one gates fact per card, `card-<i>-open`. Diff key `gates.card-<i>-open["<command>"].enabled` | The key has no title any more (titles are in ux `cards`). The state's own fact is the rest state after folding (no command shows) |
| 050: card LANDLEASE_CARD, row 0 selected | gate state `card-row-selected` | |
| Reader: `leaseCommandStates` (the first visible command bar) | `manifest.readGates` = `leaseCommandStates` | Same reader. `controls.commands` (caption / `lease-<key>`) are also listed for the generic readers |
| 054: the period row's hover text (canvas `title` inside the transparent button; code `title`) | ux `row-hover-text` | The first row a user can SEE (not clipped), where the old read the first in the DOM |
| 052: the six text values of the Edit panel | ux `edit-panel-texts`, one key per text: `ux.edit-panel-texts.<k>` | The old `edit.texts.<k>`. The same per-field keys hold for the dropdown values, enabled states and options (`ux.edit-panel-dropdown-values.<k>` ...), the toggles (`ux.edit-panel-toggles.<k>`, old `edit.toggles.<k>`) and the accessible names (`ux.edit-panel-accessible-names.<k>`, old `a11y.<k>.ariaLabel`) (item 6, section 10) |
| 052: each dropdown's value | ux `edit-panel-dropdown-values` | |
| 052: each dropdown's enabled state | ux `edit-panel-dropdown-enabled` | |
| 053: option lists, compared only where both apps' dropdown is enabled | ux `edit-panel-dropdown-options`: the options when enabled, null when disabled | Where only one app has it enabled, this check now differs too, besides the enabled check. That is one more line in the summary, not one fewer |
| 054: aria-label where the canvas sets an AccessibleLabel (`a11y.<k>.ariaLabel`) | ux `edit-panel-accessible-names`: Duration years, Duration months, Distribution Frequency | The three dropdowns with a literal canvas AccessibleLabel in the YAML (PA:2554, PA:2618, PA:3685), fixed in the manifest. The old run picked them at run time; it is the same set |
| 052: the four toggle states | ux `edit-panel-toggles` | |
| 054: the panel ✕ hover text | ux `panel-close-hover-text` | |
| 051: Save of an empty "Add Contract Type" panel | ux `save-gate-new-contract`, key `ux.save-gate-new-contract.empty` | One key per boolean, as the old `saveGate.empty` (item 6, section 10) |
| 051: Save after a Description only | ux `save-gate-new-contract`, key `ux.save-gate-new-contract.descriptionOnly` | |
| One read of the Edit panel for all of 052–054 | `editSnapshot`: read once per page, shared by the 8 Edit-panel ux checks | |
| `KNOWN = {}` | no gates or ux entry in `manifest.known` | The "predicted findings" X1 and X2 were fixed (D79), so they are expected to pass |
| Screenshot per app | **Not ported** (failure screenshot only) | |
| The ux checks' lane | canvas-C / code-A (generic `DEFAULT_LANES`) | The old spec ran everything in one serial test per app |

## 4. `e2e/landlease.codeapp.spec.ts`, E2E-LANDLEASE-001…006 (code app)

| Old test / assertion | Now | Notes |
|---|---|---|
| 001 no console errors, failed calls, HTTP ≥ 400; host-only errors listed; route contains `/costs/land-lease` | platform lane `the screen loads with no console errors…` (`@smoke @code-A`) | The route must be exactly `/costs/land-lease` (no query), where the old check was "contains" |
| 002 ACTION Load line, DATA read line, HTTP GET line polled up to 30 s, no GUID outside HTTP lines | platform lane `the [VSB] request log records the load` | Same patterns and timeouts |
| 003 aria-label + data-testid on every visible control, closed and with the first card open | platform lane `labels-at-rest`, and the platform lane's smoke-state check: the manifest's `smokeState` (`card-open`) opened, labels read, then reset (`@smoke`). The visual lane also records `platform/unlabelled-<state>` for **every** visual state, failing on any | Wider: all 11 states, panels included. The smoke tier keeps both halves of the old 003 (item 8, section 10) |
| 004 no test id built from a display value (`<word>card-` / `<word>row-`, suffix with a space or a non-hex letter): **fails** | `codeapp.lane.ts`: the old rule, asserted (`@smoke @code-A`). The generic platform lane also records its broader rule as a fact | **Fails on today's code**, as in the old run: the cards are `leasecard-<card name>` |
| 005 deep link + browser refresh: same route, same project title, title not empty | platform lane `a browser refresh keeps the screen and the project` (`refreshKeepsScreen` = true for `cost`) | **Ported in full.** Besides before = after, a project-scoped screen must show a project title before the refresh (`e2e/harness/lanes/6-platform.lane.ts:178`, `expect(before.title).toBeTruthy()`). Gap G4 is closed |
| 006 zoom 75 / 100 / 125 %: no sideways scroll, the first card visible | platform lane zoom check; the screen counts as shown while `controls.restMarker` shows: the Canvas card title, and in the code app any card header, matched by the test id prefix `leasecard-` (`codeMatch: "prefix"`) | No sub-account name is written in the manifest any more (item 7, section 10). Risk R2 is closed |
| 006 screenshot per zoom | **Not ported** | |
| Canvas side (none in the old spec) | platform lane Canvas refresh, recorded only | New |

## 5. `e2e/landlease.write.parity.spec.ts`, E2E-LANDLEASE-046 / 047 (writes to DEV)

| Old test / assertion | Now | Notes |
|---|---|---|
| Runs only with `PARITY_WRITE=1` | generic flows lane: `PARITY_WRITE=1` **and** the full tier | |
| Tag `PW-LL-<run>-cv` / `-ca` typed into the Description | `data.ts` runTag `PW-<runId>-cv-contract` / `-ca-contract`; the manifest refuses a tag over the Description's 55 characters | The two apps' tags have equal length, as the old `cv` / `ca` (item 9, section 10) |
| 046: `createContract` in each app (card, Description = tag, EUR/WTG 1000, 1 year 0 months, first Distribution Frequency, Allocate to all) | flow `contract`, step `create` (the same `lib/leaseFlows.ts` createContract) | |
| 046: rows read back raw (`settledRows "some"`), compared column by column, tag and ids masked | generic: `settledByTag` + `normaliseTables` after the step; `compare.ts` rowDiffs `flows.contract.create["<table>"]…` | Normalising: GUIDs are now masked (`<guid>`) instead of dropped, and lookup names are kept as `@name`. Risk R3 |
| 046: `owningBusinessUnitMissing` per app and table | the flows lane, after every step: the tagged rows are read once they stop changing (`settledByTag`), then every header, period and allocation row must have `_owningbusinessunit_value` (`data.ts` rowsWithoutBu), in each app | Absolute, as before, and now on the settled rows. A miss is a soft failure: the flow goes on and the test fails at its end (item 2, section 10). The step itself (`assertWritten`) only waits until the header exists |
| 046: `checkKnown(found, KNOWN = {})` | no flows `contract` entry in `manifest.known` | |
| 047: select the tagged row, Delete, confirm the pop-up | flow `contract`, step `delete` | |
| 047: nothing left (header, periods, allocations), per app | `assertGone` in the step (polled 60 s), plus the generic rows after the step (`.count` 0 in both) | |
| 047 skipped when 046 did not create both | the serial flow: `delete` does not run after a failed `create` | |
| afterAll: delete every PW- row of both tags, print what is left | generic cleanup in the flows lane's `afterEach`: `flow.cleanup`, `deleteByTag`, then **fail** when a tagged row is left | Stricter: a leftover fails the test. It runs also when the flow test timed out, with its own 10-minute timeout, exactly once (item 3, section 10). The flow's own timeout: 15 min (`timeoutMin`) |
| Screenshots `created` / `deleted` | **Not ported** (failure screenshot only) | |
| Canvas first, then the code app, one after the other | write-canvas and write-code lanes in parallel in phase 2 (on the shared project unless sandboxes are set) | Different tags, so the two apps' rows never mix. Risk R5 |

## 6. `e2e/landlease.flows.parity.spec.ts`, E2E-LANDLEASE-060 S1–S9 (writes to DEV)

| Old test / assertion | Now | Notes |
|---|---|---|
| S1 create the contract | flow `periods`, step `S1-create` | `assertWritten` waits for the header; the lane checks the Owning Business Unit on the settled rows |
| S2 Add Period on Period 1 (EUR/WTG 1100, 1 year, 0 months, first frequency) | step `S2-add-period-2` | |
| S3 Add Period on Period 2 (EUR/WTG 1200) | step `S3-add-period-3` | |
| S4 gates with Period 1 / 2 / 3 selected | step `S4-gates`; it records the flows fact `periods.S4-gates.ui`, table `gates` (one row per period) | Diff key `flows.periods.S4-gates.ui["gates"][<i>].<command>`. Row-shaped on purpose: see gap G1 |
| S4 delete prompt text, Period 1 and Period 3, opened never confirmed, tag masked | same fact, table `prompts` | |
| S5 Edit Period 2 (EUR/WTG 2000, Fix Costs 500) | step `S5-edit-period-2` | |
| S6 delete Period 3 only | step `S6-delete-period-3` | |
| S7 Period 1: One-Time Payments 1 and 2, inflation 2027 / 2.0 | step `S7-edit-period-1-payments-inflation` | |
| S8 "Allocate to all WTGs" off, one generator unticked (LANDLEASE_DEALLOCATE) | step `S8-deallocate-one-generator` | |
| S9 Start Date to the 20th; `startDateShown` compared | step `S9-change-start-date`; the shown date is recorded as `periods.S9-change-start-date.ui`, table `shown` | Diff key `flows.periods.S9-change-start-date.ui["shown"][0].startDate` |
| Rows after every step compared (`step.<name>.<table>…`) | generic: rows after every step, `flows.periods.<step>["<table>"]…` | |
| Owning Business Unit per step | the flows lane, after **every** step, S4 and S6 included: every settled header, period and allocation row, in each app (`rowsWithoutBu`, absolute) | Wider than before: the old check ran after the save steps only, on an early read (item 2, section 10) |
| KNOWN `gates.period 1.Add Period` | `flows.periods.S4-gates.ui["gates"][0].Add Period` | Same reason (DIVERGENCE, 27 Oct 2026) |
| KNOWN `gates.period 2.Add Period` | `flows.periods.S4-gates.ui["gates"][1].Add Period` | |
| A failed step is recorded and the run goes on; `errors` must be `{}` | A failed step fails the flow test, and the later steps do not run | **Behaviour change.** Steps after a failure are listed as not captured. The re-run pass runs the flow again once |
| Each step on a freshly opened screen | `atTaggedRow`: reset, open the card, select the tagged row; one reload and retry if the row does not show | Risk R1 |
| afterAll cleanup of both tags | generic cleanup per flow in `afterEach`, fails on a leftover; also after a timeout | The flow's own timeout: 45 min (`timeoutMin`; the old spec had 60 min for both apps) |
| Screenshots per step | **Not ported** | |

## 7. `e2e/landlease.standard.parity.spec.ts`, E2E-LANDLEASE-070 (writes to DEV)

| Old test / assertion | Now | Notes |
|---|---|---|
| Precondition: no standard contract created in the minutes before the test | `standard.lane.ts`: the same `expect`, for each write project | |
| "Add Standard Contract" enabled on card LANDLEASE_STD_CARD's own bar | `importStandard` (manifest): throws when it is disabled | |
| Click, wait until the app is no longer busy, settle (120 s) | `importStandard` | |
| Rows found narrowly: headers created since the start less 120 s, `vsb_isstandardcontract`, with children | `importedSince` / `settledImport` (manifest), on `data.ts` readCreatedSince | |
| Canvas imports first, its rows deleted before the code app imports | full mode: ONE test on write-canvas that runs the Canvas, then the code app in a code page of its own | The two apps must not import at the same time on one project |
| `expect(left).toEqual([])` per app after the delete | Canvas: asserted at once, and a re-read must find none of its rows, **before** the code app imports. Code app: collected in `problems`, asserted empty at the end | The run stops with a clear failure instead of importing onto a card that still holds the Canvas's contract (item 11, section 10) |
| Rows compared column by column, ids masked | facts `flows/standard.import` per app, `flows.standard.import["<table>"]…` | Not a manifest flow (no run tag), so it is not listed as not-captured when skipped |
| Owning Business Unit on every row (the old `diffLeaseRows`) | `rowsWithoutBu` → `problems` | |
| The canvas imported at least one contract | `expect(canvasCount).toBeGreaterThan(0)` | |
| afterAll: delete any standard row of the project created during the run | `finally`: `cleanup` of both write projects since the start | |
| Screenshot per app | **Not ported** | |
| (none) | compare mode: write-code imports in the code app alone | New, so a compare run still records the code side |

## 8. Shared helpers, kept or moved

| Old | Now |
|---|---|
| `lib/cost.ts` (open, cards, rows, commands, options) | Reused by the manifest unchanged (CONVENTIONS rule 17) |
| `lib/leaseFlows.ts` (fill, press, command, save, confirmDelete, deletePromptText, setAllocation, setStartDay, createContract) | Reused by the manifest unchanged. `diffLeaseRows` / `settledRows` are not used: `compare.ts` and `data.ts` settledByTag replace them |
| `lib/dataverse.ts` `LAND_LEASE_TABLES` | The manifest's `tables` (one definition, in `lib/dataverse.ts`) |
| `lib/known.ts` checkKnown / noteDiff | `compare.ts` classes; `manifest.known` |
| The gates spec's `readDropdown`, `readToggle`, `titleIn` | Moved into the manifest (the old spec keeps its own copy until it is retired) |
| The validation spec's `GROUPS`, `MSG`, `rateRows` | Moved into the manifest (same) |

## 9. Gaps and risks for review

| # | What | Why | Suggested fix |
|---|---|---|---|
| G1 | S4 gates and prompts, and the S9 date, are recorded as **row-shaped flows facts** (`<flow>.<step>.ui`), not as gates / ux facts | A KNOWN key on a gates or ux entry that is not in the manifest is judged **stale** whenever the read lanes recorded that layer and the flows did not run (a read-tier run, or a run without PARITY_WRITE). The flows family is judged only when the flow step was recorded | A contract field so a flow step can record extra facts in any layer, with stale judging tied to the step |
| G2 | ~~`FlowStep.run(app, tag)` gets no reader page and no `record`~~ **Closed** (item 12g, section 10) | `FlowStep.run(app, tag, ctx)`: `ctx.rows(tag)` reads through the flows lane's own reader page, `ctx.record` writes the `.ui` facts. The manifest no longer opens a page of its own | The gates state `each-card-in-turn` still writes its per-card facts with `writeFact(runEnv(), …)`: a gate state gets no `ctx` |
| G3 | ~~Rule-map corrections are not produced by a run~~ **Closed** | `e2e/screens/land-lease/rulemap.report.ts` calls `ruleMapCorrections` in the `report` project, after every lane | |
| G4 | ~~005 "project title not empty"~~ **Closed** | `e2e/harness/lanes/6-platform.lane.ts:178`: `expect(before.title).toBeTruthy()` on a project-scoped screen | |
| R1 | Reset without reload | The old suite opened a fresh screen per state. `resetLease` relies on Cancel, a row click to deselect, and a fold. If it fails, it reloads in place (`page.reload`, then the left menu on the Canvas), which assumes the player keeps `projectId` in the URL. Unproven live | Check it in the calibration run |
| R2 | ~~`restMarker` code test id `leasecard-Locations`~~ **Closed** (item 7) | The code side is now the prefix `leasecard-` (`codeMatch: "prefix"`): any card header, no sub-account name. `LANDLEASE_REST_TESTID` is gone | A fixed id in the app would still be cleaner |
| R3 | Row normalising changed | GUIDs are masked instead of dropped, and lookup names are kept (`_x_value@name`). A column that differs by nature would now show. Rows are ordered by `sortKey` (item 10), so the n-th row of each app is the same row by meaning | Add such a column to the table's `ignoreColumns` in `lib/dataverse.ts` |
| R4 | `settle` on the Canvas watches the busy indicators only | A message that renders late could be read as absent. **Validation no longer uses it on the Canvas** (item 4): it waits with `waitForStable` as the old suite did. Visual states, gates and ux still `settle` | Calibration run for those layers; then `validationWait` can be set to `settle` if it proves enough |
| R5 | Write lanes in parallel on one shared project | The old suite ran the apps one after the other. Tags keep the rows apart; the standard import is serialised inside one test | Set the two sandbox project variables |
| R6 | E2E-LANDLEASE-004 fails on today's code | It is the old finding (`leasecard-<name>`), kept as a failure | Fix the card test id in the app (rule 16), or record a decision |

## 10. Review fixes (3 Nov 2026)

What changed in the harness after the review, and what each change means for the Land Lease coverage. Items 1 to 11 are
the review list; the generality changes (item 12) are in the last row.

| # | Finding | Now | Where |
|---|---|---|---|
| 1 | A lane's files could run on several workers, in any order | Every lane project has `workers: 1`. Its files run one after another, in alphabetical path order. The generic lane files are named in `LANE_LAYER_ORDER` (`1-visual` ... `6-platform`), so platform runs last; UT-PHSCR-007 pins the names to the order. Land Lease's own lanes (`codeapp.lane.ts`, `standard.lane.ts`) sort after the generic ones; they reset first, and every platform test leaves the screen reopened or reset at 100 % zoom. The global `workers` is still the lane count (+2 when the writes run beside the reads) | `playwright.harness.config.ts`, `screens.ts`, `e2e/harness/lanes/` |
| 2 | The Owning Business Unit was checked on an early read inside the step, and only after save steps | The flows lane reads the rows once they have settled (`settledByTag`) and checks every header, period and allocation row, for each app, after every step (S4 and S6 included), with the absolute `rowsWithoutBu`. A miss fails the test softly, so the flow still finishes. `assertWritten` in the manifest now only waits for the header | `5-flows.lane.ts`, `data.ts`, `manifest.ts` |
| 3 | A flow test had the config's 10-minute timeout, and a timeout skipped the cleanup | `Flow.timeoutMin` (default 30): `contract` 15, `periods` 45. The cleanup moved to `afterEach`: Playwright runs it in a fresh slot after a timeout, and the hook sets its own 10 minutes. The body registers its flow and the hook takes it, so the cleanup runs exactly once; a timed-out body that is still running stops at its next step | `contract.ts`, `screens.ts`, `5-flows.lane.ts` |
| 4 | The Canvas validation reads used `settle` | After each typed input the Canvas waits with `waitForStable` { pollMs 400, timeoutMs 10 000 }, as the old suite. The code app keeps `settle`. Optional `validationWait` ("settle" / "stable", for both apps or per app) to calibrate later | `3-validation.lane.ts`, `screens.ts` validationWaitFor |
| 5 | Save was read through `shown()`, which skips a clipped Save | Save is read through `locate()` (first visible match, clipped or not), then its own button: enabled unless `disabled` or `aria-disabled="true"`, as the old spec | `readers.ts`, UT-PHREAD-025 |
| 6 | An object-valued ux check was one key (`ux.<check>.value`): one wrong field showed the whole object | `compare.ts` writes one key per field when both apps recorded an object of fields: `ux.<check>.<path>`. A list or a scalar stays `.value`. This holds for every screen. The mutation proof's `aria-label` key is now `ux.edit-panel-accessible-names.durationYears` | `compare.ts`, UT-PHCMP-024/025, `mutations.json` |
| 7 | The rest marker named a sub-account (`leasecard-Locations`) | `ControlRef.codeMatch: "prefix"` locates `[data-testid^='…']`, first visible match. The rest marker is `{ code: "leasecard-", codeMatch: "prefix" }`; `LANDLEASE_REST_TESTID` is gone | `contract.ts`, `readers.ts`, `manifest.ts` |
| 8 | The smoke tier checked the labels at rest only; the old 003 also checked one open card | A platform test (`@smoke`) opens the manifest's `smokeState` (Land Lease: `card-open`; default: the first visual state), checks aria-label and data-testid, then resets. The smoke tier lists 8 code app tests: 001, 002, 003 at rest, 003 with a card open, 004 (recorded and asserted), 005, 006 | `6-platform.lane.ts`, `screens.ts` smokeStateOf |
| 9 | Run tags had kind words of different length (`canvas`, `code`) | `PW-<runId>-cv-<flow>` / `-ca-<flow>`, as the old suite: a column derived from the tag, or cut to a length, compares equal once masked | `data.ts` runTag, UT-PHSCR-042/047 |
| 10 | Rows were paired by their masked JSON | `TableSpec.sortKey` orders the normalised rows; the JSON order is the fallback for ties. Land Lease: headers `vsb_name`; periods `vsb_period`, then `vsb_name`; allocations `_vsb_generatorinproject_value@name` (the generator's name, kept by the normalising), then `vsb_name` | `data.ts` normaliseRows, `manifest.ts`, UT-PHSCR-046 |
| 11 | The standard import went on to the code app even when the Canvas cleanup left rows | The test stops with a clear failure first: the Canvas delete must leave nothing (`expect(left).toEqual([])`), and a re-read of the Canvas project must find none of its imported rows | `standard.lane.ts` |
| 12 | Screen-specific ties in the harness | No `LANDLEASE_PROJECT_ID` fallback (the old specs keep it). No default screen: without `PARITY_SCREEN` the config prints `set PARITY_SCREEN to one of: <screens>` and exits, and `run.mjs` stops the same way. The generic helpers moved from `lib/cost.ts` to `lib/appFrame.ts` (re-exported, old specs unchanged). Flows need a root table with a `tagColumn`. Land Lease lane tags come from `laneFor`. One `writeSkip`. `FlowStep.run` gets `ctx` (G2). One text window (`SHELL_TEXT_WINDOW`, `textWindow`). PM General Data and the Application Settings menu are waited for and scoped | `env.ts`, `runPlan.mjs`, `lib/appFrame.ts`, `openers.ts`, `lib/parity.ts` |

## 11. Live run fixes (3–4 Nov 2026, DEV)

What the live Land Lease runs changed, run by run. Each fix came from a run's failure, screenshot or a read-only probe. Row 4
of section 10 is superseded by the "outcome" wait below.

| Run | Problem | Fix | Where |
|---|---|---|---|
| 1 | Serial lanes: one failure skipped the rest of the lane | Default mode; still one worker per lane, in order | `lanes/common.ts` laneDescribe |
| 1 | An over-budget lane failed every later test | A warning (`over-budget` annotation); the hard 60-minute deadline stays | `session.ts` budget |
| 1 | The Canvas "default" state was the CAPEX start screen; a code page looked idle before loading | `openScreenReady`: wait for the rest marker, one retry | `openers.ts` |
| 1 | The write cleanup read in the player page (`_localAppUrl` matched), leaving 14 `PW-` rows | The code frame is matched by origin; the rows were removed with the new `parity:sweep` | `data.ts` codeFrame, `sweep.run.ts` |
| 1 | Canvas validation, `waitForStable` after each input: about 15 s per input | The "outcome" wait (Canvas default): re-read the messages and Save until three reads agree | `3-validation.lane.ts`, `screens.ts` |
| 2 | Every message read had its own lookup: 5–8 s per read, 23 s per input, 60 min 17 s | One page call (`findShownTexts`), the same exact-text match; about 4 s per input | `readers.ts`, UT-PHREAD-DOM-001…003 |
| 2 | The Canvas Edit / Add Period panels were read before they opened (no busy sign) | `VisualState.until`: the panel states wait for Save | `contract.ts`, `1-visual.lane.ts`, `manifest.ts`, UT-PHSCR-049 |
| 2 | The shell text window (y 128) cut through the first two card titles | Land Lease `textWindow` { minX 210, minY 80 } | `manifest.ts` |
| 2 | `cards` counted 0 rows for a card already open | Fold it first | `manifest.ts` cards |
| 2 | canvas-B held validation and gates (57 min) | Canvas gates on canvas-C; budgets canvas-B 20, canvas-C 18 | `manifest.ts` lanes, budgets |
| 3 | The code app's "Add Standard Contract" lookup only matched card 0 (`has: header.nth(i)` is matched inside each section) | The `i`th card section | `lib/cost.ts` cardCommand |
| 3 | `card-row-selected` clicked an already selected row and deselected it | Click only when nothing is selected; fail when none results | `manifest.ts` atRow |
| 4–5 | The Canvas imported the standard contract on card 5: a folded card keeps its bar laid out but clipped, 7 px under the next title | Only unclipped commands are chosen (probe of 4 Nov); card titles in screen order as a guard | `lib/cost.ts` cardCommand, canvasCardTitle |
| 4–8 | A Canvas row selection showed late, or not at all | Poll before and after each click (10 s); fold and reopen the card first, because Edit / Delete need the gallery's Selected card (LL:347, LL:1762); one reopen of the screen as the last resort | `manifest.ts` atRow |

| 10 | A row clicked before the Canvas drew the card's rows | `selectLeaseRow` waits up to 20 s for the row | `lib/cost.ts` |
| 11 | The Canvas player stuck on "Fetching your app" in the preflight | One reload before failing (a sign-in problem is not retried) | `preflight.setup.ts` |
| proof | A gate mutation on Add Contract Type hid the caption and written-column mutations | The gate mutation is on Add Standard Contract | `mutations.json`, UT-PMUT-013 |
| proof | The text window (minY 80) cut the open panel's top fields: a misspelt panel caption went unseen | minY 50 (the header texts sit at about y 24-40) | `manifest.ts` |
| 9–15 | The Canvas's native `<select>` value was placed at its box, the code app's value at its text: every panel dropdown value an "x" difference (12 rows) | `selectValuePageTexts` places the value where its text starts (border + padding, centred in the box) | `readers.ts`, UT-PHREAD-DOM-006 |
| 9–15 | The code app's CSS-drawn `*` (`::before`) was no text node, so the asterisks paired off by one: a weight difference and 56 artefact rows | `collectPageTexts` reads a `::before` / `::after` with a quoted `content` as a text, placed from its computed style | `lib/texts.ts`, UT-PHREAD-DOM-004, 005 |
| 16 | The smoke load counted the player's own `es6.webplayer-host-ui.js`, aborted by the player's navigation, as a failed call; the fresh worker after that failure sat on the player's splash screen for the 6-minute fixture timeout, failing the `[VSB]` log test too | `benignFailure`: a `net::ERR_ABORTED` on a `content.powerapps.com` resource is reported as the host's, not a failure | `lib/ui.ts`, UT-PHPROB-001, 002 |
| 16 | The code app's reset clicked a card header under the write-status overlay (10 s timeout, then a reload) four times in the write lanes, and once a pop-up Cancel the Escape had already closed | `tidy` settles first (idle hook) and clicks only a visible Cancel | `manifest.ts` tidy, closePopUp |

Result (4 Nov 2026): runs 12 and 13 were clean (29 min 52 s and 32 min 30 s; no harness failure, no flaky test), and the
mutation proof caught 6 of 6. After run 15 the only failing check was the real gap CA-30, and 64 visual differences waited
for a decision. On the user's go-ahead (4 Nov 2026) CA-30 and the four code-app differences were fixed (D80 §3: the
command bars' icon box, the dropdown value colour, the delete pop-up text size, and the Add Period selection) and the two
reader artefacts above. **Run 16 (full, 37 min 10 s) confirmed them: new 0, known 2, artefacts 58 (icon-font glyphs and
the Share-of-Revenues font width only), no lane over budget, the Canvas reference promoted; 3 tests flaky (passed on the
re-run), which led to the two run-16 rows above.**
