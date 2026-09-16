# VSBCloud single Code App — Monday demo plan

Date prepared: 13 September 2026  
Demo date: Monday, 14 September 2026

Implementation started on 14 September. The first change set covers the overview command
restriction, same-app Cost launch, project bootstrap, route guards, and project-preserving
rail links. See `ProjectCosts-CodeApp/docs/04-SINGLE-APP-IMPLEMENTATION.md` for verification
and remaining work. Cost screen completion and Canvas screenshot comparison remain pending.

## 1. Recommended outcome

Ship one deployable Code App with one app identity and two browser experiences:

```text
Current tab
  Project Overview (#/projects)
    - Canvas-matching project list and filters
    - User selects one project
    - Only the Cost command performs navigation for this demo
                 |
                 | window.open(same app + projectId)
                 v
New browser tab
  Same Code App (#/costs/capex?projectId=<guid>)
    - Selected project is reloaded by ID
    - Full Cost navigation shell
    - DEVEX/CAPEX, OPEX, Land Lease, Other OPEX, Contracts
    - Add Cost from Table
```

The canonical implementation target should be `ProjectCosts-CodeApp/app`, not a second copy of the skeleton. It already has Code App metadata, generated Power Platform services, the strongest Project Overview implementation, the shared shell, and the most complete Contracts implementation. Selected Cost features, rules, and tests should be ported from `VSBCloud-Code-App-Skeleton/vsbcode` into it.

The Canvas apps remain the product and visual specification. The skeleton is an implementation reference, not the source of truth.

## 2. Monday scope decision

There are two different meanings of “full Cost app”:

- **Demo-complete:** every Cost screen is reachable and visually faithful; the scripted interactions work end to end with deterministic demo data.
- **Production-complete:** all 37 Cost data sources, permissions, Canvas formulas, flows, PCF actions, validations, Dataverse writes, concurrency, and error paths are implemented and proven.

For Monday, the committed target should be **demo-complete**. Production-complete is not a credible one-day target: the current deployable app has only 18 of the 37 Cost tables generated, four screens are still placeholders, and several Canvas flows and PCF callbacks are not yet represented in the Code App.

### Included for Monday

- One Code App and one deployed app ID.
- Project Overview is the default route.
- Canvas-matching project list, filters, selected row, total count, header, and command bar.
- Only the Cost command opens an application route; other Project actions remain visually present but disabled for the demo.
- Cost opens in a new browser tab, using the same Code App URL and selected `projectId`.
- Cost splash/loading state and selected-project title.
- Full Cost left rail and all five Cost destinations.
- DEVEX/CAPEX tabs, toolbar, year controls, hierarchy, totals, menus, dialogs, and save/loading states.
- OPEX Operation & Maintenance and Other OPEX variants.
- Land Lease.
- Contracts.
- Add Cost from Table spreadsheet experience.
- Deterministic demo dataset and a rehearsed happy path.
- Build, typecheck, automated tests, route smoke tests, and deployed-environment smoke test.

### Explicitly deferred

- Project General, Team, Planning, Production, Revenues, Finance, Generators, Milestones, and Checklists screens.
- Admin screens.
- The third migration/utility Canvas app.
- Power BI, SharePoint, Teams, simulation, deletion, and Project create/edit behavior from the overview.
- Production enablement of unverified Dataverse writes or missing flows.
- A ground-up React rewrite of the DEVEX/CAPEX PCF renderer.
- Broad visual redesign or modernization.

## 3. Exact UI rule

Do not improve, reinterpret, or modernize the UI during this phase. Match the Canvas applications.

Use evidence in this order:

1. Current Canvas app screenshots captured at the agreed demo viewport and browser zoom.
2. Extracted Canvas YAML:
   - `ProjectCosts-CodeApp/_extracted/msapp/projectmanagement/Src/Project Main Screen.pa.yaml`
   - `ProjectCosts-CodeApp/_extracted/msapp/projectcosts/Src/Capex Costs Screen.pa.yaml`
   - `Contracts Screen.pa.yaml`
   - `Opex Costs Screen.pa.yaml`
   - `Land Lease Costs Screen.pa.yaml`
   - `Add Costs from Table.pa.yaml`
3. PCF source, CSS, and visual documentation under `Existing Solution/PCF Git Repo Clones`.
4. `VSBCloud-Code-App-Skeleton/vsbcode/docs/guide3-ui-notes-cost-app.md`.
5. Existing skeleton UI only where the other sources are silent.

Before visual work starts, capture baselines for:

- Project list: no selection and selected row.
- Cost splash/loading shell.
- Each Cost rail destination.
- Every DEVEX/CAPEX tab.
- Expanded hierarchy and Add menu.
- Add/edit panel or dialog.
- Comment and paid/unpaid states.
- Contracts: loading, empty, populated, selected row, and dialogs.
- Spreadsheet: initial, edited, validation, save, and cancel states.
- Saving and error overlays.

Do not draw the purple Power Apps player bar inside the application. If the Code App host supplies that chrome, it should appear once; otherwise the app-owned UI starts with the VSB Cloud header.

## 4. Navigation contract

### Routes

| Route | Purpose | Monday status |
| --- | --- | --- |
| `#/projects` | Project Overview and project selection | Default route |
| `#/costs/capex?projectId=<guid>` | DEVEX/CAPEX | Default Cost route |
| `#/costs/opex/om?projectId=<guid>` | Operation & Maintenance | Enabled |
| `#/costs/land-lease?projectId=<guid>` | Land Lease | Enabled |
| `#/costs/opex/other?projectId=<guid>` | Other OPEX Costs | Enabled |
| `#/costs/contracts?projectId=<guid>` | Contracts | Enabled |
| `#/costs/add-from-table?projectId=<guid>` | Spreadsheet entry | Enabled from CAPEX |

### New-tab behavior

The Cost command must:

1. Require a selected project.
2. Run the existing Cost-module prerequisite gate.
3. Build a URL from the host-provided `IContext.app.appUrl` when available, falling back to
   the current browser URL for local development, preserving host/environment parameters.
4. Put `projectId` and `costScreen=/costs/capex` in the outer query for hosted launch;
   also set the hash to `/costs/capex?projectId=<encoded-guid>` for direct/local routing.
   The player passes its query through `getContext()`; relying only on its outer hash is
   insufficient when the Code App runs inside a frame.
5. Open it synchronously with `_blank` and `noopener,noreferrer` so popup blockers do not reject it.

It must not depend on the current tab's in-memory selected-project store. The Cost tab boots independently, validates `projectId`, fetches the full project record, sets the page title, then loads Cost data.

If the ID is missing, malformed, unauthorized, or not found, show a Canvas-styled blocking error with a “Back to Projects” action. Never use the historical hard-coded fallback project GUID found in the Canvas app.

All Cost rail links must preserve `projectId`. Refreshing or directly pasting a Cost deep link must return to the same project and screen.

## 5. Source-to-target implementation map

| Area | Primary starting point | Material to port/reference |
| --- | --- | --- |
| Deployable app/config | `ProjectCosts-CodeApp/app` | Keep `.power`, SDK setup, generated models/services, and environment handling |
| Project Overview | `ProjectCosts-CodeApp/app/src/features/project-overview` | Canvas Project Main YAML and skeleton tests/rules for parity checks |
| App routing/session | Partial app shell | Skeleton combined-route design; add new-tab bootstrap by `projectId` |
| Cost shell/rail | Partial shared components | Skeleton cost navigation and Canvas Cost screenshots/YAML |
| DEVEX/CAPEX | Skeleton screen/rules/hooks | Real `DevexCapexSummaryPCF` parser, renderer, action dropdown, CSS, and Canvas callbacks |
| OPEX | Skeleton screen/rules/hooks | Canvas Opex YAML |
| Land Lease | Skeleton screen/rules/hooks | Canvas Land Lease YAML |
| Contracts | Partial app implementation | Compare to skeleton rules/tests and Canvas Contracts YAML |
| Add Cost from Table | Skeleton workflow | `vsbcloud-pcf-spreadsheet` React component and Canvas Add Costs YAML |
| Data | Partial generated SDK layer | Demo repository adapter first; generated Dataverse services only after verification |

## 6. PCF reuse strategy

### DEVEX/CAPEX summary

The `DevexCapexSummaryPCF` repository contains approximately 5,000 lines of relevant implementation, including a 1,724-line renderer and 1,416-line stylesheet. Recreating it from screenshots would be slower and less accurate.

For the demo:

- Reuse `DatasetParser`, grid models, `GridRenderer`, `ActionDropdown`, and the original CSS.
- Add a small React host/adapter that maps Code App domain records into the PCF's flat row packet.
- Translate PCF outputs into typed React callbacks: add, add-standard, edit, delete, comment, and paid/unpaid.
- Preserve account → subaccount → contract hierarchy, cluster pills, sticky header/footer, minimum column widths, horizontal scrolling, paid-cell styling, standard-contract blue styling, comment indicators, and all-years totals.
- Keep the renderer behavior stable for Monday. Refactor it into idiomatic React only after the demo.

