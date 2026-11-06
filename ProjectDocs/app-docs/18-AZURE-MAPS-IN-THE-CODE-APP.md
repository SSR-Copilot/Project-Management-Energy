# Azure Maps on the Project General Data screen (D25 map, 6 Nov 2026)

Branch `feature/azure-maps-integration`. Approved by the user on 6 Nov 2026 (parts A and B below). The design was proven
first in the Xebia test tenant (`test/AzureMapsTestApp`, `SAS_TOKEN_FLOW.md`, 2 Nov 2026), and is repeated here with no
fixed value in the app or the flow.

```
General Data ──getToken──> platform/azureMapsToken.ts ──Run()──> flow "Get Azure Maps SAS Token" (solution VSBCloud)
   (ProjectMap,            cache: memory + localStorage,          │ connection reference vsb_AzureMapsSasArm
    lazy-loaded)           refresh 10 min before expiry           │ = the service account's ARM connection
                                                                  ▼
                                                 ARM listSas on the Maps account named by vsb_AzureMaps* variables,
                                                 signed by the managed identity (Azure Maps Data Reader)
```

App users need no Azure rights and no secret is stored anywhere: the token lives at most `vsb_AzureMapsSasTokenHours`
(default 12, maximum 24), is read-only and is rate-limited by `vsb_AzureMapsSasMaxRatePerSecond`.

## 1. Azure (VSB tenant `e3bab30b-…`, subscription `sub-vsbcloud`) — checked 6 Nov 2026

| Item | Value / state |
|---|---|
| Maps account | `map-vsbcloud-codeapps` (Gen2, westeurope), resource group `rg-vsbcloud-westeurope` |
| Managed identity | `uami-vsbcloud-codeapps-maps`, principal `88255499-da25-46f2-8fc7-4c119d51a040`: attached to the account, **Azure Maps Data Reader** on it |
| `listSas` check (as ext-rohit.somase, RG Contributor) | OK: token returned; a road tile is 200 with it and 401 without |
| Service account `flow.serviceuser.vsbcloud@vsb.energy` | **Azure Maps Contributor on the Maps account: requested, not yet assigned (6 Nov 2026).** Until then a flow run fails with 403 from ARM and the map shows the error; once it is assigned, the map works for every user with no change to the app or the flow |

Note (client requirements R3, `test/AzureMapsTestApp/CLIENT_REQUIREMENTS_MAP.md`): a custom role with only
`Microsoft.Maps/accounts/listSas/action` is narrower than Azure Maps Contributor (which can also read the account keys).
VSB chose Azure Maps Contributor; either works.

## 2. Power Platform (VSBCloud_Dev, solution `VSBCloud`) — part A

All created by `ProjectCosts-CodeApp/scripts/setup-azure-maps-sas-flow.mjs`, signed in (az) as the service account so it
owns the flow and the connection. Re-runnable.

| Component | Name | Notes |
|---|---|---|
| Environment variable (Text) | `vsb_AzureMapsSubscriptionId` | the Maps account's subscription |
| Environment variable (Text) | `vsb_AzureMapsResourceGroup` | its resource group |
| Environment variable (Text) | `vsb_AzureMapsAccountName` | the Maps account |
| Environment variable (Text) | `vsb_AzureMapsPrincipalId` | the managed identity's object (principal) ID |
| Environment variable (Number) | `vsb_AzureMapsSasTokenHours` | 12 (1–24) |
| Environment variable (Number) | `vsb_AzureMapsSasMaxRatePerSecond` | 50 |
| Connection reference | `vsb_AzureMapsSasArm` (Azure Resource Manager) | bound to the service account's ARM connection *Azure Maps SAS (ARM)* |
| Cloud flow (instant, Power Apps V2, no inputs) | **Get Azure Maps SAS Token** | `listSas` → responds `sastoken`, `expiresutc`; connection `embedded` (runs as the service account for every user) |

**Flow error handling (6 Nov 2026).** The first build had no answer on failure: with the role missing, `listSas` failed,
the flow never reached its response and the app got *502 BadGateway / NoResponse* after a wait. Now:

```
Get_token (Scope) ─ Expiry, Invoke_resource_operation (listSas)
  ├─ Succeeded        → Respond_token   { sastoken, expiresutc, errorcode "", errormessage "" }
  └─ Failed/TimedOut  → Failed_steps (Filter array over result('Get_token'), status not Succeeded/Skipped)
                        → Respond_error { sastoken "", expiresutc "", errorcode, errormessage }
                        → Terminate_failed (run status Failed, same code and message: visible in run history)
```

`errorcode` is the ARM error code (`AuthorizationFailed`, `ResourceNotFound`, …), else the run error (`InvalidTemplate`
when a variable value cannot be used, `ActionTimedOut`), else the status code. The app turns it into one sentence:

| Kind (`platform/azureMapsToken.ts`) | From | The map area says |
|---|---|---|
| `notAuthorized` | `AuthorizationFailed`, 401/403 | The map is not available yet: access to Azure Maps has not been granted. Please contact your administrator. |
| `notConfigured` | `*NotFound`, `InvalidTemplate`, 400/404 | The map is not set up for this environment. Please contact your administrator. |
| `unavailable` | 502/503/504, `NoResponse`, a timeout, the network | The map service did not respond. Please reload the page or try again later. |
| `accessDenied` | Azure Maps refused the token (tile 401/403) | The map could not be loaded because access was denied. Please reload the page. |
| `unknown` | anything else | The map could not be loaded. Please try again later. |
| (error boundary) | the map cannot render at all | The map cannot be displayed. Please reload the page. |

