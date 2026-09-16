# Global architecture plan

This document is binding on every screen plan under `migration-plans/screens/`. A screen
implementation chat that deviates from it without recording a reason is making an
undocumented architectural choice, which is exactly what this document exists to prevent.

It is not new invention. It transcribes the architecture already built and running (in mock
mode) in `VSBCloud-Code-App-Skeleton/vsbcode/` — the canonical unified Code App referenced by
`migration-plans/00-workspace-inventory.md`. Section 12 of the task brief that produced this
plan set says: *"If one exists, follow its architecture unless it is clearly unsuitable."* It
exists, it is not unsuitable, and re-deriving a competing architecture from nothing would
throw away 292 build-days of already-resolved decisions. Every screen plan cites this file
instead of re-litigating these choices.

Primary sources for everything in this document: `vsbcode/README.md`, `vsbcode/CONVENTIONS.md`,
`vsbcode/CLAUDE.md`, `vsbcode/docs/SECURITY.md`, `vsbcode/package.json`, and
`VSBCloud-Code-App-Skeleton/VSBCloud-Harness-Plan.md` sections 0–7.

---

## 1. What is being built

One Power Apps **code app** — not two — replacing both the Project Management and Project
Costs canvas apps against the same, unchanged Dataverse environment: same tables, same 17
Power Automate flows, same five security roles. Twenty-three production screens (see
`00-workspace-inventory.md` for the four excluded developer-diagnostic screens), organized
into three phases that are both a security dependency order and the recommended build order:

| Phase | Folder | Screens | Owns |
|---|---|---:|---|
| 1 · Admin | `src/features/admin/` | 6 | Master data every other screen reads: CAPEX chart of accounts, standard DEVEX/CAPEX/OPEX assumptions, standard BoP contracts, standard milestone durations, default checklist, gate/checklist approvers. |
| 2 · Project Management | `src/features/pm/` | 12 | One project's identity, technical model, financial model, team, planning, and checklist/gate workflow. |
| 3 · Project Costs | `src/features/cost/` | 5 | One project's monthly CAPEX/DEVEX/OPEX/land-lease costs and BoP contracts. |

**Why admin-first.** All five Cost screens and four PM screens read a table an admin screen
owns (`00-workspace-inventory.md` §"Cross-referencing"). Building Cost or PM screens first
means developing against guessed fixture shapes; building admin first means developing
against master data entered through the screen that will maintain it in production. This is
also why the six admin screens gate the security workstream (§9 below) — Phase 1 does not
close until Dataverse itself refuses a non-admin write.

**Repository home.** Continue in `VSBCloud-Code-App-Skeleton/vsbcode/`. Do not start a second
Code App or fork the folder layout — `ProjectCosts-CodeApp/app/` is a separate, narrower
prototype (Project-Costs-only, different generated-SDK conventions) and is evidence for the
five Cost screens' UI, not the implementation target. See §14.

---

## 2. Technology stack (as already chosen and running)

