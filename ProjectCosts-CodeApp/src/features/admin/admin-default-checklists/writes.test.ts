/**
 * Check List Settings writes that moved onto a `WritePlan`, end to end through the REAL
 * `runPlan` / `executePlan` / `updateRecordIfExists` against the guarded SDK fake: exactly one
 * PATCH per action, the upsert guard, and the error classes the screen branches on.
 *
 * WIRE-EQUIVALENCE. Edit (K2), the Completion Date toggle (K3) and activate/deactivate (K4) used
 * to be `updateTask` / `toggleCompletionDate` / `setTaskActive` of `@/data/adminDefaultChecklists`;
 * each is now a one-write `WritePlan` (`./rules`). `OLD_WIRE` is the request sequence those
 * functions sent, RECORDED from the code before it was changed (the same guarded SDK fake, the
 * same arguments). Each test runs the new plan and asserts the SAME sequence: method, entity set,
 * id, body (JSON-compared, so key order counts too) and the guard's existence read.
 * UT-ADCHK-014, 018, 019, 020, 022, 023 and 024 moved here from
 * `@/data/adminDefaultChecklists.test.ts` with their assertions.
 *
 * The create flow (`createTask`) and the KEEP flows (soft delete + renumber, reorder) stay in the
 * data layer and are still covered there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);

import { executePlan, PlanRefusedError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import type { WritePlan } from "@/data/writePlan";
import { CHECKLIST_ENTITY_SETS } from "@/data/dataverseNames";
import { createTask, type ChecklistTab, type TaskForm } from "@/data/adminDefaultChecklists";
import { DataError, RecordGoneError } from "@/platform/errors";
import { guardedSdk, resetGuardedSdk } from "@/test/guardedSdkFake";
import { OUT_OF_SCOPE_MESSAGE } from "./messages";
import { planSetActive, planToggleCompletion, planUpdateTask } from "./rules";

const TASKS = CHECKLIST_ENTITY_SETS.tasks;
const admin = { canEdit: true } as const;

const TAB: ChecklistTab = {
  id: "aaaaaaaa-0000-0000-0000-000000000001", name: "DE Wind", order: "1",
  owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-000000000001",
};
const CLUSTER = "cccccccc-0000-0000-0000-000000000001";
const FORM: TaskForm = {
  name: "  Site identified ", holdingDescription: " hold ", gateRelevance: true,
  isCompletionDate: false, isActive: false,
};
const ID = (n: number) => `dddddddd-0000-0000-0000-${String(n).padStart(12, "0")}`;

const EDIT_BODY = {
  vsb_name: "Site identified",
  vsb_holdingtaskdescription: "hold",
  vsb_gaterelevance: true,
  vsb_iscompletiondate: false,
  statecode: 1,
  statuscode: 2,
  "owningbusinessunit@odata.bind": "/businessunits(bbbbbbbb-0000-0000-0000-000000000001)",
};

/** Request sequences of the OLD data-layer functions, recorded before the move. */
const OLD_WIRE = {
  "updateTask.inactive": [
    { method: "read", table: TASKS, id: ID(1) },
    { method: "update", table: TASKS, id: ID(1), body: EDIT_BODY },
  ],
  "updateTask.active": [
    { method: "read", table: TASKS, id: ID(1) },
    { method: "update", table: TASKS, id: ID(1), body: { ...EDIT_BODY, statecode: 0, statuscode: 1 } },
  ],
  "updateTask.noTab": [
    { method: "read", table: TASKS, id: ID(1) },
    {
      method: "update", table: TASKS, id: ID(1),
      body: {
        vsb_name: "Site identified", vsb_holdingtaskdescription: "hold", vsb_gaterelevance: true,
        vsb_iscompletiondate: false, statecode: 1, statuscode: 2,
      },
    },
  ],
  "toggleCompletionDate.null": [
    { method: "read", table: TASKS, id: ID(1) },
    { method: "update", table: TASKS, id: ID(1), body: { vsb_iscompletiondate: true } },
  ],
  "toggleCompletionDate.true": [
    { method: "read", table: TASKS, id: ID(2) },
    { method: "update", table: TASKS, id: ID(2), body: { vsb_iscompletiondate: false } },
  ],
  "setTaskActive.false": [
    { method: "read", table: TASKS, id: ID(1) },
    { method: "update", table: TASKS, id: ID(1), body: { statecode: 1, statuscode: 2 } },
  ],
  "setTaskActive.true": [
    { method: "read", table: TASKS, id: ID(2) },
    { method: "update", table: TASKS, id: ID(2), body: { statecode: 0, statuscode: 1 } },
  ],
} as const;

