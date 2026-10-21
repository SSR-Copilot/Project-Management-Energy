/**
 * Typed wrappers over the Power Automate flows the apps call.
 *
 * DISPOSITION (from the flow register — 17 flows, 672 actions):
 *   NONE can be absorbed into app code. Every flow either waits on an approval webhook
 *   or is triggered by a Dataverse row change.
 *
 *   Keep as flow, called from the app (8 flows, 499 actions):
 *     PerformCommonRequestofCheckListApproval   126 actions  WaitForAnApproval
 *     RequestModulePermission                   122          approval + mail
 *     PerformCommonRequestofGateApproval        112          approval + project-id allocation
 *     RequestApproverApprovals                   49
 *     RequestPortfolioManagersApproval           38
 *     ComposeChecklistItems                      28
 *     ManualTrigger-UpdateTeamsandSPOSite        22          SharePoint + Teams
 *     ReportDevOpsBug                             2          Azure DevOps
 *
 *   Replace with a Dataverse custom API (3 flows, 38 actions) — short, synchronous,
 *   write-only, but they touch msdyn_flow_approvals so they cannot be client code:
 *     Requestpermissioncancellation                  17
 *     PerformRequestofGateApprovalCancellation       12   (takes only StateTrackingId;
 *                                                          the AppId argument is unused)
 *     PerformRequestofCheckListApprovalCancellation   9
 *   The app invokes the replacements by their custom-action names —
 *   vsb_CancelGateApproval, vsb_CancelCheckListApproval, vsb_CancelModulePermission —
 *   which are registered in their own right below. `invokeFlow` refuses any name the
 *   register does not carry, so a wrapper cannot quietly call an unregistered action.
 *
 *   Keep as flow, server-triggered, untouched by the rebuild (6 flows, 135 actions):
 *     WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers, SynchroniseProjectTaskList,
 *     UpdateTeamsandSPOSite, CreatingTeamsandSPOSite-ProjectCreation, SynchroniseProjectState,
 *     LoadDevexCapexCostTotalCapacityTrigger
 *
 * MISSING FROM THE EXPORT — the apps call these but no definition ships in the solution:
 *   SynchronizeStandardAssumptionCosts, ForCountriestriggerFabricrecalculationsforProjects,
 *   SynchroniseRecalculationCapexStandardCost, ForaProjecttriggerFabricDEVEX/CAPEXrecalculation
 * They are declared here so the call sites are typed; each throws a clear error in mock mode.
 */
import { dataClient } from "@/platform/dataClient";
import { dataMode } from "@/platform/powerClient";
import { trace } from "@/platform/telemetry";
import { AppError } from "@/platform/errors";

export type FlowDisposition = "keep" | "customApi" | "serverTriggered" | "missing";

export interface FlowDescriptor {
  name: string;
  disposition: FlowDisposition;
  actions: number;
  reason: string;
}

export const FLOW_REGISTER: FlowDescriptor[] = [
  { name: "PerformCommonRequestofCheckListApproval", disposition: "keep", actions: 126,
    reason: "WaitForAnApproval / PostCardAndWaitForResponse — webhook-suspended, cannot be client code." },
  { name: "RequestModulePermission", disposition: "keep", actions: 122,
    reason: "Long-running approval plus Outlook. The flow owns the post-approval recalculation." },
  { name: "PerformCommonRequestofGateApproval", disposition: "keep", actions: 112,
    reason: "Approval wait. Its Do-until over vsb_countries.vsb_lastprojectid is a lost-update race — extract that allocation into a custom API." },
  { name: "RequestApproverApprovals", disposition: "keep", actions: 49, reason: "Approval wait." },
  { name: "RequestPortfolioManagersApproval", disposition: "keep", actions: 38, reason: "Approval wait." },
  { name: "ComposeChecklistItems", disposition: "keep", actions: 28, reason: "Called by the approval flows." },
  { name: "ManualTrigger-UpdateTeamsandSPOSite", disposition: "keep", actions: 22,
    reason: "SharePoint and Teams connectors — not available to app code." },
  { name: "ReportDevOpsBug", disposition: "keep", actions: 2, reason: "Azure DevOps connector." },

  { name: "Requestpermissioncancellation", disposition: "customApi", actions: 17,
    reason: "Three synchronous row updates, no waits — but touches msdyn_flow_approvals." },
  { name: "PerformRequestofGateApprovalCancellation", disposition: "customApi", actions: 12,
    reason: "Synchronous writes only. Should take just StateTrackingId; the 13-field JSON and AppId are vestigial." },
  { name: "PerformRequestofCheckListApprovalCancellation", disposition: "customApi", actions: 9,
    reason: "Three synchronous writes, no waits." },

  // The three Dataverse custom actions that stand in for the cancellation flows above.
  // These are the names the app actually invokes — the flow names next to them describe
  // what is being replaced, and are never passed to `invokeFlow`. They must be registered
  // in their own right or `invokeFlow` would refuse them.
  { name: "vsb_CancelGateApproval", disposition: "customApi", actions: 12,
    reason: "Custom-API replacement for PerformRequestofGateApprovalCancellation. Takes only StateTrackingId; the flow's 13-field JSON and AppId are vestigial." },
  { name: "vsb_CancelCheckListApproval", disposition: "customApi", actions: 9,
    reason: "Custom-API replacement for PerformRequestofCheckListApprovalCancellation. Three synchronous writes, no waits." },
  { name: "vsb_CancelModulePermission", disposition: "customApi", actions: 17,
    reason: "Custom-API replacement for Requestpermissioncancellation. Three synchronous row updates, no waits — but touches msdyn_flow_approvals." },

  { name: "WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers", disposition: "serverTriggered", actions: 42, reason: "Dataverse row-change webhook." },
  { name: "SynchroniseProjectTaskList-Add_Update", disposition: "serverTriggered", actions: 38, reason: "Dataverse row-change webhook." },
  { name: "UpdateTeamsandSPOSite", disposition: "serverTriggered", actions: 23, reason: "Dataverse row-change webhook." },
  { name: "CreatingTeamsandSPOSite-ProjectCreation", disposition: "serverTriggered", actions: 20, reason: "Dataverse row-change webhook." },
  { name: "SynchroniseProjectState", disposition: "serverTriggered", actions: 10, reason: "Dataverse row-change webhook." },
  { name: "LoadDevexCapexCostTotalCapacityTrigger", disposition: "serverTriggered", actions: 2, reason: "Dataverse row-change webhook." },

  { name: "SynchronizeStandardAssumptionCosts", disposition: "missing", actions: 0,
    reason: "Called from Admin Cost and Admin Contract but absent from the solution export." },
  { name: "ForCountriestriggerFabricrecalculationsforProjects", disposition: "missing", actions: 0,
    reason: "Called from Admin Milestones but absent from the export." },
  { name: "SynchroniseRecalculationCapexStandardCost", disposition: "missing", actions: 0,
    reason: "Commented out on Project Production and absent from the export." },
];

