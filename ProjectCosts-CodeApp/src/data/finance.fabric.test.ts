import { beforeEach, describe, expect, it, vi } from "vitest";

const debtGetAll = vi.fn();
const banksGetAll = vi.fn();
const kfwGetAll = vi.fn();
vi.mock("@/generated/services/AssumptionsDebtService", () => ({
  AssumptionsDebtService: { getAll: (o: unknown) => debtGetAll(o) },
}));
vi.mock("@/generated/services/AssumptionsBanksService", () => ({
  AssumptionsBanksService: { getAll: (o: unknown) => banksGetAll(o) },
}));
vi.mock("@/generated/services/AssumptionsKfWTrancheService", () => ({
  AssumptionsKfWTrancheService: { getAll: (o: unknown) => kfwGetAll(o) },
}));

import { listBanks, listDebtAssumptions, listKfwTranches } from "./finance";
import { sliceDebtAssumptions } from "@/features/pm/finance/rules";

beforeEach(() => { debtGetAll.mockReset(); banksGetAll.mockReset(); kfwGetAll.mockReset(); });

describe("Finance Fabric SQL loaders (3 Nov 2026)", () => {
  it("UT-FIN-DATA-001 debt: the project country's rows, a $select, blanks mapped; split by debttype", async () => {
    debtGetAll.mockResolvedValueOnce({
      success: true,
      data: [
        { country: "Germany", debttype: "debt facility", category: "tenor", wind: "18", pv: "20" },
        { country: "Germany", debttype: "DSCR", category: "dscr p50", wind: "1.15" },
        { country: "Germany", debttype: "decommissioning costs", category: "value", wind: "80000" },
        { country: "Germany", debttype: "DSRA", wind: "6" },
        { country: "Poland", debttype: "debt facility", category: "tenor", wind: "15" },
      ],
    });
    const rows = await listDebtAssumptions("Germany");
    const options = debtGetAll.mock.calls[0]![0] as Record<string, unknown>;
    expect(options["select"]).toEqual(["country", "debttype", "category", "pv", "wind"]);
    expect(options["filter"]).toBe("country eq 'Germany'");
    // The country is re-checked in case the connector ignores the filter.
    expect(rows.map((r) => r.country)).toEqual(["Germany", "Germany", "Germany", "Germany"]);
    expect(rows[3]).toEqual({ country: "Germany", debttype: "DSRA", category: "", wind: "6", pv: null });
    const slices = sliceDebtAssumptions(rows);
    expect([slices.debt.length, slices.decommissioning.length, slices.dsra.length]).toEqual([2, 1, 1]);
  });

  it("UT-FIN-DATA-002 banks: the whole table as { id, bankname }; rows without an id are dropped", async () => {
    banksGetAll.mockResolvedValueOnce({
      success: true,
      data: [{ id: "7", bankname: "Deutsche Kreditbank (DKB)" }, { id: "other-id-123", bankname: "Other" }, { bankname: "no id" }],
    });
    expect(await listBanks()).toEqual([
      { id: "7", bankname: "Deutsche Kreditbank (DKB)" }, { id: "other-id-123", bankname: "Other" },
    ]);
    expect((banksGetAll.mock.calls[0]![0] as Record<string, unknown>)["select"]).toEqual(["id", "bankname"]);
  });

  it("UT-FIN-DATA-003 KfW: the loantenor_repayfreeperiod_ratefixing values in table order, blanks dropped", async () => {
    kfwGetAll.mockResolvedValueOnce({
      success: true,
      data: [
        { loantenor_repayfreeperiod_ratefixing: "20 / 3 / 10" }, { loantenor_repayfreeperiod_ratefixing: "" },
        { loantenor_repayfreeperiod_ratefixing: "10 / 2 / 10" },
      ],
    });
    expect(await listKfwTranches()).toEqual(["20 / 3 / 10", "10 / 2 / 10"]);
  });

  it("UT-FIN-DATA-004 a failed Fabric read throws (the Screen then withholds the Fabric seeds)", async () => {
    debtGetAll.mockResolvedValueOnce({ success: false, error: new Error("no connection") });
    await expect(listDebtAssumptions("Germany")).rejects.toThrow();
  });
});