Before production, fix or explicitly test the repository's documented issues: comma-decimal parsing, selected-year total fallback, empty-account totals, negative allocated width, fixed/global DOM IDs, sample fallback, and incomplete Canvas comment/paid handlers.

### Spreadsheet

The `vsbcloud-pcf-spreadsheet` repository is already React-based and is the fastest route to matching Add Cost from Table.

For the demo:

- Port the spreadsheet grid and CSS behind typed props.
- Adapt its old React 16/Fluent UI 8 assumptions to the app's React/Fluent stack.
- Map Save, Copy, Add Row, and Delete Row outputs into the Cost feature state.
- Preserve Canvas validation and layout behavior.
- Use the same demo repository transaction as the DEVEX/CAPEX grid so saved rows immediately appear when returning to CAPEX.

## 7. Data strategy and honesty boundary

### Monday default

Use a deterministic demo repository for Cost data, seeded with one project that exercises all important states:

- Multiple account/subaccount levels.
- Planned and paid values across more than one year.
- DevCo and SPV rows.
- Standard and ordinary contracts.
- Comment indicators.
- Empty account visibility.
- Contracts and Land Lease records.
- Spreadsheet-valid and validation-error examples.

Mutations should persist for the browser session so add/edit/delete/save can be demonstrated and then reset before rehearsal. Project Overview may use Dataverse if it is already stable, but the selected demo project must be mapped to a known seeded Cost dataset. The presenter must know whether the shown values are seeded or live.

### Live-data promotion gate

Do not switch a feature from the demo repository to Dataverse merely because it compiles. Enable live data only when all of these pass:

- Correct entity logical name, entity-set name, primary key, lookup binding, and option-set mapping.
- Read and write privileges verified with the demo user's identity.
- Create, update, delete, refresh, and error behavior tested in the demo environment.
- Required flows/custom APIs exist and return the expected contract.
- No write targets production data.

If this gate is not complete by the code-freeze checkpoint, keep the complete Cost demo on deterministic data. A reliable demo is preferable to an unverified mixed live/mock workflow.

## 8. Execution plan

Because the plan starts late Sunday afternoon, the full Monday scope requires parallel ownership. Recommended split:

| Workstream | Owner focus | Deliverable |
| --- | --- | --- |
| A — app integration | Routing, same-app new tab, session bootstrap, project loading, shell | Overview → new Cost tab works on refresh and direct link |
| B — CAPEX/PCF | DEVEX/CAPEX renderer adapter and interactions | Pixel-faithful hierarchy grid and scripted actions |
| C — remaining Cost | OPEX, Land Lease, Contracts, spreadsheet | Every rail destination and scripted happy path |
| D — parity/QA/deploy | Screenshot comparison, tests, browser/deployment checks | Frozen build and demo evidence |

If only one developer is available, reduce the committed demo to Project Overview + complete DEVEX/CAPEX + Contracts, while keeping the remaining rail destinations visually present but clearly marked outside the scripted path. Do not claim production-complete Cost functionality.

### Phase 0 — freeze and baseline

- Create a demo branch from the current canonical app.
- Record the existing dirty-worktree state and avoid mixing unrelated changes.
- Capture Canvas screenshots at one fixed viewport and 100% zoom.
- Freeze exact labels, ordering, colors, selected states, dialogs, and demo data.
- Agree on the one demo project and reset procedure.

Exit gate: every screen/state in the demo script has a visual reference.

### Phase 1 — single-app route foundation

- Make `#/projects` the initial route.
- Restrict overview behavior to project selection and Cost opening.
- Implement the synchronous same-app new-tab deep link.
- Bootstrap the selected project in the new tab solely from `projectId`.
- Preserve `projectId` on all Cost navigation and Add-from-Table return links.
- Add missing/invalid/unauthorized project states.

Exit gate: a new tab can be opened, refreshed, and deep-linked without relying on the source tab.

### Phase 2 — shared Cost shell parity

- Match splash, loading shell, VSB header, project title, Help/user area, version text, left rail, selected indicator, and content dimensions.
- Match expanded OPEX grouping and its child indentation.
- Implement common loading, saving, error, empty, and blocking modal states.

Exit gate: all Cost routes share one shell and switch without losing project context.

### Phase 3 — Cost features

Implement in this order:

1. DEVEX/CAPEX shell, tabs, filters, toggles, year navigation, and PCF grid adapter.
2. Add/edit/delete/comment/paid-unpaid actions used by the scripted demo.
3. Contracts using the partial app's existing implementation; repair recalculation so it receives Cost records rather than an empty collection.
4. OPEX O&M and Other OPEX using the shared hierarchy/grid primitives.
5. Land Lease using its Canvas-specific rules and form layout.
6. Add Cost from Table using the spreadsheet repository.

Exit gate: every scripted mutation is visible immediately after save and survives route changes in the same Cost tab.

### Phase 4 — UI parity pass

For each reference state, compare side by side and fix in this order:

1. Overall dimensions and regions.
2. Typography, labels, and capitalization.
3. Spacing and alignment.
4. Colors, borders, icons, selected/disabled states.
5. Scrolling, sticky areas, overlays, and interaction timing.

Use one CSS ownership layer for each visual region. Avoid scattered one-off inline values when porting the PCF styles.

Exit gate: no unexplained visible difference in the scripted viewport; any unavoidable host/browser difference is documented.

### Phase 5 — verification, freeze, and deployment

- Run typecheck, lint, unit tests, and a production build.
- Repair the known stale Project Overview pagination test rather than weakening the skip-token implementation.
- Add tests for URL construction, popup invocation, direct-load project bootstrap, missing ID, project-not-found, route preservation, and Cost repository reset.
- Smoke-test Chrome and Edge at the demo display resolution.
- Deploy to the demo environment.
- Test the actual shared URL as the actual demo user.
- Rehearse twice from a clean/reset state.
- Freeze the build; after freeze, accept only demo-blocking fixes.

Exit gate: the exact demo script passes twice on the deployed application.

## 9. Acceptance criteria

The Monday build is accepted only if:

- One Code App deployment and one app ID are used.
- Opening Cost creates a second browser tab; the Project Overview remains open in the first.
- The second tab URL contains the selected `projectId` and belongs to the same app.
- Refreshing the Cost tab preserves both project and Cost route.
- The selected project name appears correctly in the Cost header.
- No hard-coded fallback project is used.
- Only the Cost action navigates from Project Overview for this demo.
- All promised Cost rail items render without placeholders, crashes, or dead controls.
- The scripted Cost operations produce visible, internally consistent results.
- Loading, saving, empty, validation, and error states do not expose raw exceptions.
- Canvas visual references match at the frozen viewport.
- Typecheck, lint, unit tests, production build, deployed smoke test, and two rehearsals pass.
- The presenter knows exactly which data is live and which is seeded.

## 10. Go/no-go and fallback order

Do not discover the fallback during the demo. Freeze one before deployment.

If time is lost, reduce scope in this order:

1. Keep overview → new-tab navigation, CAPEX, and Contracts fully working.
2. Keep OPEX and Land Lease read-only but populated and visually exact.
3. Keep Add Cost from Table as a scripted session-only save.
4. Remove non-scripted context-menu actions.
5. Never sacrifice the new-tab contract, selected-project correctness, loading/error handling, or deployed smoke test.

The fallback must not contain blank “Coming soon” pages on any route visible during the script.

## 11. Monday demo script

1. Open the single Code App at Project Overview.
2. Filter the project list and select the agreed project.
3. Show that non-Cost Project commands are unavailable for this scope.
4. Select View/Edit Costs.
5. Confirm Cost opens in a new tab while Project Overview remains in the original tab.
6. Confirm the new tab shows the selected project name.
7. On DEVEX/CAPEX, change year and filters, expand hierarchy, and show totals.
8. Demonstrate one Cost action and its saving state.
9. Open Contracts and demonstrate selection plus one supported action.
10. Visit OPEX, Land Lease, and Other OPEX to prove the shared Cost navigation.
11. Open Add Cost from Table, edit one row, save, and return to CAPEX.
12. Refresh the Cost tab and confirm route/project recovery.

## 12. Immediately after the demo

- Generate and verify the remaining Cost Dataverse models/services.
- Replace the demo repository feature by feature behind the same interfaces.
- Implement missing flows and custom APIs with idempotency and error contracts.
- Complete all PCF action paths, especially comments and paid/unpaid.
- Resolve PCF parser, totals, sizing, and multi-instance defects.
- Validate security using Dataverse privileges, not UI-only checks.
- Add integration and end-to-end coverage against a non-production environment.
- Then bring the remaining Project Management routes into the same app and enable their overview commands.
