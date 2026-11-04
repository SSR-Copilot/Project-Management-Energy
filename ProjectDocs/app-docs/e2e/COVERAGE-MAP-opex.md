# OPEX parity coverage map (D80, 3 Nov 2026)

Written for: the developers who run and extend the one-hour parity harness.

**What this is.** The OPEX manifest, `ProjectCosts-CodeApp/e2e/screens/opex/manifest.ts`, is the second screen of the
harness, after Land Lease. It was written to show that the harness works for any screen. Nothing under `e2e/harness/`
knows OPEX, and the screen has no lane files of its own. This page lists what the manifest covers in each layer, what it
leaves out, and why.

**Status.** Built and checked offline only. The strict type check is clean, and `--list` loads the manifest through
`loadManifest` with its validation. No browser run has been made yet. The first calibration run will show whether the
canvas selectors and the hover reader work as written.

## How to run it

```powershell
$env:PARITY_SCREEN = "opex"            # or: npm run parity -- --screen opex
$env:PARITY_READ_PROJECT_ID = "<guid>" # never written into a file
# optional data indexes, 0-based, in screen order (see "Data" below)
$env:OPEX_CARD = "0"; $env:OPEX_ROW = "0"; $env:OPEX_EMPTY_CARD = "2"; $env:OPEX_OTHER_CARD = "0"; $env:OPEX_OTHER_ROW = "0"
npx playwright test -c e2e/harness/playwright.harness.config.ts --list
```

With no OPEX variables set, `--list` gives **68 tests**. With `OPEX_EMPTY_CARD` and `OPEX_OTHER_ROW` set, it gives 72,
because two gate states are added.

| Project | Tests | Contents |
|---|---|---|
| preflight | 1 | Sessions, servers, fingerprint (default: row count and latest `modifiedon` of `vsb_opexprojectcosts` for the project) |
| canvas-A | 13 | 12 visual states, 1 platform (refresh, recorded only) |
| canvas-B | 13 (15) | 4 (6) gate states, 9 validation groups |
| canvas-C | 4 | 4 UX checks |
| code-A | 23 | 12 visual states, plus the every-state label check; 4 UX checks; 6 platform checks (`@smoke`) |
| code-B | 13 (15) | 4 (6) gate states, 9 validation groups |
| report | 1 | Offline comparison, `summary.md` |
| write-canvas / write-code | 0 | `flows` is empty (see "Left out") |

## Two tabs, one screen

The canvas serves **Operation & Maintenance** and **Other OPEX Costs** from one screen, `Opex Costs Screen`, and switches
on the selected menu item. The code app has one `OpexScreen` with a `mode`, on two routes: `/costs/opex/om` and
`/costs/opex/other`.

- The manifest opens O&M. Its `open` is `cost`, with the canvas menu caption "Operation & Maintenance" and the code route
  `/costs/opex/om`.
- The `other-*` states switch to Other OPEX first.
- Every tab switch goes **through Land Lease** in both apps. This is needed because:
  - In the canvas, navigating to the screen already shown does not run `OnVisible` again. The selected account and cost
    stay as they were, and the device cards stay as they were.
  - In the code app, a change between the two modes keeps the component mounted.

  Leaving and coming back gives both apps a fresh screen.

### Rest and reset

The manifest has its own `reset`. It does three things:

1. It closes the delete prompt and the panel with Cancel.
2. If a step changed the screen, it leaves to Land Lease and comes back to O&M.
3. On the canvas, it first folds every Other OPEX card, because their fold state lives in `colOpexSubaccounts`, which
   `OnVisible` does not reload.

At rest, both apps show the screen as it first loads. The canvas `OnVisible` folds every device card. The code app opens
its first card by default. A run therefore reports a difference in `visual.default` and `gates.rest`. That difference is
real, not a tool artefact: see "Expected findings".

## Data

All data comes from environment variables. These are card and row **indexes**, never record ids.

| Variable | Default | Must be |
|---|---|---|
| `OPEX_CARD` | 0 | An O&M card with a non-standard **root** cost. For the EUR/WTG group it must be a WTG device, because the canvas hides that field for a PV module. |
| `OPEX_ROW` | 0 | A row of that card. It must be a non-standard chain root, so that Edit, Delete and the panel toggles are enabled. |
| `OPEX_EMPTY_CARD` | none | An O&M card with no costs. `om-panel-add` and the `om-empty-card` gate need it. |
| `OPEX_OTHER_CARD` | 0 | An Other OPEX sub-account card without a standard contract, so that Add Contract Type is enabled. |
| `OPEX_OTHER_ROW` | none | A row of that card. The Other OPEX row states need it, because a project may have no Other OPEX costs. |

