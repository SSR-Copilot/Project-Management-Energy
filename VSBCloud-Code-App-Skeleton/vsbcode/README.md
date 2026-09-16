# VSBCloud — Power Apps code apps

The VSBCloud **Project Management** and **Project Costs** canvas apps, rebuilt as a single
Power Apps **code app** on React 19, TypeScript and Fluent UI v9. Dataverse itself is
unchanged: the same tables, the same 17 Power Automate flows, the same security roles.

Twenty-three screens, in three phases — six administration screens, twelve Project
Management screens, five Project Costs screens. The plan that sequences them is not a
document, it is `src/app/buildPlan.ts`, and `src/app/buildPlan.test.ts` fails if the plan
and the feature tree disagree.

**Nothing in this package has ever run against a real Dataverse environment.** That is
deliberate and it is the first thing to understand about it — see *Limitations* below.

---

## What runs today, with no environment

```bash
npm install
npm run dev            # http://localhost:3000 — in-memory fixtures, no sign-in
npm test               # 1,720 tests in 40 files
npm run build          # tsc -b && vite build
npm run gates          # every gate a commit must pass; exits 0 today
```

The app opens in **mock mode** (`VITE_DATA_MODE=mock`, the default in `.env.example`).
`src/data/mock/mockBackend.ts` implements enough of the Dataverse Web API — `$select`,
`$filter`, `$top`, `$skip`, `$count`, `$orderby`, paging tokens — that every screen loads,
every command runs, and every write round-trips. The fixture data in
`src/data/mock/projectSeed.ts` is invented sample data for a demo; it is not VSB's.

### Running the demo as a single role

The default mock session carries five role assignments across four distinct roles — two held
directly and three through teams, so the union of direct and team-derived roles is exercised
— and `VSB - Application Administrator` is one of them. Nothing is therefore ever refused,
and a demo cannot show a locked screen. `VITE_MOCK_ROLES` replaces the whole set with a
comma-separated list of role names:

```bash
VITE_MOCK_ROLES="VSB - Project Manager Own Projects" npm run dev
```

Two cases are worth knowing, because they lock different things:

- `VSB - Project Manager Own Projects` — the administration section becomes **unreachable**.
  `canSeeAdminSection` is false, so all six routes render *"Administration is not available
  to your account"*. Verified: G-WALK's seven administration steps report exactly that page
  on a build made with this override.
- `VSB - Controller Own Data` — the administration screens **open, and are read-only where
  it counts**. The matrix grants the controller create and write on master data at
  `organization` but `delete: none`, so `privileges.forTable` returns `canDelete: false` and
  the delete commands are gone. This is the case that demonstrates the mechanism rather than
  just the guard.

Either way the privileges resolve through the same `matrix.json` the server will be
configured from, so what you see is what a correctly configured environment will do. An
unrecognised role name is kept on the session but grants nothing, and bootstrap traces it as
unmodelled — which is the correct treatment of a typo. The override lives in the mock branch
of `readRoles` in `src/platform/bootstrap.ts`.

---

## The tree

```
src/
  app/          buildPlan.ts — the 23-screen plan as data: phases, build order,
                dependsOn, exit gates, caveats. Tested against the feature tree.
  security/     matrix.json + index.ts — the single source of truth for role security
  platform/     Power Apps SDK binding, dataClient, privileges, odata, errors,
                telemetry, bootstrap
  data/         entity sets, repositories, query keys, the mock Dataverse
  domain/       pure business rules translated from Power Fx — no I/O, fully tested
  components/   23 shared modules exporting 26 components, plus useBreakpoint
  features/     admin/ · pm/ · cost/ · shared/   — see below
  flows/        typed wrappers over the flows, with FLOW_REGISTER as an allow-list
  theme/        AppTheme.palette and gblAppSizes as design tokens
  store/        Zustand — the replacement for the canvas gbl* variables
  routes/       route table and guards
scripts/        the gates: check-matrix, check-labels, check-test-ids,
                check-ownership, gsec, walk, scenario, extract-canvas-labels
solution/       the Dataverse side — roles, column security, custom APIs, plugins
reference/      the canvas label corpus and the two gate baselines
docs/           SECURITY.md, G-LABEL.md, and the screenshot notes per guide page
```

