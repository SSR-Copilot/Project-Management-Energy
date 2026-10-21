# Session handoff — 15 Oct 2026: one code app, skeleton merged in and retired

Use this as the starting input for the next chat. It records what was asked for, what was decided, what was changed and verified, and what is still open. Paths are relative to the workspace root (`Project-Management-Energy-WorkDev1/`) unless stated otherwise.

## 1. Where things stand (read this first)

- **One app.** `ProjectCosts-CodeApp/` is the single Power Apps code app.
  - Stack: React 19, TypeScript and Vite on Fluent v9, reading and writing live Dataverse in VSBCloud_Dev.
  - Concept: the app follows only its own concept (`ProjectDocs/app-docs/APP-README.md` rules 1–9 and `ProjectDocs/instructions/CONVENTIONS.md`).
  - Folders: features are split by phase, `src/features/{admin,pm,cost}/<slug>/`. This is the one skeleton idea adopted, at the user's request.
- **What is built:**

  | Area | State | Routes |
  |---|---|---|
  | Project Overview (`features/pm/project-main`) and the five Cost screens (`features/cost/*`) | Live, reading and writing Dataverse | `/projects`, `/costs/*` |
  | 6 Admin screens | UI built, **not connected** | `/admin/<screen>` |
  | 10 PM screens | UI built, **not connected** | `/project/<screen>?projectId=` |

  "Not connected" means each `hooks.ts` returns `notConnected()` from `src/data/notConnected.ts` and lists its tables in `TABLES`. Every write command is disabled. See `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D14.
- **The skeleton is gone.** `VSBCloud-Code-App-Skeleton/` was removed. Everything of it worth keeping is archived, reference-only, in `ProjectDocs/skeleton-reference/`. Its `README.md` and `REMOVED-FROM-SKELETON.txt` record what is there and what was taken out.
- **Last verified results:**

  | Check | Result |
  |---|---|
  | `npm run typecheck` | 39 errors, all of them the missing `.power/` import; none from this session's work |
  | `npx vitest run` | **2,355 passed, 0 failed**. 9 files cannot load, all because `.power/` is missing |
  | `npm run lint` | Clean (warnings only) |
  | `vite build` with a temporary `.power` stub | Builds; no mock code in the bundle |

## 2. Blockers before the app can run

1. **`ProjectCosts-CodeApp/.power/` is missing.**
   - It is `pac` output. `data/client.ts` and every generated service import `.power/schemas/appschemas/dataSourcesInfo.ts`.
   - No copy exists on this machine: not in the checkout, the sibling folders, or any zip under `VSBCloud_CodeApps`.
   - Until it is restored, `npm run dev` and `npm run build` fail.
2. **There is no `pac` profile for VSBCloud_Dev.**
   - The current profiles point at "S&I Prac" and "Xebia Nederland B.V.".
   - The user must sign in interactively: `pac auth create --name VSBCloud_Dev --environment https://vsbclouddev.crm4.dynamics.com/`
   - Then re-register the 38 tables listed in `ProjectCosts-CodeApp/power.config.json`, one at a time: `pac code add-data-source -a dataverse -t <logical-name>`.
   - After each one, diff `.power/schemas/appschemas/dataSourcesInfo.ts`. CONVENTIONS rule 9 warns that the command can drop previously registered tables.
3. **To run with real data,** use two processes: `npm run dev` (port 3000) and `pac code run --appUrl http://localhost:3000` (port 8080). Then open the `apps.powerapps.com/.../app/local?...` URL that pac prints, not `localhost:3000`.

## 3. What was done, in order

1. **Understood the workspace.** There were four documentation layers. Two inputs the docs referred to were missing:
   - `ProjectDocs/_extracted/msapp/` (unpacked canvas source): restored by unpacking the two `.msapp` files from `ProjectDocs/_extracted/VSBCloud/CanvasApps/`. This also fixed the logo-PNG import that 5 test files depended on.
   - `.power/`: still missing (see §2).
2. **Merged the skeleton's missing files into the app**, without changing app files. Cost screens were moved into `features/cost/`, Project Overview into `pm/project-main`, and Report Problem into `shared/`. Admin and PM screens were wired as routes. The theme was unified on the app's tokens.
3. **Cleaned up skeleton tooling.**
   - Dead files deleted.
   - The mock backend made lazy-loaded so it stayed out of the bundle.
   - `.env.example` defaulted to `power`; the file was later archived.
   - Skeleton tooling and docs moved out of `ProjectCosts-CodeApp/`.
