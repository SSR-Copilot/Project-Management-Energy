# Guide-parity pass — what changed and why

**Input:** `Project Management – Step-by-Step User Guide` (24 pages, 22 screenshots taken from a
screen recording of the live canvas app on 03-09-2026). Until this document arrived, every screen
in this repo had been built from the unpacked `.msapp` sources — control trees, formulas and
property counts. That gives the *logic* exactly and the *layout* only by inference. This pass
closes the gap for the twelve screens the recording covers.

**Verified after the change:** `tsc --noEmit` clean · `vitest run` **1552 passed** (from 1495) ·
`vite build` succeeds · the app renders in mock mode with no console or page errors.

Provenance is traceable in the code: every decision taken from a screenshot carries a
`// GUIDE p06:`-style comment naming the page it came from.

---

## New shared components

| File | Why the guide forced it |
|---|---|
| `components/CountryRail.tsx` | The admin screens carry a **middle rail** nobody had inferred. It has two shapes and the difference is deliberate: a flag tree with `+`/`−` expanding to Wind/PV (Project Gates, Costs, Contracts) and a flat country list with no flags (Standard Assumptions → Milestones, whose axis is the whole country). Exposed as `variant="tree" \| "flat"`. |
| `components/RecordFooter.tsx` | The record editors' bottom bar is not a right-aligned button pair. It is `ⓘ Required fields` on the left, then `Created By:` / `Modified By:` audit stamps, then Cancel and Save — and the stamps read `..` until the first save. |
| `components/Breadcrumb.tsx` | Two separators are in use and they are not interchangeable: `Project Gates \| Germany \| Wind` and `Standard Assumptions / Costs / Germany / Wind`. |
| `components/TextFieldWithCount.tsx` | Every counted text field shows `n/55` at the **top right** of the field, and validation is eager — p10 shows "Project short name should have at least 3 letters." under an untouched field on a form that has only just opened. |

## Screens

### Project list — `features/project-main/`
- `Dashboard` now greys out with nothing selected. The recording shows only `+ Add Project`
  enabled on an unselected list; the old gate left Dashboard always available.
- Filter strip laid out as the two literal rows the screenshot shows (three fields, then four)
  rather than an auto-wrapping grid; `Search for Project Name, Short Name and ID` and
  `Select operator` are now the verbatim placeholders.
- Project Manager became a real typeahead with the `Suggested People` panel — avatar, display
  name, email on a second line — replacing a dropdown of every user.
- The per-project colour stripe moved into the Project Name cell (`DataGrid rowAccent`), which is
  where the recording puts it, instead of occupying its own column.
- Status renders as **plain text** (`Cluster 1` … `Cluster 4`), not a chip. A chip per row
  truncated to `Clus…`, which is worse than the value it decorated.
- Zebra banding is now the brand tint rather than a neutral grey, matching the recording. Only
  screens that opt into `zebra` see it — today that is this grid alone.

### General / New Project — `features/general-data/`
- Rebuilt into the guide's three sections: `Basic Information`, `Placement`, `Shareholding Entity`,
  in that order and with that field set.
- Read-only, system-assigned `Project ID`; `SPV Legal Structure` appears on the saved record.
- All seven validation messages are now verbatim and under test, including
  `Expected decimal degrees field format number ###.######.` on both Latitude and Longitude.
- **The ownership-sum rule no longer blocks Save.** p13 saves with a single 50% row and an
  informational banner — the obvious implementation blocks it, so a test pins the behaviour.
- `Development Type` defaults to `Own Development` on a new record.
- Project Manager and Deputy render as removable initials-avatar chips.
- The post-save re-read now uses this screen's own projection. General writes more columns than
  any other screen reads, and a re-read on the narrower default returned them blank — which shows
  up as "the field I just filled in is empty again".

### Milestones — `features/milestones/`
- Field set, labels and two-column order corrected; `Sales Start Date`, the two-box
  `Operational Lifetime` and the farmdown reset button were missing.
- **Derived dates now render in italic blue and entered dates in plain text**, driven by a pure
  classifier rather than a hard-coded key list. This is the guide's most load-bearing visual
  detail: in p16 the anchors the user typed (Project Start, Cluster 1, Cluster 3) are black and
  every date the app calculated is blue.
- Six ordering messages are verbatim, including `The date needs to be later than sales starts
  date.` with its original wording.

### Checklist Settings — `features/admin-default-checklists/`
- Page title is `Checklist settings` — distinct from the rail label `Check List Settings`.
- Accordion rows lost their order badge and moved the chevron to the right, matching the flat
  label + right-chevron rows in p17. The seven gate transitions are pinned by a test.

