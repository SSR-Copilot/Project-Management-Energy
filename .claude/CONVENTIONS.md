# Conventions — `ProjectCosts-CodeApp/app/`

These are the real app's own rules, not the skeleton's. The nine numbered rules are from
`ProjectCosts-CodeApp/README.md` verbatim (do not let that file and this one drift — if you
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
   both halves, and an entry in `ProjectCosts-CodeApp/docs/02-OPEN-DECISIONS.md`. Never fix a
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
    environment.** `resolvePlayAppUrl` in `src/app/deepLinks.ts` is the pattern: prefer the
    SDK-reported `ctx.app.appUrl` when the host provides it (a pushed/deployed app); otherwise,
    in `import.meta.env.DEV`, reconstruct the local `pac code run` play-host URL
    (`…/app/local?_localAppUrl=…&_localConnectionUrl=…`) rather than falling back to a bare
    `localhost:3000` that carries no Power context. Keep this pure and testable — read
    `window.location`/`import.meta.env` at the call site, pass values in as arguments.
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
    confirmation — don't "clean it up" without checking `docs/02-OPEN-DECISIONS.md` first.

## What NOT to copy from the skeleton or migration-plans

- Its `src/features/{admin,pm,cost}/<slug>/` phase-split folder structure — this app is flat
  `src/features/<slug>/`.
- Its `src/security/matrix.json` / `privileges.forTable` model — this app's privilege model (if
  any exists yet) is separate; check `src/platform/` before assuming parity.
- Its entity-set / logical-name spellings — always resolve names for this app from
  `ProjectCosts-CodeApp/reference/dataverse-entities.json` and `dataverse-attributes.json`, or
  from `app/.power/schemas/appschemas/dataSourcesInfo.ts` for tables already registered here.
- Its mock-mode data layer (`src/data/mock/`) — this app has no mock mode; local testing without
  a Power context genuinely has no data (see `.claude/TESTING-AND-HARNESS.md`).
