# Testing and the harness — what exists today vs. the reference target

## What actually runs today, in `ProjectCosts-CodeApp/`

```bash
cd ProjectCosts-CodeApp
npm ci
npm run dev          # http://localhost:3000 — no Power context, no data (see below)
npx vitest run       # the whole suite
npm run typecheck    # tsc --noEmit
npm run build         # tsc -b && vite build
npm run lint          # oxlint src
npm run check:labels  # every UI control has aria-label + data-testid (CONVENTIONS rule 16)
npm run check:canvas  # those identities are RIGHT: real canvas control, same type, canvas AccessibleLabel
npm run verify        # ALL of the above, in order — run before every commit or merge
```

**The control-label gate (G-LABELS).** `scripts/check-control-labels.mjs` parses every `.tsx`
under `src/` and fails on any interactive control without an explicit `aria-label` (or
`aria-labelledby`) and a `data-testid`, and on a literal test id used twice in one file. It runs
inside the unit suite as `src/test/controlLabels.test.ts` (UT-LABELS-001..003), so `npx vitest
run` alone already enforces it. `npm run check:labels` prints the findings plus warnings for
`aria-label`s computed from expressions (convention rule 2: labels come from configuration,
never bound data).

**The canvas-identity gate (G-CANVASID).** `scripts/check-canvas-identities.mjs` maps each feature
folder to its canvas screen (`MODULES` in the script). It reports C1 for an unknown name, C2 for a
name from another screen, C3 for a type mismatch and C4 for an `aria-label` different from the
canvas `AccessibleLabel`. C5 (the label is an expression) is advisory. It runs as
`src/test/canvasIdentities.test.ts` (UT-CANVASID-001..003). A new feature folder needs a
`MODULES` entry.

The label gate does not cover controls created through the DOM API in the vendored PCF renderer
(`features/cost/capex-costs/pcf/ui/GridRenderer.js`). That file's identities are documented in
`ProjectDocs/migration-plans/09-tosca-automation-conventions.md`; check them by hand when it changes.

As of the last verified run in this app (22 Oct 2026): **3,859 tests passing, 145 files**,
81 data sources; `typecheck`, `build`, and `lint` (warnings only) all clean. (`ProjectDocs/app-docs/APP-README.md` still says "247 tests" and
`appId: null` — both stale; see `ProjectDocs/instructions/PROJECT-MAP.md` on doc drift. Prefer a fresh run over
any number quoted in a doc, including this one, if it matters to the task at hand.)

### Vitest specifics worth knowing before debugging a flaky run

- Config uses the `threads` pool, not Vitest's default `forks` — `forks` has been observed to
  never complete its worker handshake on this checkout, specifically because the project lives
  under a OneDrive-synced path with spaces in it. This is a Windows/OneDrive workaround, not a
  general recommendation.
- Test environment defaults to `node` (fast — most tests are pure `rules.ts`/`domain` logic);
  a component test opts into `jsdom` with `// @vitest-environment jsdom` at the top of the
  file.
- `deps.optimizer.web.enabled` is on so jsdom test workers don't have to transform ~2,300
  Fluent UI modules one file at a time, which otherwise blows the worker-handshake budget on
  this same OneDrive checkout.

### There is no mock mode

Unlike the former skeleton (archived in `ProjectDocs/skeleton-reference/`), this app has **no in-memory Dataverse**.
`npm run dev` alone gives you the UI with no signed-in user and no data at all —
`getContext()` has nothing to answer it. To see real data locally, you need two processes:

```bash
npm run dev                                    # the app, on :3000 (strictPort)
pac code run --appUrl http://localhost:3000    # the connection host, on :8080
```

Then open the `apps.powerapps.com/.../app/local?_localAppUrl=…&_localConnectionUrl=…` URL that
`pac code run` prints — **not** `http://localhost:3000` directly. Full detail, including how
to land straight on a project via `?projectId=<guid>` on that URL, is in
`ProjectDocs/app-docs/03-STATUS.md` and `ProjectDocs/app-docs/APP-README.md`.

`resolvePlayAppUrl` (`src/app/deepLinks.ts`) is what makes Edit Costs/Edit Project's new-tab
links follow this automatically in dev mode rather than opening a bare, context-less
`localhost:3000` tab — see `ProjectDocs/instructions/CONVENTIONS.md` rule 12 before changing that logic.

### Deploying for a smoke test

