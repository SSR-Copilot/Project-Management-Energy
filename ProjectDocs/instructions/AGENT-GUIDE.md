# VSBCloud canvas → Power Apps code app migration

This workspace migrates two Power Apps **canvas apps** — VSBCloud Project Management and
VSBCloud Project Costs — into one Power Apps **code app**. The real, actively-developed app is
**`ProjectCosts-CodeApp/`** — a React 19 + TypeScript + Vite app on the
`@microsoft/power-apps` SDK, connected to the live `VSBCloud_Dev` Dataverse environment. If
you are about to write code, that is almost certainly where it goes; everything in
`ProjectDocs/` is reference material feeding that one app.

## Workspace layout (since 19 Oct 2026)

| Folder | What it holds |
|---|---|
| `ProjectCosts-CodeApp/` | **The code repo only** — source, scripts, config, `power.config.json`, `.power/` (pac output). No docs. |
| `ProjectDocs/instructions/` | This guide and the app's rules: `CONVENTIONS.md`, `MIGRATION-STRATEGY.md`, `PROJECT-MAP.md`, `TESTING-AND-HARNESS.md`, `KNOWN-RISKS-AND-DECISIONS.md` |
| `ProjectDocs/app-docs/` | The app's own docs: `APP-README.md` (layout, the nine core conventions), decision log `00`–`07`, requirement/harness docs, `PCF-RENDERER-PORT.md`, `RESTRUCTURE-2026-10-19.md` |
| `ProjectDocs/migration-plans/` | Per-screen build specs (written against the skeleton) |
| `ProjectDocs/reference/` | `dataverse-{entities,attributes}.json` — verified Dataverse names |
| `ProjectDocs/_extracted/` | Unpacked canvas source (read-only). The canvas-identity gate and two tests read it from here |
| `ProjectDocs/Existing Solution/` | The managed PCF solution zip (read-only migration source) |
| `ProjectDocs/skeleton-reference/` | Archive of the retired mock-mode skeleton — reference only, never imported |

`CLAUDE.md` at the workspace root only imports this file, so Claude Code picks it up from any
folder in the workspace.

## Quick orientation

- **Start here in a new chat:** `ProjectDocs/app-docs/14-SESSION-HANDOFF-2026-10-27.md` (the
  latest state, what is deployed, and what waits on the product owner). Then read
  `02-OPEN-DECISIONS.md` **D51** (Add Cost from Table bulk Save, especially §10 and §11–§11.16)
  and **D52** (the DEV push of `2c7e6aa`), then D41–D46 (Project Overview pagination) and
  `ProjectDocs/app-docs/09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` (the admin-screen
  replacement, D36).
- **Older context:**
  - `12-SESSION-HANDOFF-2026-10-26.md`
  - `10-SESSION-HANDOFF-2026-10-22.md`
  - `11-CAPEX-PARITY-CHANGE-RECORD-2026-10-23.md`
  - `08-SESSION-HANDOFF-2026-10-19.md`
  - `07-SESSION-HANDOFF-2026-10-15.md`
  - `RESTRUCTURE-2026-10-19.md` (the folder move)

- @PROJECT-MAP.md — what every folder is, and which one is ground truth
- @CONVENTIONS.md — the real app's coding rules (OData, privileges, labels, tests)
- @MIGRATION-STRATEGY.md — how a canvas screen becomes a code-app screen here
- @TESTING-AND-HARNESS.md — how to run/extend the test suite, and the gates that exist
  today vs. the gates the reference harness defines
- @KNOWN-RISKS-AND-DECISIONS.md — standing risks, open decisions, and documented
  contradictions between planning docs — read before touching the Cost module's delete/save
  paths especially

## The commands you need most (run from `ProjectCosts-CodeApp/`)

```bash
npm run dev                                    # :3000 — no Power context, no data alone
pac code run --appUrl http://localhost:3000    # :8080 — run alongside dev for real data
npm run verify                                 # BEFORE every commit/merge: .power gate, typecheck,
                                               # lint, label + canvas gates, tests, build — all pass
npm run check:power                            # .power/ has every table power.config.json needs
npm run check:labels                           # list controls missing aria-label / data-testid
pac auth list                                  # confirm which environment a push will hit
pac code push                                  # deploy dist/ to that environment
```

For real data open the `apps.powerapps.com/.../app/local?...` URL that `pac code run` prints,
not `localhost:3000`.

## Before every build — check all four (user's standing instruction)

1. Every new or changed control has `aria-label` + `data-testid` (`CONVENTIONS.md` rule 16).
2. The technical requirements of the module's canvas YAML
   (`ProjectDocs/_extracted/msapp/<app>/Src/<Screen>.pa.yaml`) are listed and covered. Use the
   `canvas-yaml-to-codeapp` skill.
3. Reusable components and helpers were searched for first (`CONVENTIONS.md` rule 17).
4. **No commit, merge or push without the user's explicit approval**, even when `verify` is green.

Details: `CONVENTIONS.md`, "Before every build".

## Working agreement

- Before calling anything done, and **before every commit or merge**, run `npm run verify` from
  `ProjectCosts-CodeApp/`. It runs the `.power/` data-source gate, typecheck, lint, the
  control-label and canvas-identity gates, all tests and the build. See
  `TESTING-AND-HARNESS.md`. The canvas-identity gate reads `ProjectDocs/_extracted/msapp/`, so
  keep `ProjectDocs/` next to the code repo.
- **Before every push to DEV**, follow the checklist in `CONVENTIONS.md`, section
  "Before pushing to DEV":
  - `npm ci`
  - `check:power`
  - `verify`
  - the knip and duplicate hygiene checks
  - a local smoke test with `pac code run`
  - confirm the pac environment, then `pac code push`
- Reuse, never copy: shared UI comes from `@/components`, and OData, row and write-plan helpers
  come from `data/` (CONVENTIONS rules 17–19). Search before writing a helper.
- Every new or changed UI control gets an explicit `aria-label` (its visible caption) and a
  `data-testid` (its canvas control name, or a stable `<screen>-<purpose>` id). This is
  `CONVENTIONS.md` rule 16, and `src/test/controlLabels.test.ts` fails the suite without it.
- Never silently reword a canvas-sourced string, never silently "fix" a canvas behaviour without
  marking it `SOURCE DEFECT` / `DIVERGENCE` with a `…CanvasParity` twin and a test. See
  `CONVENTIONS.md` rule 7–8.
- `src/generated/` and `.power/` under `ProjectCosts-CodeApp/` are `pac` output — regenerate,
  never hand-edit.
- Keep docs out of the code repo: new `.md` / `.txt` / notes go in `ProjectDocs/`.
- Do not treat anything in `ProjectDocs/skeleton-reference/` or `ProjectDocs/migration-plans/`
  as already true of `ProjectCosts-CodeApp/` without checking — they describe a sibling, not
  this app.