/** Runs a plan through the real executor and returns what reached the SDK, JSON-normalised like the recording. */
async function wireOf(plan: WritePlan): Promise<string> {
  resetGuardedSdk();
  await executePlan(plan, "wire test");
  return JSON.stringify(guardedSdk.log);
}
const golden = (key: keyof typeof OLD_WIRE) => JSON.stringify(OLD_WIRE[key]);

const updates = () => guardedSdk.log.filter((r) => r.method === "update");

beforeEach(() => resetGuardedSdk());

describe("Wire equivalence: each plan sends exactly what the data-layer function sent", () => {
  it("UT-ADCHK-W01 edit (Inactive): existence read, then one PATCH with the edit payload", async () => {
    expect(await wireOf(planUpdateTask(ID(1), FORM, TAB, admin))).toBe(golden("updateTask.inactive"));
  });

  it("UT-ADCHK-W02 edit (Active): the same body with statecode 0 / statuscode 1", async () => {
    expect(await wireOf(planUpdateTask(ID(1), { ...FORM, isActive: true }, TAB, admin)))
      .toBe(golden("updateTask.active"));
  });

  it("UT-ADCHK-W03 edit without a tab: the BU bind is omitted, exactly as before", async () => {
    expect(await wireOf(planUpdateTask(ID(1), FORM, undefined, admin))).toBe(golden("updateTask.noTab"));
  });

  it("UT-ADCHK-W04 Completion Date toggle from null: read, then PATCH true", async () => {
    expect(await wireOf(planToggleCompletion({ id: ID(1), isCompletionDate: null }, admin)))
      .toBe(golden("toggleCompletionDate.null"));
  });

  it("UT-ADCHK-W05 Completion Date toggle from true: read, then PATCH false", async () => {
    expect(await wireOf(planToggleCompletion({ id: ID(2), isCompletionDate: true }, admin)))
      .toBe(golden("toggleCompletionDate.true"));
  });

  it("UT-ADCHK-W06 deactivate: read, then PATCH statecode 1 / statuscode 2", async () => {
    expect(await wireOf(planSetActive(ID(1), false, admin))).toBe(golden("setTaskActive.false"));
  });

  it("UT-ADCHK-W07 activate: read, then PATCH statecode 0 / statuscode 1", async () => {
    expect(await wireOf(planSetActive(ID(2), true, admin))).toBe(golden("setTaskActive.true"));
  });
});

