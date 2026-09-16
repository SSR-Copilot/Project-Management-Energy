# G-LABEL — label fidelity

Every user-visible string in this code app keeps the **exact text** the canvas app had,
and every label constant **says where its text came from**. `scripts/check-labels.mjs`
enforces it.

```bash
node scripts/extract-canvas-labels.mjs        # rebuild reference/canvas-labels.json
node scripts/check-labels.mjs                 # the gate — fails on NEW drift
node scripts/check-labels.mjs --strict        # fails on the known set too (Phase exit gate)
node scripts/check-labels.mjs --update-baseline   # re-record the known set (read the warning)
```

A clean default run says exactly this and exits 0:

```
G-LABEL: 0 new, 67 baselined (16 copy-owner, 51 refactor)
```

## The rule

UI labels, button captions, page titles, column headers, tooltips, placeholders,
validation messages and confirmation titles are **transcribed, not rewritten**. If the
canvas said `Value cannot be blank.` the code app says `Value cannot be blank.` — same
words, same punctuation, same capitalisation. Parity is a text property, not a vibe: a
migration that improves the wording silently makes every screenshot, every training doc
and every support ticket wrong.

## The three permitted deviations

1. **The control is gone.** Text belonging to a control the code app no longer has
   (a canvas card replaced by a grid, a hidden button the canvas never showed) is dropped
   or replaced, and the new string is marked `NEW — no canvas equivalent: <why>`.
2. **The canvas computes the wrong text and the defect is recorded.** The corrected
   string ships; the canvas string stays reachable through a `…CanvasParity` twin with a
   test pinning both, and the constant is marked
   `CANVAS DIVERGENCE — see <fn>; canvas text: "<exact canvas string>"`.
   Example: `deleteDialogText` / `deleteDialogTextCanvasParity` in `cost/opex-costs`.
3. **A misspelling is corrected in place and the original is written down.**
   `SPELLING CORRECTED — canvas \`<control>.<property>\` reads "<exact canvas string>"`.
   Example: `admin/admin-default-checklists` renders `Deactivate checklist item?` where
   the canvas builds `$"{If(…Active,"Decativate","Activate")} checklist item?"`.

Anything else that differs from the canvas text is a **violation**, and the gate says so.
Two further comment forms exist, and neither is a deviation — the visible text is
unchanged, only its shape in the source differs, and both are checked:

- `INTERPOLATED — canvas \`<control>.<property>\` builds this from "<segment>" + …`
  for a canvas string assembled by `$"…{expr}…"` that the code app stores assembled.
  Every quoted segment must be recorded for that control+property AND appear inside the
  constant's value.
- `@labels-not-in-corpus <reason>` for a string whose canvas home is **not** a label
  property, so the corpus cannot adjudicate it: a Dataverse data value or option-set
  label (`'Hedging Type'.'Individual Volumes'`, a `'Job Type'.Name`), or a literal the
  canvas builds inside a collection (`ClearCollect(colTabsValues, ["Contracted Revenue",
  …])`). The reason is mandatory and must name where the string does come from. Every
  such exemption is counted on every run of the gate.

## Where labels live

| What | Where |
| --- | --- |
| Validation, confirmation, guard, empty-state and save-failure **messages** | `MSG` (or `<AREA>_MSG`) in the feature's `rules.ts` |
| Field labels, panel titles, command captions, column headers | `*_LABELS` / `*_TITLES` / `*_COLUMNS` / `PANEL_LABELS` in `rules.ts` |
| Page furniture — `<PageHeader eyebrow title description>`, section captions | inline in `Screen.tsx`, per `CONVENTIONS.md` |
| The canvas corpus every one of them is checked against | `reference/canvas-labels.json` |

`reference/canvas-labels.json` is generated, never hand-edited. It records every literal
user-visible string from the canvas `Text`, `HintText`, `Tooltip`, `Title`, `Label`,
`ItemText` and `PlaceholderText` properties of both source apps, keyed by screen, control
and property, plus four auxiliary indexes the gate can also cite (see the script header):
the `App.OnStart` message resources (`gblAppResx.*`), record-field literals
(`<control>.<Property>.<Field>`), the app's other display properties (`Description`,
`ConfirmButtonText`, `CancelButtonText`, `Placeholder`, `InputTextPlaceholder`, `Header`),
and prose literals built inside `On…` behaviour formulas.

## How to add a label

1. **Find the canvas string first.** Grep the corpus, not the YAML:
   ```bash
   node -e 'const c=require("./reference/canvas-labels.json");
     for (const [t, w] of Object.entries(c.byText))
       if (t.toLowerCase().includes(process.argv[1].toLowerCase()))
         console.log(JSON.stringify(t), "@", w.slice(0, 3).join(" , "));' "closing date"
   ```
   (Control names in the canvas source are the reliable anchor — a 1 000-line formula
   sits on one physical line, so never grep by line number.)