/**
 * The register is the allow-list, not a lookup table.
 *
 * An unregistered name used to fall straight through to `dataClient.callAction`, which
 * answers `{ok: true}` in mock mode and raises a raw Dataverse fault against a real
 * environment — a silent no-op either way. A name that is not in the register cannot be
 * called at all.
 */
export function resolveFlow(name: string): FlowDescriptor {
  const d = FLOW_REGISTER.find((f) => f.name === name);
  if (!d) {
    throw new AppError("unknown",
      `The action "${name}" is not in FLOW_REGISTER, so it cannot be invoked. ` +
      `Add it to the register with its disposition and reason before calling it.`,
      { source: name });
  }
  return d;
}

async function invokeFlow<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const d = resolveFlow(name);
  if (d.disposition === "missing") {
    throw new AppError("unknown",
      `The flow "${name}" is called by the app but is not present in the solution export. ` +
      `Import it, or agree a replacement, before this action can work.`, { source: name });
  }
  trace("information", `flow ${name}`, payload);
  if (dataMode === "mock") {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, mock: true } as T;
  }
  // Flows exposed to a code app are invoked through their Dataverse-bound custom action
  // or an HTTP endpoint registered at deploy time.
  return dataClient.callAction<T>(name, payload);
}

/* --------------------------------------------------------- keep-as-flow wrappers */

export interface CheckListApprovalRequest {
  projectId: string;
  checklistId: string;
  approverIds: string[];
  comment?: string;
}
export const performCheckListApproval = (p: CheckListApprovalRequest) =>
  invokeFlow<{ approvalId: string }>("PerformCommonRequestofCheckListApproval", { ...p });

export interface GateApprovalRequest {
  projectId: string;
  stateTrackingId: string;
  targetClusterState: string;
  comment?: string;
}
export const performGateApproval = (p: GateApprovalRequest) =>
  invokeFlow<{ approvalId: string }>("PerformCommonRequestofGateApproval", { ...p });

export interface ModulePermissionRequest {
  projectId: string;
  moduleType: string;
  generatorTypeInProjectId?: string;
  justification?: string;
}
export const requestModulePermission = (p: ModulePermissionRequest) =>
  invokeFlow<{ approvalId: string }>("RequestModulePermission", { ...p });

export const requestPortfolioManagersApproval = (p: { projectId: string; comment?: string }) =>
  invokeFlow<{ approvalId: string }>("RequestPortfolioManagersApproval", { ...p });

export const updateTeamsAndSpoSite = (p: { projectId: string }) =>
  invokeFlow<{ ok: boolean }>("ManualTrigger-UpdateTeamsandSPOSite", { ...p });

export interface DevOpsBugPayload {
  user: string; errorScreen: string; errorSource: string;
  errorMessage: string; timestamp: string; description: string;
}
export const reportDevOpsBug = (p: DevOpsBugPayload) =>
  invokeFlow<{ workItemId: number }>("ReportDevOpsBug", { ...p });

/* ------------------------------------------------- custom-API replacements (Stage 4) */

/**
 * Replaces PerformRequestofGateApprovalCancellation. The flow declared a 13-field JSON
 * payload plus an unused AppId; only the state-tracking id is actually needed.
 */
export const cancelGateApproval = (p: { stateTrackingId: string }) =>
  invokeFlow<{ ok: boolean }>("vsb_CancelGateApproval", { ...p });

export const cancelCheckListApproval = (p: { checklistId: string }) =>
  invokeFlow<{ ok: boolean }>("vsb_CancelCheckListApproval", { ...p });

export const cancelModulePermission = (p: { permissionRequestId: string }) =>
  invokeFlow<{ ok: boolean }>("vsb_CancelModulePermission", { ...p });

/* ------------------------------------------------------------------ missing flows */

export const synchronizeStandardAssumptionCosts = (p: { contractTypeId?: string; countryId?: string }) =>
  invokeFlow<{ ok: boolean }>("SynchronizeStandardAssumptionCosts", { ...p });

export const triggerFabricRecalculationForCountries = (p: { countryIds: string[] }) =>
  invokeFlow<{ ok: boolean }>("ForCountriestriggerFabricrecalculationsforProjects", { ...p });