describe("Writes: exactly one PATCH per action (UT-ADCHK-014/018/019/020/022/023/024, relocated)", () => {
  it("UT-ADCHK-014 create and edit SEND the lower-case owningbusinessunit@odata.bind, never PascalCase", async () => {
    await createTask({ tab: TAB, clusterId: CLUSTER, form: FORM, order: 1 });
    const created = guardedSdk.log.find((c) => c.method === "create")?.body as Record<string, unknown>;
    resetGuardedSdk();
    await runPlan(planUpdateTask(ID(1), FORM, TAB, admin), "t");
    const edited = updates().at(-1)?.body as Record<string, unknown>;
    for (const body of [created, edited]) {
      expect(body["owningbusinessunit@odata.bind"]).toBe("/businessunits(bbbbbbbb-0000-0000-0000-000000000001)");
      expect(body).not.toHaveProperty("OwningBusinessUnit@odata.bind");
    }
  });

  it("UT-ADCHK-018 Edit turning Active off sends 1/2, on sends 0/1", async () => {
    await runPlan(planUpdateTask(ID(1), { ...FORM, isActive: false }, TAB, admin), "t");
    await runPlan(planUpdateTask(ID(1), { ...FORM, isActive: true }, TAB, admin), "t");
    expect(updates().map((u) => (u.body as Record<string, unknown>).statecode)).toEqual([1, 0]);
    expect(updates().map((u) => (u.body as Record<string, unknown>).statuscode)).toEqual([2, 1]);
  });

  it("UT-ADCHK-019 A 403 becomes a forbidden DataError", async () => {
    guardedSdk.writeFails = 403;
    const error = await runPlan(planUpdateTask(ID(1), FORM, TAB, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).isForbidden).toBe(true);
  });

  it("UT-ADCHK-020 V9: a failed edit names the capitalised operation 'Update checklist item'", async () => {
    guardedSdk.writeFails = 500;
    const error = await runPlan(planUpdateTask(ID(1), FORM, TAB, admin), "ignored").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataError);
    expect((error as DataError).operation).toBe("Update checklist item");
    expect((error as DataError).message).toMatch(/^Update checklist item failed: /);
  });

  it("UT-ADCHK-020b the toggle and the status write carry the same operation text", async () => {
    guardedSdk.writeFails = 500;
    const message = async (plan: WritePlan) =>
      ((await runPlan(plan, "ignored").catch((e: unknown) => e)) as Error).message;
    expect(await message(planToggleCompletion({ id: ID(1), isCompletionDate: null }, admin)))
      .toBe("Update checklist item failed: HTTP 500");
    expect(await message(planSetActive(ID(1), false, admin))).toBe("Update checklist item failed: HTTP 500");
  });

  it("UT-ADCHK-022 Null Completion Date becomes true; true becomes false", async () => {
    await runPlan(planToggleCompletion({ id: ID(1), isCompletionDate: null }, admin), "t");
    await runPlan(planToggleCompletion({ id: ID(2), isCompletionDate: true }, admin), "t");
    expect(updates().map((u) => u.body)).toEqual([{ vsb_iscompletiondate: true }, { vsb_iscompletiondate: false }]);
  });

  it("UT-ADCHK-023 Deactivating sends statecode 1 / statuscode 2", async () => {
    await runPlan(planSetActive(ID(1), false, admin), "t");
    await runPlan(planSetActive(ID(2), true, admin), "t");
    expect(updates().map((u) => u.body)).toEqual([{ statecode: 1, statuscode: 2 }, { statecode: 0, statuscode: 1 }]);
    expect(guardedSdk.reads).toEqual([{ table: TASKS, id: ID(1) }, { table: TASKS, id: ID(2) }]);
  });

  it("UT-ADCHK-024 Upsert guard: a status write on a task deleted meanwhile is refused (RecordGoneError), never upserted", async () => {
    guardedSdk.gone.add(ID(1));
    await expect(runPlan(planSetActive(ID(1), false, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    expect(updates()).toEqual([]);
  });

  it("UT-ADCHK-024b the edit and the toggle are guarded too, and the gone text is unchanged", async () => {
    guardedSdk.gone.add(ID(1));
    const error = await runPlan(planUpdateTask(ID(1), FORM, TAB, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as Error).message).toBe(`Update checklist item failed: ${TASKS} row ${ID(1)} no longer exists`);
    await expect(runPlan(planToggleCompletion({ id: ID(1), isCompletionDate: null }, admin), "t"))
      .rejects.toBeInstanceOf(RecordGoneError);
    expect(updates()).toEqual([]);
  });
});

describe("The out-of-scope refusal stays inside the plan", () => {
  const refusals: [string, WritePlan][] = [
    ["updateTask", planUpdateTask(ID(1), FORM, TAB, { canEdit: false })],
    ["toggleCompletion", planToggleCompletion({ id: ID(1), isCompletionDate: null }, { canEdit: false })],
    ["setActive", planSetActive(ID(1), true, { canEdit: false })],
  ];

  it.each(refusals)("UT-ADCHK-W08 %s without admin access: refused with the screen's message, nothing sent", async (_name, plan) => {
    expect(plan).toEqual({ writes: [], log: [], refusedReason: OUT_OF_SCOPE_MESSAGE });
    const error = await runPlan(plan, "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRefusedError);
    expect((error as Error).message).toBe(
      "This country is outside your editable country scope, so the checklist is read-only.",
    );
    expect(guardedSdk.log).toEqual([]);
  });
});
