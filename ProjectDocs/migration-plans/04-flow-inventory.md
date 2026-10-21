# Flow inventory plan

Inventory date: 2026-09-16. This file is planning documentation only. It records how the Canvas flow calls must be treated when rebuilding VSBCloud as a React/TypeScript Power Apps Code App.

## Verified 2026-10-19 against the extract on disk (supersedes the sections below where they disagree)

Source: `ProjectDocs/_extracted/VSBCloud/Workflows/*.json` (solution 1.21.709) and the
`SdkMessageProcessingStep` entries in `ProjectDocs/_extracted/VSBCloud/customizations.xml`.
The extract holds **15** flow files, not 17. `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers`
and `PerformRequestofCheckListApprovalCancellation` are **not** in it.

### Why this matters for the code app

A flow with a Dataverse trigger, and every plugin step, runs on the server for **any** write,
including the code app's. Such a flow never appears in canvas YAML. Three rules follow:
- The code app writes only the source rows, exactly as the canvas does (same columns, same
  number and order of writes, same Owning Business Unit).
- The code app must not do the flow's or plugin's work itself.
- A screen plan is incomplete until its writes are checked against the two tables below.

### Server-triggered flows (fire on Dataverse writes)

| Flow | Table · event · columns · scope | What it does | Screens whose writes fire it |
|---|---|---|---|
| `SynchroniseProjectTaskList-Add_Update` | `vsb_projectdefaultchecklists` · Added or Modified · all columns · **Business Unit** scope | **Create:** copies name, order, holding description, gate relevance, completion date and cluster into `vsb_projectchecklists` for every project tracking that cluster that is not yet approved or requested, for the same country and technology. It does **not** copy status. **Update:** copies the same fields **plus `statecode`** to those project rows. When `vsb_todelete = true`, it deletes the project rows and then hard-deletes the default row. | Admin Default Checklists (001). The canvas's create-then-update is what gets status to the projects; soft delete is what removes project copies. |
| `SynchroniseProjectState` | `vsb_projectstatetracking` · Added or Modified · `vsb_approvalclusterstate` · Organization | Updates `vsb_projects` | PM Checklist, gate-approval flows |
| `CreatingTeamsandSPOSite-ProjectCreation` | `vsb_project` · Added · Organization | Creates the Teams/SharePoint site and updates the project | PM General Data (New Project) |
| `UpdateTeamsandSPOSite` | `vsb_project` · Modified · `vsb_clusterstate` · Organization | Teams/SharePoint update on a cluster change | PM General Data, PM Checklist |
| `LoadDevexCapexCostTotalCapacityTrigger` | `vsb_project` · Modified · plant WTG/PV/storage/hydrogen/substation capacity · Organization | Creates a `vsb_fabricsyncjobs` row (Fabric recalculation) | PM Generators, and any screen writing plant capacity |

### Request-triggered flows (run only when called)

| Flow | Live canvas caller (commented-out calls excluded) |
|---|---|
| `PerformCommonRequestofCheckListApproval` | Project General CheckList Screen |
| `PerformCommonRequestofGateApproval` | Project General CheckList Screen (calls a child flow) |
| `PerformRequestofGateApprovalCancellation` | Project General CheckList Screen, Project General Data Screen |
| `PerformRequestofCheckListApprovalCancellation` | Project General CheckList Screen. **Not in the export. Locate it in the tenant.** |
| `RequestModulePermission`, `Requestpermissioncancellation` | Project Generators Screen |
| `ComposeChecklistItems`, `RequestApproverApprovals`, `RequestPortfolioManagersApproval`, `ManualTrigger-UpdateTeamsandSPOSite` | No live canvas call found. Presumably called by other flows or manually. |
| `ReportDevOpsBug` | Commented out in both apps |
| `SynchronizeStandardAssumptionCosts`, `ForCountriestriggerFabricrecalculationsforProjects`, `ForaProjecttriggerFabricDEVEX/CAPEXrecalculation`, `SynchroniseRecalculationCapexStandardCost` | **Commented out** in every canvas caller (Admin Cost, Admin Contract, Admin Milestones, PM Milestones, PM Production). The Apply buttons that would call the first one are hard-disabled. These are therefore **not** blockers for plans 003, 005, 006 and 010. |