The technical detail goes to the console only: `[VSB] ERROR Azure Maps token — <kind> — <code>: <message>`. After a
failure the app waits 60 s before it calls the flow again, so panning a broken map does not start a flow run per tile.

**State in VSBCloud_Dev (6 Nov 2026, all as `flow.serviceuser.vsbcloud@vsb.energy`):** the six variables (definitions in
VSBCloud, current values outside it), `vsb_AzureMapsSasArm` bound to the connection *Azure Maps SAS (ARM)*
(`7be5770f259a4bec8e9c9010b97c1831`, Connected), the flow On — workflow id `2c2b6c50-a1d9-f111-a05d-6045bd98c286`,
`pa app list-flows` id `5ebce9d1-d9c9-f20c-7b1e-b2360e252b77`, added to the code app with `pa app add flow`.
`listSas` as the service account returns 403 *AuthorizationFailed* until the role is assigned (checked 6 Nov 2026).
The Power Apps trigger cannot be started from the CLI (`MisMatchingOAuthClaims`): the first real run is the app's.

The variables have **no default value**: each environment holds its own current value, so the solution carries no
Azure value. (The first run of the script put the six values in the solution; they were removed with
`RemoveSolutionComponent` and the script no longer adds them.) For Test / Prod, set the six values and bind `vsb_AzureMapsSasArm` at import (or re-run the script there).

```powershell
# from ProjectCosts-CodeApp/, az signed in as flow.serviceuser.vsbcloud@vsb.energy
node scripts/setup-azure-maps-sas-flow.mjs --org https://vsbclouddev.crm4.dynamics.com --solution VSBCloud `
  --subscription <id> --resource-group <rg> --maps-account <name> --principal-id <object id> `
  --connection-id <shared_arm connection name>
pa app add flow --flow-id <FLOW_ID printed above>
npm run check:power
```

The ARM connection itself needs an interactive sign-in: make.powerautomate.com, environment VSBCloud_Dev, signed in as
the service account → Connections → New connection → *Azure Resource Manager* → sign in as the service account.

## 3. Code app — part B

| File | What |
|---|---|
| `src/data/flows.ts` | `getAzureMapsSasToken()` — the one place that calls the generated service (CONVENTIONS rule 17), `[VSB] DATA execute flow …` line with the time, never the token |
| `src/platform/azureMapsToken.ts` | the token cache: one flow call per lifetime per browser, parallel requests share it, background refresh, drop on 401/403, no loop on a short-lived token |
| `src/features/pm/general-data/ProjectMap.tsx` | the map (`azure-maps-control` 3.7.x), loaded with `React.lazy`: only General Data fetches the SDK |
| `src/features/pm/general-data/useDeviceLocation.ts` | the canvas `Location` (browser geolocation; null when refused) |
| `src/features/pm/general-data/rules.ts` | `shouldConfirmMapLocation`, `applyMapLocation` (canvas `OnMapClick` / the confirmation's `OnConfirm`) |
| `src/features/pm/general-data/Screen.tsx` | the placeholder replaced; `cmp_GeneralData_Map_PopUp_ConfirmationChangeLocation` added |

Canvas behaviour kept: one pin labelled with the saved project name at `Coalesce(changed, device, 51.2847…/13.7120…)`,
the device's location as a dot, zoom 12, the player's language; a click on another point opens *Project Location
Confirmation*, Confirm fills Latitude / Longitude (`Text(Round(x, 6), "#0.0#######")`) and makes the form dirty; nothing
is saved until Save. **DIVERGENCE:** the view opens on the pin (the canvas opened on the device location) and follows a
typed position that falls outside the view. Recorded in file 13.

Unaffected: every other screen (the SDK is in its own lazy chunk), the Latitude / Longitude validation and the Save plan.
If the flow fails, the map area shows `Map error: …` and the rest of the screen works as before. If the map cannot load
at all (the SDK chunk, WebGL, a CSP block), an `ErrorBoundary` around it shows `Map unavailable: …` in the map area only.

Tests: UT-AZMAP-001…007 (token cache), UT-GDATA-087/088 (rules), UT-GDATA-910 (screen: pin, Cancel, Confirm),
UT-GDATA-911 (a map that throws leaves the form working).

## 4. Content security policy

VSBCloud_Dev does not enforce a CSP today (`iscontentsecuritypolicyenabled = false`, 6 Nov 2026), so nothing blocks the
map. If VSB enforces one (client requirement R7), the app's policy needs: `connect-src` and `img-src`
`https://atlas.microsoft.com https://*.atlas.microsoft.com`; `img-src` and `worker-src` `blob:`.

## 5. Checks after the role is assigned (from the test plan S1–S6)

| ID | Check | Expected |
|---|---|---|
| S1 | Open a project's General Data | map loads; one run in the flow's run history |
| S2 | Reload, open a second tab | no new flow run (cached) |
| S3 | Click the map, Confirm, Save | Latitude / Longitude saved; pin moved |
| S5 | Turn the flow off, clear site data, reload | `Map error: …` in the map area, rest of the screen works |
| S6 | A user with no Azure rights | map loads (the connection is the service account's) |
