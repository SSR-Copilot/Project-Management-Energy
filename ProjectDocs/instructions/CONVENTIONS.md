# Conventions — `ProjectCosts-CodeApp/`

These are the real app's own rules, not the skeleton's. The nine numbered rules are from
`ProjectDocs/app-docs/APP-README.md` verbatim (do not let that file and this one drift — if you
change one, change both); everything after rule 9 was established over the course of real
development sessions and is recorded here because the README doesn't carry it yet.

## The nine core rules

1. **`$select` on every query.** Dataverse returns every column of a table without it — 112
   on `vsb_projects` alone.
2. **Never materialise a table to filter it.** The canvas `ClearCollect(col, Filter(T, …))`
   pattern is what capped the old app at 2,000 rows with no warning. Filter on the server with
   an OData `$filter`, built through `src/data/odata.ts`'s `f.*` helpers — never hand-concatenate
   a filter string.
3. **Every read and write goes through `unwrap`** (`src/platform/errors.ts`). The SDK returns
   `{success: false}` rather than throwing on failure, and the canvas app ignored the
   equivalent almost everywhere — that silence is exactly the bug class to not reproduce.
4. **Every create on a project-scoped table writes `OwningBusinessUnit@odata.bind`** (the write
   form — a bound navigation property — never `_owningbusinessunit_value`, which is the read
   form and is either rejected or silently ignored on create). Omitting it never errors; the
   row just becomes invisible to a business-unit-scoped colleague later. This is the worst
   shape a defect can have — nothing throws, nothing logs, the grid is just quietly short.
5. **Business rules live in `rules.ts` as pure functions**: no React, no network, no globals,
   no `Date.now()`/`Math.random()` without injecting them. If it branches on data it is a rule
   and it gets a test. `Screen.tsx` is composition only and calls into `rules.ts`.
6. **Theme values are transcribed, not chosen.** `src/theme/tokens.ts` mirrors the canvas
   `AppTheme.palette`; changing a hex changes parity with the canvas app.
7. **Visible strings are transcribed from the canvas, verbatim** — not paraphrased, not
   corrected for style. They live in a `MSG` (or `<AREA>_MSG`) object in `rules.ts`, each entry
   citing the canvas control and property it came from in a comment, e.g.
   `` /** `lbl_Add_Edit_AdminContracts_Description_ErrorMessage_1.Text` — verbatim. */ ``. A
   string literal inline in `Screen.tsx` is a review comment waiting to happen.