### CAPEX Accounts — `features/admin-capex-accounts/`
- Toolbar relabelled and reordered to `Reorder`, `New`, `Edit`, `Deactivate`.
- Accounts render as a radio-select list of `80000 - Turbine / PV Supply Agreement` rows with a
  status chip, not as a grid. Row 80003 keeps `(In-active)` inside its own name — that is data.

### Project Gates — `features/admin-gates-approvals/`
- Replaced the accordion-of-mini-grids with the real three-pane shape: admin rail, country rail,
  one table with the seven columns in order, bold gate rows, indented task rows and `+ Add Task`
  per group.
- Unset people cells render `-`; multi-person cells stack `Display Name (email)` lines.
- `Edit Approvers` drawer rebuilt: disabled `Gate` dropdown, `Gate active` toggle, the three
  `Approval Mode` radios in order, required `Notifications` picker, and `Reset Gate` with its
  caption `Remove all cluster gate participants and deactivate the gate approval.`

### Standard Assumptions → Milestones — `features/admin-milestones/`
- Flat country rail with all nine countries — including Spain, Greece and Romania, which the
  Costs and Contracts pickers filter out.
- Technology × cluster table with paired `Duration [months]` / `Success Rate [-]` rows, and the
  `Edit Milestones for {country}` drawer as two Wind/PV numeric matrices.

### Standard Assumptions → Costs — `features/admin-cost/`
- Flag-tree rail and slash breadcrumb replace the dropdown scope bar; `Apply to All` is a disabled
  button with its override caption; the `Apply was made by` banner is composed in `rules.ts`.
- `DEVEX/CAPEX` wrapper section, the four-column cost table and `10,000 EUR` formatting.

---

## Deliberate differences from the recording

1. **Costs opens with no country selected.** The canvas silently defaulted to the first country
   and Wind; this build makes the admin choose, and says so in the empty state. Marked in code.
2. **Gate header rows show a delete icon but refuse the delete.** p20 shows the icon; the canvas
   has no removal path for `Project Default Approvals`. The icon renders for visual parity and
   the planner returns a refusal rather than inventing a write.
3. **Both Apply buttons stay disabled.** The recording agrees with the source: the Fabric sync
   write is commented out and the flow is missing from the export, so Apply records work that
   never runs. Kept disabled with the existing `// SOURCE DEFECT:` note.
4. **Date fields use the native picker**, so the recording's long-form
   `Thursday, September 10, 2026` and short-form `Fri, Sep 18, 2026` renderings are not
   reproduced. Adding a date-picker library is a dependency decision, not a parity fix.

## Still open

- `npm run lint` does not run: the repo ships `.eslintrc.cjs` and the installed ESLint is v9,
  which needs a flat `eslint.config.js`. Pre-existing, untouched here.
- `Project Type`'s choice list is unverified beyond the single value `Only infrastructure` seen
  in p14.
- The `+` copy-forward icon beside `Sales Start` / `Sales Completion` is not implemented: no
  recalculation formula exists for those two fields in the source, and adding one would be
  inventing a business rule.
- Mock fixtures carry five countries, so Croatia is absent from the country rails in mock mode.
  Live data supplies six.

---

# Pass 2 — the rest of Project Management, and the Cost app

**Inputs:** a second recording of the Project Management app (25 screenshots, 01:36 → 10:18) and a
third of the Project Costs app (8 screenshots, 00:13 → 02:18). Between them they cover every
Project Management screen that pass 1 had to infer, plus the Capex Costs grid.

**Verified after the change:** `tsc --noEmit` clean · `vitest run` **1610 passed** (from 1552) ·
`vite build` succeeds · every changed screen renders in mock mode with no console or page errors.

Transcriptions are checked in beside the first pass's: `docs/guide2-ui-notes-q02-q16.md`,
`docs/guide2-ui-notes-q18-q26.md`, `docs/guide3-ui-notes-cost-app.md`. Provenance comments use
`// GUIDE q07:` for the second recording and `// GUIDE r06:` for the third.

## What the recordings settled

**The captions lied and the rails told the truth.** The second guide labels four frames as a map,
a team screen and "additional project attributes"; they are actually a Cluster Movement history
dialog, Planning on two different tabs, and the Revenue and Financing panels. Screens were
identified from the rail selection, not the caption.

**Two "add a child record" patterns that look identical and are not.** Generator expands the
detail *in place inside the list*; Production opens a *wide right-side slide-over* whose columns
appear progressively as toggles are switched on. Both are now built as observed.

**Contextual actions are per screen.** Selecting a generator adds `Delete Generator Type` and
`Deactivate`; selecting a production record adds `Edit`, `Delete` and `Deactivate Production`.

**Two kinds of calculated value, styled differently.** Seasonality's monthly `Distribution [%]`
and Negative Prices' yearly `Reduction [%]` are *editable calculated defaults* — italic blue, each
individually resettable. `Total Sum [%]` is a *read-only computed total* — plain, bold. The first
pass established italic blue for derived values on Milestones; this pass had to split that into
two treatments.

