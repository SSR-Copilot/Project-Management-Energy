# Power Automate cloud flows of the Project Management app in the code app (D81)

Written 4 Nov 2026, on the user's instruction to add the VSBCloud solution's cloud flows that the Project
Management canvas app needs to the code app, with connection references handled first. Sources: the solution
export `ProjectDocs/_extracted/VSBCloud/Workflows/*.json` and `customizations.xml` (1.21.709), the PM canvas
YAML (`ProjectDocs/_extracted/msapp/projectmanagement/Src`), the live VSBCloud_Dev environment (`pa app list-flows`,
`pac connection list`, `pac env fetch` on `connectionreference` and `workflow`, all read-only), and Microsoft's
[Add Power Automate flows to a code app](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/add-flows).

## 1. How a code app calls a flow (the mechanism, and its limits)

- Only a **solution-aware instant flow with the Power Apps (V2) trigger** can be added. Automated flows (Dataverse
  triggers) and flows with the manual "Button" trigger cannot; they do not need to be, see section 2.
- `pa app add flow --flow-id <id>` (Power Apps CLI `pa` 1.2.0, authenticated as the `pac` profile `ServiceAccount_DEV`)
  downloads the flow's OpenAPI definition and writes:
  - `src/generated/models/<Flow>Model.ts` (`ManualTriggerInput`, the trigger's `text_1`… fields, and `ResponseActionOutput`,
    the fields of "Respond to a Power App or flow");
  - `src/generated/services/<Flow>Service.ts` with one static `Run(input)` returning `IOperationResult<ResponseActionOutput>`
    through the same `getClient(dataSourcesInfo)` every Dataverse call uses;
  - `.power/schemas/logicflows/<Flow>.Schema.json` and a `"Connector"` entry in `.power/schemas/appschemas/dataSourcesInfo.ts`;
  - a `connectionReferences` entry in `power.config.json`: `id: /providers/Microsoft.PowerApps/apis/shared_logicflows`,
    `dataSources: [<flow data-source name>]` and `workflowDetails { workflowEntityId, workflowDisplayName, workflowName }`.
    No `sharedConnectionId`: the flow is started under the signed-in user, exactly as a canvas `Flow.Run(...)`.
- The person running the command must have access to the flow **and to every connection the flow uses** (Microsoft:
  "Maker access required"). End users need Dataverse rights to start flows (the App Opener role or equivalent).
