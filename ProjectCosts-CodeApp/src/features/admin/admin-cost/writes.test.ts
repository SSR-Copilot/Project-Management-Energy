/**
 * Costs settings DEVEX writes, end to end through the REAL `runPlan` / `executePlan` /
 * `updateRecordIfExists` against the guarded SDK fake: exactly one request per action, the upsert
 * guard, the operation texts and the refusals the screen branches on.
 *
 * WIRE-EQUIVALENCE. The standard-cost save and delete used to be `saveDevexCost` /
 * `deleteDevexCost` in `@/data/adminCost`; each is now a one-write `WritePlan` (`./rules`).
 * `OLD_WIRE` is the request sequence those two functions sent, RECORDED from the code before it was
 * changed (the same guarded SDK fake, the same `DevexWrite`). Each test runs the new plan and
 * asserts the SAME sequence: method, entity set, id, body (JSON-compared, so key order counts too)
 * and the guard's existence read. UT-ADCOST-006..009, 021 and 022 moved here from
 * `@/data/adminCost.test.ts` with their assertions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@microsoft/power-apps/data", async () => (await import("@/test/guardedSdkFake")).sdkModule);

import { executePlan, PlanRefusedError } from "@/data/executePlan";
import { runPlan } from "@/data/runPlan";
import type { DevexWrite } from "@/data/adminCost";
import type { WritePlan } from "@/data/writePlan";
import { COST_UNIT, TECHNOLOGY } from "@/domain/costStandards";
import { DataError, RecordGoneError } from "@/platform/errors";
import { guardedSdk, NEW_ROW_ID, resetGuardedSdk } from "@/test/guardedSdkFake";
import { MSG } from "./constants";
import { devexPayload, planDeleteDevexCost, planSaveDevexCost } from "./rules";

const ROW = "11111111-1111-1111-1111-111111111111";
const COUNTRY = "22222222-2222-2222-2222-222222222222";
const CATEGORY = "33333333-3333-3333-3333-333333333333";
const SUBACCOUNT = "44444444-4444-4444-4444-444444444444";
const DEVEX = "vsb_devexcapexstandardassumptionses";
const admin = { canEdit: true } as const;

/** The `DevexWrite` the recording used — the same row UT-ADCOST-006 always wrote. */
const W: DevexWrite = {
  countryId: COUNTRY, countryName: "Poland", technology: TECHNOLOGY.wind, categoryId: CATEGORY,
  subaccountId: SUBACCOUNT, subaccountName: "Permits", descriptionInput: " Fees ",
  clusters: [true, false, false, false, true], unit: COST_UNIT.plnMw, costAmount: 1000,
  comment: " note ", costPaidBy: 952850002,
};

/** The field map exactly as the data layer sent it (recorded, key order included). */
const BODY = {
  vsb_name: "Standard Cost : Poland-Wind-Permits",
  vsb_cluster1: true,
  vsb_cluster2: false,
  vsb_cluster3: false,
  vsb_cluster4: false,
  vsb_cluster5: true,
  vsb_description: "Standard Permits - Fees",
  vsb_descriptioninput: "Fees",
  "vsb_Country@odata.bind": `/vsb_countries(${COUNTRY})`,
  vsb_technology: 952850000,
  vsb_unit: 952850004,
  vsb_applyvat: true,
  vsb_depreciation: true,
  vsb_distributionfrequency: 3,
  vsb_costamount: 1000,
  vsb_comment: "note",
  vsb_costpaidby: 952850002,
  "vsb_Subaccount@odata.bind": `/vsb_capexaccountlists(${SUBACCOUNT})`,
  "vsb_Category@odata.bind": `/vsb_capexaccountlists(${CATEGORY})`,
} as const;

/** Request sequences of the OLD data-layer functions, recorded before the move (golden-cost-wire). */
const OLD_WIRE = {
  "saveDevexCost.create": [{ method: "create", table: DEVEX, body: BODY }],
  "saveDevexCost.update": [
    { method: "read", table: DEVEX, id: ROW },
    { method: "update", table: DEVEX, id: ROW, body: BODY },
  ],
  deleteDevexCost: [{ method: "delete", table: DEVEX, id: ROW }],
} as const;

/** Failure texts of the OLD functions, recorded the same way (the `label` keeps them verbatim). */
const OLD_MESSAGES = {
  create: "create standard cost failed: HTTP 500",
  update: "update standard cost failed: HTTP 500",
  delete: "delete standard cost failed: HTTP 500",
  gone: `update standard cost failed: ${DEVEX} row ${ROW} no longer exists`,
  rule: "The sub-account of this cost is inactive; choose an active sub-account.",
} as const;

/** Runs a plan through the real executor and returns what reached the SDK, JSON-normalised. */
async function wireOf(plan: WritePlan): Promise<string> {
  resetGuardedSdk();
  await executePlan(plan, "wire test");
  return JSON.stringify(guardedSdk.log);
}
const golden = (key: keyof typeof OLD_WIRE) => JSON.stringify(OLD_WIRE[key]);
const messageOf = async (plan: WritePlan) =>
  ((await runPlan(plan, "ignored").catch((e: unknown) => e)) as Error).message;

beforeEach(() => resetGuardedSdk());

