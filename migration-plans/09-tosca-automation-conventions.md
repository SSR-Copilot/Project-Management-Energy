# Tosca automation — aria-label conventions and known risk spots

## How to read this document

Tosca already identifies this app's controls through `aria-label`. This started as a
source-code audit; it now also incorporates a real Tosca **Full Code App Scan** recording
(`Existing Solution/Full Code app scan (1).mp4`) of this app's "Add/Edit Contract" panel, which
caught Tosca's own identification engine flagging controls as **not unique** live. That
recording changed the diagnosis: the biggest risk wasn't the CAPEX grid (see "Secondary
findings" below) — it was two shared field primitives used almost everywhere in the app. All
four findings below are now fixed; none required touching a screen file.

## The headline

| Where | Was | Risk | Status |
|---|---|---|---|
| Every plain text/number field — `CostField` ([Fields.tsx:89](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx#L89)), 44 call sites across 5 files | Relied on an implicit wrapping `<label>`; no `aria-label` | Tosca's scanner doesn't resolve implicit label wrapping — every such field scanned as `AriaLabel: (empty)`, `AssociatedLabel: <No label associated>` | **Fixed** — `aria-label={label}` added |
| Every radio group — `Choices` ([Fields.tsx:132](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx#L132)), 12 call sites across 3 files | Same implicit-label gap, **plus** no `value` attribute on the `<input>` — every radio in the app defaulted to the HTML default `value="on"` | Tosca flagged this live: multiple radios in one panel share identical `{Tag: INPUT, Type: radio, Value: on}` with no distinguishing property — scan reported "N items are not unique" | **Fixed** — `aria-label={option}` added |
| CAPEX grid, paid/unpaid cell (`GridRenderer.js:969`) | `aria-label` includes the **formatted cost value** | Breaks on every edit; collides whenever two cells show the same amount | **Fixed** — `data-testid` added, `aria-label` left alone |
| CAPEX grid, comment indicator dot (`GridRenderer.js:1012`) | `aria-label` is the **literal comment text** | Not unique, not stable, leaks user text into a DOM attribute | **Fixed** — `data-testid` added, `aria-label` left alone |
| Dropdowns, toolbar buttons, nav (`CostSelect`, `CommandBar.tsx`, `LeftNav.tsx`, etc.) | Static `aria-label`, set once from the control's own config | None — already stable, confirmed by the same scan | No change |

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
   [Fields.test.tsx:65](ProjectCosts-CodeApp/app/src/features/costing/Fields.test.tsx#L65))
   already passed before this fix and keeps passing after it — same resolved name, just sourced
   from `aria-label` now instead of the wrap.
2. **Radio buttons scanned with `Value: on`**, because `Choices` never set a `value` attribute
   and `"on"` is the browser default for an unvalued `<input type="radio">`. Combined with #1,
   every radio in every group in the app was scanned with an identical technical fingerprint.
   Tosca's own status bar read **"N items are not unique"** with the conflicting nodes
   highlighted — this is Tosca telling you its default identification would mis-click, not a
   hypothetical.

### The fix

[Fields.tsx:89](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx#L89) and
[Fields.tsx:132](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx#L132) — one
`aria-label` prop added to each shared input, mirroring exactly what `CostSelect` already did
deliberately (see its comment at [Fields.tsx:97-99](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx#L97-L99)).
`aria-label` text is always the same string already shown as the caption/option text, so no
screen reader behavior changes and no visible UI changes — this is additive only. Because both
are shared primitives, every `CostField` and every `Choices` radio group in the app picks up a
stable, unique `AriaLabel` without touching a single screen file, and **without changing a
single Tosca module** — the next scan just finds a populated, distinguishing property where it
previously found none.

## Carrying forward the original canvas control names

A second reference recording, `Existing Solution/Canva app scan.mp4`, scans a different,
Fluent-based reference implementation of this same app (the "architecture of record" per
`migration-plans/README.md`). It showed every field there identified not by caption text but by
the **original canvas app's own control name** — e.g. `txt_AddContract_RightPanel_Description_1`,
the same `txt_`/`rad_`/`drp_` naming this repo's own code comments already cite (e.g.
`rad_…_DistributionType_1`). That raised a real question: should this app's fields carry that
same control-name identity, so that any Tosca module already recorded against the canvas app (or
against that reference implementation) might keep working unchanged?

**Decision:** yes, carry the canvas control name forward — but as `data-testid`, not
`aria-label`. The reference recording's own scan showed that app's `AriaLabel` populated with
the control name directly, which — had we copied it exactly — would have meant a screen reader
announcing `"txt_AddContract_RightPanel_Description_1"` instead of `"Description"` for every
field in the app. That's a real accessibility regression for an actual screen-reader user, not
just a cosmetic difference, so it was rejected even though it would have mirrored the reference
implementation more literally. `data-testid` gets Tosca the exact same stable string — it's just
never read aloud.

Both `CostField` and `Choices` ([Fields.tsx](ProjectCosts-CodeApp/app/src/features/costing/Fields.tsx))
now take an optional `name` prop carrying that canvas control name, rendered as `data-testid` on
the underlying `<input>` (`CostField`) or `<fieldset>` (`Choices` — the group; each radio's own
`aria-label` stays the option text, unchanged, so the group gets a stable identity without
re-introducing the per-option collision the first fix solved). `name` is optional and additive:
a call site with no canvas counterpart (or not yet mapped) behaves exactly as before — `aria-label`
unaffected either way.

Every `CostField`/`Choices` call site in the four screens that use them was matched against the
original canvas Power Fx source (`Existing Solution/PCF Git Repo Clones/DevexCapexSummaryPCF/Powerapps code/*ScreenCode.txt`)
and given its real control name — 9 in Capex Costs, 26 in Contracts, 7 in Opex Costs, 13 in Land
Lease, 55 in total, all verified against the source rather than guessed. Two fields already had
their own hand-chosen `data-testid` from earlier work (`contract-comment`, `target-note`) and
were deliberately left alone rather than overwritten. Two cases needed care because one canvas
caption maps to more than one physical control:

- Capex Costs' `txt_AddContract_RightPanel_TotalCost_1` is reused by two call sites
  ([Screen.tsx:734](ProjectCosts-CodeApp/app/src/features/capex-costs/Screen.tsx#L734) and
  [:750](ProjectCosts-CodeApp/app/src/features/capex-costs/Screen.tsx#L750)) — safe, because
  they're mutually exclusive render branches of the same `edit.distribution`/`distributionScheme`
  state, exactly as the canvas's one physical control is.
- Contracts' card-body total field resolves to one of **two different** canvas controls
  depending on `contract.contractType` — `txt_Contracts_List_Card_Body_Fields_TotalDevContract`
  for Development/Construction, `txt_Contracts_List_Card_Body_Fields_TotalCosts_RC` for Project
  Rights (see [Screen.tsx:1359](ProjectCosts-CodeApp/app/src/features/contracts/Screen.tsx#L1359)).
  The `data-testid` is now picked dynamically by `contract.contractType`, matching the canvas's
  own two-controls-not-one-conditional structure (already documented in `rules.ts`).

Verified with `tsc --noEmit` (clean) and the full suite for `costing/`, `capex-costs/`,
`contracts/`, and `periods/` — 780 tests passed, zero changes needed to any test.

## Secondary findings (CAPEX grid)

The CAPEX grid (`GridRenderer.js`, a hand-rolled, non-React table) had a different, narrower
problem that the shared-primitive fix above doesn't touch — `aria-label` text that comes from
bound data instead of configuration:

- [GridRenderer.js:969](ProjectCosts-CodeApp/app/src/features/capex-costs/pcf/ui/GridRenderer.js#L969) —
  the paid/unpaid toggle cell's `aria-label` bakes in the **formatted cost value**:
  `` `${this.formatCostValue(val)}. Click to ${isPaid ? "set as unpaid" : "set as paid"}.` ``.
  It changes on every edit and collides whenever two cells show the same amount.
- [GridRenderer.js:1012](ProjectCosts-CodeApp/app/src/features/capex-costs/pcf/ui/GridRenderer.js#L1012) —
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

- [PcfGrid.tsx:93](ProjectCosts-CodeApp/app/src/features/capex-costs/PcfGrid.tsx#L93) — the grid
  host carries one static label for the whole container; everything under it (outside the two
  cases above) is already identified by table position, not by label — nothing to add there.
- [SpreadSheet.tsx](ProjectCosts-CodeApp/app/src/features/add-costs-from-table/spreadsheet/SpreadSheet.tsx)
  (the `react-spreadsheet`-based Add Costs from Table grid) sets no `aria-label` anywhere; same
  conclusion — positional identification already, nothing to break. If this grid ever needs the
  same treatment, the stable identifier to key off is `Row_ID` / `rowIdentity()` in
  [adapter.ts:284](ProjectCosts-CodeApp/app/src/features/add-costs-from-table/spreadsheet/adapter.ts#L284).

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
   Lease) and tick **`data-testid`**, not `AriaLabel`, as the identifying property — that's where
   the canvas control name now lives (see "Carrying forward the original canvas control names"
   above). `AriaLabel` is still populated (the caption text, e.g. "Description"), but it's no
   longer guaranteed unique the way `data-testid` now is for every mapped field. Existing modules
   recorded against the old (empty-label, `value=on`) fingerprint may currently be working off
   XPath/position instead; worth checking which, since those will keep working but are still
   fragile.
2. **Point the two CAPEX grid modules (paid/unpaid cell, comment dot) at `data-testid`** instead
   of whatever they're anchored to today, the same way.
3. **If any Tosca module already exists for the reference canvas app and keys on `AriaLabel`
   equal to the control name** (e.g. `txt_AddContract_RightPanel_Description_1`), it will
   **not** match this Code App's fields as-is — this app deliberately puts that string in
   `data-testid` instead, for the accessibility reason explained above. Those modules would need
   either a one-property edit (switch their identifying property from `AriaLabel` to
   `data-testid`) or re-recording — there was no way to give Tosca the same string on the same
   property without regressing screen-reader behavior.
4. Nothing else needs a re-scan — the dropdown/button/nav modules the recording showed already
   resolving cleanly need no action.

I can't drive Tosca itself (no access to that tool from here) — this is the one part of "what we
can't do" from this session.
