/**
 * The Project Management app's Power Automate cloud flows, called from the code app (D81, 4 Nov 2026;
 * `ProjectDocs/app-docs/16-PM-FLOWS-IN-THE-CODE-APP.md`).
 *
 * Each is a solution-aware instant flow with the Power Apps V2 trigger, added with `pa app add flow --flow-id <id>`,
 * which generates `generated/services/<Flow>Service.Run` and a `shared_logicflows` entry in `power.config.json`. A flow
 * starts under the signed-in user, exactly as the canvas `<Flow>.Run(...)`; its actions run through the solution's
 * connection references (the service account's connections). `Run` returns when the flow reaches "Respond to a Power
 * App or flow" (the approval flows answer `runid` / `approvalid` and keep running), or when a flow without a response
 * action ends.
 *
 * This module is the ONE place that maps the canvas's positional arguments to the trigger's `text_*` fields
 * (CONVENTIONS rule 17); each screen's `rules.ts` decides the values. Every call is a `[VSB] DATA execute flow <name>`
 * line with its time and outcome, never its payload (rule 23), and a failed call throws through `unwrap` (rule 3).
 *
 *   requestChecklistApproval   Perform Common Request of Check List Approval
 *                              text_1 ProjectGUID · text_2 ProjectChecklistGUID · text_4 DefaultApprovalGUID · text CurrentProjectStateGUID
 *   requestGateApproval        Perform Common Request of Gate Approval
 *                              text_1 ProjectGUID · text_2 StateGUID · text_3 StateTrackingGUID · text_4 DefaultApprovalGUID
 *   cancelGateApproval         Perform Request of Gate Approval Cancellation
 *                              text AppId · text_1 Project (the 13-field JSON, `GateCancellationPayload`); no response
 *   cancelChecklistApproval    Perform Request of Check List Approval Cancellation
 *                              text CheckList Guid → `success`
 *   requestModulePermission    Request Module Permission (D97, Project Generators)
 *                              email RequesterEmail · text_1 PrimarilyApprovalGroupID · text_4 AppId · text Project (JSON) → `runid`, `approvalid`
 *   cancelModulePermission     Request permission cancellation (D97, Project Generators)
 *                              email RequesterEmail · text_2 AppId · text_3 Project (the module JSON); no response
 *
 * The two module-permission flows were registered on 5 Nov 2026 (D86, after the run-only connections were switched to
 * connection references, D81 §3b) and wired to the Generators screen in D97. Both write the type row themselves:
 * Request Module Permission sets 'Request Permission State' Pending, `FlowRunId` and `FlowApprovalId` right after it
 * responds (`Scope_update_RunId_and_Approval_Id_info`), then Approved + the plant roll-up, or deletes the row when the
 * approval is declined; the cancellation sets Canceled and blanks both ids. The code app writes none of those fields.
 */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { PerformCommonRequestofCheckListApprovalService } from "@/generated/services/PerformCommonRequestofCheckListApprovalService";
import { PerformCommonRequestofGateApprovalService } from "@/generated/services/PerformCommonRequestofGateApprovalService";
import { PerformRequestofCheckListApprovalCancellationService } from "@/generated/services/PerformRequestofCheckListApprovalCancellationService";
import { PerformRequestofGateApprovalCancellationService } from "@/generated/services/PerformRequestofGateApprovalCancellationService";
import { RequestModulePermissionService } from "@/generated/services/RequestModulePermissionService";
import { RequestpermissioncancellationService } from "@/generated/services/RequestpermissioncancellationService";
import { unwrap } from "@/platform/errors";
import { loggedCall } from "@/platform/requestLog";

/** The display names, as `pa app list-flows` shows them; they name the console line and the error. */
export const FLOW = {
  checklistApproval: "Perform Common Request of Check List Approval",
  gateApproval: "Perform Common Request of Gate Approval",
  gateCancellation: "Perform Request of Gate Approval Cancellation",
  checklistCancellation: "Perform Request of Check List Approval Cancellation",
  modulePermission: "Request Module Permission",
  permissionCancellation: "Request permission cancellation",
} as const;

/**
 * What the approval flows answer: `runid` is the flow run (the canvas gates its write-back on it), `approvalid` the
 * Approvals row — or "NOTIFICATION-ONLY" / a blank when no approval was created. Blank comes back as null.
 */
export interface FlowApprovalResult {
  runid: string | null;
  approvalid: string | null;
}

/**
 * `text_1` of Perform Request of Gate Approval Cancellation — the record the canvas builds in `With({varProject: {…}})`
 * and sends as `JSON(varProject)` (CheckList screen Y:1572-1598; General Data Y:299-316). The flow's `Parse_Gate_data`
 * schema names these 13 fields. A blank is `null`, which is what Power Fx `JSON` writes for `Blank()`.
 */
export interface GateCancellationPayload {
  ProjectGuid: string;
  /** `'Project ID'` (`vsb_name`), the text key. */
  ProjectId: string | null;
  ProjectName: string | null;
  StateGuid: string | null;
  StateName: string | null;
  StateTrackingGuid: string | null;
  HasGate: boolean;
  GateSettingsGuid: string | null;
  PreviousClusterGuid: string | null;
  NextClusterGuid: string | null;
  /** The portfolio manager's mail, or "" (`If(Not(IsBlank(…)), ….Mail, "")` / `Coalesce(….Mail, "")`). */
  PortfolioManager: string;
  FlowRunId: string | null;
  FlowApprovalId: string | null;
}