8. **A divergence from the canvas app is marked `SOURCE DEFECT:` or `DIVERGENCE:`** in a
   comment naming what the canvas does and what this app does instead, gets a `…CanvasParity`
   twin function where numbers are involved so the decision stays reversible, a test pinning
   both halves, and an entry in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`. Never fix a
   canvas bug silently.
9. **`src/generated/` and `.power/` are `pac` output.** Regenerate with
   `pac code add-data-source -a dataverse -t <logical-name>`; never hand-edit either tree.
   **Known footgun**: the legacy `pac code` CLI's `add-data-source` has been observed to
   regenerate `.power/schemas/appschemas/dataSourcesInfo.ts` from scratch, dropping every
   other previously-registered table rather than appending. Always diff that file immediately
   after running the command and restore the other entries if it happened.

## Established since the README was last updated

10. **The real-vs-commented-out canvas formula trap.** A canvas control's `ItemEnabled` /
    `ItemVisible` sometimes carries a commented-out (`/* … */`) formula right next to the LIVE
    one that actually runs. Always check which formula is live before porting a gate — porting
    the commented-out one reproduces a check the canvas never actually enforced. (Established
    while fixing the Simulate command: its real `ItemEnabled` is just "a project is selected";
    the Wind/PV + Cluster 1–5 + Base Case validation is enforced in the `OnSelect` handler, not
    in the gate.)
11. **`OnSelect`/`OnChange` validation is a separate concern from `ItemEnabled`/`ItemVisible`.**
    A command can be enabled by selection alone and still refuse to act at click time with its
    own `Notify(...)`. Port both halves faithfully and don't conflate one command's validation
    with another's just because they look similar (e.g. don't reuse the cost-module Draft lock
    for a command the canvas never gates on Draft).
12. **New-tab / cross-window URLs must be environment-aware, not just correct for one
    environment.** `resolvePlayAppUrl` in `src/app/deepLinks.ts` is the pattern.
    - In `import.meta.env.DEV`, use the local `pac code run` play-host URL
      (`…/app/local?_localAppUrl=…&_localConnectionUrl=…`) FIRST, even when the host reports
      an `appUrl`.
    - Otherwise use the SDK-reported `ctx.app.appUrl` (a pushed/deployed app).
    - Never fall back to a bare `localhost:3000`, which carries no Power context.

    Changed 20 Oct 2026: during `pac code run` the host's `appUrl` played a published app, so
    Edit Project opened the wrong app.

    The player strips the URL fragment, so a new tab's target screen must also travel as a
    launch parameter, which `Landing` routes on: `costScreen` for Edit Costs, `pmScreen` for
    Edit Project, plus `projectId`. Keep this pure and testable: read
    `window.location`/`import.meta.env` at the call site, and pass values in as arguments.
13. **Test IDs**: `UT-<SCREEN>-NNN`, matching the skeleton's and migration-plans' own
    convention, one id per `it()`. Used already in this app's `rules.test.ts` files (e.g.
    `UT-OV-051`). Keep IDs stable across edits so a failure points at a specific documented
    case, not a renumbered one.
14. **Delete paths must surface SDK failure, never swallow it.** The generated service's
    `delete()` discards the `IOperationResult` and the SDK never throws, so a Dataverse refusal
    (403, a cascade restriction) resolves exactly like success unless the call goes through
    `deleteRecord` in `data/client.ts` (which does check the result) instead of the raw
    generated service method directly.
15. **Treat `CANVAS_PARITY_DELETION`-style flags as live product decisions, not dead code.**
    Where a flag exists specifically to reproduce a canvas defect (e.g. Add Cost from Table's
    full-history delete on contract removal), it was turned on deliberately after client
    confirmation — don't "clean it up" without checking `ProjectDocs/app-docs/02-OPEN-DECISIONS.md` first.
16. **Every interactive UI control carries an explicit `aria-label` AND a `data-testid`.** This
    applies to every new or changed control, before any commit or merge. Tosca identifies
    controls by these two attributes, and implicit `<label>` wrapping is invisible to its scanner
    (`ProjectDocs/migration-plans/09-tosca-automation-conventions.md`). The rules:
    - **`aria-label`** = the canvas control's **`AccessibleLabel`, verbatim, wherever the canvas
      sets a literal one** (usually the control's own name, e.g. `tgl_SeniorDebt_Data_KfW_Tranche`,
      sometimes text such as "Year"). That is what the canvas rendered, so it is what existing Tosca
      modules recorded. Where the canvas sets none, use the visible caption, verbatim: button text,
      field label, column header, option text, action verb. Never bound data (no amounts, comments
      or record names).
    - **`data-testid`** = the canvas control name (`btn_…`, `txt_…`, `drp_…`, `rad_…`, `tgl_…`,
      `ico_…`) where one exists, looked up in `ProjectDocs/_extracted/msapp/*/Src/*.pa.yaml`.
      Otherwise use a stable kebab-case id from configuration (`<screen>-<purpose>`). For
      repeating rows, append the row's stable id (`` `${base}-${row.id}` ``), never a display
      value or a list index.
    - **Radios and checkboxes** get an explicit `value`.
    - **Never change an existing value.** Tests and Tosca modules key on them; only add what is
      missing.
    - **Use the shared primitives.** Pass `label` + `name` to `CostField` / `Choices`, and
      `label` + `testId` to `CostSelect`, `TextField`, `TextAreaField`, `NumericField` and
      `PanelExtraButton`. `PanelButtons` labels Save/Cancel itself; pass `saveTestId` /
      `cancelTestId` where the canvas names are known.
    - **Validated against the canvas** by `scripts/check-canvas-identities.mjs`, which runs inside
      the suite as `src/test/canvasIdentities.test.ts` (UT-CANVASID). It checks three things:
      every canvas-named `data-testid` is a real control on that feature's own canvas screen; its
      type matches; and the `aria-label` equals the canvas `AccessibleLabel`. Run
      `npm run check:canvas` for a per-module report. The canvas source on disk is solution
      1.21.709, so exempt a newer-only control with `// canvas-identity-ignore: <reason>`.
    - **Enforced** by `scripts/check-control-labels.mjs`, which runs inside the unit suite as
      `src/test/controlLabels.test.ts` (UT-LABELS). `npx vitest run` therefore fails on an
      unlabelled control or a duplicate literal test id. `npm run check:labels` prints the list
      plus warnings for `aria-label`s computed from expressions. Exempt a control only with
      `// control-labels-ignore: <reason>` on the line above it.

17. **One definition per helper or component; reuse it, never copy it.** Before writing a
    helper, search for one. New screens import from these homes, and a second copy is a review
    failure:
    - **UI primitives:** `@/components` (`index.ts`). That covers the canvas field primitives in
      `components/CanvasFields.tsx` (`CostField`, `CostSelect`, `Choices`, `PanelButtons`,
      `PanelExtraButton`, `testIdPart`) and the Fluent ones in `components/Fields.tsx`. Never
      import a primitive from another feature's folder. If the kit lacks a control, add it to
      `components/`, not to the screen.
    - **OData and row values:** `data/odata.ts` (filters, `dateOnly`, `bind`, `idIn`,
      `numberOf`, `money`).
    - **Write plans:** `data/writePlan.ts` (`WriteOp`, `PlannedWrite`, `WritePlan`,
      `emptyPlan`, `refusePlan`).
    - **Names and option sets:** entity-set names and option sets in `data/dataverseNames.ts`;
      date maths in `domain/dates.ts`.
    - **Exceptions:** a deliberate per-screen variant (different canvas formula, message or
      signature) stays local but cites its canvas source. Re-check `npx -y knip@5` and the
      duplicate audit before a release (see below).
18. **Date-only values are formatted from LOCAL parts, never `toISOString()`.** Use `dateOnly`
    from `data/odata.ts`. `toISOString().slice(0, 10)` stores the previous day for any user
    east of UTC, which includes India and the Netherlands.
19. **Every screen that reads data renders its load-error state.** Check the query's `error` as
    well as `isLoading`, and show `EmptyState` ("Cost data is unavailable") rather than an empty
    screen. A failed read must never look like "no rows".

20. **Standard-assumption values render blue and italic** (product owner, 20 Oct 2026). Wherever
    the canvas ties a value to an "is standard assumption" condition, the code app shows that
    value in `palette.themePrimary` (#006eb9) and italic while the condition is true, and in
    the normal label colour, not italic, once it is false. The condition takes several forms:
    - an `Is … Standard Assumption?` column (e.g. `'Is Tarrif / Price P90 Standard Assumption?'`);
    - `IsStandardContract`;
    - a `locIsStandard…` / `locSelected…_IsStandard` variable;
    - a row whose Description or Name starts with "Standard" (`StartsWith(…, "Standard")`).

    In the canvas it is the pair `FontColor`/`Color: =If(<condition>, ColorValue(gblAppTheme.palette.themePrimary), …)`
    plus `FontItalic`/`Italic: =<condition>`. Rules:
    - The condition is a pure function in `rules.ts` with a test.
    - The style comes from the one shared definition in `@/components` (rule 17), never a
      per-screen copy.
    - Editing a field so it no longer equals the standard value clears the styling, exactly
      when the canvas clears the flag.
    - Check every module's canvas YAML for these pairs when porting (item 2 below), including
      gallery rows, inputs, date pickers and labels.

## Before every build (standing instruction, 19 Oct 2026)

Check all four, in order, before writing or building any feature or change. Items 1 and 3
restate rules 16 and 17; they are listed here so the whole check is in one place.

1. **aria-label + data-testid** on every new or changed control (rule 16).
2. **Technical requirements from the module's canvas YAML.** Read the screen's
   `ProjectDocs/_extracted/msapp/<app>/Src/<Screen>.pa.yaml` and the `Components/` it uses.
   Before coding, list the live formulas it needs (`OnVisible`, `OnSelect`, `Items`,
   `DisplayMode`, `Visible`, `Patch`/`Remove` payloads), the tables and columns
   (via `ProjectDocs/reference/dataverse-attributes.json`), the verbatim captions and the
   `AccessibleLabel`s. Then check that the implementation covers each one. Skip commented-out
   formulas (rule 10). The `canvas-yaml-to-codeapp` skill has the method. Item 2 also includes
   two checks that canvas formulas alone do not show:
   - **Server-side flows and plugins** that the screen's writes trigger. See the verified map at
     the top of `ProjectDocs/migration-plans/04-flow-inventory.md`. Write exactly the rows,
     columns, write order and Owning Business Unit the canvas writes, and never redo a flow's
     or plugin's work in the client.
   - **Hidden controls and components:**
     - hidden buttons run as subroutines through `Select()`;
     - hidden fields whose values other formulas read;
     - timers;
     - `fn_*` validation components;
     - the logic inside shared components such as the `cmp_Header` menus.
3. **Reusable components first** (rule 17). Search `@/components`, `data/` and `domain/` before
   writing any control or helper.
4. **Approval before commit.** After `npm run verify` passes, show the user what changed and
   wait for their explicit approval before any commit, merge or push. A passing gate is not
   approval.

## Before every commit or merge

**Get the user's explicit approval first** (item 4 above). Then, from `ProjectCosts-CodeApp/`,
run **`npm run verify`**. It runs these steps in order, and
every step must pass:
1. the `.power/` data-source gate (`check:power`);
2. typecheck;
3. lint;
4. the control-label gate;
5. the canvas-identity gate;
6. the full test suite;
7. the build.

It is the same gate as the "Working agreement" in `ProjectDocs/instructions/AGENT-GUIDE.md`; rules 16–19 are part of
it. Lint warnings do not fail the gate, but do not add new ones.

## Before pushing to DEV (`pac code push`)

Run every step, in order, from `ProjectCosts-CodeApp/`. Stop at the first failure.

1. **Clean install.** `npm ci`, so the build uses exactly the lockfile.
2. **Data sources present.** `npm run check:power` must report 38 registered and 0 problems.
   `.power/` is git-ignored, so on a fresh checkout regenerate it first: re-add each table in
   `power.config.json` with `pac code add-data-source -a dataverse -t <logicalName>`, then
   re-run the check.
3. **The full gate.** `npm run verify` must exit 0.
4. **Hygiene.** `npx -y knip@5`: no new unused files or dependencies. No file may be
   byte-identical to another in `src/`.
5. **Local smoke test against VSBCloud_Dev.**
   - Start two terminals: `npm run dev` (port 3000) and
     `pac code run --appUrl http://localhost:3000` (port 8080).
   - Open the `apps.powerapps.com/.../app/local?...` URL that pac prints, signed in with the
     account that has VSBCloud_Dev access.
   - Check the browser console has no errors.
   - Open Project Overview and each of the five Cost screens (Capex, Contracts, Opex, Land Lease,
     Add Costs from Table) on a test project. On each, add, edit and delete a record, then
     reload to confirm the change persisted.
   - The Admin and PM screens show their not-connected notice.
6. **Right environment.** `pac auth list` and `pac org who` must both show VSBCloud_Dev
   (environment `be41add6-6f60-ebb0-9c73-2480d6bc615d`, the one in `power.config.json`).
   `pac code push` deploys to the ACTIVE profile.
7. **Push, then confirm.** Run `pac code push`. Open the deployed app in VSBCloud_Dev and repeat
   the step-5 smoke test there.

Never push from a tree where `verify` was skipped, or where a step above was waived without
recording the reason in `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`.

## What NOT to copy from the skeleton or migration-plans

- ~~Its phase-split folder structure~~ — **adopted** (15 Oct 2026): this app now uses
  `src/features/{admin,pm,cost}/<slug>/`. Everything else in this list still applies.
- Its `src/security/matrix.json` / `privileges.forTable` model — this app's privilege model (if
  any exists yet) is separate; check `src/platform/` before assuming parity.
- Its entity-set / logical-name spellings — always resolve names for this app from
  `ProjectDocs/reference/dataverse-entities.json` and `dataverse-attributes.json`, or
  from `ProjectCosts-CodeApp/.power/schemas/appschemas/dataSourcesInfo.ts` for tables already registered here.
- Its mock-mode data layer (`src/data/mock/`) — this app has no mock mode; local testing without
  a Power context genuinely has no data (see `ProjectDocs/instructions/TESTING-AND-HARNESS.md`). A screen whose
  tables are not registered yet returns `notConnected()` from `src/data/notConnected.ts` — empty,
  never invented — until it is connected per MIGRATION-STRATEGY steps 4 and 6.
- Anything under `ProjectDocs/skeleton-reference/` — reference only, never imported.
