/**
 * UT-FLOWS — `data/flows.ts` (D81): the one mapping from the canvas's positional flow arguments to the triggers'
 * `text_*` fields, the normalised answers, and a failed call surfacing as an error that names the flow (rule 3).
 * The generated services are stubbed; nothing here talks to Power Automate.
 */
import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/generated/services/PerformCommonRequestofCheckListApprovalService", () => ({
  PerformCommonRequestofCheckListApprovalService: { Run: vi.fn() },
}));
vi.mock("@/generated/services/PerformCommonRequestofGateApprovalService", () => ({
  PerformCommonRequestofGateApprovalService: { Run: vi.fn() },
}));
vi.mock("@/generated/services/PerformRequestofGateApprovalCancellationService", () => ({
  PerformRequestofGateApprovalCancellationService: { Run: vi.fn() },
}));
vi.mock("@/generated/services/PerformRequestofCheckListApprovalCancellationService", () => ({
  PerformRequestofCheckListApprovalCancellationService: { Run: vi.fn() },
}));
vi.mock("@/generated/services/RequestModulePermissionService", () => ({
  RequestModulePermissionService: { Run: vi.fn() },
}));
vi.mock("@/generated/services/RequestpermissioncancellationService", () => ({
  RequestpermissioncancellationService: { Run: vi.fn() },
}));

import { PerformCommonRequestofCheckListApprovalService } from "@/generated/services/PerformCommonRequestofCheckListApprovalService";
import { PerformCommonRequestofGateApprovalService } from "@/generated/services/PerformCommonRequestofGateApprovalService";
import { PerformRequestofCheckListApprovalCancellationService } from "@/generated/services/PerformRequestofCheckListApprovalCancellationService";
import { PerformRequestofGateApprovalCancellationService } from "@/generated/services/PerformRequestofGateApprovalCancellationService";
import { RequestModulePermissionService } from "@/generated/services/RequestModulePermissionService";
import { RequestpermissioncancellationService } from "@/generated/services/RequestpermissioncancellationService";
import {
  cancelChecklistApproval, cancelGateApproval, cancelModulePermission, requestChecklistApproval, requestGateApproval,
  requestModulePermission, type GateCancellationPayload,
} from "./flows";

const run = {
  checklist: PerformCommonRequestofCheckListApprovalService.Run as unknown as Mock,
  gate: PerformCommonRequestofGateApprovalService.Run as unknown as Mock,
  gateCancel: PerformRequestofGateApprovalCancellationService.Run as unknown as Mock,
  checklistCancel: PerformRequestofCheckListApprovalCancellationService.Run as unknown as Mock,
  modulePermission: RequestModulePermissionService.Run as unknown as Mock,
  permissionCancel: RequestpermissioncancellationService.Run as unknown as Mock,
};

