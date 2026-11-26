/**
 * UT-CONTR-180..184 — editing a contract or a payment target another user deleted must not re-create it.
 *
 * The SDK (1.3.1) sends an update as `PATCH <set>(<id>)` without `If-Match`, which Dataverse treats as an upsert. The
 * real `saveContract` / `savePaymentTarget` run here against a mocked SDK client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
}));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => client }));

import { RecordGoneError } from "@/platform/errors";
import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/cost/contracts/rules";
import { savePaymentTarget, saveContract, type ContractWrite, type PaymentTargetWrite } from "./contracts";

const CONTRACT_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_ID = "44444444-4444-4444-4444-444444444444";
const BU = "22222222-2222-2222-2222-222222222222";

const write: ContractWrite = {
  projectId: "11111111-1111-1111-1111-111111111111",
  owningBusinessUnitId: BU,
  name: "BoP-P-1-Grid",
  description: "Grid",
  contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 8, 18),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated,
  margin: false,
  totalCostOfContract: 1,
  comment: "",
  isMarginStandardAssumption: false,
};
const target: PaymentTargetWrite = {
  contractId: CONTRACT_ID, owningBusinessUnitId: BU, name: "BoP-PT-x", description: "x",
  paymentDate: "01/2027", totalCostsContract: 10, note: "",
};

const row = (key: string, id: string) => ({ success: true, data: { [key]: id } });

beforeEach(() => {
  Object.values(client).forEach((fn) => fn.mockReset());
  client.createRecordAsync.mockImplementation(async () => row("vsb_bopprojectscontractsid", "new"));
});

describe("editing a row another user deleted", () => {
  it("UT-CONTR-180 a contract update reads the row first and is refused with nothing sent when it is gone", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] });
    await expect(saveContract({ ...write, id: CONTRACT_ID })).rejects.toBeInstanceOf(RecordGoneError);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
    expect(client.createRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-181 a contract update of an existing row sends one PATCH and returns the mapped contract", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true, data: [{ vsb_bopprojectscontractsid: CONTRACT_ID }],
    });
    client.updateRecordAsync.mockResolvedValue(row("vsb_bopprojectscontractsid", CONTRACT_ID));
    const saved = await saveContract({ ...write, id: CONTRACT_ID });
    expect(saved.id).toBe(CONTRACT_ID);
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(1);
    const payload = client.updateRecordAsync.mock.calls[0]![2] as Record<string, unknown>;
    expect("owningbusinessunit@odata.bind" in payload).toBe(false);
  });

  it("UT-CONTR-182 a contract CREATE does not read first and still binds the owning business unit", async () => {
    await saveContract(write);
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    const payload = client.createRecordAsync.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BU})`);
  });

  it("UT-CONTR-183 a payment-target update of a deleted row is refused, nothing sent", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] });
    await expect(savePaymentTarget({ ...target, id: TARGET_ID })).rejects.toBeInstanceOf(RecordGoneError);
    expect(client.updateRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-184 a PATCH refused with 404 after the read (a late delete) is reported as 'gone' too", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true, data: [{ vsb_bopcontractspaymenttargetsid: TARGET_ID }],
    });
    client.updateRecordAsync.mockResolvedValue({ success: false, error: { message: "Not Found", status: 404 } });
    await expect(savePaymentTarget({ ...target, id: TARGET_ID })).rejects.toBeInstanceOf(RecordGoneError);
  });
});

describe("the BoP standard assumption lookup", () => {
  it("UT-CONTR-212 asks for the oldest match first, so two matching rows always give the same seed", async () => {
    const { findBopStandardAssumption } = await import("./contracts");
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [{ vsb_bopcontractsstandardassumptionsid: "a1" }] });
    const row = await findBopStandardAssumption({ countryId: "55555555-5555-5555-5555-555555555555", technology: 1, contractType: CONTRACT_TYPE.Development });
    expect(row).toEqual({ vsb_bopcontractsstandardassumptionsid: "a1" });
    const options = client.retrieveMultipleRecordsAsync.mock.calls[0]![1] as { orderBy?: string[]; top?: number };
    expect(options.orderBy).toEqual(["createdon asc"]);
    expect(options.top).toBe(1);
  });
});
describe("dvopt — a contract create that landed but looked failed (CB-14)", () => {
  const sentIds = () => client.createRecordAsync.mock.calls.map((c) => (c[1] as Record<string, unknown>)["vsb_bopprojectscontractsid"]);

  it("UT-CONTRDVOPT-001 the create carries a client id that a retry of the same save keeps", async () => {
    const { resetStableCreateIds } = await import("./stableCreateId");
    resetStableCreateIds();
    client.createRecordAsync.mockResolvedValueOnce({ success: false, error: { message: "gateway timeout", status: 504 } });
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] }); // the read-back: not there
    await expect(saveContract(write)).rejects.toThrow();
    const saved = await saveContract(write);
    expect(sentIds()).toHaveLength(2);
    expect(sentIds()[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sentIds()[1]).toBe(sentIds()[0]);
    expect(saved.id).toBe("new"); // the mock's own answer wins when the server issues another id
  });

  it("UT-CONTRDVOPT-002 when the first POST had landed, the retry reads the contract back and creates NO second one", async () => {
    const { resetStableCreateIds } = await import("./stableCreateId");
    resetStableCreateIds();
    client.createRecordAsync.mockResolvedValueOnce({ success: false, error: { message: "gateway timeout", status: 504 } });
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [] });
    await expect(saveContract(write)).rejects.toThrow();
    const landed = String(sentIds()[0]);
    // The row exists after all: the existence read-back and the row read both find it.
    client.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true, data: [{ vsb_bopprojectscontractsid: landed, vsb_name: "BoP-P-1-Grid" }],
    });
    const saved = await saveContract(write);
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(saved.id).toBe(landed);
    expect(saved.name).toBe("BoP-P-1-Grid");
  });

  it("UT-CONTRDVOPT-003 a first attempt reads nothing, and an update is untouched by the stable id (UT-CONTR-181/182 still hold)", async () => {
    const { resetStableCreateIds } = await import("./stableCreateId");
    resetStableCreateIds();
    await saveContract(write);
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    const payload = client.createRecordAsync.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BU})`);
  });
});
