# Screen build conventions — read before writing any feature

You are adding to a working Power Apps **code app**. The foundation is finished, it
compiles, and `npm run gates` exits 0. Keep it that way.

Do not change anything outside your own `src/features/<phase>/<slug>/` directory except
where this document says so. The exceptions are named: `src/data/repos.ts` if you need a
repository that does not exist, `src/data/entities.ts` if you need an entity set, and
`src/security/matrix.json` if you touch a table nobody has modelled (rule 8).

> **The rule numbers are load-bearing.** Files under `src/` cite them by number:
> `platform/privileges.ts`, `admin/admin-cost/hooks.ts` and
> `admin/admin-capex-accounts/hooks.ts` all cite *rule 4* below, and five more files cite
> *CLAUDE.md rules 1, 5 and 6*. If you renumber either document, fix the citations in the
> same change.

---

## Sources of truth

| For | Read |
|---|---|
| What a screen does, its tables, its numbered business rules with the Power Fx quoted, its validation and gating, its flows, its unit-test cases | the build specification — `VSBCloud.md` is the index |
| Where a screen sits in the plan: phase, build order, dependencies, its exit gate, its known caveats | `src/app/buildPlan.ts` |
| Layout, field order, and the exact wording on screen | `docs/guide*-ui-notes-*.md` and `reference/canvas-labels.json` |
| Who may write what | `src/security/matrix.json` — and nothing else |
| Every Power Fx formula against the function that implements it | the concordance — `PowerFx.md` is the index |

Build what the specification says. Do not invent rules. Where the specification and a
screenshot disagree, the screenshot wins on layout and wording and the specification wins on
logic; mark the decision with a `// GUIDE p06:`-style comment naming the page.

---

## Where a screen's files live

One folder per screen, under the parent for its **phase**:

```
src/features/admin/<slug>/     phase 1 — administration
src/features/pm/<slug>/        phase 2 — Project Management
src/features/cost/<slug>/      phase 3 — Project Costs
src/features/shared/           cross-screen hooks. NOT a screen folder.
```

```
Screen.tsx        default export, layout and composition only
rules.ts          every business rule as a PURE function — no React, no network
rules.test.ts     Vitest cases, ids UT-<PREFIX>-NNN taken from the specification
hooks.ts          queries, mutations and privilege hooks
```

Imports are `@/features/<phase>/<slug>/rules`. `Screen.tsx` **must** `export default`; the
route table in `src/routes/AppRoutes.tsx` already lazy-imports it by that path.

A new screen also needs an entry in `BUILD_PLAN` in `src/app/buildPlan.ts` — `UT-PLAN2-002`
fails on a feature folder the plan does not know about, and `UT-PLAN2-001` on the reverse.
The entry needs a real `exitGate` sentence; `UT-PLAN2-012` rejects a placeholder.

Split `rules.ts` only when a screen genuinely holds two independent families, as
`admin/admin-cost` does with `devexRules.ts`, `opexRules.ts` and `plan.ts`. The
`*Rules.ts` / `plan.ts` suffixes are in G-LABEL's scan scope; an arbitrary filename is not,
and a label that lands in one escapes the gate.

---

## What already exists — use it, do not rebuild it