`ProjectCosts-CodeApp/power.config.json` has no connection references yet, so the code app cannot
call any flow until one is set up. This first matters for PM Checklist, General Data and Generators.

### Plugin steps (14 steps in the solution)

The step names point to several plugin namespaces. The unpacked copy in `ProjectDocs/_extracted/` holds
only an empty `VsbPluginsBoPDevCoCosts` folder. The solution zip itself
(`…WorkDev1/Existing Solution/VSBCloud (3).zip`, `PluginAssemblies/`) contains all 11 DLLs; their
strings can be read to see what each step does (done for the two BoP steps on 19 Oct 2026).

| Table · message · filtering columns | Plugin |
|---|---|
| `vsb_project` · Update · `vsb_initialp50trigger` (async) | InitialP50StandardCapexContractCreate |
| `vsb_project` · Update · `vsb_capexstandardcontractscreated, vsb_capexstandardcostscreated, vsb_initialp50trigger` (async) | InitialP50StandardBOPContractsCreate |
| `vsb_project` · Update · `vsb_capexstandardcontractscreated` (async) | InitialCapexCostsCreate |
| `vsb_project` · Update · `vsb_operationsstartdatecod` | COD shift: senior-debt repayment rebalancing; balancing-price date sync; negative-price sync (async) |
| `vsb_project` · Update · `vsb_construction` | Senior-debt financial-close date shift |
| `vsb_project` · Update · `vsb_construction, vsb_enddate, vsb_operationsstartdatecod` (async) | Decommissioning project-date sync |
| `vsb_balancingprice` · Create (`vsb_name, vsb_project`) / Update (`vsb_shiftofcoddatemonths`) | Balancing-price period date sync |
| `vsb_devexcapexstandardassumptions` · Delete (pre-validation) | Capex assumption deletion (`VSB_CapexAssumptionDeletion`): batch-deletes every `vsb_capexprojectcontract` and `vsb_capexcost` built from the standard cost (read from the DLL, 19 Oct 2026) |
| `vsb_bopcontractsstandardassumptions` · Delete (pre-validation) | BoP contract assumption deletion (`VSB.BoPContractAssumptionDeletion`): deletes the contract's template DevCo costs (`vsb_bopcontractsstandardassumptiondevcocosts`), every project's `vsb_bopcontractsdevcocosts`, and every `vsb_bopprojectscontracts` built from it (read from the DLL, 19 Oct 2026) |
| `vsb_bopcontractsstandardassumptiondevcocosts` · Create / Update `vsb_capexaccount` (pre-operation) | `DevCoCostRootCapexPlugin`: walks the CAPEX parent chain and sets `vsb_rootcapexaccount`; clears it when the account is blank (read from the DLL, 19 Oct 2026). Not a validation |

Screens that write these columns (PM Milestones, General Data, Revenues, Finance, Production,
Admin Cost, Admin Contract) trigger the plugins. Each screen's plan must confirm which columns it writes.

## Scope

The solution export contains 17 Power Automate workflow JSON files under `ProjectDocs/_extracted/VSBCloud/Workflows/`. The Project Management Canvas app also references four flow names that are not present in the extracted workflow folder; those are treated as migration gaps and called out below. The Project Costs Canvas app has no active `.Run(...)` calls; its `ReportDevOpsBug.Run(...)` usage is commented out.

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

- `rg "\.Run\(" ProjectDocs/_extracted/msapp` finds every Canvas call site and each one is mapped above.
- `ProjectDocs/_extracted/VSBCloud/Workflows/*.json` count remains 17 unless the solution export changes.
- For each kept callable flow, add one unit test around payload shaping and one integration/mock test around error rendering on the owning screen.
- For each missing flow, record the final tenant artifact id or the approved replacement decision before marking the owning screen complete.
