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

As of the last verified run in this app (27 Oct 2026, on `2c7e6aa` plus the D51 §11.17–§11.18
fixes): **4,304 tests in 157 files**, all passing. 13 jsdom files had worker-start timeouts under
the full run and passed on their own. There are 84 data sources (`check:power`: 84 registered,
0 problems). `typecheck`, `build`, and `lint` (warnings only) are all clean. knip lists 12 unused
files, as expected (D52). The run on `2c7e6aa` itself had 4,293 tests. The previous recorded run
was 26 Oct on `fceb336`: 3,998 tests in 148 files, 81 data sources.
UT-ADGATE-910 (`features/admin/admin-gates-approvals/Screen.test.tsx`) was a known timing flake
under a full run. It is **fixed (29 Oct 2026, uncommitted; `01-BUGS-FOUND.md` CA-19)**.

The cause: in jsdom, tabster never activates a modalizer for a Fluent dialog that has just opened.
250 ms later it marks every open dialog and drawer `aria-hidden` for good. So a default
(accessible-only) role query on an open dialog works only if it runs within those 250 ms.

In a jsdom screen test, query an open Fluent dialog or drawer with `{ hidden: true }`, as
UT-ADGATE-905/906/910/914/915/916 do. Do not raise the timeout. If a full run still fails on a
single jsdom timing test, the run is aborted, not red. Re-run that file, then run
`npm run build`, because the aborted verify skipped it. (`ProjectDocs/app-docs/APP-README.md` still says "247 tests" and
`appId: null` — both stale; see `ProjectDocs/instructions/PROJECT-MAP.md` on doc drift. Prefer a fresh run over
any number quoted in a doc, including this one, if it matters to the task at hand.)

**The runs leading up to it (27 Oct 2026, D51; committed in `5d50e2b`).** The full `npm run verify` ran after the
first wave of the Add Cost from Table bulk save: **152 files, 4,079 tests**, all green, build OK.
After the second fix wave it ran again: **152 files, 4,129 tests**. 4,128 passed, and only
UT-ADGATE-910, the known flake, failed; it passed 33/33 when its file was run alone. `npm run build`
passed separately. Since then, `src/features/cost/costing/useAddCostSheet.test.ts`
(UT-ACSHEET-QUERY-001) has been added. The change adds these test files:
- `src/features/cost/add-costs-from-table/savePlan.test.ts`, UT-ACSAVE-001…031. It includes a
  benchmark (10,000 stored costs, 800 changed rows, about 18 ms) and a 400-seed equivalence
  property test against the legacy path. Second wave: 020…031.
- `src/data/bulkWrites.test.ts`, UT-BULK-001…047, with gaps. Second wave: 040…047.
- `src/data/addCostSheetBulk.test.ts`, UT-ACBULK-001…030. Second wave: 018…030.
- `src/data/addCostSheet.bulk.test.ts`, UT-ACSHEET-BULK-001…023, end to end with a mocked SDK.
  Second wave: 015…023.

Two existing files gained tests: `rules.test.ts` (UT-ADDCOST-SAVEMSG-001…008, second wave) and
`src/data/addCostSheet.test.ts` (UT-ACSHEET-LEGACY-001…003). `check:power` now reports **84**
registered, 0 problems: 81 tables plus the `CreateMultiple`, `UpdateMultiple` and `UpsertMultiple`
actions. It accepts the `environment_<id>` entry those actions need in `power.config.json`
(CONVENTIONS rule 9). The manual DEV test and the automated part are in
`ProjectDocs/app-docs/13-ADDCOST-BULK-SAVE-TEST-PLAN.md`.

**Performance wave (27 Oct 2026, D51 §11; committed in `5d50e2b`, covered by the `2c7e6aa` run
above).** It adds or changes these tests:
- `src/data/addCostSheetBulk.test.ts`: UT-ACBULK-031…038 (parallel verify reads, the concurrent
  stage order, stage B, settle-then-reconcile, the retried "new" target, timings).
- `src/data/addCostSheet.bulk.test.ts`: UT-ACSHEET-BULK-024…034 (`CreateMultiple` /
  `UpdateMultiple` split and parallel groups, the per-action 501 fallback and flags, one-group and
  mixed failures, the save log). 024–026 were rewritten for the per-action fallback; 003 and 008
  were updated for the parallel order.
- `src/features/cost/costing/useAddCostSheet.test.ts`: UT-ACSHEET-QUERY-001/002 (002: the Save
  does not wait for the post-save reloads).
- `src/platform/errors.rootCause.test.ts`: UT-ERR-ROOT-001/002.

**Round-trip and prepare pass (27 Oct 2026, D51 §11.12; committed in `5d50e2b`, covered by the
`2c7e6aa` run above).** Two new test files:
- `src/features/cost/add-costs-from-table/prepare.bench.test.ts`, UT-ADDPERF-001…003: the Save's
  client prepare on a seeded 15,000-row sheet. 001 times each step and prints the table with
  `--reporter=verbose` (generous wall-clock bounds, plus the exact 3,487 changed rows); 002 and 003
  count element reads on the reference arrays, which is the machine-independent guard against a
  scan per row.
- `src/features/cost/add-costs-from-table/spreadsheet/SpreadSheet.test.tsx` (jsdom),
  UT-ADDCOST-070, 071: one `onDataChange` on mount, and a new grid still re-hydrates.

Existing files gained:
- `src/data/addCostSheetBulk.test.ts`: UT-ACBULK-040…050 (no verify on a first attempt, deletes
  before the verify answers, `costDeletesIfExist`, a failed verify read after deletes landed,
  `RowsGoneError` waiting for the deletes, the reconcile comparing a skipped contract).
- `src/data/addCostSheet.bulk.test.ts`: UT-ACSHEET-BULK-035…040 (404 as already gone, 403 still
  rejects, the verify skip and when it stays on, the mid-save `UpdateMultiple` 501 guard, the log
  line's metrics).
- `src/data/concurrency.test.ts`: UT-CONC-013, 014 (`peak()`, `reset()`).
- `spreadsheet/adapter.test.ts`: UT-ADDCOST-062…066, 072, 073 (the indexed code against the
  replaced code, kept as an oracle) and 079…083 (only edited rows reported, through a real grid).
- `rules.test.ts`: UT-ADDCOST-067…069 (indexed rules against oracles) and 074…078 (`diffRows` by
  identity, CA-11; 077 also pins the CA-12 validation gap).
- `savePlan.test.ts`: UT-ACSAVE-032…039 (no contract target when nothing changes).

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