```
@/theme/tokens        palette, semantic, fontSize, sizes, space, radius, media,
                      breakpoints, stateColor, navIconColor  (all from AppTheme.palette)
@/components          AppShell, AppHeader, LeftNav, CountryRail, Breadcrumb, DataGrid,
                      GridPager, CommandBar, FormPanel, RecordFooter, ConfirmDialog,
                      LoadingOverlay, NumericInput, PercentageInput, CurrencyInput,
                      TextFieldWithCount, StateChip, PageHeader, Card, StatTiles,
                      VsbLogo, UserBadge, EmptyState, SelectProjectPrompt,
                      ErrorBoundary, ReportErrorPanel, useBreakpoint
@/domain/numeric      parseNumber, isNumeric, inRange, isInteger, isDecimalWithPlaces,
                      isOneDecimal/isTwoDecimal/isThreeDecimal/isSixDecimal,
                      isValidCurrency, isPercentage, formatWithSeparators, formatInteger,
                      pfxRound, roundDown, roundUp, coalesce, isBlank
@/domain/dates        addDays, addMonths, addYears, addYears360, monthsBetween,
                      toMMYY, fromMMYY, formatDate
@/domain/yieldStats   p75, p90, NOT_COMPUTABLE, uncertaintyFrom, Z
@/domain/session      CurrentUser, canEditSelectedProject, canSeeAdminSection,
                      canEditCountry, VSB_ROLES, unionVsbRoles
@/domain/navigation   PM_NAV, COST_NAV, navItemColor, SelectedProject
@/domain/approval     the approval-state transitions
@/domain/paging       skipToken paging
@/domain/technology   the technology choice and its filters
@/data/entities       ES, ES_PROCESS, ES_PLANT, ES_PRODUCTION, ES_FINANCE, ES_ADMIN,
                      ES_COST (entity sets), SELECT, CHOICE
@/data/repos          109 repositories
@/data/repository     makeRepository(entitySet, select, {projectLookup}) if you need one
                      that does not exist yet — add it to repos.ts
@/data/queryKeys      qk
@/platform/dataClient dataClient (list/getById/getOne/create/update/remove/batch/callAction)
@/platform/privileges privileges.forTable / forRecord — see rule 4
@/platform/odata      f.eq / f.and / f.or / f.inList / f.guid / f.notNull ... , asc, desc
@/platform/errors     AppError, toAppError, Result, ok, err
@/platform/telemetry  trace
@/security            matrix types, grantFor, allows, privilegeName, TABLES, ROLES
@/store/appStore      useAppStore, useCurrentUser, useSelectedProject, useProjectHeader
@/features/shared/useProjectContext   useProjectContext(), selectProjectById, readPrivileges
@/flows/flowClient    typed flow wrappers + FLOW_REGISTER
```

---

## The screen skeleton

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

---

## Hard rules

### 1. Every business rule goes in `rules.ts`, as a pure function

Visibility gates, DisplayMode gates, validation, calculations, derived totals, command
gates, write plans. If it branches on data, it is a rule. `rules.ts` imports no React, makes
no network call and reads no global; `Screen.tsx` calls it and holds only composition, and
the test tests the function directly with a plain record. That split is the whole reason the
XL screens stay readable, and it is why `rules.ts` sits at 97 per cent function coverage
while `Screen.tsx` sits at 10.

`hooks.ts` is where a query, a mutation and a privilege hook live. It is allowed to be
impure — that is its job — but it must not hold arithmetic. Build the write plan in
`rules.ts` as data and hand it to `dataClient.batch` from `hooks.ts`; `admin-cost`'s
`WritePlan` and `runPlan` are the pattern.

### 2. Never materialise a table to filter it

`ClearCollect(col, Filter(T, …))` becomes a `useQuery` with an OData `filter`, not a
client-side `.filter()` over everything. `select` is mandatory on every query — there are no
unprojected reads. Paging is server paging via `skipToken`; the canvas delegation
workarounds were deleted, not ported.

### 3. Never write in a loop

`ForAll(…, Patch(…))` becomes one `repo.saveMany([...])` or one `dataClient.batch([...])`,
which fans out twelve at a time under a concurrency gate. Know its limit before you rely on
it: **`batch` is not a transactional changeset**, so a multi-write operation can half-apply.
Where all-or-nothing actually matters, the answer is a Dataverse custom API in
`solution/customapi/`, not a comment hoping for the best.

### 4. Privileges come from `privileges.forTable` / `forRecord`, and NEVER from a role name

This is the rule three files broke, so it gets the space that earns.

```ts
// WRONG. This shipped in three hooks modules and had to be taken out again.
const canWrite = user.isApplicationAdministrator || user.isControllerOwnData;

// RIGHT.
const p = privileges.forTable(ES_ADMIN.capexAccountLists);
const canWrite = p.canWrite;
```

A role name is a label a person can be given without the privileges that are supposed to
come with it, and the two genuinely disagree: Dataverse row-level sharing grants a write on
a row to somebody holding no relevant role at all, and a role whose privileges were edited
in the maker portal still answers to the same name. The role-name version was wrong in both
directions — a sixth role with the right privileges saw nothing, and a fifth role whose
privileges were narrowed still saw the command. One of the three also granted Delete to
`VSB - Controller Own Data`, which `matrix.json` does not: master data may be deleted by the
administrator alone.

