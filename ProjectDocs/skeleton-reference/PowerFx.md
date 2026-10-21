# VSBCloud Power Fx concordance — index

Companion to the build specification and the code-app repo. Single self-contained HTML,
published as an artifact ("VSBCloud Power Fx Concordance") and delivered as a file.

Every Power Fx logic block in the two canvas apps, listed screen by screen against the
control and property it lives on, with the exact formula and the code-app function that
implements it.

## What it inventories

| | |
|---|---|
| Logic blocks (≥ 3 lines) | **3,097** |
| Substantive (≥ 10 lines) | **1,657** |
| Lines of Power Fx shown | **89,804** |
| Units covered | 48 — 23 screens, 2 app shells, 23 shared components |
| Code-app rule functions mapped | **687** |
| Unit tests covering them | **1,239** |

The 65,533 one-line properties are deliberately excluded — almost all layout arithmetic and
single-field bindings that CSS or a component prop absorbs. They carry no logic.

## Row anatomy

`line count · Control.Property · property-class tag · what-it-does pills · tables touched`

Property class is the same taxonomy as the build specification: Event, Binding, Visibility,
Other, Layout. Blocks of ≥ 10 lines are marked in VSB blue and counted as substantive.
Clicking a row reveals the formula exactly as written in the `.msapp` source, with a
lightweight Power Fx highlighter (comments, strings, table names, numbers, function calls).

## Per-screen implementation panel

Each screen carries a panel naming its code-app target folder, the files with line counts,
every pure rule function exported from `rules.ts`, and the test count. That is the
Power Fx → TypeScript trace: the reader can go from a canvas formula to the function that
replaced it and the test that pins it.

## Biggest units by block count

Project Generators 359 · Project Finance 321 · Capex Costs 294 · Project Revenues 216 ·
Admin Cost 193 · Project General Data 177 · Opex Costs 163 · Land Lease 156 ·
Project Production 150 · Contracts 149 · Project General CheckList 115.

Totals by app: Project Management 2,201 blocks · Project Costs 771 · app shells 6 ·
shared components 119.

## Build pipeline (reproducible)

Working directory `/home/claude/vsb2`:
- `analyze.py` → `corpus.json` / `summary.json` (parses `Src/*.pa.yaml`; needs the
  `tag:yaml.org,2002:value` constructor for bare `=` values)
- `fxcat.py` → `fxcat.json` (blocks ≥ 3 lines, gist heuristics, table extraction, and the
  implementation map read from `/home/claude/vsbcode/src/features/*/rules.ts`)
- `build_fxdoc.py` → `VSBCloud-PowerFx-Concordance.html`

The formula text ships as a JSON payload injected into each block on first open, so the
initial DOM holds 3,097 summary rows rather than 3.4 MB of code — the page loads in ~3.4 s
at 4.9 MB.