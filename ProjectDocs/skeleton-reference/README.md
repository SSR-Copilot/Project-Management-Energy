# Skeleton reference material — NOT part of the running app

These files came from `VSBCloud-Code-App-Skeleton/vsbcode/` when its Administration and Project
Management screens were merged into `ProjectCosts-CodeApp/`. They were moved out of `ProjectCosts-CodeApp/`
because they either do not fit this app's tooling or would mislead someone working in it. The
paths below mirror where they sat in the skeleton.

| Path | What it is | Why it is not in `ProjectCosts-CodeApp/` |
|---|---|---|
| `solution/` | `apply-roles.mjs`, `apply-columnsecurity.mjs`, `customapi/apply-customapis.mjs`, the custom-API C# plugins | **Writes to a Dataverse environment** (security-role privileges, column security, custom APIs) from the skeleton's unverified `matrix.json` role model. Dry run by default, but `--apply` against `VSBCloud_Dev` would change live security. Do not run without an owner's sign-off. |
| `scripts/` | The skeleton's gate checks (`check-*.mjs`, `gsec.mjs`), label/a11y extractors, `scenario.mjs` / `walk.mjs` | Not wired into `ProjectCosts-CodeApp/package.json`; their baselines describe the skeleton's tree, not this app. |
| `reference/` | Baselines for those gates (labels, ownership, a11y) and the extracted canvas label/AccessibleLabel lists | Only read by `scripts/`. Their generated output, `canvasA11y.generated.ts`, is archived in `removed-from-app/src/a11y/`. |
| `.github/workflows/ci.yml` | The skeleton's CI pipeline | Calls `gate:*` / `gates:phase` scripts that do not exist in `ProjectCosts-CodeApp/package.json`. |
| `CONVENTIONS.md`, `PowerFx.md`, `GUIDE-PARITY.md`, `docs/` (`SECURITY.md`, `G-A11Y.md`), `skeleton-app/CLAUDE.skeleton.md` (the skeleton working agreement) | The skeleton's own rules, analysis and UI notes | They describe mock mode as the default, ESLint and nine gates — true of the skeleton, not of this app. Use for background only; the app's rules are `ProjectDocs/instructions/AGENT-GUIDE.md` and the workspace `ProjectDocs/instructions/CONVENTIONS.md`. |

`removed-from-app/` holds the skeleton infrastructure taken out of `ProjectCosts-CodeApp/src` (mock backend, data
client, repositories, store, `matrix.json`, flows client, a11y, skeleton components, routes),
each at its ORIGINAL skeleton path and as the unmodified skeleton original. These files were
also removed from `VSBCloud-Code-App-Skeleton/vsbcode/`, so this folder is now their only copy.
`REMOVED-FROM-SKELETON.txt` lists every file taken out of the skeleton.

`features/<phase>/<slug>/` holds the skeleton's ORIGINAL `Screen.tsx` and `hooks.ts` for the 16
Admin / Project Management screens (plus `pm/generators/replace.test.ts`). The app's versions of
those screens are UI-only and not connected (`ProjectCosts-CodeApp/src/data/notConnected.ts`); these originals are
the only working implementation of each screen's queries and save sequences — read them when
connecting a screen (MIGRATION-STRATEGY steps 4 and 6), then re-derive the code on the app's
data layer (`data/client.ts`, generated services, `unwrap`); never import them.
`features/cost/capex-costs/rules.ts` is kept as the reference
`ProjectDocs/app-docs/1.21.753-REQUIRED-CHANGES.md` cites for R2–R4 (`absorbPercentRemainder`, `enrichSchemeIsPercent`).

To adopt one of the gates in the real app, port the script into `ProjectCosts-CodeApp/scripts/`, re-baseline it
against `ProjectCosts-CodeApp/src`, and add it to `ProjectCosts-CodeApp/package.json` — do not run it from here as-is.

The build specification index (`VSBCloud.md`), the five UI guide notes (`guide*-ui-notes-*.md`),
`G-LABEL.md` and `CHANGES-FROM-INPUT.md` are requirement and harness docs: their single copy lives in
`ProjectDocs/app-docs/`. The skeleton's own `CLAUDE.md` files are renamed `*.skeleton.md` so
Claude Code does not load their mock-mode rules as instructions for this app.