### Where a screen lives

One folder per screen, under the parent for its **phase**:

```
src/features/admin/<slug>/     phase 1 — six administration screens
src/features/pm/<slug>/        phase 2 — twelve Project Management screens
src/features/cost/<slug>/      phase 3 — five Project Costs screens
src/features/shared/           not a screen: useProjectContext, useDebouncedValue
```

so imports read `@/features/cost/capex-costs/rules`, and a folder is

```
Screen.tsx      default export; layout and composition only
rules.ts        every business rule as a pure function — no React, no network
rules.test.ts   Vitest cases, ids UT-<PREFIX>-NNN
hooks.ts        queries, mutations and privilege hooks (present on 21 of 23)
```

`admin/admin-cost` also carries `devexRules.ts`, `opexRules.ts` and `plan.ts` because one
screen holds two independent families. `cost/add-costs-from-table` has no `hooks.ts` and
`pm/app-loading` has neither `hooks.ts` nor `rules.ts` — everything that screen did became
routing and bootstrap.

### Phases, and why the build order is what it is

The build order is **Admin → Project Management → Project Costs**, and it is deliberately
not the document order. All five Project Costs screens and four Project Management screens
read tables an administration screen owns. Build the Cost app first and every one of them is
developed against fixtures whose shape is a guess; build the administration screens first
and they are developed against master data a person entered through the screen that will
maintain it in production. `dependsOn` in `src/app/buildPlan.ts` is the evidence: four of
the five Cost screens name an administration screen directly, and the fifth
(`add-costs-from-table`) reaches them through `capex-costs`.

| Phase | Folder | Screens | Build-days |
|---|---|---:|---:|
| 1 · Admin | `src/features/admin/` | 6 | 55 |
| 2 · Project Management | `src/features/pm/` | 12 | 166 |
| 3 · Project Costs | `src/features/cost/` | 5 | 71 |

Inside Phase 1 the order is `admin-default-checklists` → `admin-capex-accounts` →
`admin-milestones` → (`admin-gates-approvals` **and** `admin-contract`) → `admin-cost`.
The first and fourth are **mutually dependent**: `admin-default-checklists` references
Project Default Approvals and `admin-gates-approvals` references Project Default Checklists.
They share an `order` value in the plan and are one 13-day unit of work — one branch, one
pair of developers — not two screens that can be sequenced. `UT-PLAN2-009` asserts that this
is the only cycle in the graph and `UT-PLAN2-011` that the two share a build order.

`admin-cost` is 21 of Phase 1's 55 days on its own, and bigger than nine of the twelve
Project Management screens.

---

## The gates

Nine named checks. Eight are scripts that run here; the ninth, G-SEC, is a statement about a
Dataverse environment and cannot be satisfied from a repository at all.

| Gate | Command | What it catches |
|---|---|---|
| **G-TYPE** | `npm run gate:type` | type errors — `tsc --noEmit`, strict, `noUnusedLocals` |
| **G-IDS** | `npm run gate:ids` | a `UT-` id on two `it()`s, or cited in a comment with no test behind it. 1,263 ids today, 8 declared `@ut-ref` exemptions |
| **G-MATRIX** | `npm run gate:matrix` | an inconsistent security matrix: a duplicate entity set or logical name, a grant naming a role or table that does not exist, a write privilege on a `readOnly` table, a `projectData` table without `requiresOwningBusinessUnit` |
| **G-OWN** | `npm run gate:own` | a create on one of the 38 `requiresOwningBusinessUnit` tables whose payload does not write the owning business unit |
| **G-LABEL** | `npm run gate:label` | a user-visible string that is not transcribed from the canvas, or has no provenance comment saying where it came from. See `docs/G-LABEL.md` |
| **G-UNIT** | `npm run gate:unit` | the suite — 1,720 tests |
| **G-BUILD** | `npm run gate:build` | `vite build` |
| **G-WALK** | `npm run gate:walk` | the app being wrong when you *move through* it: 31 steps across every screen in a real browser. It exists because `+ Add Project` once navigated straight into the `RequireProject` guard while every unit test passed |
| **G-SEC** | `npm run gate:sec` | whether **Dataverse** refuses an authenticated non-admin a direct Web API write to master data. Skips loudly and exits 0 with no environment configured — and a skip is not a pass |

