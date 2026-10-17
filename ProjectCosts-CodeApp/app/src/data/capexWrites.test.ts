/**
 * V-1 (shared, `09-upsert-risk.md` P1-P3): CAPEX single-row updates go through
 * `updateRecordIfExists`. Another user's contract save deletes `vsb_capexcosts` rows, and the
 * SDK 1.3.1's If-Match-less PATCH would otherwise recreate a deleted month / contract as a partial row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const log: string[] = [];

vi.mock("@microsoft/power-apps/data", async () => (await import("./testing/guardedSdkFake")).sdkModule);
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    create: async () => { log.push("create cost"); return { success: true, data: { vsb_capexcostid: "new" } }; },
    delete: async (id: string) => { log.push(`delete cost ${id}`); },
    update: async () => { throw new Error("unguarded update must not be used"); },
  },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    create: async () => { log.push("create contract"); return { success: true, data: { vsb_capexprojectcontractid: "new" } }; },
    delete: async () => undefined,
    update: async () => { throw new Error("unguarded update must not be used"); },
  },
}));
vi.mock("./comments", () => ({
  loadComments: async () => [],
  deleteComment: async () => undefined,
}));

import { guardedSdk, resetGuardedSdk } from "./testing/guardedSdkFake";
import { RecordGoneError } from "@/platform/errors";

const { saveCostLine, setCostPaid } = await import("./capexWrites");

const PROJECT = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const ACCOUNT = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d21";
const CONTRACT = "54b5d3fd-d9b0-f111-aaac-7ced8d15d85e";
const JAN = "c0570001-0000-4000-8000-000000000001";
const FEB = "c0570002-0000-4000-8000-000000000002";

const line = {
  id: CONTRACT,
  description: "Grid connection",
  payer: "DevCo",
  vat: false,
  depreciation: false,
  distribution: "individual",
  distributionScheme: "absolute",
  frequency: 1,
  standard: false,
  payments: [
    { id: JAN, year: 2026, month: 1, amount: 100, paid: true },
    { id: FEB, year: 2026, month: 2, amount: 200, paid: true },
  ],
} as never;

const payments = [
  { id: JAN, year: 2026, month: 1, amount: 150 },
  { id: FEB, year: 2026, month: 2, amount: 250 },
];

const args = { line, accountId: ACCOUNT, projectId: PROJECT, payments, isNew: false };

beforeEach(() => {
  resetGuardedSdk();
  log.length = 0;
  guardedSdk.onUpdate = (u) => { log.push(`update ${u.table} ${u.id}`); };
});

describe("setCostPaid — V-1 guard (P1)", () => {
  it("UT-CAPEXW-V1-001 a month row deleted meanwhile: nothing sent, RecordGoneError", async () => {
    guardedSdk.gone.add(JAN);
    const error = await setCostPaid(JAN, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
  });

  it("UT-CAPEXW-V1-002 an existing month row is checked, then PATCHed", async () => {
    await setCostPaid(JAN, true);
    expect(guardedSdk.reads).toEqual([{ table: "vsb_capexcosts", id: JAN }]);
    expect(guardedSdk.updates).toEqual([{ table: "vsb_capexcosts", id: JAN, body: { vsb_costpaid: true } }]);
  });
});

describe("saveCostLine — V-1 guard (P2 / P3)", () => {
  it("UT-CAPEXW-V1-003 a contract deleted meanwhile: NOTHING is written (contract PATCH runs first)", async () => {
    guardedSdk.gone.add(CONTRACT);
    const error = await saveCostLine(args).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(guardedSdk.updates).toEqual([]);
    expect(log).toEqual([]);
  });

  it("UT-CAPEXW-V1-004 a month row deleted meanwhile fails the save instead of being recreated", async () => {
    guardedSdk.gone.add(FEB);
    const error = await saveCostLine(args).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordGoneError);
    expect(log).toEqual([
      `update vsb_capexprojectcontracts ${CONTRACT}`,
      `update vsb_capexcosts ${JAN}`,
    ]);
  });

  it("UT-CAPEXW-V1-005 existing rows: contract then each month checked and PATCHed", async () => {
    await saveCostLine(args);
    expect(guardedSdk.reads.map((r) => r.id)).toEqual([CONTRACT, JAN, FEB]);
    expect(log).toEqual([
      `update vsb_capexprojectcontracts ${CONTRACT}`,
      `update vsb_capexcosts ${JAN}`,
      `update vsb_capexcosts ${FEB}`,
    ]);
  });

  it("UT-CAPEXW-V1-006 the relink reset SKIPS a paid month deleted meanwhile (nothing to unpay)", async () => {
    guardedSdk.gone.add(JAN);
    const saved = await saveCostLine({
      ...args, payments: [{ id: FEB, year: 2026, month: 2, amount: 250 }],
      resetPaidAndPaymentDateComments: true,
    });
    expect(saved).toBe(CONTRACT);
    expect(log).toEqual([
      `update vsb_capexprojectcontracts ${CONTRACT}`,
      `update vsb_capexcosts ${FEB}`, // unpaid
      `update vsb_capexcosts ${FEB}`, // new amount
    ]);
    expect(guardedSdk.updates.some((u) => u.id === JAN)).toBe(false);
  });
});