```bash
cd ProjectCosts-CodeApp
npm run verify
pac code push          # deploys the dist/ build to whichever environment the active
                        # `pac auth` profile points at — check with `pac auth list` first
```

Confirm the active `pac` profile before pushing: `pac auth list`, look for the `*` marker. This
app is bound to `VSBCloud_Dev` (`https://vsbclouddev.crm4.dynamics.com/`, environment
`be41add6-6f60-ebb0-9c73-2480d6bc615d`, app id `807a2fba-665c-40f3-b158-ffe822aa7da4`).

### E2E parity suite (Playwright), on request before every commit

A browser suite that runs the same scenarios on the Canvas app and the Code app, and maps each
canvas Power Fx rule to its `rules.ts` function. It is not part of `npm run verify` (it needs a
signed-in browser and live data). Before every commit or merge the user is asked whether to run it.
The prompt, the inputs to ask for and the rule are in `ProjectDocs/instructions/E2E-PARITY-PROMPT.md`.
It is the answer to the G-WALK gap listed below.

## The reference harness — five layers, nine gates

`ProjectDocs/app-docs/VSBCloud-Harness-Plan.md` defines this for the *skeleton's* 23-
screen mock-mode build. It's worth knowing even though this app doesn't implement it, because
it's the discipline to port over deliberately where it's missing here, not to copy wholesale.

**Five layers** (types → unit/pure-rules → unit/components-and-mock → build → scenario walk),
designed to run in under three minutes total so developers won't skip it. **Nine gates**:
G-TYPE, G-LINT, G-IDS, G-MATRIX, G-OWN, G-LABEL, G-UNIT, G-BUILD, G-WALK, and **G-SEC** — the
one that checks whether Dataverse itself refuses an unauthorized write, which "cannot be
satisfied from a repository" and must never be read as passing just because it skipped with no
environment configured.

Since solution 1.21.753 (15 Oct 2026) the skeleton runs one more static gate, **G-A11Y**
(`ProjectDocs/skeleton-reference/docs/G-A11Y.md`): every canvas `AccessibleLabel` must reach
its code-app control as `aria-label` (caption) + `data-testid` (canvas name), with a baseline of
owed wiring. This app has no equivalent yet, and puts the canvas name on `aria-label` instead
(`ProjectDocs/migration-plans/09-tosca-automation-conventions.md`) — see
`ProjectDocs/app-docs/1.21.753-REQUIRED-CHANGES.md`.

**What this app already has, in harness terms**: G-TYPE, G-UNIT, G-BUILD (the three npm
scripts above) — and, uniquely, this app is the only lineage in the workspace that has
actually exercised **G-SEC's spirit for real**, because it talks to live `VSBCloud_Dev`, not
mock data. What it's missing relative to the reference harness:

- **G-WALK** (a scripted real-browser walk through every screen). Nothing like
  `scripts/scenario.mjs` exists here yet. The scenario walk caught a defect
  (`+ Add Project` navigating into an unreachable guard) that passed the entire unit suite —
  that class of bug is exactly what's currently unguarded in this app.
- **G-LABEL** as an automated check. Label fidelity (`ProjectDocs/instructions/MIGRATION-STRATEGY.md`) is
  enforced by convention and review only, not by a script that diffs canvas strings against
  `MSG` objects.
- **G-OWN** as an automated check. The `OwningBusinessUnit@odata.bind` rule
  (`ProjectDocs/instructions/CONVENTIONS.md` rule 4) is enforced by convention only.
- **G-MATRIX** / a security-privilege model. This app doesn't yet have a `matrix.json`
  equivalent; check `src/platform/` for whatever privilege handling exists before assuming
  there's parity with the skeleton's model.

If you're asked to "harden the harness" for this app specifically, G-WALK and an automated
G-LABEL check are the two highest-value additions — both are concrete, both already have a
worked example to adapt from in the skeleton (`scripts/scenario.mjs`, `scripts/check-labels.mjs`),
and both catch classes of bug this app has already paid for once (the unreachable-create-path
bug class for G-WALK; silent wording drift for G-LABEL).

## Test ID convention

`UT-<SCREEN>-NNN`, one id per `it()`, e.g. `UT-OV-051` in `features/project-overview/
rules.test.ts`. Keep ids stable when editing a test — a renumbered id breaks the trace from "a
documented rule" to "the case that pins it."