Two composite scripts:

```bash
npm run gates          # G-TYPE · G-IDS · G-MATRIX · G-OWN · G-LABEL · G-UNIT · G-BUILD
npm run gates:phase    # the above, then G-LABEL --strict, G-OWN --strict, G-SEC
```

`npm run gates` is what a commit must pass, and it exits 0 today. `npm run gates:phase` is
what a **phase exit** needs, and it exits 1 today on purpose: the steps are `&&`-chained, so
it stops at `gate:label:strict`, where `--strict` counts all 67 baselined label violations as
failures. `gate:own:strict` (which would fail on its 16) and `gate:sec` do not get to run.
G-WALK is in neither composite — it needs a browser — and CI runs it as its own job.
`.github/workflows/ci.yml` runs `gates` on every push, then `walk` and `security` behind it,
and `gates:phase` only on `workflow_dispatch`.

G-WALK needs Playwright, which is deliberately **not** a dependency: a 150 MB browser
download in every developer's install, for one script, is a bad trade. Install it outside
the lockfile when you want the walk:

```bash
npm i -D --no-save playwright && npx playwright install chromium
npm run gate:walk               # builds, serves on :4176, walks 31 steps
npm run gate:walk -- --no-build # reuse an existing dist/
```

### The two baselines

`reference/label-baseline.json` (67 entries) and `reference/ownership-baseline.json` (16).
A gate that always exits 1 gets ignored within a week, so the known violations are written
down and the default run fails on **drift** — anything not in the baseline is `[NEW]` and
fails; a baseline entry that no longer matches anything also fails, because a stale entry
hides a fixed violation and leaves its key free for a different one to slip in under.

**Both files are to-do lists, not permissions.** Nothing in either is approved,
grandfathered or closed. Every entry carries an owner:

| Baseline | Entries | Owners |
|---|---:|---|
| `label-baseline.json` | 67 | `refactor` 51 — the string is right, it is inline in a `Screen.tsx` and must move to `rules.ts`; `copy-owner` 16 — the text itself differs from the canvas and someone must decide which wins |
| `ownership-baseline.json` | 16 | `security-owner` 15 — a create that does not write the owning business unit and must; `platform-default` 1 — the audit-trail row on `vsb_applyandapplyalltrackings`, where the caller *is* the subject and the caller's own BU is correct by construction |

---

## How the security module works

`src/security/matrix.json` is the single source of truth: 5 roles and 85 tables in five
`kind`s — 13 `masterData`, 38 `projectData`, 22 `reference`, 7 `connected`, 5 `platform` —
with a `_masterData` and a `_projectData` grant default per role and per-table overrides
where a role diverges. The two defaults exist because the interesting property of the matrix
is a sentence rather than a table: *no role writes both master data and project data except
the administrator.* Exactly **two** consumers read the file and neither copies it — this
application, through `src/security/index.ts` and `src/platform/privileges.ts`, to decide
what the UI offers; and `solution/security/apply-roles.mjs`, to write 2,031 privilege grants
into Dataverse. Client and server therefore agree by construction rather than by discipline,
which matters because of the rule the whole workstream exists to enforce: **a restriction
that exists only in the client is not a restriction.** Absent means none — a grant not
written in the matrix is denied.

The app never asks a role name what a user may do. `privileges.forTable(entitySet)` and
`privileges.forRecord(entitySet, id)` are ports of the canvas `DataSourceInfo` and
`RecordInfo`, and both are *reports* about security the platform has already applied. In
`power` mode `forTable` answers from the caller's effective privilege names, read once at
bootstrap through `RetrieveUserPrivileges` (falling back to the `roleprivileges` join), and
`forRecord` calls `RetrievePrincipalAccess`, which is the only correct answer for a row
because ownership, sharing and business-unit depth all fold into it. In `mock` mode both
resolve from the matrix against the session's role names, so the mock app behaves like a
correctly configured environment and the same UI paths are exercised. Every path denies on
error rather than throwing, and an unmodelled table denies and traces — so **a new table
that is not added to `matrix.json` will be refused by the app**. Three hooks used to derive
privileges from role names (`user.isApplicationAdministrator || user.isControllerOwnData`)
and now ask the platform: `useCapexPrivileges` in `admin/admin-capex-accounts`,
`useCostPrivileges` in `admin/admin-cost`, and `useCapexPrivileges` in `cost/capex-costs`.
`readOnly` is a hard mask, not a hint: `grantFor` deletes create, write and delete for every
role on all 34 read-only tables whatever the defaults say, and `check-matrix.mjs` fails if
the file even tries to express otherwise.