- `Run` returns when the flow reaches its "Respond to a Power App or flow" action (within the platform's 120 s), or
  when the flow ends if it has none; the canvas `.Run()` behaves the same. A flow that keeps running after it responded
  (the approval flows wait for the approval afterwards) is not awaited.
- `.power/schemas` (the flow schemas included) is tracked in git since `3c234a2` (29 Oct 2026); only `.power/tmp/` is
  ignored. A checkout that lacks a flow's schema re-adds it with the same command (section 6).
- Running the command again with the same id refreshes the generated files after a flow change; `pa app remove flow`
  removes one. CONVENTIONS rule 9's footgun applies: `dataSourcesInfo.ts` is regenerated, so `npm run check:power`
  runs after every add (4 Nov 2026: 89 tables survived each of the six adds).

## 2. Inventory: the 17 flows of the solution, and what the code app does with each

Trigger and connection references from the export; ids and status from `pa app list-flows` on VSBCloud_Dev (4 Nov 2026).

### 2a. Called by the Project Management canvas app (live `.Run(...)`, commented-out calls excluded)

| Flow | DEV flow id | Trigger / parameters (title) | Returns | Canvas caller (YAML) | Code app, 4 Nov 2026 |
|---|---|---|---|---|---|
| Perform Common Request of Check List Approval | `b0b35f43-bb1c-572e-76f1-40ec3c442975` | V2: `text_1` ProjectGUID, `text_2` ProjectChecklistGUID, `text_4` DefaultApprovalGUID, `text` CurrentProjectStateGUID | `runid`, `approvalid` | CheckList screen, panel "Request Approval", checklist mode (`:5514`) | **added** |
| Perform Common Request of Gate Approval | `7235fad7-ed32-a0f5-8793-7238df8f0f14` | V2: `text_1` ProjectGUID, `text_2` StateGUID, `text_3` StateTrackingGUID, `text_4` DefaultApprovalGUID | `runid`, `approvalid` | CheckList screen, panel "Request Approval", cluster mode (`:5662`) | **added** |
| Perform Request of Gate Approval Cancellation | `d68b3a66-6ae8-ce06-68ec-d9af740cc18c` | V2: `text` AppId, `text_1` Project (13-field JSON) | nothing | CheckList "Cancel Approval Request" (`:1602`); General Data Draft reset step 1 (`:297`) | **added** |
| Perform Request of Check List Approval Cancellation | `67e2929f-a73e-a2b3-039c-569b58bda414` | V2: `text` CheckList Guid | `success` | CheckList row ✕ (`:3696`) | **added** (the flow is NOT in the 1.21.709 export; it exists in DEV) |
| Request Module Permission | `483a3074-9166-b822-9e47-a891cafbe68e` | V2: `email` RequesterEmail, `text_1` PrimarilyApprovalGroupID, `text_4` AppId, `text` Project (JSON) | `runid`, `approvalid` | Generators, out-of-country WTG save (`:15214`, `:16535`, `:16869`), inverter / substructure save with an Other Supplier (`:10259`, `:8995`); the PV call is commented out | **added 5 Nov 2026, wired (D97)** |
| Request permission cancellation | `1a8b4be8-902b-b90c-dcef-1875f75ba7f3` | V2: `email` RequesterEmail, `text_2` AppId, `text_3` Project (JSON) | nothing | Generators, the cards' Cancel request and the deletes of a type with an open request (`:2652` … `:15676`) | **added 5 Nov 2026, wired (D97)** |

`AppId` is the environment variable `vsb_ProjectManagementAppID` (`App.OnStart:631`), `PrimarilyApprovalGroupID` is
`vsb_PrimarilyApprovalGroupID` (`App.OnStart:687`); both are read through the environment-variable tables the code app
already registers.

### 2b. Server-triggered (Dataverse triggers): nothing to add, the writes must stay identical

`CreatingTeamsandSPOSite-ProjectCreation`, `UpdateTeamsandSPOSite`, `LoadDevexCapexCostTotalCapacityTrigger`,
`SynchroniseProjectState`, `SynchroniseProjectTaskList-Add_Update`, `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers`
(the last is not in the export). They fire on the code app's writes as on the canvas's (`04-flow-inventory.md`, verified
19 Oct 2026). A code app cannot call them, and must not redo their work.

### 2c. Child and manual flows (trigger "Button"): not callable from an app, called by other flows

`ComposeChecklistItems`, `RequestApproverApprovals`, `RequestPortfolioManagersApproval`, `ManualTrigger-UpdateTeamsandSPOSite`.
`pa app list-flows` does not list them, as expected.

### 2d. In DEV, with a Power Apps trigger, but not needed

| Flow | Why not |
|---|---|
| Report DevOps Bug (`84a8bb87-…`) | Its only caller, `cmp_ReportErrorRightPanel`, is commented out in both canvas apps; its Azure DevOps connection is a personal one |
| Synchronize Standard Assumption Costs (`5fb84328-…`) | Admin Cost / Admin Contract Apply buttons: calls commented out, buttons hard-disabled (D20) |
| For Countries trigger Fabric recalculations…, For a Project trigger Fabric DEVEX/CAPEX recalculation (Inactive), Synchronise Recalculation Capex Standard Cost | Commented out in every canvas caller (Admin Milestones, PM Milestones, PM Production) |
| Perform Request of Gate Approval, Request Controlling Approval By App…, Request Controlling Approval Cancel…, VSB_Bulk_Patch_PCF_Cost | No canvas call |

## 3. Connection references: the critical part

### 3a. Two kinds of connection in a flow

A flow's actions run through its **connection references** (solution components). Each reference can be configured in
the flow's *Run only users* settings in one of two ways, and the flow definition records it as `runtimeSource`:

- `embedded`: the action uses the solution connection reference, bound in each environment to one connection (here the
  service account's). Every user who starts the flow gets the same behaviour; nothing is asked of the user. This is
  the ALM-friendly form and what the solution's connection references exist for.
- `invoker` ("Provided by run-only user"): the action uses a connection of whoever starts the flow. The canvas app
  prompts each user to consent to such a connection the first time. A code app cannot provide one, and `pa app add flow`
  refuses the flow because the connection recorded in the definition belongs to another maker.

### 3b. How the six flows are configured in VSBCloud_Dev (read from `workflow.clientdata`, 4 Nov 2026)

| Flow | Dataverse | Approvals | Mail (`shared_sendmail`) | Outlook | Teams | O365 Users | O365 Groups |
|---|---|---|---|---|---|---|---|
| Perform Common Request of Check List Approval | embedded | embedded | embedded | embedded | embedded | embedded | – |
| Perform Common Request of Gate Approval | embedded | embedded | embedded | embedded | embedded | embedded | – |
| Perform Request of Gate Approval Cancellation | embedded | – | embedded | – | – | – | – |
| Perform Request of Check List Approval Cancellation | (added cleanly; definition not in the export) | | | | | | |
| **Request Module Permission** | embedded | **invoker** | **invoker** | – | – | – | **invoker** |
| **Request permission cancellation** | embedded | – | **invoker** | – | – | – | – |

The error from `pa app add flow` for the last two was exactly this: *Unable to retrieve connection
'/providers/Microsoft.PowerApps/apis/shared_sendmail'. You may not have access to the underlying connections.*

**Required change (flow owner, in Power Automate, DEV solution VSBCloud):** open each of the two flows → *Edit* → *Run only
users* → under *Connections Used* set Approvals, Mail and Office 365 Groups (Request Module Permission) and Mail (Request
permission cancellation) from "Provided by run-only user" to **"Use this connection (connection reference)"**, i.e. the
solution references `vsb_sharedapprovals_f346e`, `vsb_sharedsendmail_ccf66`, `vsb_sharedoffice365groups_94f4e`, then save.
This makes them like the other four flows. After that: `pa app add flow --flow-id 483a3074-9166-b822-9e47-a891cafbe68e`
and `… 1a8b4be8-902b-b90c-dcef-1875f75ba7f3`, then `npm run check:power`. Side effect to be aware of: the mails and
approvals of those two flows will then be sent through the service account's connections instead of the requesting
user's (the other four flows already work that way).

### 3c. The solution's 12 connection references and their DEV bindings (read-only check, 4 Nov 2026)

| Logical name | Connector | Bound to (connection id) | Connection status (`pac connection list`) |
|---|---|---|---|
| `new_sharedcommondataserviceforapps_60ba1` | Dataverse ("VSBCloud - Microsoft Dataverse Primary") | `5e2fdb7f666e4634a69f24092af76bda` | Connected |
| `vsb_sharedcommondataserviceforapps_60bf9` | Dataverse | `67f2fe9d331a4230b401934fd543b8aa` | Connected |
| `vsb_sharedapprovals_f346e` | Approvals | `c25c0d010fd7450cb6f69f362e20642d` | Connected |
| `vsb_sharedsendmail_ccf66` | Mail | `92bd2f9fd2194474bcfb463586df6e82` | Connected (a second Mail connection, `63cd4274…`, is in Error and is not referenced) |
| `vsb_sharedoffice365_4d338` | Office 365 Outlook | `3d1403677ea74baab2995f744e982bf9` | Connected |
| `vsb_sharedteams_92bc9` | Teams | `853dd6e0dd974c8ebcc46910e37de86f` | Connected |
| `vsb_sharedoffice365users_7ec1c` | Office 365 Users | `2a5a6de4f9e8416a85fea4cdc3fedac6` | Connected |
| `vsb_sharedoffice365groups_94f4e` | Office 365 Groups | `d3cf737ae240483682cead4db3d1cca2` | Connected |
| `vsb_sharedvisualstudioteamservices_be30c` | Azure DevOps | `bfbca16214a2426296c0d46bef14f37e` (a personal connection) | Connected |
| `vsb_HttpWithEntrapPreauthorized` | HTTP with Entra (preauthorized) | `18586bf368044b3486485e84e79d1443` | Connected |
| `new_sharedflowmanagement_25673` | Power Automate Management | `shared-flowmanagemen-9aa0221b-…` | **Error** (used by no flow the code app calls) |
| `vsb_VSBCloudFabricSQL` | SQL Server (Fabric) | `9b9170f3ee4640d0af705334d497fb0e` | Connected (the code app's own SQL source, D54) |

All are Active and all but one are bound to healthy connections owned by `flow.serviceuser.vsbcloud@vsb.energy`, the
account the code app's `pac` profile uses. Nothing in the code app binds them: they are solution components, bound per
environment. For TEST / PROD the same table must hold there (bind each reference when the solution is imported).

### 3d. The code app's own entries

`power.config.json` now has one `shared_logicflows` entry per added flow (`workflowDetails.workflowName` is the flow id).
Unlike the SQL entry it carries no `sharedConnectionId` and no `xrmConnectionReferenceLogicalName`: the app does not own
a connection to the flow, the user does. `check:power` reports 93 registered (89 tables, the 3 bulk actions, 4 flows;
95 once the two Generators flows are added). `scripts/check-power-sources.mjs` accepts the `"Connector"` entries as it
does tables; on a fresh checkout the flows are re-added with the commands in section 6.

## 4. Calling convention in the code app (CONVENTIONS rules 3, 5, 17, 23)

- One module, `src/data/flows.ts`, wraps the generated services behind typed functions named after the canvas calls
  (`requestChecklistApproval`, `requestGateApproval`, `cancelGateApproval`, `cancelChecklistApproval`,
  `requestModulePermission`, `cancelModulePermission`). Each maps the named arguments to the trigger's positional
  `text_*` fields in one place, runs through `loggedCall("HTTP", "flow <name>", …)` so the console shows a
  `[VSB] HTTP flow …` line with the time and whether a run id came back (never the payload), and returns the typed response.
  A `success: false` result is raised as an error with the SDK's message (`unwrap`), never swallowed.
- Payload shaping stays in each screen's `rules.ts` (already there: `checklistApprovalArgs`, `gateApprovalArgs`,
  `flowWriteBackPatch`, the generators' `build*PermissionPayload`, `buildCancellationPayload`, `pendingPermissionFields`,
  `needsPermissionCancellation`). The 13-field gate-cancellation JSON and the General Data 15-field variant are built by
  pure functions with tests, from the canvas `With({...})` records verbatim.
- Order of operations is the canvas's, step by step (pre-flow patch → flow → write-back gated on `runid` → note), and a
  failed flow leaves a visible, retryable error. Where the canvas writes before the flow and the flow fails, the same
  half-applied state results; it is reported, not hidden (`04-flow-inventory.md` suggested custom APIs for the
  cancellations; the user chose the flows, 4 Nov 2026).
- Screens call the wrappers only through their hooks (`useChecklistWrites`, `useGeneratorWrites`, the General Data save);
  no component imports a generated service.
- The two `EXCLUDED.*` disabled states of D27 / D29 are removed where the flow is now callable; the controls get their
  canvas captions and gates back. Where a flow is still blocked (section 3b) the control stays disabled with a reason
  that says so.

## 5. Per-screen wiring (what the canvas does, in order)

- **Project General CheckList** — Request Approval, cluster mode: pre-flow tracking patch (comment, due date, persona
  snapshot, mode, In Progress) → `PerformCommonRequestofGateApproval` → if `runid`: local state only (the flow updates the
  tracking row itself) → note "Approval requested - {project}, {state}". Checklist mode: pre-flow checklist patch →
  `PerformCommonRequestofCheckListApproval` → if `runid`: patch Flow Run Id / Flow Approval Id → note "Approval requested"
  or "Completed and notified about Check List". Cancel Approval Request: tracking patch (In Progress, step blank,
  FlowRunId blank) → `PerformRequestofGateApprovalCancellation(AppId, 13-field JSON)` → note "Request canceled - {project},
  {user}". Row ✕: `PerformRequestofCheckListApprovalCancellation(checklistId).success` → refresh.
- **Project General Data** — on a Save that changes the start cluster while the Draft tracking's approval is In Progress
  with a FlowRunId: `IfError(PerformRequestofGateApprovalCancellation(AppId, 15-field JSON), false)` before the project is
  forced back to Draft (D25's refusal of that case is lifted by this work).
- **Project Generators** (D97, 5 Nov 2026): the out-of-country WTG save and replace, and the inverter / substructure save
  with an Other Supplier (Y:10243 / 8979 — missed by the first inventory) → the row writes without the roll-up →
  `RequestModulePermission(User().Email, PrimarilyApprovalGroupID, AppId, JSON(varProject))`; the PV call stays commented
  out as in the canvas. Card "Cancel" and the deletes / replaces of a type with an open request →
  `Requestpermissioncancellation(User().Email, AppId, JSON(varModule))`, before any delete write. The flows write the row's
  request state, run id and approval id themselves; the code app does not (D97).

### Status (4 Nov 2026, evening; Generators row 5 Nov 2026)

| Screen | Flow | Code | Tests |
|---|---|---|---|
| Check List | Request Approval, cluster mode (`PerformCommonRequestofGateApproval`) | `hooks.ts` requestApproval: `planGateApprovalRequestPatch` → flow → `planGateApprovalRequestNote` | UT-CHKLST-079 |
| Check List | Request Approval, checklist mode (`PerformCommonRequestofCheckListApproval`) | `planChecklistApprovalRequestPatch` → flow → `planChecklistApprovalRequestFollowUp` | UT-CHKLST-080, 904 |
| Check List | Cancel Approval Request (`PerformRequestofGateApprovalCancellation`) | `planGateCancelPatch` → flow with `gateCancellationPayload` → `planGateCancelNote` | UT-CHKLST-077, 078, 907 |
| Check List | the row ✕ (`PerformRequestofCheckListApprovalCancellation`) | `cancelChecklistApproval`: flow → refresh; a `success: false` is reported (rule 3) | UT-CHKLST-913 |
| General Data | the Draft-reset cancellation (`PerformRequestofGateApprovalCancellation`) | `planGeneralDataSaveHead` → `cancelDraftGateApprovalIfRunning` (`draftGateCancellationPayload`, `IfError` → logged) → `planGeneralDataSaveTail` | UT-GDATA-045, 083, 903 |
| Generators | `RequestModulePermission` (WTG out of country, inverter / substructure with an Other Supplier) | `planCreateGeneratorType` / `planSaveInverter` / `planSaveSubstructure` without the roll-up → `useModulePermissionFlows().request` in the job's `then` | UT-GEN-118, 133, 150, 904 |
| Generators | `Requestpermissioncancellation` (cards' Cancel; deletes and replaces with an open request) | Cancel: empty plan → flow → refresh; delete / replace: `cancelIfOpen` → the existing plan | UT-GEN-149, 909, 912, 914, 915 |

The shared pieces: `data/flows.ts` (UT-FLOWS-001…008) and `PlanJob.then` in `data/usePlanWrite.ts` (UT-PLANWRITE-006…008).
Deployed to DEV on 4 Nov 2026 (D83, build `b517659`): the four flows are callable from the deployed app, and the first
open may ask each user to consent to the Power Automate connection. Not yet run live: the first live run is the test
plan of §7.

## 6. Fresh checkout / DEV push additions

After the tables and the three bulk actions (CONVENTIONS "Before pushing to DEV", step 2):
```
pa app add flow --flow-id b0b35f43-bb1c-572e-76f1-40ec3c442975   # Perform Common Request of Check List Approval
pa app add flow --flow-id 7235fad7-ed32-a0f5-8793-7238df8f0f14   # Perform Common Request of Gate Approval
pa app add flow --flow-id d68b3a66-6ae8-ce06-68ec-d9af740cc18c   # Perform Request of Gate Approval Cancellation
pa app add flow --flow-id 67e2929f-a73e-a2b3-039c-569b58bda414   # Perform Request of Check List Approval Cancellation
pa app add flow --flow-id 483a3074-9166-b822-9e47-a891cafbe68e   # Request Module Permission (after section 3b)
pa app add flow --flow-id 1a8b4be8-902b-b90c-dcef-1875f75ba7f3   # Request permission cancellation (after section 3b)
pa app add flow --flow-id 5ebce9d1-d9c9-f20c-7b1e-b2360e252b77   # Get Azure Maps SAS Token (General Data map, 18-AZURE-MAPS-IN-THE-CODE-APP.md)
npm run check:power
```

## 7. Risks and open points

- **Real notifications.** Every one of these flows sends mails, Teams cards or approvals to real people (portfolio
  managers, the approval group from `vsb_PrimarilyApprovalGroupID`). A live test on DEV must use a test project and
  approvers who expect it; agree the test plan before the first run.
- **Half-applied state.** The canvas writes before and after the flow with no transaction; the code app keeps that order
  and surfaces the failure. The custom-API alternative from `04-flow-inventory.md` is not built.
- **Flow changes.** A trigger or response change in DEV needs `pa app add flow` again (the generated types would be stale).
- **Environments.** The flow ids are solution components, so they travel with the solution; the connection-reference
  bindings and the `invoker` → `embedded` setting are per environment and must be checked on import.
- **Permissions.** End users need Dataverse rights to start the flows (App Opener or equivalent); the flows' actions
  then run as the service account through the embedded references.
