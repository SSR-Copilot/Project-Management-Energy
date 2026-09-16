# ProjectCosts-CodeApp

Migrating the **VSBCloud Project Costs** canvas app to a Power Apps code app.
Project Management stays on canvas for this phase; the deep link between them keeps working.

## Quick start

```bash
cd app
npm install
npm run dev          # http://localhost:3000
npm test             # 247 tests
npm run typecheck
npm run build        # → dist/
```

### Running with real Dataverse data

`npm run dev` alone gives you the app with **no** Power context — `getContext()` has nothing
to answer it, so there is no user and no data. For real data you need two processes:

```bash
npm run dev                                    # the app, on :3000
pac code run --appUrl http://localhost:3000    # the connection host, on :8080
```

…and then open the `apps.powerapps.com/.../app/local?_localAppUrl=…&_localConnectionUrl=…`
URL that `pac code run` prints — not `localhost:3000` directly. Full detail, including how to
land on a project, is in [docs/03-STATUS.md](docs/03-STATUS.md).

The landing screen is the Main Project Overview (`#/projects`); **Edit Costs** is the way
into the cost module. Routes are hash-based — see that doc for why, and note it is the URL
shape the PM app's "Edit Costs" button has to target. `?projectId=<guid>` is the deep-link
parameter; without one the app shows a project picker rather than the canvas app's silent
fallback to a fixed test project.

## Layout

```
app/                      the code app
  src/app/                providers, routes, session, the left-rail model
  src/components/         shared UI — shell, header, rail, command bar, panel, fields
  src/data/               repositories, OData builders, paging, cache keys
  src/domain/             pure logic with no Dataverse in it (numeric, locale)
  src/features/<screen>/  Screen.tsx (composition) · rules.ts (pure) · rules.test.ts · hooks.ts
  src/generated/          pac-generated models and services — DO NOT EDIT
  src/platform/           SDK binding, error unwrapping, telemetry, the privileges seam
  src/theme/              the canvas AppTheme palette, transcribed, as a Fluent v9 theme
  .power/                 pac-generated data-source schemas — DO NOT EDIT
  power.config.json       the code-app manifest

docs/00-ANALYSIS.md       what the canvas app is, measured; what the skeleton contains
docs/01-BUGS-FOUND.md     23 defects — 18 in the canvas app, 5 in the skeleton. None fixed silently.
docs/02-OPEN-DECISIONS.md 13 positions taken that need sign-off
docs/03-STATUS.md         what is built, what is verified, what is next

reference/dataverse-entities.json    83 entities: logical name, entity set, primary key
reference/dataverse-attributes.json  717 attributes: the canvas display name → logical name map

_extracted/               unpacked inputs, read-only — the solution, the two PCFs, the .msapp
```

`reference/dataverse-attributes.json` is the one to reach for when porting Power Fx: the canvas
formulas name columns by display name (`'Project ID'`, `'Total cost of contract [EUR]'`) and
this maps them to logical names (`vsb_name`, `vsb_totalcostofcontract`).

## Conventions

1. **`$select` on every query.** Dataverse returns all 112 columns of `vsb_projects` without it.
2. **Never materialise a table to filter it.** The canvas `ClearCollect(col, Filter(T, …))`
   pattern is what capped the old app at 2,000 rows with no warning. Filter on the server.
3. **Every read and write goes through `unwrap`.** The SDK returns `{success: false}` rather
   than throwing, and the canvas app ignored the equivalent almost everywhere.
4. **Every create on a project table writes `OwningBusinessUnit@odata.bind`.** Omitting it
   never errors — the row just becomes invisible to a business-unit-scoped colleague later.
5. **Business rules live in `rules.ts` as pure functions**: no React, no network, no globals.
   If it branches on data it is a rule and it gets a test.
6. **Theme values are transcribed, not chosen.** `src/theme/tokens.ts` mirrors the canvas
   `AppTheme.palette`; changing a hex changes parity.
7. **Visible strings are transcribed from the canvas**, live in `MSG` / `RESX` in `rules.ts`,
   and cite the canvas `Control.Property` they came from.
8. **A divergence from the canvas app is marked** `SOURCE DEFECT` or `DIVERGENCE`, gets a
   `…CanvasParity` twin where numbers are involved, and gets an entry in `02-OPEN-DECISIONS.md`.
9. **`src/generated/` and `.power/` are pac output.** Regenerate with
   `pac code add-data-source -a dataverse -t <table>`; never hand-edit.

## Reproducing the extraction

```bash
unzip -o "../Existing Solution/VSBCloud (3).zip"                        -d _extracted/VSBCloud
unzip -o "../Existing Solution/VSBCustomComponents_1_0_115_managed.zip" -d _extracted/VSBCustomComponents
unzip -o _extracted/VSBCloud/CanvasApps/vsb_projectcosts_ba045_DocumentUri.msapp \
                                                                        -d _extracted/msapp/projectcosts
```

(The `.msapp` unzip warns about backslash path separators; it extracts correctly anyway.)

## Environment

Node 24.20.0 · npm 11.19.0 · `pac` 2.8.1 · Windows 11
Bound to `VSBCloud_Dev` — `https://vsbclouddev.crm4.dynamics.com/`,
environment `be41add6-6f60-ebb0-9c73-2480d6bc615d`.

Nothing has been pushed: `power.config.json` still has `appId: null`.