A step that cannot reach its state throws an error that names the variable to change. A wrong index therefore fails the
test. It never records the wrong state under the right name.

There is no explore script for OPEX yet, like `e2e:landlease:explore`. Choose the indexes by looking at the test project
in the code app.

## Coverage per layer

### Visual: 12 states

Every visible text is recorded with its box and style. On the canvas, the selected dropdown values are recorded too.

| State | Steps from rest | Needs |
|---|---|---|
| `default` | none | |
| `om-card-open` | Only card `OPEX_CARD` open | |
| `om-row-selected` | That card, row `OPEX_ROW` selected | |
| `om-panel-edit` | Edit on that row | |
| `om-panel-edit-all-fields` | Edit panel, Inflation Profile on, Country Inflation Profile off, Threshold on with "Individual" chosen (EUR/MWh filled with 1 if empty) | Row must be a root |
| `om-panel-add` | Add Period on the empty card | `OPEX_EMPTY_CARD` |
| `om-delete-prompt` | Delete on the row. The prompt is never confirmed. | |
| `other-default` | Switch to Other OPEX | |
| `other-card-open` | Only card `OPEX_OTHER_CARD` open | |
| `other-panel-add-contract-type` | Add Contract Type on that card | |
| `other-row-selected` | Row `OPEX_OTHER_ROW` selected | `OPEX_OTHER_ROW` |
| `other-panel-edit` | Edit on that row | `OPEX_OTHER_ROW` |

In every state, the code app's controls without an `aria-label` or `data-testid` are also recorded (rule 16).

### Validation: 9 groups

There is one group per validated text input of the panel. Every group opens the panel on O&M card `OPEX_CARD`: Edit on
`OPEX_ROW`, or Add Period when the card has no rows. Each group then types the standard probes into its field:

`abc`, `-1`, `0`, `1`, `1.5`, `1,5`, `0.555`, `1e3`, a space, an empty string, `1.`

It then adds inputs for the field's own bounds and decimal places. After every input, the visible messages and the Save
state are read.

| Group | Field (canvas name; code test id) | Extra inputs | Panel set-up |
|---|---|---|---|
| `description` | `txt_…_Description` | `Standard`, `standard`, `My Standard cost`, `Contract A` | |
| `fix-costs` | `txt_…_FixCosts` | `12.34`, `12.345`, `1000000000`, `1000000000.01` | |
| `procent-of-revenues` | `txt_…_ProcentOfRevenues` | `12.34`, `12.345`, `10000`, `10000.01` | |
| `euro-per-mwh` | `txt_…_EuroPerMwh` | as fix-costs | |
| `euro-per-mw` | `txt_…_EuroPerMw` | as fix-costs | |
| `euro-per-wtg` | `txt_…_EuroPerWtg` | as fix-costs | A WTG card |
| `inflation-start-year` | `txt_…_InflationStartYear` | `2025`, `999`, `20255`, `abcd` | Inflation on, country profile off |
| `inflation-profile` | `txt_…_InflationProfile`; code `opex-inflation-profile` | `2.5`, `2.55`, `100`, `100.1` | Inflation on, country profile off |
| `threshold-individual` | `txt_…_Threshold_Individual` | `2.5`, `2.55`, `10000000`, `10000000.1` | EUR/MWh filled, Threshold on, "Individual" chosen |

`messages` lists 14 verbatim texts. These are every `*_ErrorMessage` text and the hint label, including the range arms
with their numbers formatted as the canvas formats them, for example "Value must be between 0 and 1,000,000,000.0.".

The individual-threshold range message is listed twice, with and without a trailing full stop. The canvas formats the
number with `"###.#"`, which may leave a "." after a whole number, and `OPEX_MSG.thresholdRange` has none. Listing both
forms means the run finds whichever form each app shows, and reports the two forms as different if they differ.

### Gates: 4 states, 6 with the optional variables

The gates layer reads the enabled state of the open card's commands: Add Contract Type (Other OPEX only), Add Period,
Add Standard Contract, Edit and Delete.

- Canvas: by caption, the PCF CommandBar items.
- Code app: by `opex-<ItemKey>`.

| State | Declared |
|---|---|
| `rest` | Always |
| `om-card-open` | Always |
| `om-row-selected` | Always |
| `other-card-open` | Always |
| `om-empty-card` | Only when `OPEX_EMPTY_CARD` is set |
| `other-row-selected` | Only when `OPEX_OTHER_ROW` is set |

The last two states are declared only when their variable is set, because a `GateState` has no `needsEnv` in the
contract.

### UX: 4 checks

