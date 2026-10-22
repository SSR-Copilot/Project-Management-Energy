/**
 * Project Gates writes, end to end through the REAL `runPlan` / `executePlan` / `updateRecordIfExists`
 * against the guarded SDK fake: exactly one request per action, the upsert guard, and the error
 * classes the screen branches on.
 *
 * WIRE-EQUIVALENCE. Each write used to be a function of `projectGatesRepository`
 * (`@/data/adminGatesApprovals`); it is now a one-write `WritePlan` (`./rules`). `OLD_WIRE` is the
 * request sequence those functions sent, RECORDED from the code before it was changed (the same
 * guarded SDK fake, the same arguments). Each test runs the new plan and asserts the SAME sequence:
 * method, entity set, id, body (JSON-compared, so key order counts too) and the guard's existence
 * read. UT-ADGATE-014..023 moved here from `@/data/adminGatesApprovals.test.ts` with their assertions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);

import { executePlan, PlanRefusedError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import type { WritePlan } from "@/data/writePlan";
import { DataError, RecordGoneError } from "@/platform/errors";
import { permissionMessage } from "@/platform/privileges";
import { guardedSdk, NEW_ROW_ID, resetGuardedSdk } from "@/test/guardedSdkFake";
import {
  NO_PERMISSION_MESSAGE, planDeleteTaskApproval, planResetGate, planSaveGate, planSaveTaskApproval,
  planSetGateActive, planSetTaskApprovalActive, RESET_GATE_PAYLOAD,
} from "./rules";

const T1 = "50000000-0000-0000-0000-000000000801";
const A1 = "50000000-0000-0000-0000-000000000901";
const GATES = "vsb_projectdefaultapprovalses";
const TASKS = "vsb_checklistdefaultapprovalses";
const admin = { canEdit: true } as const;

/** Request sequences of the OLD data-layer functions, recorded before the move (golden-old-wire). */
const OLD_WIRE = {
  setGateActive: [
    { method: "read", table: GATES, id: T1 },
    { method: "update", table: GATES, id: T1, body: { vsb_gateactive: false } },
  ],
  setTaskActive: [
    { method: "read", table: TASKS, id: A1 },
    { method: "update", table: TASKS, id: A1, body: { vsb_gateisactive: true } },
  ],
  "saveGate.create": [
    { method: "create", table: GATES, body: { vsb_name: "x", "vsb_Approvalparticipant1@odata.bind": null, n: 2, b: true } },
  ],
  "saveGate.update": [
    { method: "read", table: GATES, id: T1 },
    { method: "update", table: GATES, id: T1, body: { vsb_name: "y" } },
  ],
  "saveTask.create": [
    { method: "create", table: TASKS, body: { vsb_name: "x", n: 3 } },
  ],
  "saveTask.update": [
    { method: "read", table: TASKS, id: A1 },
    { method: "update", table: TASKS, id: A1, body: { vsb_name: "y" } },
  ],
  resetGate: [
    { method: "read", table: GATES, id: T1 },
    {
      method: "update", table: GATES, id: T1,
      body: {
        vsb_gateactive: false, "vsb_Approvalparticipant1@odata.bind": null, vsb_defaultcontributors: null,
        vsb_defaultapprovals: null, vsb_defaultnotifications: null,
      },
    },
  ],
  deleteTask: [{ method: "delete", table: TASKS, id: A1 }],
} as const;

const GATE_CREATE_PAYLOAD = { vsb_name: "x", "vsb_Approvalparticipant1@odata.bind": null, n: 2, b: true };

/** Runs a plan through the real executor and returns what reached the SDK, JSON-normalised like the recording. */
async function wireOf(plan: WritePlan): Promise<string> {
  resetGuardedSdk();
  await executePlan(plan, "wire test");
  return JSON.stringify(guardedSdk.log);
}
const golden = (key: keyof typeof OLD_WIRE) => JSON.stringify(OLD_WIRE[key]);

beforeEach(() => resetGuardedSdk());

