# Parity in one hour per screen: plan and harness (D80, 3 Nov 2026)

Written for: the developers who run and extend the Playwright parity suite.

**Goal.** Every parity layer of one screen, both apps, within **60 minutes of wall-clock time including the review**. That
covers static checks, rules, UI, UX, validation, gates, flows, data and platform. A compare-only run (cached Canvas) takes
about 15 minutes. Nothing is trimmed: all validation inputs are still typed into **both** apps. The time comes out of the
waiting, not out of the checks.

Code: `ProjectCosts-CodeApp/e2e/harness/` (shared) and `e2e/screens/<slug>/` (one manifest and its lanes per screen). The
contract every module follows is `e2e/harness/contract.ts`.

## 1. Budget

| Block | Minutes | What happens |
|---|---|---|
| Preflight | 3 | Sessions valid, servers up, data fingerprint, run id |
| Phase 1: read lanes in parallel | 15–20 | 5 lanes (3 Canvas, 2 code app), one page per app per lane |
| Phase 2: write lanes | 15–25 | After phase 1 on the shared test project; beside it when each app has its own sandbox project |
| Phase 3: compare and report | 2 | Offline comparison of the recorded facts; one `summary.md` |
| Review | 10–15 | Differences are already sorted: new, known, stale, artefact, not captured |
| **Total** | **≤ 60** | |

## 2. Where the old suite lost its time, and the fix

| Cause (measured 3 Nov 2026) | Fix in the harness |
|---|---|
| `workers: 1`, every spec serial, one shared `e2e/results/` emptied by each run | Lanes as parallel workers; output per run in `e2e/runs/<runId>/` |
| The Canvas recorded again and compared on every run | Facts recorded per app and compared offline; Canvas reference cached by canvas version + data fingerprint (`compare` mode) |
| 33 screen loads over 7 specs | One load per app per lane; `reset()` between states (Cancel, deselect, fold) |
| `waitForStable`: polls the whole page's text until three equal reads | Code app: `window.__vsbIdle()` (no query or mutation in flight, no overlay), active only with the test flag. Canvas: watches the busy indicators and the target control only |
| `retries: 1`, video always recorded | One re-run pass at the end, never inline; video off; trace on first failure |
| Analysis by hand | `summary.md` with sorted differences, lane timings against their budgets, states not captured |

**Deviation from the first plan:** the code app keeps the Vite **dev server**, not a built preview. Reason: `lib/dataverse.ts`
reads and cleans up rows by importing the app's own modules through the dev server, and the fingerprint and the row
comparison depend on that. Reloads are already stopped (`vite.config.ts` does not watch `e2e/`).

## 3. Data isolation

- A **read project** is never written: `PARITY_READ_PROJECT_ID`. The harness reads no screen-named variable; the old Land
  Lease specs keep `LANDLEASE_PROJECT_ID`.
- **Write projects:** `PARITY_WRITE_PROJECT_CANVAS` / `PARITY_WRITE_PROJECT_CODE`. With both set (and different), the write
  lanes run beside phase 1. Otherwise they use the read project and run after phase 1, so the read lanes never see a
  half-written row.
- Project ids are passed only as environment variables, never written into a file.

## 4. Lanes (Land Lease)

| Lane | Contents |
|---|---|
| canvas-A / code-A | Visual states; UX; deep link and refresh (code: smoke 001–006) |
| canvas-B / code-B | Validation, every input; gates |
| canvas-C | UX checks that need the Canvas (hover, zoom) |
| write-canvas / write-code | Flows S1–S9, standard import, write 046/047; rows compared by tag; cleanup |
| (vitest) | The Canvas recordings run through `rules.ts` inside `npm run verify` |

Each lane has a budget (manifest `budgets`). A lane over its budget plus 20 % stops and is reported by name.

## 5. Trust

- **Sorting:** new / known (`known`) / stale known / artefact (`artefacts`) / not captured.
- **Mutation proof:** `npm run parity:mutate -- apply` makes 6 known source changes (caption, size, gate, message, written
  column, aria-label); a run must report all 6. Then `-- revert`. Run it once per harness change.
- **Re-runs:** failed tests run once more at the end; a test that passes only then is reported **flaky**, never passed.
- **Sessions:** preflight stops the run at minute 0 if a saved login has expired.

## 5a. Dynamic screens: any screen, no code per screen (user requirement, 3 Nov 2026)

The harness is not tied to Land Lease. Everything under `e2e/harness/` is screen-agnostic, and nothing there imports a
screen's code.

- **A screen is one folder.** `e2e/screens/<slug>/manifest.ts` is found automatically (`e2e/harness/screens.ts`); there is
  no registry to edit. `PARITY_SCREEN=<slug>` (or `--screen a,b` / `--screen all` on `run.mjs`) picks it. There is no
  default screen: without one, the run stops with "set PARITY_SCREEN to one of: <screens>".
- **Generic lanes.** `e2e/harness/lanes/*.lane.ts` run every layer from the manifest: visual, validation, gates, ux,
  platform, flows. Which lane runs a layer comes from `DEFAULT_LANES`, which a manifest can override.
- **Screen-specific checks.** A screen adds its own `e2e/screens/<slug>/*.lane.ts` only for a check no layer can express.
- **Opening a screen.** `open` names the app:
  - `cost`: project-scoped Cost screens;
  - `pm`: project-scoped Project Management screens;
  - `admin`: Application Settings, with no project;
  - `custom`: an opener of its own.

  `e2e/harness/openers.ts` maps each to the existing helpers.
- **Data.** `tables` describes the Dataverse tables the screen writes: generated service, primary key, tag column,
  parent lookup, delete order. The generic data layer (`e2e/harness/data.ts`) reads rows back by run tag, cleans up and
  builds the fingerprint from it. That replaces per-screen readers such as `lib/dataverse.ts`'s Land Lease functions.
- **Generic readers.** Validation reads the screen's verbatim `messages` and `controls.save`; gates read
  `controls.commands`; reset uses Escape, `controls.cancel`, and a reload if `controls.restMarker` is not visible. A
  manifest overrides a reader only when the screen needs it.
- **Mutation proof per screen.** A manifest lists its own `mutations`, and `scripts/parity-mutate.mjs` applies them for
  any screen.
- **More than one screen.** `--screen a,b` runs the screens one after the other, each in its own run folder, with an index
  page over all of them. Each screen keeps its one-hour budget.

## 6. A new screen

1. Run `npm run parity:gen -- <Screen>.pa.yaml`. It drafts `e2e/screens/<slug>/manifest.draft.ts` and
   `ProjectDocs/app-docs/e2e/RULEMAP-<slug>.draft.md` from the canvas YAML.
2. Review the draft and complete the manifest: states, baselines, flows.
3. Do one full run. Target: half a day to a day per screen; each full run after that up to an hour.

## 7. Done when

- **The hour:** three full Land Lease runs in a row at ≤ 60 minutes.
- **No coverage lost:** the same findings as the old suite, and the mutation proof reports 6 of 6.
- **Stable and clean:** fewer than 2 % of tests flaky, and nothing left on DEV.