So:

- **Table privileges**: `privileges.forTable(entitySet | logicalName)`, which returns
  `{canCreate, canRead, canWrite, canDelete}` synchronously — a command bar cannot await.
  Wrap it in a `useXPrivileges` hook in `hooks.ts` and take `useAppStore(s => s.session.user)`
  as the memo dependency so it re-resolves when the session does.
- **Record privileges**: `await privileges.forRecord(entitySet, id)`, which is
  `RetrievePrincipalAccess` in `power` mode. It is the only correct answer for a row:
  ownership, sharing and business-unit depth all fold into it and none of them can be
  computed on the client. Call `privileges.invalidateRecord` after a write that can change
  ownership.
- **Project scope**: `canEdit` from `useProjectContext()`. It is necessary but not
  sufficient — the caller also has to hold the table privilege, so `canEdit && p.canCreate`.
**Where a role name is still legitimate, and why it is a different question.** The rule is
about *privileges* — may this caller create, write or delete this table or this row. Three
things in the tree still read the `isApplicationAdministrator` / `isControllerOwnData` /
`isProjectDataAllCountries` flags, and none of them is a privilege:

| Where | What it answers |
|---|---|
| `canSeeAdminSection` in `src/domain/session.ts`, used by `RequireAdmin` | whether to show the administration nav at all. Explicitly a courtesy: the guard is client-side, the bundle is public, and Dataverse is what has to refuse the write |
| `canEditCountry` in `src/domain/session.ts`, and `canEditAccountScope` in `admin/admin-capex-accounts/rules.ts` | which **countries** this user may edit. The matrix expresses depth, not a country list; the list comes from the business units the user's roles are assigned in |
| `serverFilterFor` in `pm/project-main/rules.ts` | which `$filter` to send for the portfolio list — a query-scoping decision, not a permission |

If your new code branches on a role flag, be able to say which of those three it is. If it
cannot be said in one sentence, it is a privilege question and rule 4 applies.
`admin-capex-accounts`'s exit gate in `buildPlan.ts` puts the test crisply: a grep for
`isApplicationAdministrator` in that folder must find no privilege decision.

And know what the layer is for. `forTable` and `forRecord` are ports of the canvas
`DataSourceInfo` and `RecordInfo`: they *report* security the platform has already applied.
They grant nothing, they hide a command the user cannot use, and that is a courtesy rather
than a control. **A restriction that exists only in the client is not a restriction.** The
server half is `solution/`, the proof is G-SEC, and `docs/SECURITY.md` is the model.

### 5. Every visible string is transcribed from the canvas, lives in `MSG`, and says where it came from

Not paraphrased, not improved: same words, same punctuation, same capitalisation. A
migration that silently rewords makes every screenshot, every training document and every
support ticket wrong.

- Validation, confirmation, guard, empty-state and save-failure **messages** go in `MSG`
  (or `<AREA>_MSG`) in `rules.ts`. Field labels, panel titles, command captions and column
  headers go in `*_LABELS` / `*_TITLES` / `*_COLUMNS` / `PANEL_LABELS`, also in `rules.ts`.
  Page furniture — `<PageHeader eyebrow title description>`, section captions — is inline in
  `Screen.tsx` by convention.
- Every entry carries a **provenance comment** naming the canvas control and property:

  ```ts
  /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */
  closingDateEmpty: "The Contract Closing Date cannot be empty.",
  ```

- Find the string in `reference/canvas-labels.json` first, and **never invent a control
  name**: a citation the corpus does not know fails the gate. The three permitted deviations
  (`NEW — no canvas equivalent`, `CANVAS DIVERGENCE`, `SPELLING CORRECTED`), the two
  shape-only forms (`INTERPOLATED`, `@labels-not-in-corpus`) and the exact syntax of each are
  in **`docs/G-LABEL.md`**. Read it before you add a label.
- A message-shaped literal left inline in a `Screen.tsx` fails the gate. 51 of the 67
  baseline entries are exactly that.

### 6. Every create on a `requiresOwningBusinessUnit` table writes the owning business unit