4. **Moved to the app concept only (user decision).**
   - All skeleton infrastructure taken out of `ProjectCosts-CodeApp/src`: mock backend, data client, repositories, store, `matrix.json`, flows client, a11y, skeleton components and adapters. It was moved to the archive, not deleted.
   - Pure rules kept.
   - The 16 Admin and PM screens rebuilt UI-first by 9 parallel agents, using the app's kit (Fluent v9, `@/components`, `@/theme/tokens`, `canvas.css`), with verbatim canvas captions and a `Screen.test.tsx` in each folder.
5. **Centralised the table names.**
   - New file `src/data/dataverseNames.ts` holds the entity sets and option sets, each checked against `ProjectDocs/reference/dataverse-entities.json`.
   - Two real defects corrected: `vsb_projectmemberdescriptionses` and `vsb_projectmemberses`.
   - Three names are marked UNVERIFIED.
6. **Wired navigation into the app's own router and rail.**
   - `app/navigation.ts` gained `PM_NAV_ITEMS` and `ADMIN_NAV_ITEMS`, transcribed from the canvas `LeftNavigationMenu` and `LeftAdminNavigationMenu`.
   - `LeftNav` picks the item set from the path.
   - `ProjectScreenGate` added.
   - `/projects/new` and `/projects/:id/general` redirect to `/project/general`.
   - Tests added: `src/app/ScreenRoutes.test.tsx` (21) and rail tests in `navigation.test.ts`.
7. **Removed the skeleton folder entirely, in stages.** Each file was either confirmed byte-identical to an archived copy or moved into `ProjectDocs/skeleton-reference/` (verified by hash) before deletion.
8. **Cleaned up the workspace.**
   - Duplicate docs collapsed to one copy, in `ProjectDocs/app-docs/`.
   - Dev probe pages and template leftovers deleted.
   - Skeleton `CLAUDE.md` files renamed `*.skeleton.md`, so they are not loaded as instructions.
   - The root planning and requirement docs moved into `ProjectDocs/app-docs/` (`MONDAY-DEMO-IMPLEMENTATION-PLAN.md`, `1.21.753-REQUIRED-CHANGES.md`).
   - Citations updated across `ProjectDocs/instructions/`, `ProjectDocs/migration-plans/` and code comments.

## 4. File-level audit of the app's original 231 files

| Status | Files |
|---|---|
| Unchanged | 135 |
| Moved, byte-identical | 49 |
| Archived, identical (the old General Data placeholder) | 1 |
| Changed on purpose | 42 |
| **Permanently deleted** | **4** |

The 42 changed files:
- 34 are import-path changes for the moved folders. This was proven reversible byte-for-byte at the time.
- 7 are additive route and rail changes.
- The rest are comment-only.

The 4 deleted files: `ProjectCosts-CodeApp/devdots.html`, `ProjectCosts-CodeApp/devnet.html`, `ProjectCosts-CodeApp/public/icons.svg`, `ProjectCosts-CodeApp/src/assets/vite.svg`. They are unreferenced, and the two HTML files pointed at sources that do not exist.

Docs outside `ProjectCosts-CodeApp/`:
- `ProjectDocs/app-docs/CHANGES-FROM-INPUT copy.md` deleted (an identical copy is kept).
- `ProjectDocs/app-docs/CONVENTIONS.md` deleted (identical copy at `ProjectDocs/skeleton-reference/CONVENTIONS.md`).
- `ProjectDocs/app-docs/CLAUDE.md` moved to `ProjectDocs/skeleton-reference/docs/WORKING-AGREEMENT.skeleton.md`.

OneDrive version history and the Recycle Bin hold the pre-session originals.

## 5. Open decisions (detail in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D14 and D15)