| Concern | Choice | Notes |
|---|---|---|
| UI runtime | React 19 + TypeScript (strict), Vite | `tsc -b && vite build`; `noUnusedLocals`/`noUnusedParameters` on; no `any`. |
| Component library | Fluent UI v9 (`@fluentui/react-components`, `@fluentui/react-icons`) | `makeStyles` **rejects CSS shorthands** for border/padding/margin/background — use longhands (`borderTopColor`, not `borderColor`). Inline `style={}` carrying a computed color needs `as CSSProperties`. |
| Routing | `react-router-dom` v7 | Route table + guards in `src/routes/AppRoutes.tsx`. Routes are lazy-imported by the screen's default export path. |
| Server state | `@tanstack/react-query` v5 | Every list/detail read is a `useQuery`; every write a `useMutation`. No client-side materialize-then-filter (§4). |
| Client/UI state | `zustand` v5 | Replaces the ~70 canvas `gbl*` global variables. Select primitives from the store, not fresh objects — a selector returning a new object on every call renders forever (React error #185). |
| Grid virtualization | `@tanstack/react-virtual` | Backs the shared `DataGrid`. |
| Validation | `zod` | Where a schema is more legible than hand-written pure-function checks; most Canvas validation ports as plain pure functions in `rules.ts` instead. |
| Power Platform binding | `@microsoft/power-apps` SDK | Wrapped by `src/platform/dataClient.ts`; screens and hooks never import the SDK directly. |
| Testing | Vitest + Testing Library, v8 coverage | See §13. |

Do not introduce a second state library, a second component kit, or a second data-fetching
library. Do not add Redux, MobX, styled-components, Material UI, Ant Design, or a second
router. If a screen plan seems to need one, that is a signal to re-read this document, not a
license to diverge.

---

## 3. Folder structure and naming

```
src/
  app/            buildPlan.ts — the 23-screen plan as data (phase, order, dependsOn,
                  exitGate, caveat). buildPlan.test.ts asserts the plan and the feature
                  tree agree.
  platform/       Power Apps SDK binding: dataClient, privileges, odata, errors,
                  telemetry, bootstrap, powerClient (dataMode: "mock" | "power")
  data/           entities.ts (entity sets ES/ES_ADMIN/ES_COST/...), repos.ts (109
                  repositories), repository.ts (makeRepository factory), queryKeys.ts,
                  mock/ (mockBackend, projectSeed, autoFixture — dev-mode Dataverse)
  domain/         pure business rules shared across screens — numeric, dates, session,
                  navigation, approval, paging, technology, yieldStats. No I/O.
  components/     23 shared modules, ~26 components — see §7. Import from "@/components".
  features/
    admin/<slug>/     phase 1 — 6 screens
    pm/<slug>/        phase 2 — 12 screens
    cost/<slug>/      phase 3 — 5 screens
    shared/           cross-screen hooks only (useProjectContext, useDebouncedValue).
                      NOT a screen folder — no Screen.tsx here.
  flows/          flowClient.ts — typed wrappers + FLOW_REGISTER allow-list (§6, and
                  04-flow-inventory.md)
  security/       matrix.json + index.ts — the ONLY source of truth for role security
  store/          appStore.ts — the Zustand store
  routes/         AppRoutes.tsx — route table and guards (RequireProject, RequireAdmin)
  theme/          tokens.ts — AppTheme.palette / gblAppSizes transcribed as design tokens
scripts/          gate scripts: check-matrix, check-labels, check-test-ids,
                  check-ownership, gsec, walk, scenario, extract-canvas-labels
solution/         the Dataverse side — roles, column security, custom APIs, plugin
                  skeletons. Server-side counterpart to src/security.
reference/        canvas-labels.json (label corpus), label-baseline.json,
                  ownership-baseline.json (the two gate baselines — to-do lists, not
                  permissions)
docs/             SECURITY.md, G-LABEL.md, guide*-ui-notes-*.md (screen-recording notes)
```

**Per-screen folder**, one per screen, under its phase's parent (`@/features/<phase>/<slug>`):

```
Screen.tsx        default export. Layout and composition ONLY. No arithmetic, no fetch
                  logic, no validation — calls rules.ts and hooks.ts and renders.
rules.ts          every business rule as a PURE function: no React, no network, no
                  global read. Visibility gates, DisplayMode gates, validation,
                  calculations, derived totals, command gates, write plans (as data,
                  e.g. admin-cost's WritePlan/runPlan pattern), and the MSG/labels
                  objects (§8).
rules.test.ts     Vitest cases, ids UT-<PREFIX>-NNN (§13). One id per screen prefix.
hooks.ts          queries, mutations, privilege hooks. Impure by design — no arithmetic.
                  Present on 21 of 23 screens (app-loading has neither hooks.ts nor
                  rules.ts; add-costs-from-table has no hooks.ts).
```

Split `rules.ts` only when a screen genuinely holds independent families (e.g.
`admin-cost/devexRules.ts` + `opexRules.ts` + `plan.ts`). The `*Rules.ts` / `plan.ts` suffix
convention matters because it is inside the G-LABEL scan scope; an arbitrarily named file is
not, and a label placed there escapes the fidelity gate.

A new screen (there should not be one — all 23 are enumerated) requires an entry in
`BUILD_PLAN` in `src/app/buildPlan.ts` with a real, non-placeholder `exitGate`.

---

## 4. Server-state and data-access principles

1. **Never materialize a table to filter it client-side.** The Canvas idiom
   `ClearCollect(col, Filter(Table, ...))` becomes a `useQuery` with an OData `$filter`, never
   a `.filter()` over a fully-fetched collection. `select` is mandatory on every query — there
   are no unprojected reads. This directly replaces every Canvas delegation workaround; those
   workarounds are deleted, not ported.
2. **Server paging via `skipToken`.** `src/domain/paging.ts` is the shared pure helper.
3. **Never write in a loop.** `ForAll(..., Patch(...))` becomes one `repo.saveMany([...])` or
   one `dataClient.batch([...])`, which fans out with a concurrency limit (12 at a time).
   **`dataClient.batch` is not a transactional OData `$batch` changeset** — it bounds
   concurrent requests, it does not make them atomic. A multi-write operation can half-apply.
   Where all-or-nothing genuinely matters (e.g. an approval cancellation that must reset one
   row while un-linking another), the correct target is a Dataverse **custom API** in
   `solution/customapi/`, not a client-side retry loop or a hopeful comment. Every screen plan
   must say, for each multi-write operation, whether a partial failure is tolerable and if not,
   name the custom API that replaces it.
4. **Repositories, not ad hoc fetch calls.** `src/data/repos.ts` holds 109 repositories built
   from `makeRepository(entitySet, select, { projectLookup })` in `src/data/repository.ts`.
   A screen needing a repository that does not exist adds it there — this is one of the three
   named exceptions to "stay inside your feature folder" (the others are `src/data/entities.ts`
   for a new entity set, and `src/security/matrix.json`, see §9).
5. **Entity sets, not literal table-name strings.** `src/data/entities.ts` exports `ES`,
   `ES_ADMIN`, `ES_COST`, `ES_PROCESS`, `ES_PLANT`, `ES_PRODUCTION`, `ES_FINANCE`, plus
   `SELECT` (projection sets) and `CHOICE` (choice/option-set maps). Screen plans reference
   these symbolic names, not raw Dataverse logical names, because ~40 of the 85 modeled
   logical names are still unverified (§12) and will be corrected in one place.
6. **Query keys are centralized.** `src/data/queryKeys.ts` exports `qk`; every `useQuery` key
   goes through it so invalidation after a mutation is consistent across screens.
7. **`dataClient`** (`src/platform/dataClient.ts`) is the only thing that talks to the SDK:
   `list` / `getById` / `getOne` / `create` / `update` / `remove` / `batch` / `callAction`. It
   runs against `src/data/mock/mockBackend.ts` in `VITE_DATA_MODE=mock` (the default; no
   sign-in, in-memory fixtures) or the real Power Apps SDK in `VITE_DATA_MODE=power`. Screen
   plans describe operations against `dataClient`'s vocabulary, never against invented SDK
   method names — see §14 on not inventing generated-SDK signatures.

---

## 5. Client state (Zustand) and routing

- **`src/store/appStore.ts`** replaces the canvas global variables (`gblCurrentUser`,
  `gblSelectedProject`, theme/session flags, etc.) as a single Zustand store. Exposed hooks:
  `useAppStore`, `useCurrentUser`, `useSelectedProject`, `useProjectHeader`. See
  `02-global-state-and-data.md` for the full canvas-global-to-store mapping.
- **Selectors must return primitives or be memoized.** A selector that builds a fresh object
  each render is a React #185 infinite-render bug; `selectProjectHeader` in `appStore.ts` is
  the pattern to copy.
- **Project-scoped screens** call `useProjectContext()` (in `src/features/shared/`), which
  resolves the selected project, `canEdit`, and loading state together — it is the shared
  replacement for "read `gblSelectedProject`, then check `CanEditSelectedProject`".
- **Routing** is `react-router-dom` v7, route table in `src/routes/AppRoutes.tsx`. Two named
  guards exist because the canvas app has no equivalent and each is therefore a genuinely new
  failure mode that must be walked in the scenario-walk gate (G-WALK) before its phase closes:
  - `RequireProject` — blocks a project-scoped route with no project selected, redirecting to
    "No project selected" / `SelectProjectPrompt`.
  - `RequireAdmin` — reproduces the canvas nav-item hiding for the six admin routes. It is a
    courtesy, not security (§9) — the actual gate is Dataverse privilege enforcement.
  - **Route contracts must be reconstructible**, not memory-only. A project-scoped screen's
    route must accept a `projectId` (path or query parameter) and reload the record from it,
    not depend solely on in-memory `useSelectedProject()` state. The one documented case where
    a route needed a *marker* rather than only an id: `+ Add Project` uses
    `NEW_PROJECT_ROUTE` (`/project/general?new=1`) with `isNewProjectRequest()` in
    `src/domain/navigation.ts`, so a reloaded or shared "new project" link still works instead
    of bouncing off `RequireProject`.

---

## 6. Power Automate strategy — flows are frozen

**All 17 flows stay exactly as exported.** No flow definition is edited, split, merged, or
replaced by this migration. `src/flows/flowClient.ts` holds typed wrappers and a
`FLOW_REGISTER` allow-list; `invokeFlow` refuses any action name the register does not carry,
so a call site cannot silently invoke something unregistered. Full inventory, dispositions,
and per-screen usage are in `04-flow-inventory.md`. Two properties of this choice are
structural, not incidental, and every screen plan touching a flow must restate them:

1. A flow-driven cancellation is two separate writes, not one transaction — a mid-sequence
   failure can leave an approval cancelled with the entity not reset. Three of the 17 flows
   (`Requestpermissioncancellation`, `PerformRequestofGateApprovalCancellation`,
   `PerformRequestofCheckListApprovalCancellation`) are earmarked to be replaced by a
   Dataverse **custom API** for exactly this reason — the flow stays for reference/rollback but
   the app's call sites move to `vsb_CancelGateApproval` / `vsb_CancelCheckListApproval` /
   `vsb_CancelModulePermission`.
2. Failure notifications continue to arrive by email from the flow's own Catch scope; the
   Code App does not surface flow failures as in-app notifications unless a screen plan says
   otherwise.

Where logic genuinely belongs on the server, the mechanism is a Dataverse **custom API** or a
**plug-in** in `solution/`, never a flow edit.

---

## 7. Shared component library

Ten React components replace the 27 Canvas components (four confirmation-style popups
collapse into one `ConfirmDialog`; three loading/progress variants into one
`LoadingOverlay`), plus components the rebuild needs that Canvas had no equivalent for
(virtualized `DataGrid`, generic `CommandBar`, `FormPanel`). Import everything from
`@/components`; do not hand-roll a second version of any of these:

```
AppShell, AppHeader, LeftNav, CountryRail, Breadcrumb, DataGrid, GridPager, CommandBar,
FormPanel, RecordFooter, ConfirmDialog, LoadingOverlay, NumericInput, PercentageInput,
CurrencyInput, TextFieldWithCount, StateChip, PageHeader, Card, StatTiles, VsbLogo,
UserBadge, EmptyState, SelectProjectPrompt, ErrorBoundary, ReportErrorPanel, useBreakpoint
```

Reach leaders (screens using them): `AppHeader` 21, `ConfirmDialog` 21, `LeftNav` 20,
`LoadingOverlay` 20, `NumericInput`/`PercentageInput` 16.

**Canonical screen skeleton** (composition only, no logic inline):

```tsx
export default function XScreen() {
  const { project, canEdit, isLoading } = useProjectContext();   // project-scoped screens
  const priv = useXPrivileges();                                 // table privileges
  const data = useQuery({ queryKey: qk.child("<table>", project!.projectId!), ... });

  return (
    <>
      <PageHeader eyebrow="…" title="…" description="…" />
      <StatTiles stats={[…]} />           {/* only where figures are the point */}
      <CommandBar commands={commands} />
      <DataGrid rows={…} columns={…} rowKey={…} loading={…} />
      <FormPanel open={…} title={…} onSave={…} onClose={…} errors={…}>…</FormPanel>
      <ConfirmDialog … />
    </>
  );
}
```

Numeric fields always use `NumericInput` / `PercentageInput` / `CurrencyInput` (never a bare
`<Input>`) — they already enforce the `fn_Numeric` validation rules from the canvas behavior
components.

---

## 8. Label and copy strategy — transcribe, never rewrite

**Every UI label, button caption, page title, column header, tooltip, placeholder,
validation message, and confirmation title keeps the exact text it has in the canvas app.**
Not a paraphrase, not a tidier version. Where the canvas is internally inconsistent (e.g. a
page title with different capitalization than the matching left-rail item), both survive
exactly as-is — users navigate by those inconsistencies. This is a deliberate defence against
the class of regression a test suite cannot see: a wrong number fails a test, a politely
reworded button fails nothing, ships, and becomes a support ticket.

- Labels are never inline string literals in `Screen.tsx`. Each screen's `rules.ts` exports a
  frozen `MSG` object (message-shaped strings), `PANEL_LABELS`, and `*_COLUMNS` /
  `*_TITLES` constants.
- **Every entry carries a provenance comment** naming the exact canvas control and property it
  came from, e.g. `` /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */ ``.
  Check `reference/canvas-labels.json` first; never invent a control name.
- Exactly three kinds of deviation are permitted, and each must be declared in the target code
  and in the screen plan: (1) text for a control the rebuild removed entirely; (2) text the
  canvas computes wrongly, corrected only where the plan already records the defect, with the
  canvas string kept reachable as a `...CanvasParity` twin; (3) a misspelling corrected in
  place, with the original spelling documented (e.g. `admin-default-checklists/rules.ts`
  correcting `Decativate` to `Deactivate` while noting the canvas spelling).
- Full mechanics — the label corpus, the two shape-only forms (`INTERPOLATED`,
  `@labels-not-in-corpus`), and the baseline — are in `vsbcode/docs/G-LABEL.md`. Read it before
  writing any `MSG` entry.
- Placeholder/dead text (e.g. the canvas's own `This is Eror Message` filler in twelve places)
  does not port; that is category-1 deletion.

---

## 9. Security architecture — the four layers

**The working rule, repeated because it governs every permission decision in every screen
plan: a restriction that exists only in the client is not a restriction.**

| Layer | Mechanism | What it is worth |
|---|---|---|
| 1 Route/nav gating | `RequireAdmin`, `canSeeAdminSection` | Nothing as security — stops an honest user reaching a screen that would only fail, and is readable/bypassable in a publicly served bundle. |
| 2 Command gating | `privileges.forTable(entitySet)` / `privileges.forRecord(entitySet, id)` | Nothing as security either, but *correct*: reports privileges the platform already applied, rather than guessing from a role name. |
| 3 Dataverse role privileges | `src/security/matrix.json` → `solution/security/apply-roles.mjs` | **The real boundary.** 5 roles × 85 tables, Create/Read/Write/Delete/Append/AppendTo/Assign/Share at `none`/`user`/`businessUnit`/`parentChildBusinessUnit`(4)/`organization`(8) depth. |
| 4 Column security | `columnSecurityProfiles` in the same file → `apply-columnsecurity.mjs` | 13 approval-state columns across two tables, secured to a profile with **zero members** — the mechanism that makes an approval-state transition flow-only by construction. |

**Rule 4 of `CONVENTIONS.md`, restated because three hooks broke it and every screen plan must
avoid repeating the mistake:** privileges come from `privileges.forTable` /
`privileges.forRecord`, **never** from a role-name check like
`user.isApplicationAdministrator || user.isControllerOwnData`. A role name is a label a person
can hold without the matching privileges (Dataverse sharing can grant a right to a role with no
relevant privilege; a role's privileges can be narrowed in the maker portal without renaming
it). The only legitimate remaining role-flag reads are: `canSeeAdminSection` (nav visibility,
not a privilege), `canEditCountry` (country **scope**, i.e. which business units, not
permission itself), and `serverFilterFor` (query scoping). If a screen plan cannot say which of
those three a role-flag check is answering, it is a privilege question and must use
`privileges.forTable`/`forRecord` instead.

**Ownership.** Every create on one of the 38 `projectData`-kind tables (all
`requiresOwningBusinessUnit: true`) must write
`` "owningbusinessunit@odata.bind": `/businessunits(${project.owningBusinessUnitId})` `` — the
write (bind) form, never `_owningbusinessunit_value` (the read form). Omitting it never fails
at create time; Dataverse silently derives the BU from the caller's own, and the row becomes
invisible later to a BU-scoped colleague in another country. Every screen plan with a create
path on a `projectData` table must show this field explicitly in its data contract.

**Five roles**: `VSB - Application Administrator` (full master-data authority, only role that
may delete master data), `VSB - Controller Own Data` (maintains but never deletes master data;
reads but never writes project data), `VSB - Project Data All Countries`,
`VSB - Project Data Own Country`, `VSB - Project Manager Own Projects` (own projects only,
read at `businessUnit` depth, write/delete/share at `user` depth). Roles are taken as the union
of **direct and team-derived** role assignments filtered to `VSB*` — never direct-only, which
under-reports and hides a control from someone entitled to it.

**`src/security/matrix.json` is the single source of truth**, with exactly two consumers that
never copy it: this app (`src/security/index.ts` → `src/platform/privileges.ts`, deciding what
the UI offers) and `solution/security/apply-roles.mjs` (deciding what Dataverse permits). A new
table not added to the matrix is denied by the app by design — see `CONVENTIONS.md` rule 8 for
the required fields (`entitySet`, `logicalName`, `displayName`, `kind`, `ownership`, `phase`,
`ownedByScreen`, `isMasterData`) if a screen plan is found to need a table the matrix does not
yet model.

**Exit gate for Phase 1 (G-SEC):** an authenticated user holding no `VSB*` admin role is
refused **by Dataverse, not by the UI**, on a direct Web API write to each of the 13
master-data tables. This is a statement about a live environment; it cannot be satisfied from
the repository alone and has never yet run (see §12).

Full model: `vsbcode/docs/SECURITY.md`.

---

## 10. Current-user / auth handling

`src/platform/bootstrap.ts` reads the signed-in identity and role assignments at startup
(`readRoles`), composing the union of direct and team-derived `VSB*` roles, and populates
`src/domain/session.ts`'s `CurrentUser`. `useCurrentUser()` (from `@/store/appStore`) is the
screen-facing accessor — screens never read a raw SDK user object. In mock mode,
`VITE_MOCK_ROLES` overrides the session's role set for local testing of a single-role scenario
(see `vsbcode/README.md` "Running the demo as a single role"). This replaces the canvas
`gblCurrentUser` initialization in `App.OnStart`; the full mapping is in
`02-global-state-and-data.md`.

---

## 11. Notifications, loading, and error handling

- **Errors**: `AppError` (`src/platform/errors.ts`) plus `trace()` (`src/platform/telemetry.ts`)
  at the matching severity — this is the direct port of the canvas `IfError(..., Trace(...))`
  pairing, and the two must be kept together in every mutation call site a screen plan
  describes.
- **Error surfaces**: `ErrorBoundary` (screen-crash containment) and `ReportErrorPanel` (the
  canvas `cmp_ReportErrorRightPanel` equivalent — note the canvas's own `ReportDevOpsBug.Run`
  call is commented out in both apps' source; a screen plan must say explicitly whether it
  restores that wiring or documents it as intentionally inert).
- **Loading**: `LoadingOverlay` (replaces three canvas loading-panel variants) and `DataGrid`'s
  own `loading` prop. Use `EmptyState` where a whole screen has nothing to show, and
  `SelectProjectPrompt` specifically where a missing **project selection** (not missing data)
  is the reason.
- **Confirmations**: `ConfirmDialog` (replaces four canvas confirmation popup variants).
- There is no separate toast/notification component in the shared library today. A screen
  plan that needs the canvas `Notify(...)` behavior must specify its own success/failure
  messaging via `MSG` entries surfaced through `ConfirmDialog`/inline panel messaging (per
  §8), and flag as `REQUIRES_INVESTIGATION` if the canvas used `Notify` with a banner
  behavior with no current equivalent, rather than inventing a global toast system silently.

---

## 12. What is explicitly NOT yet true — read before writing "the SDK does X"

This Code App has never been connected to a live Dataverse environment. Do not let a screen
plan assert a generated SDK method signature, a confirmed logical name, or a proven security
refusal — assert only what is in the repository, and mark the rest `REQUIRES_INVESTIGATION`:

1. **Mock only.** `power.config.json` has a placeholder environment id and `"dataSources": []`.
   No `pac` command has run against a tenant.
2. **40 of 85 logical names are unverified** (derived by de-pluralizing the entity set, never
   checked against the metadata endpoint) — 20 `reference`, 13 `projectData`, all 7
   `connected`. All 13 `masterData` tables are verified.
3. **Seven tables have competing plural spellings** in `src/data/entities.ts`; each is modeled
   once with the losing spelling as an `entitySetAlias`.
4. **Four flows called by the apps are absent from the solution export**
   (`SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`,
   `SynchroniseRecalculationCapexStandardCost`, and a fourth Fabric DEVEX/CAPEX recalculation
   call commented out on Project Production). Three are registered in `FLOW_REGISTER` with
   `disposition: "missing"` and throw a clear error rather than silently no-op.
5. **`hooks.ts` and `Screen.tsx` are thinly tested** (31.9% and 9.8% function coverage
   respectively) versus `rules.ts` at ~97%. A screen plan's test section must not claim
   equivalent confidence in the two layers.
6. **Five equipment sub-panels on Project Generators are stubs** that save `fields: {}}` —
   rules, cost derivations and rollups are complete; only the panel form fields are missing.
7. **`dataClient.batch` is not transactional** (§4, §6) — repeated here because it is the
   single most likely place a screen plan silently overclaims correctness.
8. **A live per-record privilege probe has a documented latent bug**
   (`useProjectContext`'s `readPrivileges` builds its `RetrievePrincipalAccess` target from the
   entity **set** name instead of the logical name) — any screen plan touching per-record
   privileges must reference this and converge on `privileges.forRecord`, which does it
   correctly.

A screen plan must never present any of the above as resolved. Where a plan's implementation
depends on one of these being fixed first, it must say so as a prerequisite, not route around
it silently.

---

## 13. Testing strategy

Five layers, in strictly increasing cost, each catching what the layer below cannot:

| # | Layer | Command | Catches |
|---|---|---|---|
| 1 | Types | `npx tsc --noEmit` | Contract drift between rules, repositories, screens |
| 2 | Unit — pure rules | `npx vitest run` | Wrong arithmetic, wrong branch, wrong date, wrong validation |
| 3 | Unit — components + mock backend | (same run) | Grid, command bar, form panel, the in-memory Dataverse itself |
| 4 | Build | `npx vite build` | Type-checks but does not bundle |
| 5 | Scenario walk | `node scripts/scenario.mjs` / `npm run gate:walk` | What only shows up moving through the app as a person does — e.g. a new route guard silently blocking the one path that reaches it |

**The `rules.ts` vs `Screen.tsx` split is the architecture's core testability decision.**
Every Power Fx block that decides something becomes an exported pure function in `rules.ts`,
tested by calling the function with plain records — never by mounting a screen. `Screen.tsx`
is composition only and is comparatively lightly tested; that asymmetry (97% vs ~4-10%
coverage) is intentional, not a gap to silently close in a screen plan's test section.

**Test IDs**: `UT-<PREFIX>-NNN`, three digits, one prefix per screen (e.g. `UT-ADCOST`,
`UT-FIN`, `UT-CAPEX`; 8 further prefixes for shared layers: `UT-DOM`, `UT-NAV`, `UT-SES`,
`UT-GRID`, `UT-MOCK`, `UT-PQ`, `UT-AUTOFIX`, `UT-TECH`). One id names exactly one `it()` case —
never two — and every id cited in a comment must have a real test behind it (`G-IDS` enforces
both directions). Screen plans re-use each screen's established prefix (given in
`buildPlan.ts`/the Harness Plan and repeated in each screen plan's own package) rather than
inventing a new one, and propose new IDs continuing the existing numbering, not restarting it.

**The gates** (a gate either passes or fails, no judgment call):

| Gate | Enforces |
|---|---|
| G-TYPE | `tsc --noEmit` exits 0 |
| G-IDS | no duplicate/undeclared `UT-` id |
| G-MATRIX | `matrix.json` internally consistent (§9) |
| G-OWN | no create on a `requiresOwningBusinessUnit` table omits it |
| G-LABEL | every visible string is transcribed with provenance (§8) |
| G-UNIT | every test passes, no skips in a closing screen's folder |
| G-BUILD | `vite build` exits 0 |
| G-WALK | scenario walk covers every screen in phases closed so far |
| G-SEC | Dataverse (not the UI) refuses a non-admin master-data write — Phase 1 exit only |

Every screen plan's "Automated Tests" section must cite this ID scheme and gate set, not
invent a parallel one.

---

## 14. On the other Code App evidence in the workspace

`ProjectCosts-CodeApp/app/` is a second, narrower React 19/Fluent v9/TanStack Query Code App
covering only the five Project Costs screens, built against generated Power Apps data-source
types rather than the repository/entity-set abstraction above. It is **evidence for UI and
data-shape parity on the five Cost screens** (its README explicitly leaves Project Management
on Canvas) — screen plans for `capex-costs`, `contracts`, `opex-costs`, `land-lease`, and
`add-costs-from-table` should cross-check its component structure and generated types where
useful, but the target architecture, folder conventions, and state/security model remain those
of `vsbcode/` above. Do not blend the two apps' conventions inside one screen plan.

---

## 15. PCF migration strategy (summary — full detail in `03-pcf-inventory.md`)

Two PCF controls are in scope: `vsb_Dev.DevexCapexSummaryPCF` (used on `Capex Costs Screen`)
and `vsb_Dev.SpreadSheet` (used on `Add Costs from Table`). Neither PCF is treated as an opaque
black box to be embedded in the Code App. Both are recreated natively:

- `DevexCapexSummaryPCF`'s dataset-grid behavior (grouping, summary rows, action dropdown) is
  reproduced with the shared `DataGrid` plus screen-specific `rules.ts` logic — it is a
  Dataverse-bound PCF grid, and the Code App's own repository/`DataGrid` combination is a
  direct, native replacement.
- `vsb_Dev.SpreadSheet`'s editable-grid behavior is reproduced with a native editable grid
  built from `DataGrid` plus form/validation logic in `rules.ts`, not a re-embedded PCF and not
  a timer-polling mechanism (the canvas screen's `OnTimerEnd` polling approach is explicitly
  not ported — see the `add-costs-from-table` screen plan and its exit gate).

The 141 generic PowerCAT `Icon` instances and `CommandBar`/`FluentDetailsList`/`PeoplePicker`/
`PowerDragDrop` Creator-Kit-style controls used elsewhere are UI chrome, not business-logic
PCFs, and are replaced by native Fluent UI v9 equivalents (`IconButton`, the shared
`CommandBar`, `DataGrid`, and a native people-picker built on Fluent's `Combobox`/`Persona`
patterns) — they do not get their own PCF contract sections in screen plans; each screen plan
lists them in its Control-to-React Mapping table instead.

---

## 16. Naming conventions quick reference

| Canvas | Code App |
|---|---|
| Screen name (e.g. `Project Finance Screen`) | `slug` (e.g. `finance`), feature folder `src/features/pm/finance/` |
| `gbl*` global variable | Zustand store field, `02-global-state-and-data.md` |
| Context variable (`UpdateContext`) | local component state or `rules.ts`-derived value, per screen plan §8 |
| Collection (`ClearCollect`) | `useQuery` result + TanStack Query cache, or in-memory derived array from `rules.ts`, per screen plan §9 |
| Control name (`lbl_Foo`, `txt_Bar`) | React component + prop, listed in the screen's Control-to-React Mapping table |
| Power Fx rule/formula block | Rule ID `<SCREENCODE>-FX-NNN` (this migration's scheme — see `05-rule-registry.md`) tied to one exported function in `rules.ts`, further tied to one or more `UT-<PREFIX>-NNN` test cases |
| Flow | Entry in `FLOW_REGISTER`, wrapper function in `src/flows/flowClient.ts` |

**Rule ID scheme.** Each screen plan assigns IDs in the form `<SCREENCODE>-FX-NNN` (three
digits, sequential, no gaps introduced by the plan itself). `SCREENCODE` is the upper-case,
hyphen-free short code listed for each screen in `05-rule-registry.md` (derived from its
`buildPlan.ts` slug), e.g. `ADMINCOST-FX-001`, `FINANCE-FX-014`, `CAPEXCOSTS-FX-072`. This ID
namespaces business-rule traceability; it is deliberately distinct from the `UT-<PREFIX>-NNN`
test-case IDs already in the repository so that one rule can cite the (possibly several)
existing tests that cover it without renumbering anything already shipped.

---

## 17. What every screen plan must not do

- Must not propose a new state library, router, or component kit.
- Must not invent a Dataverse logical name, a generated SDK method signature, or a flow
  input/output contract not evidenced in `solution/`, `Workflows/*.json`, or `flowClient.ts`.
- Must not silently "fix" a documented canvas defect without a `// SOURCE DEFECT:`-style note
  and a `...CanvasParity` twin, per `CONVENTIONS.md` rule 7.
- Must not derive a privilege from a role name (§9).
- Must not omit the owning-business-unit write on a `projectData` create (§9).
- Must not claim G-SEC, live-environment, or logical-name verification as done (§12).
- Must not reword a canvas label (§8).
