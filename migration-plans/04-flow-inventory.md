# Flow inventory plan

Inventory date: 2026-09-16. This file is planning documentation only. It records how the Canvas flow calls must be treated when rebuilding VSBCloud as a React/TypeScript Power Apps Code App.

## Scope

The solution export contains 17 Power Automate workflow JSON files under `ProjectCosts-CodeApp/_extracted/VSBCloud/Workflows/`. The Project Management Canvas app also references four flow names that are not present in the extracted workflow folder; those are treated as migration gaps and called out below. The Project Costs Canvas app has no active `.Run(...)` calls; its `ReportDevOpsBug.Run(...)` usage is commented out.

## Exported workflows

| Flow | Disposition | Code App contract | Main screen owners |
|---|---|---|---|
| `ComposeChecklistItems` | Keep callable | Wrap as `composeChecklistItems(projectId, gateId)` with typed result and retry/error surface. | Project General Checklist |
| `CreatingTeamsandSPOSite-ProjectCreation` | Keep callable | Trigger after project creation only after Dataverse project row is committed. | Project Main / General Data |
| `LoadDevexCapexCostTotalCapacityTrigger` | Keep callable | Trigger or poll cost-capacity recalculation after project cost edits when existing Canvas behavior requires it. | Capex Costs, Contracts, Opex, Land Lease |
| `ManualTrigger-UpdateTeamsandSPOSite` | Keep callable | Admin/support action only; expose through typed flow client, not ad hoc fetch. | Project Main / Team |
| `PerformCommonRequestofCheckListApproval` | Keep callable | Start checklist approval request and store returned status/id. | Project General Checklist |
| `PerformCommonRequestofGateApproval` | Keep callable | Start gate approval request and store returned status/id. | Project General Data / Gates |
| `PerformRequestofCheckListApprovalCancellation` | Replace with custom API | Canvas cancellation can half-apply when Dataverse write succeeds but flow fails. Implement server-side transaction/custom API. | Project General Checklist |
| `PerformRequestofGateApprovalCancellation` | Replace with custom API | Same cancellation risk; use audited custom API that validates role and current approval state. | Project General Data / Gates |
| `ReportDevOpsBug` | Optional callable | Keep hidden/support-only if re-enabled; no active production call in Cost Canvas. | None active |
| `RequestApproverApprovals` | Keep callable | Request approver approval workflow with typed payload and returned tracking id. | Admin Gates / Checklist |
| `RequestModulePermission` | Keep callable | Request permission/access workflow. Do not use as client-side authorization substitute. | Header / shared request access |
| `Requestpermissioncancellation` | Replace with custom API | Permission cancellation should be server-side to avoid partial state. | Shared access request |
| `RequestPortfolioManagersApproval` | Keep callable | Trigger portfolio manager approval after validating project state transition server-side. | Project General Data |
| `SynchroniseProjectState` | Server-triggered unchanged | Do not call from client unless later evidence proves a Canvas call. Keep environment behavior. | Project state backend |
| `SynchroniseProjectTaskList-Add_Update` | Server-triggered unchanged | Dataverse/plugin/flow side effect; client writes source tables only. | Checklist/task data |
| `UpdateTeamsandSPOSite` | Server-triggered unchanged | Treat as backend lifecycle automation. | Project creation/team updates |
| `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers` | Server-triggered unchanged | Backend notification; client must not duplicate email behavior. | Project updates |

## Referenced but missing from export

| Missing flow reference | Canvas owner | Required migration action |
|---|---|---|
| `SynchronizeStandardAssumptionCosts` | Admin Cost Screen, Admin Contract Screen | Do not silently stub. Locate flow in tenant, replace with a custom API, or explicitly remove behavior with product approval. Plans #5 and #6 are marked incomplete until this is resolved. |
| `ForCountriestriggerFabricrecalculationsforProjects` | Admin Milestones Screen | Resolve Fabric recalculation workflow before shipping milestone admin edits. Plan #3 is incomplete until resolved. |
| `SynchroniseRecalculationCapexStandardCost` | Project Production Screen, commented reference | Documented as dormant/commented. Do not port unless product owners confirm it is live elsewhere. |
| `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation` | Project General Milestones Screen | Resolve per-project Fabric recalculation before shipping project milestone edits. Plan #10 is incomplete until resolved. |

## Flow client implementation requirements

- Keep all calls behind `src/flows/flowClient.ts` or the equivalent current Code App flow wrapper.
- Each wrapper must accept typed ids/payloads and return typed success/error results.
- Screen components must call flow wrappers through hooks/services, not by constructing raw URLs.
- Client authorization checks are only UX hints. Dataverse roles, custom APIs, and flow connection-user semantics are the enforcement layer.
- Cancellation operations must be moved to server-side custom APIs or transactional Dataverse operations because Canvas currently separates UI state updates from flow outcomes.
- A flow failure must leave a visible, retryable error and must not optimistic-commit irreversible UI state unless the Dataverse write already committed and the screen explicitly represents pending sync.

## Verification checklist

- `rg "\.Run\(" ProjectCosts-CodeApp/_extracted/msapp` finds every Canvas call site and each one is mapped above.
- `ProjectCosts-CodeApp/_extracted/VSBCloud/Workflows/*.json` count remains 17 unless the solution export changes.
- For each kept callable flow, add one unit test around payload shaping and one integration/mock test around error rendering on the owning screen.
- For each missing flow, record the final tenant artifact id or the approved replacement decision before marking the owning screen complete.