- **a. Admin rail visibility.** The canvas shows admin rows only when `Or(IsApplicationAdministrator, IsControllerOwnData)`. The app does not load those role flags yet, so the rows are shown to everyone. They are harmless while the screens are not connected.
- **b. Finance empty cards.** With no rows, Finance shows five empty category cards; the canvas shows none.
- **c. Generators command bar.** "Add Others" renders flat, because the app's `CommandBar` has no sub-menus.
- **d. Must fix before connecting:** in `admin-contract/rules.ts`, `CHOICE_ADMIN.bopContractTypes` values are off by one versus the real option set (None 952850000, Development 952850001, Construction 952850002).
- **e. Planning `cooperationDetails` length:** max length is 55; the canvas uses 300.
- **f / g. Revenues mismatches:** a `pageLock` bullet wording and the `balancingYearOptions` range (0–35 against the canvas 0–30).
- **h / i. Wording:** two strings that are not canvas-verbatim (a gates delete title, and `UNIT_ERROR` in admin-cost).
- **j. "Assumptions … SQL" sources** (Revenues, Debt, Banks, KfW Tranche) are Fabric SQL, not Dataverse. How to connect them is undecided (see D2).
- **Already in the log before this session:** D1 (permission model), D2 (BoP margin source), D3, D6, D7, D12, D13, and the 1.21.753 changes R1–R4 (`ProjectDocs/app-docs/1.21.753-REQUIRED-CHANGES.md`; the R2–R4 reference implementation is in `ProjectDocs/skeleton-reference/features/cost/capex-costs/rules.ts`).

## 6. How to connect an Admin or PM screen (next step after the blockers)

1. Register the screen's `TABLES` (from its `hooks.ts`) with `pac code add-data-source`, and diff `dataSourcesInfo.ts`.
2. Read the JSDoc checklist at the top of the screen's `hooks.ts`: table, filter, `$select` and writes for each hook.
3. Read the original working implementation in `ProjectDocs/skeleton-reference/features/<phase>/<slug>/hooks.ts`. It is reference only, never imported.
4. Re-implement the hooks with TanStack Query over the generated services, through `data/client.ts` (`fetchAll` / `fetchPage` / `deleteRecord`), `platform/errors` (`unwrap`) and `data/odata.ts` filters. Return `{ data, isLoading, error, connected: true }` so `Screen.tsx` does not change.
5. Re-enable the write commands. Resolve that screen's D15 items. Click through it against VSBCloud_Dev with `pac code run`.

## 7. Where things are

| What | Where |
|---|---|
| The app | `ProjectCosts-CodeApp/` |
| App concept and rules | `ProjectDocs/app-docs/APP-README.md`, `ProjectDocs/instructions/CONVENTIONS.md`, `ProjectDocs/instructions/MIGRATION-STRATEGY.md`, `ProjectDocs/instructions/PROJECT-MAP.md` |
| Decision log, bugs, plans, harness, requirement docs | `ProjectDocs/app-docs/`, including `VSBCloud-Harness-Plan.md`, `VSBCloud.md`, `guide*-ui-notes-*.md`, `G-LABEL.md`, this file |
| Per-screen build specs | `ProjectDocs/migration-plans/screens/0NN-*.md` (written against the skeleton; paths redirected to the archive) |
| Canvas source (formulas, labels) | `ProjectDocs/_extracted/msapp/{projectmanagement,projectcosts}/Src/*.pa.yaml` |
| Dataverse names | `ProjectDocs/reference/dataverse-{entities,attributes}.json` and `ProjectCosts-CodeApp/src/data/dataverseNames.ts` |
| Skeleton archive | `ProjectDocs/skeleton-reference/` (`features/`, `removed-from-app/`, `skeleton-app/`, `solution/` (writes Dataverse security; do not run without sign-off), `scripts/`, `reference/`, `ProjectDocs/app-docs/`) |

## 8. Continued 16 Oct 2026: control labelling and canvas validation

**Asked for:**
1. Every UI control gets an `aria-label` and a `data-testid`, following the Tosca convention.
2. The rule is repeated for every future feature or change before commit or merge.
3. Each control's properties are validated against the canvas source, per module.

**Done:**
- **About 230 controls labelled** across the shared components, the Cost screens, Project Overview and the PM and Admin screens.
  - The shared primitives were extended: `CostSelect` and `PanelExtraButton` take `testId`; `PanelButtons` labels Save/Cancel and takes `saveTestId`/`cancelTestId`.
  - `Choices` radios now have an explicit `value` and a per-option test id.
  - About 15 other radios and checkboxes gained the `value` they were missing.
