# VSBCloud code apps — working agreement

Two canvas apps rebuilt as one Power Apps code app: 23 screens, three phases, Dataverse
unchanged, mock mode the default, nothing here ever run against a real environment. `README.md`
is the map, `CONVENTIONS.md` the rules, `docs/SECURITY.md` the security model.

## Where things are
- `src/features/{admin,pm,cost}/<slug>/` — one folder per screen, parent = phase:
  `Screen.tsx` (composition only) · `rules.ts` (pure) · `rules.test.ts` · `hooks.ts`.
  `src/features/shared/` is not a screen.
- `src/app/buildPlan.ts` — phases, build order, `dependsOn`, exit gates. A new screen needs
  an entry or `UT-PLAN2-002` fails.
- `src/security/matrix.json` — the ONLY source of truth for role security: 5 roles, 85
  tables, read by the app AND by `solution/security/apply-roles.mjs`.
- `src/platform/` — dataClient, privileges, bootstrap, odata, errors, telemetry.
  `reference/*-baseline.json` holds the two gate baselines: to-do lists, not permissions.

## The rules most easily broken
1. **Never materialise a table to filter it.** `ClearCollect(col, Filter(T, …))` becomes a
   `useQuery` with an OData `filter`, and `select` is mandatory on every query.
2. **Never write in a loop.** One `repo.saveMany([...])` or `dataClient.batch([...])`, which
   is a bounded fan-out, **not** a transactional changeset.
3. **Business rules live in `rules.ts` as pure functions:** no React, no network, no globals.
   If it branches on data it is a rule and it gets a test. No `any`; `noUnusedLocals` is on.
4. **Every create on a `projectData` table writes the owning business unit** —
   `"owningbusinessunit@odata.bind": "/businessunits(<id>)"`, the write form, never
   `_owningbusinessunit_value`. Omitting it never fails; the row just vanishes later for a
   BU-scoped colleague elsewhere. All 38 tables are flagged, and G-OWN checks it.
5. **Permissions come from the server:** `privileges.forTable(entitySet)` /
   `privileges.forRecord(entitySet, id)`, plus `canEdit` from `useProjectContext()`. **Never**
   infer a privilege from a role name — no `user.isApplicationAdministrator ||
   user.isControllerOwnData`; three hooks did and had to be fixed. Role flags stay legitimate
   for country scope (`canEditCountry`), the admin nav guard (`canSeeAdminSection`) and query
   scoping (`serverFilterFor`) — none of which is a privilege.
6. **Theme values are transcribed, not chosen:** `src/theme/tokens.ts` mirrors
   `AppTheme.palette` and `gblAppSizes`, and changing a hex changes parity.
7. **Every visible string is transcribed from the canvas**, lives in `MSG` / `*_LABELS` in
   `rules.ts`, and cites the canvas `Control.Property` in a provenance comment. Never invent
   a control name — read `docs/G-LABEL.md` first.
8. **A new table must be added to `matrix.json`** or `forTable` denies it and the screen goes
   quietly read-only. `projectData` requires `requiresOwningBusinessUnit`; `reference`,
   `platform` and `connected` are `readOnly` — a hard mask.
9. **Divergences are marked** `// SOURCE DEFECT:`, with a `…CanvasParity` twin and a test.
10. **Fluent v9:** `makeStyles` rejects CSS shorthands (`borderTopColor`, not `borderColor`;
    likewise `background`, mixed-unit `padding`); inline `style={}` with a computed colour
    needs `as CSSProperties`; a Zustand selector building a fresh object each call renders
    forever (React #185) — select primitives or memoise (`selectProjectHeader`).

## Before you claim done
`npm run gates` (G-TYPE · G-IDS · G-MATRIX · G-OWN · G-LABEL · G-UNIT · G-BUILD) must exit
0; 1,720 tests is the floor. If you touched a label, a create payload, a test id or the
matrix, one of the static gates has an opinion — fix the code, not the gate, and never
`--update-baseline` to turn a build green. `npm run gates:phase` adds the strict gates and
exits 1 today on purpose: that is a phase-exit question, not yours.

**Do not touch** matrix grants or depths without saying so — they configure the server as
well as the UI. Nor the theme hexes, the baselines, `.github/workflows/ci.yml`,
`docs/G-LABEL.md` or the five `docs/guide*-ui-notes-*.md`. And `npm run lint` is broken
(legacy config, ESLint 10) — leave it; `gate:type` is what CI enforces.
