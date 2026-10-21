# Tosca automation — aria-label conventions and known risk spots

## How to read this document

Tosca already identifies this app's controls through `aria-label`. This started as a
source-code audit; it now also incorporates a real Tosca **Full Code App Scan** recording
(`ProjectDocs/Existing Solution/Full Code app scan (1).mp4`) of this app's "Add/Edit Contract" panel, which
caught Tosca's own identification engine flagging controls as **not unique** live. That
recording changed the diagnosis: the biggest risk wasn't the CAPEX grid (see "Secondary
findings" below) — it was two shared field primitives used almost everywhere in the app. All
four findings below are now fixed; none required touching a screen file.

## The headline

| Where | Was | Risk | Status |
|---|---|---|---|
| Every plain text/number field — `CostField` ([CanvasFields.tsx:89](ProjectCosts-CodeApp/src/components/CanvasFields.tsx#L89)), 44 call sites across 5 files | Relied on an implicit wrapping `<label>`; no `aria-label` | Tosca's scanner doesn't resolve implicit label wrapping — every such field scanned as `AriaLabel: (empty)`, `AssociatedLabel: <No label associated>` | **Fixed** — `aria-label={label}` added |
| Every radio group — `Choices` ([CanvasFields.tsx:132](ProjectCosts-CodeApp/src/components/CanvasFields.tsx#L132)), 12 call sites across 3 files | Same implicit-label gap, **plus** no `value` attribute on the `<input>` — every radio in the app defaulted to the HTML default `value="on"` | Tosca flagged this live: multiple radios in one panel share identical `{Tag: INPUT, Type: radio, Value: on}` with no distinguishing property — scan reported "N items are not unique" | **Fixed** — `aria-label={option}` added |
| CAPEX grid, paid/unpaid cell (`GridRenderer.js:969`) | `aria-label` includes the **formatted cost value** | Breaks on every edit; collides whenever two cells show the same amount | **Fixed** — `data-testid` added, `aria-label` left alone |
| CAPEX grid, comment indicator dot (`GridRenderer.js:1012`) | `aria-label` is the **literal comment text** | Not unique, not stable, leaks user text into a DOM attribute | **Fixed** — `data-testid` added, `aria-label` left alone |
| Dropdowns, toolbar buttons, nav (`CostSelect`, `CommandBar.tsx`, `LeftNav.tsx`, etc.) | Static `aria-label`, set once from the control's own config | None — already stable, confirmed by the same scan | No change |

> **Note:** the `aria-label` values described in this table are the *caption* text, which
> was the original decision. The canvas control name was later put on `aria-label` as well —
> see "Reversed: the canvas name now goes on `aria-label` too" below, which is what the code
> does today.

## What the Tosca scan actually showed

The recording walks Tosca's **Advanced View → Identify by Properties** panel over the Capex
Costs "Add/Edit Contract" panel (Distribution → Equal Distribution → By Cluster / By Start and
End Date radios, plus the Description and Total Costs fields). Two things it surfaced, directly
from the live DOM — not inferred from source:

1. **`AssociatedLabel: <No label associated>`** on every `CostField`/`Choices` input, even
   though each one is visibly captioned and, to a screen reader, correctly named. Tosca's
   HTML adapter looks for an explicit `<label for="…">`/`id` pair or an `aria-label`; it does not
   walk up to find the implicit wrapping `<label>` React was rendering here. That gap is real but
   silent — nothing in this codebase's own accessibility tests catches it, because
   Testing Library's accessible-name computation *does* walk the implicit wrap, so
   `getByRole("radio", { name: "SPV" })` (see
   [CanvasFields.test.tsx:65](ProjectCosts-CodeApp/src/components/CanvasFields.test.tsx#L65))
   already passed before this fix and keeps passing after it — same resolved name, just sourced
   from `aria-label` now instead of the wrap.
2. **Radio buttons scanned with `Value: on`**, because `Choices` never set a `value` attribute
   and `"on"` is the browser default for an unvalued `<input type="radio">`. Combined with #1,
   every radio in every group in the app was scanned with an identical technical fingerprint.
   Tosca's own status bar read **"N items are not unique"** with the conflicting nodes
   highlighted — this is Tosca telling you its default identification would mis-click, not a
   hypothetical.

### The fix

[CanvasFields.tsx:89](ProjectCosts-CodeApp/src/components/CanvasFields.tsx#L89) and
[CanvasFields.tsx:132](ProjectCosts-CodeApp/src/components/CanvasFields.tsx#L132) — one
`aria-label` prop added to each shared input, mirroring exactly what `CostSelect` already did
deliberately (see its comment at [CanvasFields.tsx:97-99](ProjectCosts-CodeApp/src/components/CanvasFields.tsx#L97-L99)).
`aria-label` text is always the same string already shown as the caption/option text, so no
screen reader behavior changes and no visible UI changes — this is additive only. Because both
are shared primitives, every `CostField` and every `Choices` radio group in the app picks up a
stable, unique `AriaLabel` without touching a single screen file, and **without changing a
single Tosca module** — the next scan just finds a populated, distinguishing property where it
previously found none.

## Carrying forward the original canvas control names

A second reference recording, `ProjectDocs/Existing Solution/Canva app scan.mp4`, scans a different,
Fluent-based reference implementation of this same app (the "architecture of record" per
`ProjectDocs/migration-plans/README.md`). It showed every field there identified not by caption text but by
the **original canvas app's own control name** — e.g. `txt_AddContract_RightPanel_Description_1`,
the same `txt_`/`rad_`/`drp_` naming this repo's own code comments already cite (e.g.
`rad_…_DistributionType_1`). That raised a real question: should this app's fields carry that
same control-name identity, so that any Tosca module already recorded against the canvas app (or
against that reference implementation) might keep working unchanged?

**Decision (superseded — see below):** carry the canvas control name forward as `data-testid`,
not `aria-label`. The reference recording's own scan showed that app's `AriaLabel` populated with
the control name directly, which — had we copied it exactly — would have meant a screen reader
announcing `"txt_AddContract_RightPanel_Description_1"` instead of `"Description"` for every
field in the app. That's a real accessibility regression for an actual screen-reader user, not
just a cosmetic difference, so it was rejected even though it would have mirrored the reference
implementation more literally. `data-testid` gets Tosca the exact same stable string — it's just
never read aloud.

### Reversed: the canvas name now goes on `aria-label` too

**Current decision, and the one the code implements:** the canvas control name is carried on
**both** `data-testid` and `aria-label`.

The trade above was re-examined and reversed deliberately. The reason the original call was
wrong in practice is item 3 of "What Tosca-side still needs a human" below: every Tosca module
already recorded against the canvas app keys on `AriaLabel` equal to the control name, so
putting that string anywhere else meant each of those modules needed a property edit or a
re-record before it would match this app. Paying an accessibility cost once, in one shared
primitive, is cheaper than a per-module migration that someone has to do by hand and keep
doing — and it makes "does the existing automation still work" a question with the answer yes.

What this costs, stated plainly: a screen reader announces
`"txt_AddContract_RightPanel_Description_1"` rather than "Description" on every mapped field.
**Sighted users see no change** — the caption `<span>` is still rendered and still visible, and
nothing about the layout moves. The cost falls entirely on screen-reader users, and it is real;
it is accepted, not overlooked. If that becomes unacceptable, the fix is not to move the string
back but to give Tosca a non-ARIA property to key on and edit the modules once.

Mechanically, in [CanvasFields.tsx](ProjectCosts-CodeApp/src/components/CanvasFields.tsx):

- `CostField` — `aria-label={name ?? label}`. An unmapped field (no canvas counterpart) keeps
  the caption as its accessible name, exactly as before.
- `Choices` — the canvas name goes on the **group** (`<fieldset>`), mirroring where its
  `data-testid` already sat. Each radio keeps its own option text as `aria-label`: giving every
  option the one group name would recreate the identical-fingerprint collision the live scan
  reported as "N items are not unique", which is the problem this document opened with.
- `CostSelect` takes no `name` and has no `data-testid`, so nothing changed there.

Both `CostField` and `Choices` ([CanvasFields.tsx](ProjectCosts-CodeApp/src/components/CanvasFields.tsx))
now take an optional `name` prop carrying that canvas control name, rendered as `data-testid` on
the underlying `<input>` (`CostField`) or `<fieldset>` (`Choices` — the group; each radio's own
`aria-label` stays the option text, unchanged, so the group gets a stable identity without
re-introducing the per-option collision the first fix solved). `name` is optional and additive:
a call site with no canvas counterpart (or not yet mapped) behaves exactly as before — `aria-label`
unaffected either way.

Every `CostField`/`Choices` call site in the four screens that use them was matched against the
original canvas Power Fx source (`ProjectDocs/Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/*ScreenCode.txt`)
and given its real control name — 9 in Capex Costs, 26 in Contracts, 7 in Opex Costs, 13 in Land
Lease, 55 in total, all verified against the source rather than guessed. Two fields already had
their own hand-chosen `data-testid` from earlier work (`contract-comment`, `target-note`) and
were deliberately left alone rather than overwritten. Two cases needed care because one canvas
caption maps to more than one physical control:

- Capex Costs' `txt_AddContract_RightPanel_TotalCost_1` is reused by two call sites
  ([Screen.tsx:734](ProjectCosts-CodeApp/src/features/capex-costs/Screen.tsx#L734) and
  [:750](ProjectCosts-CodeApp/src/features/capex-costs/Screen.tsx#L750)) — safe, because
  they're mutually exclusive render branches of the same `edit.distribution`/`distributionScheme`
  state, exactly as the canvas's one physical control is.
- Contracts' card-body total field resolves to one of **two different** canvas controls
  depending on `contract.contractType` — `txt_Contracts_List_Card_Body_Fields_TotalDevContract`
  for Development/Construction, `txt_Contracts_List_Card_Body_Fields_TotalCosts_RC` for Project
  Rights (see [Screen.tsx:1359](ProjectCosts-CodeApp/src/features/contracts/Screen.tsx#L1359)).
  The `data-testid` is now picked dynamically by `contract.contractType`, matching the canvas's
  own two-controls-not-one-conditional structure (already documented in `rules.ts`).

Verified with `tsc --noEmit` (clean) and the full suite for `costing/`, `capex-costs/`,
`contracts/`, and `periods/` — 780 tests passed, zero changes needed to any test.

## Secondary findings (CAPEX grid)

The CAPEX grid (`GridRenderer.js`, a hand-rolled, non-React table) had a different, narrower
problem that the shared-primitive fix above doesn't touch — `aria-label` text that comes from
bound data instead of configuration:

- [GridRenderer.js:969](ProjectCosts-CodeApp/src/features/capex-costs/pcf/ui/GridRenderer.js#L969) —
  the paid/unpaid toggle cell's `aria-label` bakes in the **formatted cost value**:
  `` `${this.formatCostValue(val)}. Click to ${isPaid ? "set as unpaid" : "set as paid"}.` ``.
  It changes on every edit and collides whenever two cells show the same amount.
- [GridRenderer.js:1012](ProjectCosts-CodeApp/src/features/capex-costs/pcf/ui/GridRenderer.js#L1012) —
  the comment indicator dot's `aria-label` is the literal comment text. Same instability, plus
  user-entered text sitting in a DOM attribute.

**Fixed:** both now also carry a `data-testid` built from `contract.id` — the same identifier
the app's own action dispatch already treats as each contract row's stable identity (see its use
in `showMonthActionDropdown`/`_onActionTriggered` calls elsewhere in `GridRenderer.js`) — plus
`monthIndex` for the month cell: `capex-month-cell-{contractId}-{monthIndex}` and
`capex-comment-month-{contractId}-{monthIndex}` / `capex-comment-name-{contractId}`. `aria-label`
was left exactly as it was — still correct for a screen reader, just no longer the only anchor
Tosca has.

Two spots remain genuinely out of scope for a code change and are **document-only**:

- [PcfGrid.tsx:93](ProjectCosts-CodeApp/src/features/capex-costs/PcfGrid.tsx#L93) — the grid
  host carries one static label for the whole container; everything under it (outside the two
  cases above) is already identified by table position, not by label — nothing to add there.
- [SpreadSheet.tsx](ProjectCosts-CodeApp/src/features/add-costs-from-table/spreadsheet/SpreadSheet.tsx)
  (the `react-spreadsheet`-based Add Costs from Table grid) sets no `aria-label` anywhere; same
  conclusion — positional identification already, nothing to break. If this grid ever needs the
  same treatment, the stable identifier to key off is `Row_ID` / `rowIdentity()` in
  [adapter.ts:284](ProjectCosts-CodeApp/src/features/add-costs-from-table/spreadsheet/adapter.ts#L284).

## The convention, going forward

1. **Every interactive control needs an explicit `aria-label` (or `aria-labelledby`) — don't
   rely on implicit `<label>` wrapping, even though it's valid HTML.** It's invisible to Tosca's
   scanner. `CostField` and `Choices` are now the enforced pattern; copy them rather than
   hand-rolling a wrapped `<label>` elsewhere.
2. **`aria-label` text comes from configuration, never from bound data.** Field name, column
   header, option text, action verb — yes. A formatted amount, a user's comment, a record's name
   — no. If a label needs to express "what this is," split it from "what value it currently
   holds" (this is the CAPEX grid's open problem above).
3. **A radio/checkbox `<input>` always gets an explicit `value` matching its option**, not the
   bare element with the browser's implicit default. Cheap insurance even where `aria-label`
   alone now resolves the immediate collision.
4. **Repeating rows (grids) don't get uniqueness forced into the label text.** Give them
   `data-testid` instead, scoped to the stable row/column identity the code already computes —
   never a value a screen reader would read aloud.

## What this doesn't require

No change to any screen file — the field/radio fix landed in the two shared primitives every
screen already imports, and the grid fix landed inside `GridRenderer.js` itself. No change to
accessibility behavior for real users: every `aria-label` a screen reader announces is either
unchanged (CAPEX grid) or the same string it always visually showed (fields/radios), just sourced
explicitly instead of implicitly. No re-recording of any existing Tosca module for buttons,
dropdowns, or nav — those were already fine, confirmed by the same scan.

## What Tosca-side still needs a human

Code changes stop at the repository boundary — Tosca's own project isn't something this session
has access to. Once this build reaches an environment Tosca can scan, someone who owns the Tosca
project still needs to:

1. **Re-scan every panel using `CostField`/`Choices`** (Capex Costs, Contracts, Opex Costs, Land
   Lease) and confirm the canvas control name now resolves. Since the reversal above, it is on
   **both** `AriaLabel` and `data-testid`, so either property identifies a mapped field and
   `AriaLabel` is unique again rather than being the shared caption text. Either is fine to tick;
   `data-testid` is the more honest anchor if you are recording fresh, because it cannot be
   changed by a future accessibility fix. Existing modules recorded against the old
   (empty-label, `value=on`) fingerprint may currently be working off XPath/position instead;
   worth checking which, since those will keep working but are still fragile.
2. **Point the two CAPEX grid modules (paid/unpaid cell, comment dot) at `data-testid`** instead
   of whatever they're anchored to today, the same way.
3. ~~**If any Tosca module already exists for the reference canvas app and keys on `AriaLabel`
   equal to the control name**, it will not match this Code App's fields as-is.~~ **Closed by
   the reversal above** — this was the finding that drove it. A module keyed on `AriaLabel`
   equal to `txt_AddContract_RightPanel_Description_1` now matches this app directly: no
   property edit, no re-record. Worth confirming on the first such module rather than assuming,
   since it is the whole return on the accessibility cost that was accepted to get it.
4. Nothing else needs a re-scan — the dropdown/button/nav modules the recording showed already
   resolving cleanly need no action.

I can't drive Tosca itself (no access to that tool from here) — this is the one part of "what we
can't do" from this session.

## Enforced since 16 Oct 2026

The convention above now covers **every** interactive control, not only the shared field
primitives. It is checked automatically:

- `ProjectCosts-CodeApp/scripts/check-control-labels.mjs` fails on any control without an
  explicit `aria-label` and a `data-testid`, and on a literal test id used twice in one file.
  It runs inside the unit suite (`src/test/controlLabels.test.ts`, UT-LABELS), so `npx vitest run`
  and `npm run verify` (run before every commit or merge) both enforce it.
- The working rule is `ProjectDocs/instructions/CONVENTIONS.md` rule 16:
  - `aria-label` is the caption;
  - `data-testid` is the canvas control name, or a stable `<screen>-<purpose>` id, with the row id
    for repeating rows;
  - existing values are never changed.
- Shared primitives were extended so every call site can pass an identity:
  - `CostSelect` and `PanelExtraButton` take a `testId`;
  - `PanelButtons` labels Save and Cancel and takes `saveTestId` / `cancelTestId`;
  - `Choices` radios now carry `value={option}` (rule 3) and a `data-testid` of `${name}-<option>`.
- Not covered by the static check: DOM-API controls in the vendored `GridRenderer.js`. Their
  identities are the ones listed under "Secondary findings" above.

## Validated against the canvas source (16 Oct 2026)

Presence alone is not enough, so `ProjectCosts-CodeApp/scripts/check-canvas-identities.mjs`
checks each feature module's identities against its canvas screen. It runs as UT-CANVASID, and
`npm run check:canvas` prints a per-module report. The first run found:

- **41 `aria-label`s different from the canvas `AccessibleLabel`.** Examples: the CAPEX toolbar,
  the Finance toggles, the General Data Save/Reset/Add buttons, and the Milestones and Planning
  fields. In most cases the canvas `AccessibleLabel` is the control's own name. All 41 now carry
  the canvas value verbatim, following the "Reversed" decision above. Ten tests that looked the
  controls up by their old caption were updated to the canvas names.
- **3 `data-testid`s naming no canvas control.** The two General Data record-stamp labels lacked
  the canvas's doubled `…_Buttonscon_…` prefix and were corrected. The Replace Generator toggle
  is a 1.21.753 control that the 1.21.709 source on disk cannot confirm, so it is exempted.
- **0 foreign names and 0 type mismatches** once the app's wrapper components were mapped.

Per-row ids that repeat on every row (D16 c) and the PCF grid renderer (D16 a) remain open.