describe("Wire equivalence: each plan sends exactly what the data-layer function sent", () => {
  it("UT-ADGATE-W01 setGateActive: existence read, then PATCH vsb_gateactive", async () => {
    expect(await wireOf(planSetGateActive(T1, false, admin))).toBe(golden("setGateActive"));
  });

  it("UT-ADGATE-W02 setTaskActive (task approval toggle): existence read, then PATCH vsb_gateisactive", async () => {
    expect(await wireOf(planSetTaskApprovalActive(A1, true, admin))).toBe(golden("setTaskActive"));
  });

  it("UT-ADGATE-W03 saveGate create: one POST with the payload exactly as built (null binds kept, key order kept)", async () => {
    expect(await wireOf(planSaveGate(undefined, GATE_CREATE_PAYLOAD, admin))).toBe(golden("saveGate.create"));
  });

  it("UT-ADGATE-W04 saveGate update: existence read, then PATCH", async () => {
    expect(await wireOf(planSaveGate(T1, { vsb_name: "y" }, admin))).toBe(golden("saveGate.update"));
  });

  it("UT-ADGATE-W05 saveTask create: one POST", async () => {
    expect(await wireOf(planSaveTaskApproval(undefined, { vsb_name: "x", n: 3 }, admin))).toBe(golden("saveTask.create"));
  });

  it("UT-ADGATE-W06 saveTask update: existence read, then PATCH", async () => {
    expect(await wireOf(planSaveTaskApproval(A1, { vsb_name: "y" }, admin))).toBe(golden("saveTask.update"));
  });

  it("UT-ADGATE-W07 resetGate: existence read, then PATCH with the five fields in the old order", async () => {
    expect(await wireOf(planResetGate(T1, admin))).toBe(golden("resetGate"));
  });

  it("UT-ADGATE-W08 deleteTask: one DELETE and no read", async () => {
    expect(await wireOf(planDeleteTaskApproval(A1, admin))).toBe(golden("deleteTask"));
  });

  it("UT-ADGATE-W09 the create path still yields the new row's id (what the old saveGate / saveTask returned)", async () => {
    const gate = await runPlan(planSaveGate(undefined, { vsb_name: "x" }, admin), "t");
    expect(gate.createdIds).toEqual([NEW_ROW_ID]);
    const task = await runPlan(planSaveTaskApproval(undefined, { vsb_name: "x" }, admin), "t");
    expect(task.createdIds).toEqual([NEW_ROW_ID]);
  });
});