`docs/SECURITY.md` has the model in full, including the column-security profile and what
G-SEC can and cannot prove.

---

## Limitations

Stated plainly, because none of them are hidden in the code either.

1. **Mock only. Nothing here has run against Dataverse.** `power.config.json` carries
   `"environmentId": "REPLACE_WITH_ENVIRONMENT_ID"`, an empty `appId` and
   `"dataSources": []`. No `pac` command has been run against any environment, and nothing
   exists in any tenant as a result of this repository. G-SEC has never run; 1,720 green
   tests demonstrate nothing about what Dataverse refuses, because Dataverse was not there.

2. **40 of the 85 logical names are unverified** — 20 `reference`, 13 `projectData` and all
   7 `connected`. They were derived by de-pluralising the entity set and never checked
   against the metadata endpoint. A wrong logical name makes every privilege name wrong, so
   `apply-roles.mjs` writes a privilege that does not exist and `forTable` denies a table the
   user can in fact write. `npm run gate:matrix -- --unverified` lists them; the fix is
   `pac code add-data-source` per table, then `verified: true`. All 13 `masterData` tables
   are verified.

3. **Seven tables are declared under two plurals** in `src/data/entities.ts` — the
   `…es`/`…ses` double-plural trap. Each is modelled once in the matrix with the other
   spelling as an `entitySetAlias`, so both resolve to one table and no repository silently
   goes read-only. Six are genuinely open questions only the metadata endpoint can settle;
   the seventh (`vsb_substructuretypeinprojects`) is already known to be the right one and
   its alias exists only so a stale reference resolves. `npm run gate:matrix` prints all
   seven on every run.

4. **`hooks.ts` and `Screen.tsx` are thinly covered.** `npm run test:coverage` reports
   whole-repo function coverage of 81.8 per cent, but that is carried by the rules modules
   at 97.0 per cent. Across the 21 `hooks.ts` files it is 31.9 per cent (52 of 163
   functions), and across the 23 `Screen.tsx` files 9.8 per cent (5 of 51) — the two
   component tests are the only rendering tests in the suite. Read the v8 line figures for
   these files with suspicion: several report 100 per cent lines alongside 20 per cent
   functions, which is the provider counting module-level statements and not function
   bodies.

5. **`dataClient.batch` is a bounded fan-out, not an OData `$batch` changeset.** The SDK
   exposes no `$batch` primitive, so `batch()` chunks the writes twelve at a time under a
   concurrency gate. It bounds in-flight requests — the thing the canvas `ForAll` never did
   — but it is **not transactional**, so a multi-write operation can half-apply. The
   checklist screen's two-write cancellation is the case that matters; it wants a Dataverse
   custom API, and `solution/customapi/` has the definitions.

6. **Five equipment panels on `pm/generators` are stubs.** Inverter, substructure, storage,
   hydrogen and substation share one `FormPanel` that calls `saveSimple` with
   `fields: {}` — the rules, cost derivations, roll-ups and mutations are complete and
   tested, and only the form fields are missing. WTG and PV module are real. The plan records
   this as the screen's exit gate: a panel that saves an empty field set is not done.

7. **Standard-contract instantiation computes but does not write.** On `cost/capex-costs`
   the arithmetic is complete and tested, and the result reaches `setNotice` — a message
   bar saying what *would* be created. `vsb_CreateCapexStandardContract` is defined in
   `solution/customapi/` and skeletoned in `solution/plugins/`, but nothing writes yet.

8. **Per-record privilege probes are approximate, and the project probe has a latent bug.**
   `useProjectContext` probes the project only; child-table `RecordInfo` calls inherit the
   project's right. Every consumer already takes the flag as a parameter, so the swap to
   `privileges.forRecord` is one function per call site. Worse, `readPrivileges` in that file
   builds its `RetrievePrincipalAccess` target as `` `Microsoft.Dynamics.CRM.${ES.projects}` ``
   — the entity **set** (`vsb_projects`) where `@odata.type` needs the logical name
   (`vsb_project`). It will fault against a real environment, and the `catch` correctly
   returns a deny, so the symptom is not an error but **every project read-only**.
   `privileges.forRecord` already does this correctly; converge on it.