/** Runs one flow: timed and logged by name, then unwrapped (a `success: false` result throws a `DataError` naming the flow). */
async function runFlow<T>(name: string, call: () => Promise<IOperationResult<T>>): Promise<T> {
  const operation = `flow ${name}`;
  return unwrap(await loggedCall("execute", operation, call), operation);
}

const approval = (data: { runid?: string; approvalid?: string } | null | undefined): FlowApprovalResult => ({
  runid: data?.runid ? data.runid : null,
  approvalid: data?.approvalid ? data.approvalid : null,
});

/** `PerformCommonRequestofCheckListApproval.Run(ProjectGUID, ChecklistGUID, CheckListDefaultApprovalGUID, CurrentProjectStateGUID)` (Y:5514). */
export async function requestChecklistApproval(args: {
  projectId: string;
  checklistId: string;
  checkListDefaultApprovalId: string;
  currentProjectStateId: string;
}): Promise<FlowApprovalResult> {
  return approval(await runFlow(FLOW.checklistApproval, () => PerformCommonRequestofCheckListApprovalService.Run({
    text_1: args.projectId,
    text_2: args.checklistId,
    text_4: args.checkListDefaultApprovalId,
    text: args.currentProjectStateId,
  })));
}

/** `PerformCommonRequestofGateApproval.Run(ProjectGUID, StateGUID, StateTrackingGUID, DefaultApprovalGUID)` (Y:5662). */
export async function requestGateApproval(args: {
  projectId: string;
  stateId: string;
  stateTrackingId: string;
  defaultApprovalId: string;
}): Promise<FlowApprovalResult> {
  return approval(await runFlow(FLOW.gateApproval, () => PerformCommonRequestofGateApprovalService.Run({
    text_1: args.projectId,
    text_2: args.stateId,
    text_3: args.stateTrackingId,
    text_4: args.defaultApprovalId,
  })));
}

/** `PerformRequestofGateApprovalCancellation.Run(gblProjectManagmentAppID, JSON(varProject))` (Y:1602, General Data Y:297). */
export async function cancelGateApproval(args: { appId: string; project: GateCancellationPayload }): Promise<void> {
  await runFlow(FLOW.gateCancellation, () => PerformRequestofGateApprovalCancellationService.Run({
    text: args.appId,
    text_1: JSON.stringify(args.project),
  }));
}

/** `PerformRequestofCheckListApprovalCancellation.Run(ThisItem.ID).success` (Y:3696). */
export async function cancelChecklistApproval(checklistId: string): Promise<{ success: boolean | undefined }> {
  const data = await runFlow(FLOW.checklistCancellation, () => PerformRequestofCheckListApprovalCancellationService.Run({
    text: checklistId,
  }));
  return { success: data?.success };
}

/**
 * The `varProject` record of Request Module Permission (`Parse_Project`): the project header, the `ModuleType`
 * option value and the module's own key (`GeneratorTypeInProject` + `Generator`, `InverterTypeInProject`, …).
 * The Generators screen builds it (`features/pm/generators/rules.ts`, `build*PermissionPayload`).
 */
export type ModulePermissionRequestPayload = {
  ProjectGuid: string;
  ProjectId: string | null;
  ProjectName: string | null;
  ShortName: string | null;
  ProjectManagerEmail: string | null;
  ModuleType: number;
} & Record<string, string | number | null>;

/** The `varModule` record of Request permission cancellation (`Parse_ModuleType`). */
export interface ModuleCancellationPayload {
  ModuleTypeGuid: string;
  ModuleType: number;
  Name: string | null;
  FlowRunId: string | null;
  FlowApprovalId: string | null;
}

/**
 * `RequestModulePermission.Run(User().Email, gblPrimarilyApprovalGroupID, gblProjectManagmentAppID, JSON(varProject))`
 * (Generators Y:16535 WTG, Y:10259 inverter, Y:8995 substructure; the PV call is commented out in the canvas).
 */
export async function requestModulePermission(args: {
  requesterEmail: string;
  approvalGroupId: string;
  appId: string;
  project: ModulePermissionRequestPayload;
}): Promise<FlowApprovalResult> {
  return approval(await runFlow(FLOW.modulePermission, () => RequestModulePermissionService.Run({
    email: args.requesterEmail,
    text_1: args.approvalGroupId,
    text_4: args.appId,
    text: JSON.stringify(args.project),
  })));
}

/**
 * `Requestpermissioncancellation.Run(User().Email, gblProjectManagmentAppID, JSON(varModule))` (Generators: the cards'
 * Cancel, Y:2652 / 3798 / 4466 / 5125; the deletes, Y:15308 / 15397 / 15486 / 15676; the 1.21.753 Replace).
 */
export async function cancelModulePermission(args: {
  requesterEmail: string;
  appId: string;
  module: ModuleCancellationPayload;
}): Promise<void> {
  await runFlow(FLOW.permissionCancellation, () => RequestpermissioncancellationService.Run({
    email: args.requesterEmail,
    text_2: args.appId,
    text_3: JSON.stringify(args.module),
  }));
}