| Check | What is read |
|---|---|
| `accessible-names` | The `aria-label` of the three canvas controls that set a literal `AccessibleLabel`: duration months "Month", duration years "Year", distribution frequency "Month". In the code app these are `opex-months`, `opex-years` and `opex-frequency`. Read with the panel open. |
| `hover-panel-icons` | The hover text of the panel's ✕ ("Cancel"), the reset-start-date icon and the External Contract info button |
| `hover-field-captions` | The hover text of the 11 panel field captions. Each canvas label has `Tooltip` set to its own text. In the code app the captions are found by their text. |
| `hover-card-and-row` | The hover text of card `OPEX_CARD`'s title (`Tooltip: =ThisItem.Name`) and of its first row's description (`Self.Text`) |

The hover reader takes a visible `role="tooltip"` if one appears within 1.5 s. Otherwise it takes the nearest `title`
attribute. It records "(not on screen)" when the target does not show, and null when the target shows but has no hover
text.

### Platform

The generic platform lane runs on OPEX unchanged:

- load with no errors;
- the `[VSB]` request log;
- labels at rest;
- display-value test ids;
- refresh;
- zoom.

For the zoom check, the rest marker is the O&M menu item (canvas caption; code `rail-O&MKey`).

### Static and rules (vitest)

These are not part of the manifest. `opexRules.test.ts` and `OpexScreen.test.tsx` cover them inside `npm run verify`.
OPEX has no canvas-recordings test like `landLease.canvasRecordings.test.ts`, because no OPEX run has been recorded yet.

## Expected findings on a first run

These differences are visible in the sources already. A run should report them as **new** until each one is fixed or
added to `known` with a reason.

1. **First card open at rest.** The code app opens its first card by default (`OpexScreen.tsx` `isOpen`). The canvas
   `OnVisible` folds every device card. This shows in `visual.default`, `gates.rest`, `visual.other-default`.
2. **Accessible names.** The code app's dropdowns read "Duration months", "Duration years" and "Distribution Frequency".
   The canvas `AccessibleLabel`s are "Month", "Year" and "Month". CONVENTIONS rule 16 asks for the canvas label verbatim.
3. **Field caption hover texts.** The code app's panel captions have no `title` or tooltip. Every canvas caption does.
4. **The individual-threshold range message** may differ by a trailing ".", as described under "Validation".

## Left out, and why

| Not covered | Reason |
|---|---|
| **Write flows**: create, add period, edit and the child-cost cascade, delete (root with its periods, last period alone), the standard chain on both tabs | Writes need a product decision first: which project, which rows, and whether Add Standard Contract may run on DEV. The manifest's `flows` comment lists what a flow must cover. `tables` is already set up for it (tag column `vsb_description`). |
| **Data layer** (rows compared by tag) | It depends on the write flows. Until then the table is used only for the fingerprint. |
| **Start date** (`dte_…_StartDate`, "Value cannot be blank") | The canvas date picker cannot be typed into (seen on Land Lease, 3 Nov 2026), so the probe list does not apply. A dedicated step that picks a day and clears it is needed. |
| **Dropdowns and toggles** as validation inputs (duration, aggregation, distribution frequency, area) | They have no error label. Their effect on Save is part of the panel states, not a probe list. |
| **The Area field** (O-2, Italy only) | The test project would have to be Italian with both inflation toggles on. |
| **The direct O&M to Other OPEX switch** | The harness always switches through Land Lease, so both apps start fresh (see "Two tabs, one screen"). What the canvas keeps on a direct switch is a separate question. |
| **Hover texts of row cells other than the description**, and of the misaligned-duration warning icon | The warning shows only on data that does not align with the project duration. The other cells set no `Tooltip`. |
| **Add Period on the last period of a chain**, with no selection versus with a selection | It needs a chain with more than one period on the test project. It is planned as a visual state once an `OPEX_LAST_ROW` index is agreed. |
| **Mutation proof** | There is no `e2e/screens/opex/mutations.json` yet. The manifest picks one up when it is added. |

## Changes suggested to the harness

These are reported to the integration agent. Nothing under `e2e/harness/` was changed.

- **`needsEnv` on `GateState`, `ValidationGroup` and `UxCheck`.** Only `VisualState` has it today. So OPEX declares its
  optional gate states only when the variable is set. The report therefore cannot list them as "skipped: … not set"
  the way it lists visual states.
- **A generic card and row helper in `lib/cost.ts`.** `toggleLeaseCard`, `selectLeaseRow` and `cardCommand` are written
  for Land Lease's control names. The OPEX manifest has its own copies, keyed by the tab's names: `cardFold`, `openOnly`
  and `selectRow`. A version of those helpers that takes the names as parameters would serve both screens.
