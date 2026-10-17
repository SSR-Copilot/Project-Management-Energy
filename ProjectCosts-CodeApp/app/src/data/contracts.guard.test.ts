/**
 * V-1 (shared, `09-upsert-risk.md` P5 / P6): editing a BoP project contract or a payment target
 * goes through `updateRecordIfExists`, so a row another user deleted is never recreated by the
 * SDK 1.3.1's If-Match-less (upsert) PATCH. Creates are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const created: { table: string; body: Record<string, unknown> }[] = [];

vi.mock("@microsoft/power-apps/data", async () => (await import("./testing/guardedSdkFake")).sdkModule);
vi.mock("@/generated/services/Vsb_bopprojectscontractsesService", () => ({
  Vsb_bopprojectscontractsesService: {
    create: async (body: Record<string, unknown>) => {
      created.push({ table: "vsb_bopprojectscontractses", body });
      return { success: true, data: { vsb_bopprojectscontractsid: "new", ...body } };
    },
    update: async () => { throw new Error("unguarded update must not be used"); },
  },
}));
vi.mock("@/generated/services/Vsb_bopcontractspaymenttargetsesService", () => ({
  Vsb_bopcontractspaymenttargetsesService: {
    create: async (body: Record<string, unknown>) => {
      created.push({ table: "vsb_bopcontractspaymenttargetses", body });
      return { success: true, data: { vsb_bopcontractspaymenttargetsid: "new", ...body } };
    },
    update: async () => { throw new Error("unguarded update must not be used"); },
  },
}));

import { guardedSdk, resetGuardedSdk } from "./testing/guardedSdkFake";
import { RecordGoneError } from "@/platform/errors";
import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/contracts/rules";

const { saveContract, savePaymentTarget } = await import("./contracts");

const PROJECT = "11111111-1111-1111-1111-111111111111";
const CONTRACT = "33333333-3333-3333-3333-333333333333";
const TARGET = "44444444-4444-4444-4444-444444444444";

const contract = {
  id: CONTRACT,
  projectId: PROJECT,
  name: "Development Contract - X",
  description: "X",
  contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 8, 18),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsUntilClosingPlan: 1,
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingPlan: 1,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated,
  totalCostsCalculated: 2,
  margin: false,
  totalCostOfContract: 2,
  comment: "",
  isMarginStandardAssumption: false,
};

const target = {
  id: TARGET,
  contractId: CONTRACT,
  name: "T",
  description: "T",
  paymentDate: "01/2027",
  totalCostsContract: 10,
  note: "",
};

beforeEach(() => {
  resetGuardedSdk();
  created.length = 0;
});

describe("saveContract — V-1 guard", () => {
  it("UT-CW-V1-001 a contract deleted meanwhile: nothing sent, RecordGoneError", async () => {
    guardedSdk.gone.add(CONTRACT);
    const error = await saveContract(contract).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
    expect(created).toEqual([]);
  });

  it("UT-CW-V1-002 an existing contract is checked, then PATCHed", async () => {
    await saveContract(contract);
    expect(guardedSdk.reads).toEqual([{ table: "vsb_bopprojectscontractses", id: CONTRACT }]);
    expect(guardedSdk.updates.map((u) => [u.table, u.id])).toEqual([["vsb_bopprojectscontractses", CONTRACT]]);
  });

  it("UT-CW-V1-003 a NEW contract is created without an existence read", async () => {
    await saveContract({ ...contract, id: undefined });
    expect(guardedSdk.reads).toEqual([]);
    expect(created.map((c) => c.table)).toEqual(["vsb_bopprojectscontractses"]);
  });
});

describe("savePaymentTarget — V-1 guard", () => {
  it("UT-CW-V1-004 a target deleted meanwhile: nothing sent, RecordGoneError", async () => {
    guardedSdk.gone.add(TARGET);
    const error = await savePaymentTarget(target).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
  });

  it("UT-CW-V1-005 an existing target is checked, then PATCHed", async () => {
    await savePaymentTarget(target);
    expect(guardedSdk.updates.map((u) => [u.table, u.id]))
      .toEqual([["vsb_bopcontractspaymenttargetses", TARGET]]);
  });
});
