# Status — Project Costs code app

For the 14 September single-app navigation changes and current remaining scope, see
[Single-app implementation progress](04-SINGLE-APP-IMPLEMENTATION.md). The verification
snapshot below predates that change set.

Last verified: 2026-09-09, on Windows 11 · Node 24.20.0 · npm 11.19.0 · `pac` 2.8.1

---

## Verified, not claimed

```
npm run typecheck   clean          tsc --noEmit, strict + noUncheckedIndexedAccess
npm test            151 passed     6 files, 25 s
npm run build       clean          333 kB app + 547 kB Fluent (147 kB gzip) + 45 kB screen
npm run dev         serves         http://localhost:3000 returns 200
pac org who         connected      VSBCloud_Dev · vsbclouddev.crm4.dynamics.com
pac code run        serving        connection host on :8080, all 15 tables resolved
```

Nothing has been pushed to the environment. `power.config.json` has `appId: null`, which
means no app record exists yet — `pac code push` creates it.

## What is built

| | State |
|---|---|
| **Main Project Overview — the landing screen** | **done** — 77 rule tests + 16 render tests |
| App shell — header, left rail, footer, routes | **done** |
| Deep link `projectId` → project context | **done**, incl. the no-project and not-found states |
| Theme — the canvas `AppTheme` palette as a Fluent v9 theme | **done**, transcribed |
| `fn_Numeric` / `fn_Percentage` as pure TypeScript | **done**, 29 tests |
| OData filter builders with escaping | **done**, 14 tests |
| Paging that does not silently truncate | **done** |
| Error handling — every read and write unwrapped | **done** |
| Report-a-problem panel | **done** (see decision D9 — it copies, it does not file) |
| **Contracts screen** | **done** — 78 rule tests + 3 render tests |
| Project list filters, sorting, server-side paging | **done**, criteria live in the URL |
| DEVEX/CAPEX screen | placeholder |
| OPEX (O&M + Other) screen | placeholder |
| Land Lease screen | placeholder |
| Add Costs from Table | placeholder |

### Data sources declared (18 of the app's 37 tables)

Added with `pac code add-data-source -a dataverse -t <table>`, which generates the typed
model, the service and the entry in `.power/schemas/appschemas/dataSourcesInfo.ts`:

```
vsb_bopprojectscontractses              vsb_capexaccountlists
vsb_bopcontractspaymenttargetses        vsb_capexprojectcontracts
vsb_bopcontractsdevcocostses            vsb_projects
vsb_bopcontractsstandardassumptionses   vsb_countries
vsb_projectstates                       vsb_countryareas
aadusers
systemusers  teams  roles  businessunits  transactioncurrencies
environmentvariablevalues  environmentvariabledefinitions
```

Every primary key the platform generated matches
`reference/dataverse-entities.json` — including the six the skeleton's
`entitySet.replace(/s$/,"")+"id"` rule gets wrong (`vsb_bopprojectscontractsid`,
`vsb_bopcontractspaymenttargetsid`, `vsb_bopcontractsdevcocostsid`,
`vsb_bopcontractsstandardassumptionsid`, `vsb_countryid`, `transactioncurrencyid`).

## What is knowingly incomplete in the Contracts slice

**The Recalculate button computes from an empty cost set.**
`src/features/contracts/Screen.tsx` → `capexCosts` is `[]`.

The two Plan figures are `Sum` over the project's DevCo `CAPEX Costs` rows, and
`vsb_capexcosts` is not yet a declared data source on this app. So Recalculate currently
produces 0 for both halves. Everything around it is finished and tested: the arithmetic
(`costsUntilClosing` / `costsAfterClosing`, UT-CON-014 … UT-CON-019), the total chain
(UT-CON-020 … UT-CON-031), the Save gate and the payload.

It is one `pac code add-data-source -a dataverse -t vsb_capexcost` plus one query away, and
that query belongs to the DEVEX/CAPEX slice, which is why it waited.

## Next, in order

1. **Settle decisions D1, D2, D3 and D6** in `02-OPEN-DECISIONS.md`. D1 and D6 share an
   answer; D3 changes stored numbers; D2 decides whether a premium SQL connector stays in
   scope at all.
2. **Wire `vsb_capexcosts`** and finish Recalculate. Closes the gap above.
3. **Port `DevexCapexSummaryPCF` to React.** The largest single piece of work left. The
   source is dependency-free TypeScript (`ui/GridRenderer.ts`, `ui/ActionDropdown.ts`) with a
   1,416-line stylesheet that documents every class against the element it styles, so it ports
   rather than gets reinvented. **The git repo is still needed** — the managed solution only
   carries the minified bundle.