**Greyed placeholder ≠ filled value.** In `Add Revenue Contract`, `Euro` and `Germany` look like
entered values and are system-derived defaults. Rendering them as ordinary input values
misrepresents which fields are required-and-empty.

## Screens

| Screen | The correction that mattered |
|---|---|
| Generator | Row selector became a real radio; detail grid expands in place with the seven observed fields; a real Add PV Module Type panel replaced a placeholder that wrote `{}`; save-confirmation banner with its verbatim text. |
| Production | Summary tiles reordered to the 2×3 grid and blanked (not zeroed) when empty; record list became collapsible rows; the panel gained its progressive Seasonality and Negative Prices columns with block-level and per-row resets. |
| Cluster Check List | Stepper rebuilt as status nodes with an approvers popover; table columns corrected; `View … Request History` now opens a read-only `Cluster Movement to {next}` dialog with nested per-comment tables instead of an editable transition panel. |
| Project Team | Two galleries with different columns collapsed into one table — Description / Display Name / Comment. |
| Planning | Save/Cancel moved into the shared `RecordFooter`; permit grid cut from five columns to three; the `New Permit` panel's Plan/Actual radio and date became one grouped field. |
| Revenue | Tab key moved into `?tab=`; the missing Currency and Country Inflation Profile fields added as disabled placeholder-styled inputs; panel reordered; units moved into labels. |
| Financing | `Edit Tranche` panel now scrolls; Status radio options disable conditionally; five controls that had columns and state but no UI were added (Drawdown, Upfront Fee, Commitment Fee + free period, Base Rate). |
| Capex Costs | The grid became the real matrix: `Number, Account Name, Total Costs, Total Paid, Total Planned` plus twelve month columns for the stepped year, two-level account→sub-account rows, `-` for empty cells (a real `0` still reads `0`), a dark-banded Grand Total row, and a per-row `••• Add → + Add New Cost` flyout. Saving shows the blocking `Please wait, saving costs...` overlay. |
| Contracts | Command bar already matched; its five labels are now a tested constant. |
| General | The three acquisition fields sit under their own `Acquisition Information` sub-heading, and the unit moved into the label as `Acquisition Price [EUR]`. |

## Deliberate differences, carried forward

Everything pass 1 recorded still holds. Added this pass:

- **Team's manager rows still render a radio.** `DataGrid`'s `selectionMode="single"` cannot hide
  the control per row, and changing that is a shared-component decision.
- **`Add Others` on Generator stays a single action.** The recording shows a dropdown chevron;
  `CommandBar`'s `Command` type has no submenu, and inventing one is out of scope.
- **Production's slide-over scrolls sideways** rather than widening: `FormPanel`'s drawer is a
  fixed `min(560px, 100vw)`. A `wide` variant belongs in `src/components`.
- **`NumericInput` carries no className passthrough**, so Production's calculated-default cells use
  a local field wrapper. Same fix location.

## Still open

- Opex Costs, Land Lease and Add Costs from Table are still inferred — the third recording shows
  only Capex Costs and a loading Contracts screen.
- Grid Operator remains as built in pass 1; no recording covers it.
- Four small shared-component gaps are named above and are the natural next change.

---

# Scenario test

`scripts/scenario.mjs` walks the built app in mock mode along the same path as the recordings:
portfolio → filter → **New Project** → open a project → all ten rail screens → the Planning,
Generator and Revenue panels → all six admin screens → all five Cost app screens. **31 steps.**
It fails on page errors, console errors, error boundaries, an empty `main`, and any project-scoped
screen that renders the "no project selected" guard while a project is selected.

Playwright is deliberately not a dependency — the header explains how to run it.

## What it caught

**`+ Add Project` was a dead end.** It navigated to `/project/general`, and `RequireProject` — a
guard this build added, which the canvas app has no equivalent of — bounced it straight to
"No project selected". The app's only create path could not be reached, and neither the unit suite
nor a screen-by-screen render check could see it: every screen rendered fine on its own, and the
guard is doing exactly what it was written to do.

Fixed by making the guard aware of the one project-scoped route that is legitimately reachable
without a project. `NEW_PROJECT_ROUTE` (`/project/general?new=1`) and `isNewProjectRequest()` are
pure functions in `src/domain/navigation.ts`, tested as UT-NAV-015…017 — including that the marker
unlocks General and nothing else. Marking the intent in the URL rather than in a store flag keeps
the guard a pure function of the location, so a reloaded or shared "new project" link still works.

The scenario now asserts the whole create path: the title reads `New Project`, `Basic Information`
renders, and `Save` is disabled on the empty required form.

**Final state:** `tsc --noEmit` clean · `vitest run` **1613 passed** · `vite build` succeeds ·
scenario **31/31, 0 problems**.
