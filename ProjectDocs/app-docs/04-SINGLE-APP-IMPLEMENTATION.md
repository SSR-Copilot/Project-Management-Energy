# Single-app implementation progress

Started: 14 September 2026. Canonical app: `ProjectCosts-CodeApp/app`.

## First change set: overview and Cost navigation

- The root route resolves to `/projects` unless an explicit project launch is supplied.
- Overview commands retain their existing Canvas labels, order, and visibility gates.
  Only Edit/View Costs is enabled; selecting a Draft project still shows prerequisites.
- Costs opens synchronously in a separate browser tab at the same Code App's CAPEX route.
  The overview's selected row, filters, and page remain in the original tab.
- Hosted launch uses the SDK's `appUrl`, with `projectId` and `costScreen` in the outer query.
  Local/direct launch also has the matching HashRouter fragment. Stale project aliases are
  removed from the outgoing URL while host parameters such as `tenantId` are retained.
- The new tab loads its project independently. An explicit route project wins over a stale
  original host launch. Invalid or contradictory project IDs never select another project.
- Every Cost rail destination preserves `projectId`. Add Cost from Table highlights CAPEX.
- The extra Projects rail entry is hidden to match the Canvas Cost rail; the overview remains
  in the original tab. Error states include a Back to Projects action within the same app.
- All Cost routes wait for project bootstrap and prevent screen queries for missing, invalid,
  or unreadable projects. Missing records are represented by null in React Query, which does
  not accept undefined query results.
- The overview ignores stale host project parameters, so it remains reachable after a failed
  project load.
- The stale pagination assertion now checks the server continuation token, not unsupported
  Dataverse `$skip`.

## Verification

The automated suite covers local and hosted URL construction, the new-tab command, Draft
blocking, project bootstrap on fresh mount and remount, rail navigation, missing/invalid
IDs, inaccessible records, failed queries, and landing from player launch parameters.

Final verification on 14 September 2026:

- `npm test`: 271 tests passed across 10 files.
- `npm run typecheck`: passed; the final `npm run build` also passed TypeScript compilation.
- `npm run build`: passed and generated `app/dist`.
- `npm run lint`: zero errors, eight existing warnings.

The build retains the existing large Fluent UI chunk warning. Vite initially failed to
spawn its Windows path-resolution process inside the sandbox; tests and builds succeeded
with the approved command escalation.

The published Power Apps player has not been exercised in a real browser for this change
set. The host's query transport is implemented using the documented context properties:
[Microsoft: Get context data](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/retrieve-context).
The actual deployed new-tab launch and browser refresh still need an authenticated smoke
test. In particular, the host may recreate the iframe on refresh; retaining the latest inner
route must be checked in that environment.

## Next implementation work

1. Port the DEVEX/CAPEX PCF renderer and stylesheet into a React host with typed actions.
2. Connect the CAPEX screen, tabs, toolbar, hierarchy, dialogs, and Cost data adapter.
3. Bring in OPEX, Land Lease, and Add Cost from Table from the skeleton and spreadsheet PCF.
4. Complete Contracts recalculation using the shared CAPEX data.
5. Compare all screens and dialog states against current Canvas screenshots.
6. Run the deployed demo script and freeze the verified build.

This first change set does not complete the Cost screens: CAPEX, OPEX, Land Lease, and
Add Cost from Table still contain their existing placeholders. No PCF code has been ported
yet, and no deployment or data mutation was performed.

## Screenshot handoff

Prioritize Project Overview and DEVEX/CAPEX Summary, including their full headers and rail.
Then provide the other CAPEX tabs, OPEX O&M, Land Lease, Other OPEX, Contracts, and Add Cost
from Table. Include open add/edit dialogs, expanded row menus, comments, and spreadsheet
validation states. Use a consistent browser size and 100% zoom, with the browser's viewport
dimensions recorded if available. Current Canvas screenshots take precedence over older
skeleton screenshot notes when they differ.