9. **Four flows the apps call are absent from the solution export**, and three of them are
   declared in `FLOW_REGISTER` with `disposition: "missing"` so the call sites are typed and
   throw a clear error rather than inventing internals. `Simulate` and the two Power BI
   commands are inert for the same reason — gated, labelled correctly, and their `onClick`
   is a no-op with a comment saying so.

10. **`npm run lint` does not run.** `.eslintrc.cjs` is the pre-v9 format and the installed
    ESLint is 10.1.0, which requires `eslint.config.js`. No gate depends on it; `gate:type`
    is what CI enforces.

Every deliberate divergence from the canvas is marked `// SOURCE DEFECT:` with the original
behaviour kept reachable as a `…CanvasParity` function and a test pinning both, so the
parity decision stays reversible. The load-bearing one is on `pm/finance`: the canvas
overwrites Debt Financing on every visit to the screen, and this rebuild does not.

---

## When you connect to an environment

In this order. Steps 1–6 are the app; 7 onward is `solution/`, and
`solution/README.md` is the authority on those.

1. `npm i -g @microsoft/powerplatform-cli`
2. `pac auth create --environment <url>`
3. `pac code init --displayName "VSBCloud" --environment <url>` — run it **in this
   directory** so it updates the existing `power.config.json` instead of creating a second
   one. Pass the URL literally; there is deliberately no `pac:init` npm script, because the
   one that used to be here read `--environment $POWER_ENV`, which does not expand in
   PowerShell and would have sent the literal string as an environment name. Decide before
   committing whether a real environment id belongs in the repository — it identifies a
   specific tenant.
4. `pac code add-data-source -a dataverse -t <logical name>`, once per table. This
   regenerates `src/data/dataSources.ts` and the typed models; the descriptor in that file
   today is a hand-written placeholder that covers the tables the 23 screens touch so the
   app compiles.
5. Work through `npm run gate:matrix -- --unverified` as you go: for each table, set
   `logicalName` from the metadata and `verified: true` in `src/security/matrix.json`. Settle
   the seven spelling conflicts here too, and delete the losing spelling from
   `src/data/entities.ts` along with its `entitySetAliases` entry.
6. `cp .env.example .env`, set `VITE_DATA_MODE=power` and `VITE_DATAVERSE_URL`, then
   `npm run gates` again. Once every name is verified, `npm run gate:matrix -- --strict`
   should pass too — that is the check that says the matrix is finished rather than merely
   self-consistent, and it is what `gates:phase` will hold you to.
7. Create or choose an **unmanaged** solution in the target environment with the `vsb`
   publisher prefix, and export `VSB_DATAVERSE_URL`, `VSB_DATAVERSE_TOKEN` and
   `VSB_SOLUTION_UNIQUENAME` — the last one so `apply-customapis.mjs` lands its rows in that
   solution rather than in Default, where components do not travel.
8. `node solution/security/apply-roles.mjs` (dry run — every `apply-*` script is dry-run by
   default and prints the exact change set), then `--apply`.
9. `node solution/security/apply-columnsecurity.mjs`, then `--apply --secure-columns`, then
   **publish all customizations** in the maker portal. Roles before column security: the
   profile narrows an access the role privileges have to have granted first.
10. `node solution/customapi/apply-customapis.mjs`, then `--apply`. Then build and register
    the plugin assembly and bind each plugin type to its message, synchronous on the main
    operation stage — see `solution/plugins/README.md`.
11. Assign the roles to users and **teams** in the maker portal, and add the flow identity —
    one principal, no others — to `VSB - Approval State Writers`. Neither is scriptable;
    both are explained in `solution/README.md`. Prefer team-based assignment: the privilege
    layer needs the union of direct and team-derived roles, and taking only direct roles is
    the classic way to hide a control from someone who is allowed to use it.
