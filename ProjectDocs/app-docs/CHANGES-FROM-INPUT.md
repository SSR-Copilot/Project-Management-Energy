# What changed, against `VSBCloudCodeAppfinal.zip`

The input was the code app as it stood at the end of the assessment: 23 screens, one flat
`src/features/<slug>/` folder each, 1,613 tests, and a documented security gap. This package is
the same application reorganised to `VSBCloud-Harness-Plan.md` and made checkable — plus the
Dataverse side the plan says has to exist before Phase 1 can close.

Nothing was rewritten for the sake of it. Every change below is either the plan's structure, a
gate the plan names, or a defect found while wiring one.

## Verified state

| | input | this package |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| `vitest run` | 1,613 in 36 files | **1,727 in 41 files** |
| `vite build` | clean | clean |
| `scripts/scenario.mjs` | 31 steps, 0 problems | 31 steps, 0 problems |
| `eslint` | **broken** — `.eslintrc.cjs` unreadable since ESLint 9 | clean, and clean at `--max-warnings 0` |
| gates | none | **9**, each a script, all exit 0 |

Confirmed from a clean `npm ci` in a fresh directory, not only in place.

## 1. The tree follows the plan

`src/features/` now has three parents matching the three phases — `admin/` (6 screens), `pm/`
(12), `cost/` (5) — plus `shared/`. Every `@/features/<slug>` import became
`@/features/<phase>/<slug>`; 19 files were rewritten and nothing else moved. The import graph
made this safe: there were no relative imports crossing a feature boundary.

`src/app/buildPlan.ts` is new, and is the plan as data: 23 entries carrying phase, band, score,
days, blocks, build order, dependencies, exit gate and known caveats. `buildPlan.test.ts`
asserts the plan and the tree agree — every entry points at a folder that exists, every folder
has an entry, the dependency graph has exactly one cycle and it is the documented admin pair,
and no screen depends on a later phase. A plan in a document drifts within a sprint; this one
cannot drift without reddening the suite.

## 2. Security became a module

`src/security/matrix.json` is the single source of truth: 5 roles, 85 tables in five kinds, per-
role `_masterData` / `_projectData` grant defaults with per-table overrides, and a column-security
profile. Two consumers read it — the app through `src/platform/privileges.ts`, and
`solution/security/apply-roles.mjs` to write it into Dataverse — so the client and the server
cannot hold two opinions about who may write what.

`src/platform/privileges.ts` is `DataSourceInfo` and `RecordInfo`, ported. In `power` mode it
reads the caller's effective privileges from Dataverse once at bootstrap and record access from
`RetrievePrincipalAccess`; in `mock` mode it resolves from the matrix, so the same UI paths run
either way. It denies on every error path, which is `Coalesce(RecordInfo(…), false)`.

**Three hooks derived privileges from role names and now do not.**
`admin-capex-accounts`, `admin-cost` and `capex-costs` each computed `canCreate` / `canWrite` /
`canDelete` from `user.isApplicationAdministrator || user.isControllerOwnData` — the thing
`CONVENTIONS.md` rule 4 forbids, and which two of the three file headers claimed not to do. A
role name is a label a person can hold without the privileges meant to come with it, and it is
silently wrong the first time somebody adds a sixth role. `useCostPrivileges` also now answers
per table, because the DEVEX and OPEX panels write different tables and one answer for both could
only be right by coincidence.

## 3. Nine gates, each of them runnable

`npm run gates` is what a commit must pass. `npm run gates:phase` is what closes a phase, and it
makes the baselines count as failures.

| Gate | Command | What it catches |
|---|---|---|
| G-TYPE | `npm run gate:type` | contract drift between rules, repositories and screens |
| G-LINT | `npm run gate:lint` | what `tsc` cannot see — a conditional hook is React #185 at runtime and nothing at build time |
| G-IDS | `npm run gate:ids` | a test ID on two cases, or cited in a comment and on none |
| G-MATRIX | `npm run gate:matrix` | an inconsistent privilege matrix; reports unverified logical names |
| G-OWN | `npm run gate:own` | a create on an owned table that omits the owning business unit |
| G-LABEL | `npm run gate:label` | a visible string that drifted from the canvas |
| G-UNIT | `npm run gate:unit` | the rules |
| G-BUILD | `npm run gate:build` | what type-checks and will not bundle |
| G-WALK | `npm run gate:walk` | what only appears when you walk the app as a person does |
| G-SEC | `npm run gate:sec` | Dataverse refusing. **Cannot pass from a repository** — it skips loudly and exits 0 with no environment, and that must never be read as met |

`.github/workflows/ci.yml` runs them in the order that fails cheapest first.

Two baselines carry known findings so the gates fail on *new* drift: `reference/label-baseline.json`
(67 — 16 wording decisions for the copy owner, 51 strings to move out of `Screen.tsx`) and
`reference/ownership-baseline.json` (16 create paths). Both are to-do lists, not permissions;
`--strict` fails on them and `gates:phase` uses it.