All 38 `projectData` tables in the matrix carry the flag. The payload must contain the
**write** form — the lookup's navigation property, bound:

```ts
"owningbusinessunit@odata.bind": `/businessunits(${project.owningBusinessUnitId})`
```

`_owningbusinessunit_value` is the **read** form and putting it in a create payload is its
own violation: Dataverse rejects or ignores the unknown property depending on the path, and
the payload reads as if the rule were kept. `src/features/pm/planning/rules.ts` carries both
deliberately — `PLANNING_COL.owningBusinessUnit` is the read form,
`PLANNING_LOOKUP.owningBusinessUnit` the write form — and `UT-PLAN-001` asserts the seed
payload uses the write one.

Omitting it does not fail. Dataverse creates the row and derives its owning BU from the
**caller's** business unit, so on your own tenant everything looks correct. The row
disappears later, for somebody else: `VSB - Project Data Own Country` reads project data at
`businessUnit` depth, so a row a German user created against a French project lands in the
German BU and the French team simply never sees it. Nothing throws, nothing is logged, and
the grid is not empty — it is *short*. That is the worst shape a defect can have. `G-OWN`
exists because no test that runs as one user can see it.

Where four call sites create the same table, fix all four in one change. Half-fixed is worse
than unfixed: the rows for one project then split across business units depending on which
screen made each one.

### 7. Preserve the canvas behaviour, including its defects — but say so

Where the specification's "genuinely ambiguous" list names a defect on your screen,
implement the corrected behaviour, keep the canvas behaviour reachable as a
`…CanvasParity` twin, and write `// SOURCE DEFECT:` naming what the canvas does and what you
did instead. A test pins both halves, so the parity decision stays reversible.

### 8. A new table must be added to `matrix.json` or the app will deny it

`privileges.forTable` denies and traces on a table it cannot resolve, by design: an
unmodelled table is a gap in `src/security/matrix.json`, and a permissive default is how
that gap survives to production. So a new entity set needs an entry with `entitySet`,
`logicalName`, `displayName`, `kind`, `ownership`, `phase`, `ownedByScreen` and
`isMasterData` — `G-MATRIX` fails on a missing field. Then:

- `kind: "projectData"` **requires** `requiresOwningBusinessUnit: true`, and any other kind
  **forbids** it. G-MATRIX checks both directions.
- `kind: "masterData"` requires an `admin-*` screen in `ownedByScreen`.
- `reference`, `platform` and `connected` are `readOnly: true`. That is a hard mask, not a
  hint: `grantFor` deletes create, write and delete for every role on a read-only table, so
  a per-table grant that tried to allow one would be a file that disagrees with the runtime.
  G-MATRIX fails on it rather than letting it drift.
- Set `verified: true` only when you have checked the logical name against the metadata
  endpoint. 40 of the 85 are unverified today and the flag is what makes that visible.
- Two entity sets must never resolve to one table by accident. If a table is genuinely
  declared under two plurals, model it once and put the other spelling in
  `entitySetAliases`.

Changing the matrix changes what the server will be configured to permit as well as what the
UI offers — there is exactly one file, on purpose. Re-run `npm run gate:matrix`, and
`node solution/security/apply-roles.mjs --offline` to read the grant set it now implies.

### 9. Test-ID naming: one id, one case

Ids are `UT-<PREFIX>-NNN`, three digits, taken from your screen's specification section, and
the prefix is the screen's (`UT-ADCAPEX`, `UT-LEASE`, `UT-MSTONE`, …). The id goes in the
title string of the `it()`, or of a `describe()` that groups several assertions for one
specification case — but **one id names exactly one case**. Two `it()`s under one id make
`vitest -t UT-X-001` run two things and a report saying "UT-X-001 passed" ambiguous, and
G-IDS fails on it.

Cite an id from a comment freely, including across files, as long as *some* `it()` declares
it — G-IDS resolves citations repo-wide. An id you deliberately do not implement (a
specification case whose HTTP wiring has no test) needs `@ut-ref <reason>` on the same line;
the reason is mandatory and every exemption is counted on every run. A numbering gap is fine
on its own. A gap **and** a duplicate in the same prefix is a half-finished renumber, and
the gate reports it separately because the fix is different: the duplicate needs a new id,
and the gap tells you which one was meant.

