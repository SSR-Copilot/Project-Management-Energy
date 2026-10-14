# Testing and the harness — what exists today vs. the reference target

## What actually runs today, in `ProjectCosts-CodeApp/app/`

```bash
cd ProjectCosts-CodeApp/app
npm install
npm run dev          # http://localhost:3000 — no Power context, no data (see below)
npx vitest run       # the whole suite
npm run typecheck    # tsc --noEmit
npm run build         # tsc -b && vite build
npm run lint          # oxlint src
```

As of the last verified run in this app: **1,312 tests passing, 41 files**; `typecheck`,
`build`, and `lint` all clean. (`ProjectCosts-CodeApp/README.md` still says "247 tests" and
`appId: null` — both stale; see `.claude/PROJECT-MAP.md` on doc drift. Prefer a fresh run over
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

Unlike the skeleton (`VSBCloud-Code-App-Skeleton/`), this app has **no in-memory Dataverse**.
`npm run dev` alone gives you the UI with no signed-in user and no data at all —
`getContext()` has nothing to answer it. To see real data locally, you need two processes:

```bash
npm run dev                                    # the app, on :3000 (strictPort)
pac code run --appUrl http://localhost:3000    # the connection host, on :8080
```

Then open the `apps.powerapps.com/.../app/local?_localAppUrl=…&_localConnectionUrl=…` URL that
`pac code run` prints — **not** `http://localhost:3000` directly. Full detail, including how
to land straight on a project via `?projectId=<guid>` on that URL, is in
`ProjectCosts-CodeApp/docs/03-STATUS.md` and `ProjectCosts-CodeApp/README.md`.

`resolvePlayAppUrl` (`src/app/deepLinks.ts`) is what makes Edit Costs/Edit Project's new-tab
links follow this automatically in dev mode rather than opening a bare, context-less
`localhost:3000` tab — see `.claude/CONVENTIONS.md` rule 12 before changing that logic.

### Deploying for a smoke test

```bash
cd ProjectCosts-CodeApp/app
npm run typecheck && npx vitest run && npm run build
pac code push          # deploys the dist/ build to whichever environment the active
                        # `pac auth` profile points at — check with `pac auth list` first
```

Confirm the active `pac` profile before pushing: `pac auth list`, look for the `*` marker. This
app is bound to `VSBCloud_Dev` (`https://vsbclouddev.crm4.dynamics.com/`, environment
`be41add6-6f60-ebb0-9c73-2480d6bc615d`, app id `807a2fba-665c-40f3-b158-ffe822aa7da4`).

## The reference harness — five layers, nine gates

`VSBCloud-Code-App-Skeleton/VSBCloud-Harness-Plan.md` defines this for the *skeleton's* 23-
screen mock-mode build. It's worth knowing even though this app doesn't implement it, because
it's the discipline to port over deliberately where it's missing here, not to copy wholesale.

**Five layers** (types → unit/pure-rules → unit/components-and-mock → build → scenario walk),
designed to run in under three minutes total so developers won't skip it. **Nine gates**:
G-TYPE, G-LINT, G-IDS, G-MATRIX, G-OWN, G-LABEL, G-UNIT, G-BUILD, G-WALK, and **G-SEC** — the
one that checks whether Dataverse itself refuses an unauthorized write, which "cannot be
satisfied from a repository" and must never be read as passing just because it skipped with no
environment configured.

**What this app already has, in harness terms**: G-TYPE, G-UNIT, G-BUILD (the three npm
scripts above) — and, uniquely, this app is the only lineage in the workspace that has
actually exercised **G-SEC's spirit for real**, because it talks to live `VSBCloud_Dev`, not
mock data. What it's missing relative to the reference harness:

- **G-WALK** (a scripted real-browser walk through every screen). Nothing like
  `scripts/scenario.mjs` exists here yet. The scenario walk caught a defect
  (`+ Add Project` navigating into an unreachable guard) that passed the entire unit suite —
  that class of bug is exactly what's currently unguarded in this app.
- **G-LABEL** as an automated check. Label fidelity (`.claude/MIGRATION-STRATEGY.md`) is
  enforced by convention and review only, not by a script that diffs canvas strings against
  `MSG` objects.
- **G-OWN** as an automated check. The `OwningBusinessUnit@odata.bind` rule
  (`.claude/CONVENTIONS.md` rule 4) is enforced by convention only.
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
