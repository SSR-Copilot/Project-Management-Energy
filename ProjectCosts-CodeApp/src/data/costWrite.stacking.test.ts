/**
 * QB-01 / QB-02: ONE retry layer per request in the Cost writes. `costWrite` (`costWritePolicy.ts`) wraps helpers that used to run their own
 * `sendWithPolicy` (`deleteIfExists`, `deleteRecord`, `updateRecordIfExists`), so a persistent failure multiplied the tries (3 x 3, 4 x 4).
 * These tests use the REAL client helpers over a mocked SDK client and COUNT the requests of one row for a persistent failure, with the
 * wait and the jitter injected (nothing sleeps): 503 at most 3 tries, 429 at most 4, a 500 on a create exactly 1, and with
 * `COST_WRITES_POLICY` off exactly 1 (the old behaviour).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
}));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => client }));
const flags = vi.hoisted(() => ({ policy: true }));
vi.mock("./leaseOpexFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./leaseOpexFlags")>()),
  get COST_WRITES_POLICY() { return flags.policy; },
  STABLE_CREATE_IDS: false,
}));

import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/cost/contracts/rules";
import type { CostPeriod } from "@/features/cost/costing/model";
import { LEASE_ENTITY_SET } from "@/features/cost/periods/landLeaseRules";
import { deleteContract, deletePaymentTarget, saveContract, savePaymentTarget, type ContractWrite, type PaymentTargetWrite } from "./contracts";
import { applyLeaseWrites } from "./landLease";
import { deleteOpexPeriod } from "./periodWrites";
import { setPolicyTestSeams } from "./requestPolicy";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown) => ({ success: true, data });
const refused = (status: number) => ({ success: false, error: { message: `HTTP ${status}`, status } });
const waits: number[] = [];

const write: ContractWrite = {
  projectId: id(9), owningBusinessUnitId: id(2), name: "BoP-P-1-Grid", description: "Grid", contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 8, 18), costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated, margin: false, totalCostOfContract: 1, comment: "", isMarginStandardAssumption: false,
};
const target: PaymentTargetWrite = {
  contractId: id(1), owningBusinessUnitId: id(2), name: "BoP-PT-x", description: "x", paymentDate: "01/2027", totalCostsContract: 10, note: "",
};

beforeEach(() => {
  flags.policy = true;
  waits.length = 0;
  Object.values(client).forEach((fn) => fn.mockReset());
  client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([]));
  setPolicyTestSeams({ sleep: async (ms: number) => { waits.push(ms); }, random: () => 0.5 });
});
afterEach(() => { setPolicyTestSeams(null); });

const leaseDelete = () => applyLeaseWrites([{ op: "delete", entitySet: LEASE_ENTITY_SET.period, id: id(7) }]);
const opexHead = { id: id(8) } as unknown as CostPeriod;

/** Every family that deletes a row through a helper that has a policy of its own. */
const DELETES: [string, () => Promise<unknown>][] = [
  ["Contracts deleteContract", () => deleteContract(id(1))],
  ["Contracts deletePaymentTarget", () => deletePaymentTarget(id(1))],
  ["Land Lease remove", leaseDelete],
  ["OPEX deleteOpexPeriod", () => deleteOpexPeriod(opexHead)],
];

describe("QB-01 one retry layer: a persistent failure is counted per row", () => {
  it.each(DELETES)("UT-COSTSTACK-001 %s: a persistent 503 sends the DELETE exactly 3 times, not 9", async (_name, run) => {
    client.deleteRecordAsync.mockResolvedValue(refused(503));
    await expect(run()).rejects.toBeDefined();
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
  });

  it.each(DELETES)("UT-COSTSTACK-002 %s: a persistent 429 sends the DELETE exactly 4 times, not 16", async (_name, run) => {
    client.deleteRecordAsync.mockResolvedValue(refused(429));
    await expect(run()).rejects.toBeDefined();
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(4);
    expect(waits).toHaveLength(3);
  });

  it.each(DELETES)("UT-COSTSTACK-003 %s: a 503 then success sends 2 requests and succeeds", async (_name, run) => {
    client.deleteRecordAsync.mockResolvedValueOnce(refused(503)).mockResolvedValue({ success: true });
    await expect(run()).resolves.not.toThrow();
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-COSTSTACK-004 a contract UPDATE (existence read + PATCH): a persistent 503 sends the PATCH 3 times, a persistent 429 4 times", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([{ vsb_bopprojectscontractsid: id(1) }]));
    client.updateRecordAsync.mockResolvedValue(refused(503));
    await expect(saveContract({ ...write, id: id(1) })).rejects.toBeDefined();
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(3);
    client.updateRecordAsync.mockReset();
    client.updateRecordAsync.mockResolvedValue(refused(429));
    await expect(saveContract({ ...write, id: id(1) })).rejects.toBeDefined();
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(4);
  });

  it("UT-COSTSTACK-005 a payment-target UPDATE: a persistent 503 sends the PATCH 3 times, not 9", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([{ vsb_bopcontractspaymenttargetsid: id(1) }]));
    client.updateRecordAsync.mockResolvedValue(refused(503));
    await expect(savePaymentTarget({ ...target, id: id(1) })).rejects.toBeDefined();
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(3);
  });

  it("UT-COSTSTACK-006 a CREATE answered 500 (or a network error) is sent exactly once; a 429 up to 4 times", async () => {
    client.createRecordAsync.mockResolvedValue(refused(500));
    await expect(savePaymentTarget(target)).rejects.toBeDefined();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    client.createRecordAsync.mockReset();
    client.createRecordAsync.mockRejectedValue(new Error("network"));
    await expect(savePaymentTarget(target)).rejects.toBeDefined();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    client.createRecordAsync.mockReset();
    client.createRecordAsync.mockResolvedValue(refused(429));
    await expect(savePaymentTarget(target)).rejects.toBeDefined();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(4);
  });
});

describe("QB-02 COST_WRITES_POLICY = false is a rollback: every refused write is sent ONCE", () => {
  beforeEach(() => { flags.policy = false; });

  it.each(DELETES)("UT-COSTSTACK-010 %s: a persistent 503 and a persistent 429 each send the DELETE once", async (_name, run) => {
    client.deleteRecordAsync.mockResolvedValue(refused(503));
    await expect(run()).rejects.toBeDefined();
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1);
    client.deleteRecordAsync.mockReset();
    client.deleteRecordAsync.mockResolvedValue(refused(429));
    await expect(run()).rejects.toBeDefined();
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1);
    expect(waits).toHaveLength(0);
  });

  it("UT-COSTSTACK-011 an UPDATE sends one existence read and one PATCH, and a failing read is not repeated", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([{ vsb_bopprojectscontractsid: id(1) }]));
    client.updateRecordAsync.mockResolvedValue(refused(503));
    await expect(saveContract({ ...write, id: id(1) })).rejects.toBeDefined();
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(1);
    expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
    client.retrieveMultipleRecordsAsync.mockReset();
    client.retrieveMultipleRecordsAsync.mockResolvedValue(refused(503));
    await expect(saveContract({ ...write, id: id(1) })).rejects.toBeDefined();
    expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
  });
});