Write the cases from the specification section, aim for the count it gives — at least 12 per
screen, 20 or more for L and XL — and test the pure functions directly. No rendering, no
mocking beyond the input record.

### 10. A baseline entry is a ticket, not an answer

`reference/label-baseline.json` and `reference/ownership-baseline.json` record the
violations this migration inherited so the gates can fail on *drift* instead of exiting 1 on
every machine. Every entry is work someone still owes, with a named owner and a mandatory
reason. Nothing in either file is approved, grandfathered or closed, and
`npm run gates:phase` counts all of them as failures because a phase does not close with one
open.

So: fix a gate failure by **adding provenance** or **writing the owning BU**. Never by
loosening a check, and never by baselining it. `--update-baseline` exists for two cases only
— a violation genuinely fixed (drop the stale entry) or a new known violation agreed with
its owner. It prints a warning every time and the warning is the rule: **never run it to
turn a red build green.** A failure that cannot be fixed without changing a user-visible
string is a finding for whoever owns the wording. Report it, give it an owner, do not silence
it.

### 11. Responsive is not optional

The canvas apps were fixed-width with no small-screen layout at all. Use `DataGrid` (it
already handles the phone layout), `Card`, `StatTiles` and the `media.*` helpers in
`makeStyles`. Set `hideBelow` on low-value columns. Never a fixed pixel width on a container.

### 12. Numbers use the shared inputs

`NumericInput` / `PercentageInput` / `CurrencyInput`, never a bare `<Input>` for a number.
They already enforce the `fn_Numeric` rules.

### 13. Real empty, loading and error states

`DataGrid` takes `loading` and `emptyMessage`; use `EmptyState` where a whole screen has
nothing, and `SelectProjectPrompt` where a project is the missing prerequisite. Errors are
`AppError` from `@/platform/errors` plus a `trace()` at the matching severity — the
`IfError(…, Trace(…))` pair, kept together.

### 14. Theme values are transcribed, not chosen

`src/theme/tokens.ts` mirrors `AppTheme.palette` and `gblAppSizes` from `App.pa.yaml` —
`themePrimary #006eb9`, the six `akzent` colours, the greyscale ramp, the
8/9/10/11/12/14/16 pt font scale, the 200 px / 32 px rail widths, the 450 px right panel.
Changing a hex there changes parity, and `src/theme/tokens.test.ts` pins it. Dark mode is
new and is a token swap over the same ramp.

### 15. Comment the provenance of the file

Head each file with a block naming the canvas screen, its control / line / block counts and
band, and what was deleted as a platform workaround rather than ported. Every existing
feature file has one; copy the shape.

### 16. No `any`

Strict TypeScript. `noUnusedLocals` and `noUnusedParameters` are on. Repositories over
untyped tables return `Record<string, unknown>` — narrow with a local interface and a
mapper, as every `to*` function in a `hooks.ts` does.

---

## Style rules for `makeStyles`

Fluent's `makeStyles` **rejects CSS shorthands** for border, padding, margin and background.
Use longhands: `borderTopColor` / `borderRightColor` / … not `borderColor`. `padding` and
`gap` with a single value string are fine. An inline `style={}` carrying a computed colour
needs `as CSSProperties`.

A Zustand selector that builds a fresh object on each call renders forever (React error
#185). Select primitives, or memoise — see `selectProjectHeader` in `src/store/appStore.ts`.

---

## Verify before you report back

```bash
npx tsc --noEmit 2>&1 | grep "features/<phase>/<slug>"   # must be empty
npx vitest run src/features/<phase>/<slug>               # must pass
npm run gates                                            # must exit 0
```

`npm run gates` is the real bar: it runs G-TYPE, G-IDS, G-MATRIX, G-OWN, G-LABEL, G-UNIT and
G-BUILD, and the four static gates are fast. If you touched a label, a create payload, a
test id or the matrix, one of them has an opinion about it.

Report: the files you created, the number of tests, the gates you ran, and anything in the
specification you could not implement faithfully and why. If a gate needed a baseline entry
to pass, say so explicitly and name the owner — that is a debt you are adding, not a task
you are finishing.