describe("Writes: exactly one request per action (UT-ADGATE-014..023, relocated)", () => {
  const writes = () => guardedSdk.log.filter((r) => r.method !== "read");

  it("UT-ADGATE-014 Gate toggle → one PATCH on vsb_projectdefaultapprovalses", async () => {
    await runPlan(planSetGateActive(T1, false, admin), "t");
    expect(writes()).toEqual([{ method: "update", table: GATES, id: T1, body: { vsb_gateactive: false } }]);
    expect(guardedSdk.reads).toEqual([{ table: GATES, id: T1 }]);
  });

  it("UT-ADGATE-015 Task toggle → one PATCH with vsb_gateisactive", async () => {
    await runPlan(planSetTaskApprovalActive(A1, true, admin), "t");
    expect(writes()).toEqual([{ method: "update", table: TASKS, id: A1, body: { vsb_gateisactive: true } }]);
    expect(guardedSdk.reads).toEqual([{ table: TASKS, id: A1 }]);
  });

  it("UT-ADGATE-016 Upsert guard: a task toggle on a deleted approval row is refused before any PATCH (never upserted)", async () => {
    guardedSdk.gone.add(A1);
    await expect(runPlan(planSetTaskApprovalActive(A1, true, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
  });

  it("UT-ADGATE-017 Upsert guard: gate toggle / save / reset on a deleted template are refused (RecordGoneError), nothing PATCHed", async () => {
    guardedSdk.gone.add(T1);
    await expect(runPlan(planSetGateActive(T1, true, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    await expect(runPlan(planSaveGate(T1, { vsb_name: "y" }, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    await expect(runPlan(planResetGate(T1, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    expect(writes()).toEqual([]);
    expect(guardedSdk.reads).toHaveLength(3);
  });

  it("UT-ADGATE-018 Save gate: create → one POST, update → one PATCH", async () => {
    await runPlan(planSaveGate(undefined, { vsb_name: "x" }, admin), "t");
    await runPlan(planSaveGate(T1, { vsb_name: "y" }, admin), "t");
    expect(writes().map((c) => `${c.method}:${c.table}`)).toEqual([`create:${GATES}`, `update:${GATES}`]);
  });

  it("UT-ADGATE-019 Save task: create → one POST, update → one PATCH", async () => {
    await runPlan(planSaveTaskApproval(undefined, { vsb_name: "x" }, admin), "t");
    await runPlan(planSaveTaskApproval(A1, { vsb_name: "y" }, admin), "t");
    expect(writes().map((c) => `${c.method}:${c.table}`)).toEqual([`create:${TASKS}`, `update:${TASKS}`]);
  });

  it("UT-ADGATE-021 Reset gate → one PATCH with the four nulls and gateactive false, mode untouched", async () => {
    await runPlan(planResetGate(T1, admin), "t");
    expect(writes()).toHaveLength(1);
    expect(writes()[0]!.body).toEqual(RESET_GATE_PAYLOAD);
    expect(RESET_GATE_PAYLOAD).toEqual({
      vsb_gateactive: false, "vsb_Approvalparticipant1@odata.bind": null,
      vsb_defaultcontributors: null, vsb_defaultapprovals: null, vsb_defaultnotifications: null,
    });
    expect(RESET_GATE_PAYLOAD).not.toHaveProperty("vsb_approvalmodecode");
  });

  it("UT-ADGATE-022 Delete task → one DELETE", async () => {
    await runPlan(planDeleteTaskApproval("a1", admin), "t");
    expect(writes()).toEqual([{ method: "delete", table: TASKS, id: "a1" }]);
  });

  it("UT-ADGATE-023 A refused write throws; a 403 maps to the permission message", async () => {
    guardedSdk.writeFails = 403;
    const error = await runPlan(planSaveTaskApproval(A1, { vsb_name: "y" }, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect(permissionMessage(error, "save the approvals")).toMatch(/do not have permission/);
    guardedSdk.writeFails = 500;
    await expect(runPlan(planDeleteTaskApproval("a1", admin), "t")).rejects.toBeInstanceOf(DataError);
    await expect(runPlan(planSetGateActive(T1, true, admin), "t")).rejects.toBeInstanceOf(DataError);
    await expect(runPlan(planResetGate(T1, admin), "t")).rejects.toBeInstanceOf(DataError);
    await expect(runPlan(planSaveGate(undefined, { vsb_name: "x" }, admin), "t")).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADGATE-023b the operation text of a failure is the one the data layer used (the label is verbatim)", async () => {
    guardedSdk.writeFails = 500;
    const message = async (plan: WritePlan) => ((await runPlan(plan, "ignored").catch((e: unknown) => e)) as Error).message;
    expect(await message(planSetGateActive(T1, true, admin))).toBe("update gate active failed: HTTP 500");
    expect(await message(planSaveGate(T1, {}, admin))).toBe("update gate approval template failed: HTTP 500");
    expect(await message(planSaveGate(undefined, {}, admin))).toBe("create gate approval template failed: HTTP 500");
    expect(await message(planResetGate(T1, admin))).toBe("reset gate approval template failed: HTTP 500");
    expect(await message(planSetTaskApprovalActive(A1, true, admin))).toBe(`update ${TASKS} failed: HTTP 500`);
    expect(await message(planSaveTaskApproval(A1, {}, admin))).toBe(`update ${TASKS} failed: HTTP 500`);
    expect(await message(planSaveTaskApproval(undefined, {}, admin))).toBe(`create ${TASKS} failed: HTTP 500`);
    expect(await message(planDeleteTaskApproval(A1, admin))).toBe(`delete ${TASKS} failed: HTTP 500`);
  });

  it("UT-ADGATE-023c a gone row reads as 'update gate active failed: ... no longer exists' like before, and is a RecordGoneError", async () => {
    guardedSdk.gone.add(T1);
    const error = await runPlan(planSetGateActive(T1, true, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as RecordGoneError).message).toBe(`update gate active failed: ${GATES} row ${T1} no longer exists`);
  });
});

describe("Admin refusal stays inside the plan", () => {
  const refusals: [string, WritePlan][] = [
    ["setGateActive", planSetGateActive(T1, true, { canEdit: false })],
    ["setTaskApprovalActive", planSetTaskApprovalActive(A1, true, { canEdit: false })],
    ["saveGate", planSaveGate(T1, {}, { canEdit: false })],
    ["saveTaskApproval", planSaveTaskApproval(undefined, {}, { canEdit: false })],
    ["resetGate", planResetGate(T1, { canEdit: false })],
    ["deleteTaskApproval", planDeleteTaskApproval(A1, { canEdit: false })],
  ];

  it.each(refusals)("UT-ADGATE-W10 %s without admin access: refused with the screen's message, nothing sent", async (_name, plan) => {
    expect(plan).toEqual({ writes: [], log: [], refusedReason: NO_PERMISSION_MESSAGE });
    const error = await runPlan(plan, "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRefusedError);
    expect((error as Error).message).toBe("You do not have permission to change the default approvals.");
    expect(guardedSdk.log).toEqual([]);
  });
});