## 4. The Dataverse side

`solution/` is new. It is not a packable `.zip` — a real solution shell has to be exported from
the target environment first, and hand-authoring one produces a file that will not import.
What it is: `security/apply-roles.mjs` and `apply-columnsecurity.mjs`, which resolve privilege
GUIDs at runtime and are dry-run by default; five Custom API definitions as data with C# handler
skeletons carrying `// PORT FROM:` comments pointing at the TypeScript that already specifies the
behaviour; and an operator README saying which steps cannot be scripted.

The column-security profile has no members, deliberately. That is how the standing decision on
flows is enforced: no flow is edited, and an approval-state transition becomes flow-only by
removing Write on those columns from everyone else.

## 5. Defects found and fixed

Ordered by what they would have cost.

1. **Every project silently read-only in `power` mode.** `readPrivileges` in
   `src/features/shared/useProjectContext.ts` built `RetrievePrincipalAccess`'s `@odata.type`
   from the entity set (`…vsb_projects`) where the logical name (`…vsb_project`) is required. The
   call would have faulted, the `catch` correctly denied, and every user would have found every
   project uneditable. Mock mode short-circuits to `true`, so no demo would have shown it. Now
   routed through `platform/privileges`, which owns the logical name.
2. **The app denied itself 60 tables.** The matrix modelled 32 of the 92 entity sets the app
   references, and `forTable` denies anything unmodelled — so in `power` mode two thirds of the
   tables would have gone read-only, looking like a UI bug. All 92 are now modelled, and a test
   fails if a screen touches a table the matrix does not know.
3. **A conditional `useMemo` in `pm/team/Screen.tsx`.** Called after two early returns, so hook
   order differed between the loading, locked and normal renders. React surfaces that as error
   #185, naming neither the hook nor the file. Found by the lint gate in its first run.
4. **The whole app error-boundaried on an unusual host locale.** `navigator.language` is not
   guaranteed well-formed; a host with no `LANG` reports `en-US@posix` and
   `new Intl.NumberFormat("en-US@posix")` throws. Every number and date goes through `Intl`, so
   all 31 walk steps rendered the error boundary and not one failure was the app's own.
   `src/domain/locale.ts` repairs the tag where it can — a German user keeps German formatting
   rather than silently getting American — and falls back only when nothing can be salvaged.
5. **Two cancel actions bypassed the missing-flow guard.** `vsb_CancelCheckListApproval` and
   `vsb_CancelGateApproval` were invoked but not in `FLOW_REGISTER`, so the guard never fired and
   the call fell through to `dataClient.callAction`: silently `{ok:true}` in mock mode, a raw
   Dataverse fault live. Both registered, and an unregistered action name is now a hard error.
6. **Production issued writes with no permission check**, where `grid-operator` refuses with a 403
   before issuing anything. All four mutation paths now guard.
7. **`npm run lint` had been failing rather than linting** since ESLint 9 stopped reading
   `.eslintrc.cjs`. A broken check reads as a passing one to everybody who never runs it. Replaced
   with a flat config, deliberately narrow: `tsc` in strict mode covers most of what a TypeScript
   lint config is for, and what is left is the rules-of-hooks class above.
8. **G-SEC probed 47 tables instead of 13.** It selected on `isMasterData`, which is true for
   reference lists, system tables and Fabric mirrors too, so 34 of its 47 probes attempted writes
   to things like `systemusers` and proved nothing about the admin screens.
9. **A phantom table.** `vsb_substructuretypesinprojects` was modelled as its own table while
   `entities.ts` states outright that the spelling is wrong and `ES_PLANT` is authoritative. It is
   now an alias. It got in because a scan that does not strip comments reads prose as a call site.
10. **14 test IDs sat on two cases each and 15 were cited in header lists with no case behind
    them.** Renumbered and struck; G-IDS stops both recurring.
11. **`saveMany` was documented as "exactly one `$batch`"**, which reads as a transaction it has
    never been — `dataClient.batch` bounds concurrency over individual writes, so a five-row save
    can half-apply.

## 6. Known, and deliberately not fixed here

- **Nothing has run against a real Dataverse.** Mock mode is the default and the whole harness
  passes against a backend the team wrote.
- **40 of 85 logical names are derived, not verified**, and 7 tables are declared under two
  plurals. `npm run gate:matrix -- --unverified` lists them; `pac code add-data-source` settles
  them. A wrong logical name makes every privilege name wrong, and it fails loudly on both sides.
- **`Screen.tsx` composition is at about 10 per cent function coverage** against 97 per cent for
  the rules layer. That split is the architecture working; the gap worth closing is `hooks.ts`.
- **Five equipment panels on Generators still write an empty field set**, and standard-contract
  instantiation on three Cost screens computes and tests a result it cannot persist until
  `vsb_CreateCapexStandardContract` exists.
- **`GUIDE-PARITY.md` still uses the flat feature paths** and quotes an older test count. It is a
  record of screenshot-parity passes, so its findings stand; its paths need a sweep.
