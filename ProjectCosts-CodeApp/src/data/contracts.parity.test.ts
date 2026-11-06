/**
 * UT-CONTR — the Contracts data layer's Canvas-parity fixes of test run 3.
 *
 * CONTR-091: the Project Rights Save writes seven columns only (`Contracts Screen.pa.yaml:3744-3759`).
 * CONTR-081: a refused DevCo link create must reach the save's error handling, not vanish.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@/generated/services/Vsb_bopcontractsdevcocostsesService", () => ({
  Vsb_bopcontractsdevcocostsesService: {
    create: (...args: unknown[]) => create(...args),
    getAll: vi.fn(),
  },
}));

import { DataError } from "@/platform/errors";
import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/cost/contracts/rules";
import { replaceDevCoLinks, rightsContractPayload, type ContractWrite } from "./contracts";

const rights: ContractWrite = {
  projectId: "11111111-1111-1111-1111-111111111111",
  owningBusinessUnitId: "22222222-2222-2222-2222-222222222222",
  name: "BoP RC-P-1-",
  description: " Land rights ",
  contractType: CONTRACT_TYPE.ProjectRights,
  closingDate: new Date(2026, 8, 18),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
  totalCostsOverwrite: 5000,
  margin: false,
  totalCostOfContract: 5000,
  comment: "should not be written",
  isMarginStandardAssumption: true,
};

describe("Project Rights contract payload (CONTR-091)", () => {
  it("UT-CONTR-080 writes exactly the seven canvas columns", () => {
    const payload = rightsContractPayload(rights) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "owningbusinessunit@odata.bind",
      "vsb_Project@odata.bind",
      "vsb_closingdate",
      "vsb_contracttypes",
      "vsb_description",
      "vsb_name",
      "vsb_totalcostofcontract",
    ]);
    expect(payload.vsb_name).toBe("BoP RC-P-1-");
    expect(payload.vsb_totalcostofcontract).toBe(5000);
    expect(payload.vsb_closingdate).toBe("2026-09-18");
  });

  it("UT-CONTR-081 binds the owning BU on create only", () => {
    const update = rightsContractPayload({ ...rights, id: "c-1" }) as Record<string, unknown>;
    expect(update["owningbusinessunit@odata.bind"]).toBeUndefined();
  });
});

describe("DevCo link create (CONTR-081)", () => {
  beforeEach(() => create.mockReset());

  it("UT-CONTR-082 a refused link create rejects, so the save shows its error", async () => {
    create.mockResolvedValue({ success: false, error: { message: "403 Forbidden", status: 403 } });
    await expect(replaceDevCoLinks({
      contractId: "c-1", isNewContract: true, accounts: [{ id: "a-1", name: "80000-Turbines" }],
    })).rejects.toBeInstanceOf(DataError);
  });

  it("UT-CONTR-083 an accepted create resolves", async () => {
    create.mockResolvedValue({ success: true, data: { vsb_bopcontractsdevcocostsid: "x" } });
    await expect(replaceDevCoLinks({
      contractId: "c-1", isNewContract: true, accounts: [{ id: "a-1", name: "80000-Turbines" }],
    })).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
  });
});