2. **Put the string in `rules.ts`**, in `MSG` if it is a message, in a `*_LABELS`-family
   constant otherwise. Copy the canvas text character for character.
3. **Write the provenance comment** directly above the entry:
   ```ts
   /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */
   closingDateEmpty: "The Contract Closing Date cannot be empty.",
   ```
   If the string has no canvas home, use one of the markers above instead — and
   **never invent a control name**. A citation the corpus does not know fails the gate.
4. **Reference it from `Screen.tsx`.** A message-shaped literal left inline there fails
   the gate (check 4).
5. Run the gate, then `npx tsc --noEmit && npx vitest run`.

## What the gate checks

| # | Check | Fails when |
| --- | --- | --- |
| 1 | provenance | a label constant entry has no provenance comment |
| 2 | citation exists | a comment cites a `Control.Property` absent from the corpus |
| 3 | verbatim | a citation claims verbatim but the text differs from the canvas string (and, for the deviation markers, that the quoted canvas string exists and the value really does differ) |
| 4 | inline literals | a message-shaped string literal sits inline in a `Screen.tsx` |

**Scope of checks 1–3** — every `export const` string in `src/features/**/rules.ts` (and
its `*Rules.ts` / `plan.ts` siblings) whose value is a *user-visible string*: at least one
letter, at least one uppercase letter, and not a Dataverse identifier (`vsb_…`, `…_value`,
`@odata…`, a bare camelCase token). The uppercase test is what separates shipped text
(`Delete Period?`) from the lowercase choice keys this repo compares against
(`bank margin construction`).

**Scope of check 4** — a JSX text child, or a `label` / `title` / `placeholder` /
`aria-label` prop value, that is *message-shaped*: two or more words with a letter, and
either ending in `.`, `?`, `!`, `…` or running to eight words or more. Captions are not
flagged: they are composition and this repo writes them inline by convention, and they get
their provenance the moment they move into a `*_LABELS` constant.

The corpus is **optional but preferred**: without `reference/canvas-labels.json` the gate
still runs checks 1 and 4 and reports that the corpus checks were skipped. Baseline entries
belonging to those skipped checks are reported as *not verifiable* rather than as stale —
a check that could not run is not a violation that was fixed.

## The baseline — `reference/label-baseline.json`

The migration inherited 67 real violations. A gate that always exits 1 gets ignored, so
the known set is written down and the default run fails on **drift** instead:

- every violation listed in the baseline is counted as known and does not fail the run;
- anything else is printed as `[NEW]` and **fails**;
- a baseline entry that no longer matches any violation also **fails**, loudly — a stale
  entry hides a fixed violation and leaves its key free for a different one to slip in
  under. Resolve it: `--update-baseline` if it was fixed, or find where it moved to.

**The baseline is a to-do list, not a permission.** Every entry is work someone still
owes. Nothing in it is approved, grandfathered or closed.

Each entry carries the violation `kind`, the `file`, the constant path (or the JSX slot
for an inline literal), the offending text, an `owner` and a mandatory `reason` — the gate
refuses to load an entry missing either. The key is a hash of kind + file + path + text,
**never a line number**, so it survives reformatting, a comment re-wrap and moved code —
but not a changed string, because a changed string is a different violation.

| `owner` | means |
| --- | --- |
| `copy-owner` | A wording decision. Restore the canvas text, or record the source defect and add a `…CanvasParity` twin. |
| `refactor` | The string is right, it is in the wrong place: move it into `rules.ts` and cite the canvas control from there. |
| `data-value` | Not canvas-authored text (a Dataverse data value or option-set label) and not resolvable from the corpus. |

Nine `@labels-not-in-corpus` declarations are **not** in the baseline, and `data-value` is
therefore unused today. They are already declared at the point of use with a mandatory
reason, the gate refuses one without a reason, and it prints the count on every run;
recording the same fact twice would only let the two copies drift apart.

Where a `refactor` entry's string *also* differs from the canvas text, the `reason` quotes
the canvas string and says so. Moving it will surface a second, pre-existing
`text-mismatch` — that is the move **finding** the gap, not causing it. Hand it to
`copy-owner`; do not treat it as your regression.

### `--strict`

Counts baselined violations as failures too, and prints them with their owner. This is the
question a **Phase exit gate** asks — "is the app label-clean?" — not the question a PR
asks, which is "did this change make it worse?".

### `--update-baseline`

Rewrites the file from the current violations, keeping the `owner` and `reason` of every
entry that survives and drafting a reason (with a corpus lookup) for any new one. Run it
when a violation has genuinely been **fixed**, or when a new known violation has been
agreed with the owner named in it. It prints a warning every time, and the warning is the
rule: **never run it to turn a red build green.**

## When the gate fails

Fix it by **adding provenance**, never by loosening the check and never by baselining it.
A failure that cannot be fixed without changing a user-visible string is a finding for
whoever owns the wording — report it, give it an owner, do not silence it.