- **41 `aria-label`s changed to the canvas `AccessibleLabel`, verbatim.** Usually that is the control's own name, which is what the canvas rendered and what Tosca recorded. Two General Data record-stamp ids were corrected to the canvas names. Ten tests were updated to query by the canvas names.
- **Two gates added.** Both run inside `npx vitest run` and inside `npm run verify`, which runs typecheck, lint, both gates, the tests and the build:

  | Gate | Script | Tests | Checks |
  |---|---|---|---|
  | Presence | `ProjectCosts-CodeApp/scripts/check-control-labels.mjs` (`npm run check:labels`) | `src/test/controlLabels.test.ts`, UT-LABELS-001..003 | Every interactive control has both attributes; no literal test id is repeated in a file |
  | Canvas identity | `ProjectCosts-CodeApp/scripts/check-canvas-identities.mjs` (`npm run check:canvas`) | `src/test/canvasIdentities.test.ts`, UT-CANVASID-001..003 | Each canvas-named id is a real control on that feature's own screen, of a matching type, and its `aria-label` equals the canvas `AccessibleLabel` |

  A new feature folder needs an entry in the canvas validator's `MODULES` list.
- **The rule is written down** in `ProjectDocs/instructions/CONVENTIONS.md` rule 16 plus a "Before every commit or merge" section, `ProjectDocs/instructions/TESTING-AND-HARNESS.md`, the root and `ProjectCosts-CodeApp/` `CLAUDE.md`, `ProjectDocs/migration-plans/09-tosca-automation-conventions.md`, and memory.
- **Last results:**
  - control-labels: 0 missing, 0 duplicates.
  - canvas-identities: 0 findings in C1–C5.
  - Vitest: 2,358 passed, 0 failed; the same 9 files cannot load because `.power/` is missing.
  - Typecheck: no new errors. Lint: clean.
  - `npm run verify` stops at typecheck until `.power/` is restored.

**Open (detail in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` D16):**
- The CAPEX PCF grid renderer (`GridRenderer.js`, `ActionDropdown.js`) is outside both gates, and several of its controls have no `aria-label` or `data-testid`.
- About 30 existing `aria-label`s are built from record data (rule-2 deviations), left unchanged.
- Per-row test ids repeat on every row in the Admin, Checklist, Revenues, Planning and Generators screens.
- The canvas source on disk is solution 1.21.709, so 1.21.753-only controls cannot be validated. The Replace Generator toggle is exempted for that reason. `VSBCloud_managed (2).zip` (1.21.753) sits in `VSBCloud_CodeApps/` and could be unpacked to validate them.
- Trade-off accepted: screen readers now announce canvas control names on the 41 controls whose labels changed.

## 9. Continued 16 Oct 2026 (new chat): `.power/` restored, both §2 blockers closed

- **pac profile.** Active profile `[3]` points at VSBCloud_Dev, signed in as `shakti.singh@vsb.energy`. It has no name, so select it by index. `pac org who` confirms environment `be41add6-6f60-ebb0-9c73-2480d6bc615d`, which matches `power.config.json`.
- **`.power/` regenerated.** The 38 tables in `power.config.json` were re-added one at a time with `pac code add-data-source -a dataverse -t <logical-name>`.
  - `dataSourcesInfo.ts` was checked after each one. It grew by exactly one entry every time; nothing was dropped.
  - The file is keyed by entity set name. 38 schemas are in `.power/schemas/dataverse/`.
  - `power.config.json` and `src/generated/` are byte-identical to the copies backed up before the run, so pac changed nothing outside `.power/`.
  - `.power/` is git-ignored. Regenerate it the same way on any new checkout.
- **`npm run verify` passes end to end** (exit 0):
  - Typecheck: 0 errors.
  - Lint: clean.
  - control-labels: 0 missing, 0 duplicates. The 55 aria-label warnings are the data-built labels from D16.
  - canvas-identities: pass.
  - Vitest: **81 files, 2,547 tests, 0 failed**. The 9 files that could not load before now run.
  - Build: succeeds.
- **Next:** run with real data. `npm run dev` and `pac code run --appUrl http://localhost:3000`, then open the `apps.powerapps.com/.../app/local?...` URL that pac prints. After that, connect the Admin and PM screens as described in §6.
