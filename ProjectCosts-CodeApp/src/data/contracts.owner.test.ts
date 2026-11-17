/**
 * UT-CONTR-235..238 — a create without an owning business unit is traced (RB-14, CONVENTIONS rule 4).
 *
 * The write still goes ahead; the warning shows as a `[VSB] ACTION` warn line and as a `warning` trace entry. The real
 * data functions run against a mocked SDK client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
}));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => client }));

import { traces } from "@/platform/telemetry";
import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/cost/contracts/rules";
import {
  replaceDevCoLinks, saveContract, savePaymentTarget, type ContractWrite, type PaymentTargetWrite,
} from "./contracts";

const BU = "22222222-2222-2222-2222-222222222222";
const write: ContractWrite = {
  projectId: "11111111-1111-1111-1111-111111111111",
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
  contractId: "33333333-3333-3333-3333-333333333333", name: "BoP-PT-x", description: "x",
  paymentDate: "01/2027", totalCostsContract: 10, note: "",
};

let warn: ReturnType<typeof vi.spyOn>;
const ownerWarnings = () => traces().filter((t) => t.severity === "warning" && /owning business unit/.test(t.message));
const warnedSets = () => ownerWarnings().map((t) => /create on (\w+)/.exec(t.message)?.[1]);

beforeEach(() => {
  Object.values(client).forEach((fn) => fn.mockReset());
  client.createRecordAsync.mockResolvedValue({ success: true, data: { vsb_bopprojectscontractsid: "new" } });
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("a create with no owning business unit is traced", () => {
  it("UT-CONTR-235 a new contract without one warns (trace entry and a [VSB] ACTION warn line) and is still written", async () => {
    const before = ownerWarnings().length;
    await saveContract(write);
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(ownerWarnings().length).toBe(before + 1);
    expect(warnedSets().at(-1)).toBe("vsb_bopprojectscontractses");
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[VSB\] ACTION create on vsb_bopprojectscontractses has no owning business unit/));
  });

  it("UT-CONTR-236 a new contract WITH one, and an update, do not warn", async () => {
    const before = ownerWarnings().length;
    await saveContract({ ...write, owningBusinessUnitId: BU });
    client.retrieveMultipleRecordsAsync.mockResolvedValue({ success: true, data: [{ vsb_bopprojectscontractsid: "33333333-3333-3333-3333-333333333333" }] });
    client.updateRecordAsync.mockResolvedValue({ success: true, data: { vsb_bopprojectscontractsid: "33333333-3333-3333-3333-333333333333" } });
    await saveContract({ ...write, id: "33333333-3333-3333-3333-333333333333" });
    expect(ownerWarnings().length).toBe(before);
  });

  it("UT-CONTR-237 a new payment target without one warns", async () => {
    client.createRecordAsync.mockResolvedValue({ success: true, data: { vsb_bopcontractspaymenttargetsid: "t-1" } });
    const before = ownerWarnings().length;
    await savePaymentTarget(target);
    expect(ownerWarnings().length).toBe(before + 1);
    expect(warnedSets().at(-1)).toBe("vsb_bopcontractspaymenttargetses");
  });

  it("UT-CONTR-238 DevCo links created without one warn once per save, and none when nothing is created", async () => {
    client.createRecordAsync.mockResolvedValue({ success: true, data: { vsb_bopcontractsdevcocostsid: "l-1" } });
    const before = ownerWarnings().length;
    await replaceDevCoLinks({
      contractId: "c-1", isNewContract: true, accounts: [{ id: "a1", name: "n1" }, { id: "a2", name: "n2" }],
    });
    expect(ownerWarnings().length).toBe(before + 1);
    expect(warnedSets().at(-1)).toBe("vsb_bopcontractsdevcocostses");
    await replaceDevCoLinks({ contractId: "c-1", isNewContract: true, accounts: [] });
    expect(ownerWarnings().length).toBe(before + 1);
  });
});
