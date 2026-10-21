# Migration strategy — porting a canvas screen to `ProjectCosts-CodeApp/`

This is how a canvas screen actually gets ported here, distilled from how the existing
screens were built and from fixing real divergences (Simulate, Edit Costs) in this app. It
borrows the reference harness's discipline (see `ProjectDocs/skeleton-reference/skeleton-app/CLAUDE.skeleton.md`
and `VSBCloud-Harness-Plan.md`) but adapts it to this app's actual, flatter architecture — do
not adopt that document's folder structure or security model wholesale (see
`ProjectDocs/instructions/PROJECT-MAP.md`).

## The sequencing decision already made

**Admin → Project Management → Project Costs** is the harness plan's documented order, and the
reason is structural, not aesthetic: every Project Costs screen and several PM screens read
master data an admin screen owns, and none of the admin screens the harness plan reviewed had
real server-side permission checks. For *this* app, the practical consequence already visible
in the code: `ProjectCosts-CodeApp/` built the Cost screens (which read admin-owned
reference data like CAPEX accounts, cluster states, standard assumptions) against data that
already existed in `VSBCloud_Dev`, because the admin screens still exist and are maintained on
canvas. **Do not assume a new screen can be built against fixtures** — there's no mock mode
here; everything reads real Dataverse, so a screen that reads admin-owned data needs that data
to already exist in the target environment, maintained by whichever app (canvas or future code
app) currently owns it.

## Steps to port a screen

1. **Locate the canvas source.** `ProjectDocs/_extracted/msapp/<projectmanagement|
   projectcosts>/Src/<Screen Name>.pa.yaml`. This is the ground truth for every formula —
   quote it verbatim when documenting a rule, never paraphrase from memory or from a secondary
   doc.
2. **Check which formulas are actually live.** Canvas controls frequently carry a commented-out
   (`/* ... */`) formula right beside the one that executes. Port the live one. This is not a
   hypothetical — it is exactly what went wrong before the Simulate command fix in this app
   (see `ProjectDocs/instructions/CONVENTIONS.md` rule 10).
3. **Cross-reference, don't copy, the reference materials:**
   - `ProjectDocs/migration-plans/screens/0NN-<slug>.md` if one exists — gives the business-rule breakdown
     and dependency list for that canvas screen, but it was written against the skeleton's
     architecture. Use it for *what the rule is*, re-derive *how it's coded* against this app's
     own `rules.ts`/`hooks.ts`/`Screen.tsx` split and entity names.
   - `ProjectCosts-CodeApp/src/features/{admin,pm,cost}/<slug>/rules.ts` if it
     exists — shows one already-tested TypeScript translation of the Power Fx. Same caveat:
     reference only, its entity-set names and privilege calls don't match this app.
   - `ProjectDocs/reference/dataverse-attributes.json` — maps the canvas's display
     names (`'Project ID'`) to Dataverse logical names (`vsb_name`) for every column you'll
     need. Resolve every column through this before writing a query.
4. **Resolve the Dataverse table.** If the table isn't yet registered in this app
   (`ProjectCosts-CodeApp/.power/schemas/appschemas/dataSourcesInfo.ts`), run
   `pac code add-data-source -a dataverse -t <logical-name>` — and immediately diff
   `dataSourcesInfo.ts` afterward (see `ProjectDocs/instructions/CONVENTIONS.md` rule 9's footgun note).
5. **Write `rules.ts` first, as pure functions, with `rules.test.ts` alongside.** Decisions,
   validations, gates, derived labels/totals, write-payload shaping — all of it. No React, no
   SDK call, no `window`/`import.meta.env` read inside `rules.ts`; pass those in as arguments
   from the caller (`Screen.tsx` or a hook) so the function stays trivially testable.
6. **Write `hooks.ts`** for the TanStack Query wiring — queries, mutations, cache invalidation.
   This is allowed to be impure; it must not contain arithmetic or business decisions.
7. **Compose `Screen.tsx`** — layout only, calling into `rules.ts` via `hooks.ts`'s query
   results. If you're writing a conditional or a calculation directly in `Screen.tsx`, stop and
   move it to `rules.ts`.
8. **Decide on every divergence explicitly**, per `ProjectDocs/instructions/CONVENTIONS.md` rule 8: port the
   canvas behaviour (bug and all) by default; only change it where a decision has been
   recorded, with a `…CanvasParity` twin and a test, and a line in
   `ProjectDocs/app-docs/02-OPEN-DECISIONS.md`. Never decide silently that "the canvas was
   obviously wrong here" — write it down and let someone with product authority confirm it.
9. **Verify against real Dataverse, not just the type checker.** Run the screen through
   `pac code run` locally (see `ProjectDocs/instructions/TESTING-AND-HARNESS.md`) against `VSBCloud_Dev` before
   calling it done — several real defects in this app's history (silent delete failures, the
   Base Case lookup for Simulate, the `OwningBusinessUnit` write form) are exactly the class of
   bug that only shows up against a real environment, never against types or mocked tests.
10. **Update the status docs you actually touched.** At minimum
    `ProjectDocs/app-docs/05-SCREEN-TRACKER.md`; add an entry to `01-BUGS-FOUND.md` for
    anything newly discovered, and to `02-OPEN-DECISIONS.md` for anything that needs sign-off.
    These docs are already known to lag the code (see `ProjectDocs/instructions/PROJECT-MAP.md`) — closing that
    gap a little on every change is cheaper than a future session re-deriving the current state
    from scratch.

## Label fidelity — the standing rule, restated

Every visible string — button caption, page title, column header, tooltip, placeholder,
validation message, confirmation title — keeps the exact wording the canvas has, including its
inconsistencies and its typos (correct a typo in place only if you write down the original
spelling in a comment, per `ProjectDocs/instructions/CONVENTIONS.md` rule 7). This is deliberate, not an
oversight: a wrong number fails a test; a politely reworded button fails nothing, ships, and
turns into a support ticket. The one place this doesn't apply is text referencing a control
that no longer exists (a spinner the framework now owns, a canvas timer workaround that's gone)
— that text goes with the control.

## What "done" means for a screen in this app

There is no formal multi-gate harness here yet (see `ProjectDocs/instructions/TESTING-AND-HARNESS.md` for what
exists today vs. the reference harness's nine gates). Until one exists, treat a screen as done
when:

- `npm run typecheck`, `npx vitest run`, and `npm run build` are all clean from `ProjectCosts-CodeApp/`.
- Every business rule the canvas screen has is in `rules.ts` with a test, not inferred or
  skipped.
- Every divergence is marked and recorded, not silent.
- You have actually clicked through the screen against real `VSBCloud_Dev` data via
  `pac code run` — not just trusted the mock-free unit suite.