12. `npm run build && pac code push`.
13. **G-SEC, last.** With a token for an identity holding no VSB master-data role:
    `VSB_GSEC_URL=… VSB_GSEC_TOKEN=… node scripts/gsec.mjs --identity <that user's upn>`.
    Run earlier it only tells you that an unconfigured environment refuses things. This is
    the check that closes Phase 1.
14. `pac solution export --name "$VSB_SOLUTION_UNIQUENAME" --path ./out --managed false`.
    That export is the artefact you promote; it is the first point at which a `.zip` is a
    truthful description of anything.

---

## Tests

```bash
npm test                                 # all 1,720
npx vitest run src/features/pm/finance   # one screen
npx vitest run src/features/admin        # one phase
npx vitest                               # watch
npm run test:coverage                    # v8, text + json-summary
```

Test ids (`UT-<PREFIX>-NNN`) match the build specification, so a CI failure points straight
at the documented rule, and G-IDS keeps them honest: one id names exactly one `it()`, and
every id cited in a comment has a test behind it.

Of the 40 files, 22 are the per-screen `rules.test.ts` and another ten test a pure module in
`src/domain`, `src/theme` and `src/security` directly. That is the intended default: the
rules are where the behaviour is. Eight files depart from it, each for a stated reason:

| File | Why it is not a pure test |
|---|---|
| `src/app/buildPlan.test.ts` | the plan and the tree must agree: every planned screen has a folder, every folder is planned, the dependency graph has exactly one documented cycle |
| `src/data/mock/mockBackend.test.ts` | pins the mock's OData semantics — `$top`/`$skip`/`$count`, filter precedence, code-unit `$orderby` — so mock and live cannot drift |
| `src/data/mock/autoFixture.test.ts` | the auto-fixture's negative property: it must never invent rows in a hand-seeded table, because plausible-looking data hides a real bug |
| `src/platform/privileges.test.ts` | the fail-safe paths, with `vi.resetModules()` and a dynamic import so each case gets a fresh module and its own `dataMode` |
| `src/flows/flowClient.test.ts` | that no exported wrapper can invoke an action name `FLOW_REGISTER` does not carry |
| `src/data/projectQueries.test.ts` | the portfolio read end to end. Three live defects lived *between* layers; no unit test can see any of them |
| `src/features/pm/project-main/Screen.test.tsx` | a render smoke test. Catches what `tsc` cannot: an unstable Zustand selector (React #185), a mis-named Fluent icon, a conditional hook |
| `src/components/DataGrid.test.tsx` | the opt-in invariant — the new grid props must, when absent, reproduce the render every other call site depends on |

Both component tests are structural, not snapshots, so a Fluent class-name change does not
break them. Note the limit stated in `DataGrid.test.tsx`: rows come from `useVirtualizer`,
which measures a scroll element jsdom reports as zero-height, so no row renders in either
component test — zebra striping, the per-row radio and the accent bar are unverified by any
test. G-WALK is what covers them.

Fluent v9 needs two lines of Vitest config to load at all (see `vite.config.ts`): `tabster`
declares `"type": "module"` but points `main` at a CJS build with no `exports` map, so it
must be aliased to its ESM entry *and* `@fluentui/*` must be inlined for that alias to
apply.

One environment note, because it costs an afternoon otherwise: G-WALK drives a real browser,
and the app reads `navigator.language` in `bootstrap`. On a container with no locale set,
Chromium reports `en-US@posix`, `Intl.NumberFormat` throws `Invalid language tag`, and every
screen renders the error boundary — 31 steps, dozens of problems, none of them the app's.
Set `LANG` to something valid before running the walk.

---

## Further reading

| | |
|---|---|
| `CONVENTIONS.md` | the rules a contributor must follow |
| `CLAUDE.md` | the short version, for an agent working in this repo |
| `docs/SECURITY.md` | the security model, for whoever configures the environment |
| `docs/G-LABEL.md` | label fidelity: the rule, the corpus, the baseline |
| `docs/guide*-ui-notes-*.md` | per-page notes from the screen recording of the live canvas app |
| `GUIDE-PARITY.md` | what the screenshot pass changed, and why |
| `solution/README.md` | the Dataverse side: run order, exit codes, and the five steps that cannot be scripted |
| `VSBCloud.md`, `PowerFx.md` | indexes into the build specification and the Power Fx concordance |