describe("data/flows", () => {
  it("UT-FLOWS-001 the checklist approval maps the four named arguments to the trigger's fields in the canvas order", async () => {
    run.checklist.mockResolvedValueOnce({ success: true, data: { runid: "run-1", approvalid: "ap-1" } });
    const out = await requestChecklistApproval({
      projectId: "p-1", checklistId: "cl-1", checkListDefaultApprovalId: "clda-1", currentProjectStateId: "ps-0",
    });
    expect(run.checklist).toHaveBeenCalledWith({ text_1: "p-1", text_2: "cl-1", text_4: "clda-1", text: "ps-0" });
    expect(out).toEqual({ runid: "run-1", approvalid: "ap-1" });
  });

  it("UT-FLOWS-002 the gate approval maps text_1..text_4; a blank approval id (the notification-only arm) is null", async () => {
    run.gate.mockResolvedValueOnce({ success: true, data: { runid: "run-2", approvalid: "" } });
    const out = await requestGateApproval({ projectId: "p-1", stateId: "ps-2", stateTrackingId: "t-2", defaultApprovalId: "g-2" });
    expect(run.gate).toHaveBeenCalledWith({ text_1: "p-1", text_2: "ps-2", text_3: "t-2", text_4: "g-2" });
    expect(out).toEqual({ runid: "run-2", approvalid: null });
    run.gate.mockResolvedValueOnce({ success: true, data: undefined });
    expect(await requestGateApproval({ projectId: "p", stateId: "s", stateTrackingId: "t", defaultApprovalId: "g" }))
      .toEqual({ runid: null, approvalid: null });
  });

  it("UT-FLOWS-003 the gate cancellation sends the app id as text and the 13-field record as JSON in text_1, blanks as null", async () => {
    run.gateCancel.mockResolvedValueOnce({ success: true, data: undefined });
    const project: GateCancellationPayload = {
      ProjectGuid: "p-1", ProjectId: "DE-0001", ProjectName: "Windpark Nord", StateGuid: "ps-2", StateName: "Cluster 2",
      StateTrackingGuid: "t-2", HasGate: true, GateSettingsGuid: "g-2", PreviousClusterGuid: "ps-1", NextClusterGuid: null,
      PortfolioManager: "", FlowRunId: null, FlowApprovalId: "ap-2",
    };
    await cancelGateApproval({ appId: "app-1", project });
    const [input] = run.gateCancel.mock.calls[0] as [{ text: string; text_1: string }];
    expect(input.text).toBe("app-1");
    const sent = JSON.parse(input.text_1) as Record<string, unknown>;
    expect(Object.keys(sent)).toHaveLength(13);
    expect(sent).toEqual(project);
    expect(sent.NextClusterGuid).toBeNull();
    expect(sent.FlowRunId).toBeNull();
  });

  it("UT-FLOWS-004 the checklist cancellation sends the checklist id as text and returns the flow's success", async () => {
    run.checklistCancel.mockResolvedValueOnce({ success: true, data: { success: false } });
    expect(await cancelChecklistApproval("cl-9")).toEqual({ success: false });
    expect(run.checklistCancel).toHaveBeenCalledWith({ text: "cl-9" });
    run.checklistCancel.mockResolvedValueOnce({ success: true, data: undefined });
    expect(await cancelChecklistApproval("cl-9")).toEqual({ success: undefined });
  });

  it("UT-FLOWS-005 a call the SDK reports as failed throws an error that names the flow (never a silent false)", async () => {
    run.gate.mockResolvedValueOnce({ success: false, error: new Error("The caller lacks the App Opener role") });
    await expect(requestGateApproval({ projectId: "p", stateId: "s", stateTrackingId: "t", defaultApprovalId: "g" }))
      .rejects.toThrow(/flow Perform Common Request of Gate Approval failed/);
  });

  it("UT-FLOWS-006 Request Module Permission: email, text_1 group, text_4 app id, the varProject record as JSON in text (D97)", async () => {
    run.modulePermission.mockResolvedValueOnce({ success: true, data: { runid: "run-7", approvalid: "ap-7" } });
    const project = {
      ProjectGuid: "p-1", ProjectId: "DE-0001", ProjectName: "Windpark Nord", ShortName: "WPN", ProjectManagerEmail: null,
      ModuleType: 952850000, GeneratorTypeInProject: "t-1", Generator: "g-1",
    };
    const out = await requestModulePermission({ requesterEmail: "ada@vsb.example", approvalGroupId: "grp-1", appId: "app-1", project });
    const [input] = run.modulePermission.mock.calls[0] as [{ email: string; text_1: string; text_4: string; text: string }];
    expect(input.email).toBe("ada@vsb.example");
    expect(input.text_1).toBe("grp-1");
    expect(input.text_4).toBe("app-1");
    expect(JSON.parse(input.text)).toEqual(project);
    expect(out).toEqual({ runid: "run-7", approvalid: "ap-7" });
  });

  it("UT-FLOWS-007 Request permission cancellation: email, text_2 app id, the varModule record as JSON in text_3 (D97)", async () => {
    run.permissionCancel.mockResolvedValueOnce({ success: true, data: undefined });
    const module = { ModuleTypeGuid: "s-1", ModuleType: 952850003, Name: "Tracker A", FlowRunId: "run-1", FlowApprovalId: null };
    await cancelModulePermission({ requesterEmail: "ada@vsb.example", appId: "app-1", module });
    const [input] = run.permissionCancel.mock.calls[0] as [{ email: string; text_2: string; text_3: string }];
    expect(input).toMatchObject({ email: "ada@vsb.example", text_2: "app-1" });
    expect(JSON.parse(input.text_3)).toEqual(module);
  });

  it("UT-FLOWS-008 a failed module-permission call throws an error that names the flow", async () => {
    run.permissionCancel.mockResolvedValueOnce({ success: false, error: new Error("Approval not found") });
    await expect(cancelModulePermission({
      requesterEmail: "a@b.c", appId: "app", module: { ModuleTypeGuid: "x", ModuleType: 952850000, Name: null, FlowRunId: "r", FlowApprovalId: "a" },
    })).rejects.toThrow(/flow Request permission cancellation failed/);
  });
});