describe("Wire equivalence: each plan sends exactly what the data-layer function sent", () => {
  it("UT-ADCOST-W01 saveDevexCost create: one POST with the field map exactly as built (key order kept)", async () => {
    expect(await wireOf(planSaveDevexCost(W, admin))).toBe(golden("saveDevexCost.create"));
  });

  it("UT-ADCOST-W02 saveDevexCost update: existence read, then PATCH with the same body", async () => {
    expect(await wireOf(planSaveDevexCost({ ...W, id: ROW }, admin))).toBe(golden("saveDevexCost.update"));
  });

  it("UT-ADCOST-W03 deleteDevexCost: one DELETE and no read", async () => {
    expect(await wireOf(planDeleteDevexCost(ROW, admin))).toBe(golden("deleteDevexCost"));
  });

  it("UT-ADCOST-W04 the operation text of a failure is the one the data layer used (the label is verbatim)", async () => {
    guardedSdk.writeFails = 500;
    expect(await messageOf(planSaveDevexCost(W, admin))).toBe(OLD_MESSAGES.create);
    expect(await messageOf(planSaveDevexCost({ ...W, id: ROW }, admin))).toBe(OLD_MESSAGES.update);
    expect(await messageOf(planDeleteDevexCost(ROW, admin))).toBe(OLD_MESSAGES.delete);
  });

  it("UT-ADCOST-W05 a gone row reads exactly as before and is still a RecordGoneError", async () => {
    guardedSdk.gone.add(ROW);
    const error = await runPlan(planSaveDevexCost({ ...W, id: ROW }, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect((error as Error).message).toBe(OLD_MESSAGES.gone);
  });

  it("UT-ADCOST-W06 the create path still yields the new row's id (what the old saveDevexCost returned)", async () => {
    const { createdIds } = await runPlan(planSaveDevexCost(W, admin), "t");
    expect(createdIds).toEqual([NEW_ROW_ID]);
  });
});

describe("DEVEX writes (UT-ADCOST-006..009, relocated)", () => {
  const writes = () => guardedSdk.log.filter((r) => r.method !== "read");

  it("UT-ADCOST-006 Writes exactly the field map on create", async () => {
    const { createdIds } = await runPlan(planSaveDevexCost(W, admin), "t");
    expect(createdIds[0]).toBe(NEW_ROW_ID);
    expect(writes()[0]?.body).toEqual(BODY);
  });

  it("UT-ADCOST-007 Updates by id with the same body and surfaces a failure", async () => {
    await runPlan(planSaveDevexCost({ ...W, id: ROW }, admin), "t");
    expect(writes()[0]).toMatchObject({ method: "update", id: ROW, body: devexPayload(W) });
    guardedSdk.writeFails = 500;
    await expect(runPlan(planSaveDevexCost({ ...W, id: ROW }, admin), "t")).rejects.toBeInstanceOf(DataError);
  });

  it("UT-ADCOST-008 Upsert guard: an edit of a cost deleted meanwhile is refused with RecordGoneError and nothing is PATCHed", async () => {
    guardedSdk.gone.add(ROW);
    await expect(runPlan(planSaveDevexCost({ ...W, id: ROW }, admin), "t")).rejects.toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.reads).toEqual([{ table: DEVEX, id: ROW }]);
    expect(writes()).toEqual([]);
  });

  it("UT-ADCOST-009 Deletes with its result read (plug-in refusals surface) and writes no tracking row", async () => {
    await runPlan(planDeleteDevexCost(ROW, admin), "t");
    expect(writes()).toEqual([{ method: "delete", table: DEVEX, id: ROW }]);
  });
});

describe("Refusals stay inside the plan (UT-ADCOST-021/022, relocated)", () => {
  it("UT-ADCOST-021 Refuses to write a cost without a sub-account name — never 'Standard Cost : …-'", async () => {
    for (const bad of [{ ...W, subaccountName: " " }, { ...W, subaccountId: "" }, { ...W, categoryId: "" }]) {
      expect(planSaveDevexCost(bad, admin)).toEqual({ writes: [], log: [], refusedReason: MSG.subaccountInactive });
      expect(planSaveDevexCost({ ...bad, id: ROW }, admin).writes).toEqual([]);
    }
    const error = await runPlan(planSaveDevexCost({ ...W, subaccountName: " " }, admin), "t").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRefusedError);
    expect((error as Error).message).toBe(OLD_MESSAGES.rule);
    expect(guardedSdk.log).toEqual([]);
  });

  it("UT-ADCOST-022 A valid name never ends with '-' and the description has no double space", () => {
    const p = devexPayload({ ...W, subaccountName: "Permits", descriptionInput: "X" });
    expect(String(p["vsb_name"]).endsWith("-")).toBe(false);
    expect(String(p["vsb_description"])).not.toContain("Standard  - ");
  });

  it("UT-ADCOST-W07 without admin access both plans refuse with the screen's own message, nothing sent", async () => {
    const plans: [string, WritePlan][] = [
      ["save", planSaveDevexCost(W, { canEdit: false })],
      ["delete", planDeleteDevexCost(ROW, { canEdit: false })],
    ];
    for (const [, plan] of plans) {
      expect(plan).toEqual({ writes: [], log: [], refusedReason: MSG.noPermission });
      await expect(runPlan(plan, "t")).rejects.toBeInstanceOf(PlanRefusedError);
    }
    expect(guardedSdk.log).toEqual([]);
  });
});