4. **DEVEX/CAPEX screen** on top of it. 355 controls, the comments panel, the add/edit
   contract panel, the year navigation.
5. **Land Lease, then OPEX.** Both straightforward CRUD once the shell and the data patterns
   are proven, and both need their tables declared.
6. **Add Costs from Table**, last, because it needs the spreadsheet component and a decision
   on defect A-1 (it deletes contracts that have historical costs).

## Running locally against real Dataverse data

Two processes. Both must be up.

```bash
cd app
npm run dev            # terminal 1 — the app itself, on :3000 (strictPort)
pac code run --appUrl http://localhost:3000   # terminal 2 — the connection host, on :8080
```

Then open the URL `pac code run` prints:

```
https://apps.powerapps.com/play/e/be41add6-6f60-ebb0-9c73-2480d6bc615d/app/local
  ?_localAppUrl=http://localhost:3000
  &_localConnectionUrl=http://localhost:8080
```

**Do not open `http://localhost:3000` directly.** The app loads, but `getContext()` has no
host to answer it, so there is no user, no environment and no Dataverse. The app must run
inside the `apps.powerapps.com/.../app/local` shell, which iframes `:3000` and supplies the
context; `:8080` is only there to hand it `power.config.json`.

You sign in **as yourself** in the browser, so every query runs under your own security
context — the `pac auth` profile (currently the flow service account) only decides which
environment the connection host points at.

### Landing somewhere with data

The landing screen is the **Main Project Overview** — the project list, with the seven filters,
sortable columns and the pager. Select a row and use **Edit Costs** to open the cost module.
Contracts is the only migrated cost screen, so that is where Edit Costs lands.

A project whose Status is "Draft" is blocked, exactly as the canvas blocked it: Edit Costs
shows the prerequisites dialog instead of navigating.

To skip the overview and deep-link straight into the costs — which is what the PM app's
"Edit Costs" button does today — append the project to the play URL:

```
…&_localConnectionUrl=http://localhost:8080&projectId=<guid>
```

Both replace what the canvas Cost app did with no `projectId`, which was to silently load
`GUID("33b9cc79-5b4f-f111-bec6-000d3a3855c2")` and let you edit its costs (A-2).

### Routes are hash-based

`#/` and `#/projects` (the overview) · `#/costs/capex` · `#/costs/opex/om` ·
`#/costs/land-lease` · `#/costs/contracts`

The overview keeps its filter, sort and page in the URL — `#/projects?q=test&c=<guid>&p=2` —
so a filtered list is shareable, survives a reload and undoes with the back button. The canvas
kept all of it in one `colFiltersOverview` row, which did none of those things.

`HashRouter`, not `BrowserRouter`, and deliberately: a published code app is served from a
path the Power Platform host owns, and we do not control its rewrite rules, so a
`/costs/contracts` deep link would 404 on reload or on a shared link. `vite.config.ts` sets
`base: "./"` for the same reason. **This is the URL shape the PM app's "Edit Costs" button has
to target.**

## Deployment, when it is time

```bash
npm run build
pac code push          # creates the app on first run and fills in appId
```

Two things to check before the first push:

- **the identity.** The active `pac` profile is `flow.serviceuser.vsbcloud@vsb.energy`, a
  service account. The app will be created and owned by it. That was an explicit choice, but
  it is worth revisiting before anything reaches a shared environment.
- **the PM deep link.** PM stays on canvas for this phase, so its "Edit Costs" button needs
  to point at the code app's play URL with `?projectId=<guid>`. The exact Power Fx change is
  a one-liner and depends on the appId that `pac code push` returns.

## Known local friction

`vitest` needs two non-default settings on this checkout, both because the project lives under
a OneDrive-synced path with spaces:

- `pool: "threads"` — the default `forks` pool never completes its worker handshake;
- `deps.optimizer.web.enabled` — without it a jsdom test that imports Fluent transforms ~2,300
  modules inside the worker and exceeds the pool's handshake budget.

Both are commented in `vite.config.ts`. Neither affects the built app. Moving the repo off
OneDrive would make both unnecessary and the test suite several times faster.

`npm run lint` reports 6 warnings and 0 errors. Five are oxlint's `only-export-components`
fast-refresh advisory on files that export both a component and a helper — cosmetic, and
splitting them would scatter closely related code. The sixth is the standard-assumption
seeding effect in the Contracts screen, which is the case the rule exempts; the comment above
it explains why it stays.
