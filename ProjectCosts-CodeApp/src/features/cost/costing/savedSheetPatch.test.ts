/**
 * `applySavedSheetToBook` — the DEVEX/CAPEX book as a successful Add Cost from Table Save left it
 * (D51 §11.19, CA-13). The optimistic patch the hook writes before the screen navigates back.
 */
import { describe, expect, it } from "vitest";
import { applySavedSheetToBook } from "./savedSheetPatch";
import type { CostBook, CostLine } from "./model";
import type { SavedContract, SavedContractColumns, SavedSheetChanges } from "@/data/bulkTypes";

const line = (over: Partial<CostLine> = {}): CostLine => ({
  id: "c-1", accountId: "sub-1", description: "Stored label", payer: "SPV", depreciation: false,
  vat: false, standard: true, distribution: "equal", equalMode: "dates",
  distributionScheme: "percent", startDate: "2026-01-01", endDate: "2026-12-01", frequency: 3,
  clusters: [2], comments: ["note"], totalCost: 150, standardAssumptionId: "sa-1",
  linkedClusterId: "ps-3", linkedClusterName: "Cluster 3", linkedClusterOrder: 3,
  payments: [
    { id: "k-1", year: 2026, month: 1, amount: 100, paid: true },
    { id: "k-2", year: 2026, month: 2, amount: 50, paid: false },
  ],
  ...over,
});

const book = (lines: CostLine[] = [line()]): CostBook => ({
  accounts: [
    { id: "acc-1", number: "80000", name: "Turbines", category: 0 },
    { id: "sub-1", number: "80000_0", name: "Turbine supply", parentId: "acc-1", category: 0 },
  ],
  lines, periods: [], extraGroups: { om: [], land: [], other: [] },
});

const changes = (over: Partial<SavedSheetChanges> = {}): SavedSheetChanges => ({
  contracts: [], costs: [], deletedContractIds: [], deletedCostIds: [], ...over,
});

const NEW_COLUMNS: SavedContractColumns = {
  subaccountId: "sub-1", name: "New contract ", payer: "DevCo", depreciation: true, vat: true,
  distribution: "individual", distributionScheme: "absolute",
};
const NEW_CONTRACT: SavedContract = { id: "n-1", isNew: true, totalCost: 30, columns: NEW_COLUMNS };

/** The book's category is 0 (Wind Turbine / Panels), as the fixture's accounts are. */
const apply = (b: CostBook, c: SavedSheetChanges, category = 0) => applySavedSheetToBook(b, c, category);

describe("applySavedSheetToBook", () => {
  it("UT-SHEETPATCH-001 nothing applied: the book itself comes back", () => {
    const b = book();
    expect(apply(b, changes())).toBe(b);
    // A no-op cell (same value) and an unchanged total change nothing either.
    expect(apply(b, changes({
      contracts: [{ id: "c-1", isNew: false, totalCost: 150, columns: null }],
      costs: [{ id: "k-1", contractId: "c-1", year: 2026, month: 1, amount: 100, isNew: false }],
    }))).toBe(b);
  });

  it("UT-SHEETPATCH-002 a removed contract's line goes (deferred or not, the patch does not care)", () => {
    const b = book([line(), line({ id: "c-2" })]);
    const out = apply(b, changes({ deletedContractIds: ["C-2"] }));
    expect(out.lines.map((l) => l.id)).toEqual(["c-1"]);
    expect(b.lines).toHaveLength(2); // pure
  });

  it("UT-SHEETPATCH-003 a cleared cell's payment goes; the rest of the line is untouched", () => {
    const out = apply(book(), changes({ deletedCostIds: ["k-2"] }));
    expect(out.lines[0]?.payments.map((p) => p.id)).toEqual(["k-1"]);
    expect(out.lines[0]?.totalCost).toBe(150);
  });

  it("UT-SHEETPATCH-004 an updated cell keeps its id and paid flag and takes the new amount", () => {
    const out = apply(book(), changes({
      costs: [{ id: "k-1", contractId: "c-1", year: 2026, month: 1, amount: 200, isNew: false }],
    }));
    expect(out.lines[0]?.payments[0]).toEqual({ id: "k-1", year: 2026, month: 1, amount: 200, paid: true });
  });

  it("UT-SHEETPATCH-005 a created cell is added unpaid, in year-month order", () => {
    const out = apply(book(), changes({
      costs: [
        { id: "k-new-2027", contractId: "c-1", year: 2027, month: 1, amount: 7, isNew: true },
        { id: "k-new", contractId: "c-1", year: 2025, month: 12, amount: 5, isNew: true },
      ],
    }));
    expect(out.lines[0]?.payments.map((p) => [p.id, p.year, p.month, p.amount, p.paid])).toEqual([
      ["k-new", 2025, 12, 5, false],
      ["k-1", 2026, 1, 100, true],
      ["k-2", 2026, 2, 50, false],
      ["k-new-2027", 2027, 1, 7, false],
    ]);
  });

  it("UT-SHEETPATCH-006 a created cell replaces a stale cached payment on the same month", () => {
    const out = apply(book(), changes({
      costs: [{ id: "k-fresh", contractId: "c-1", year: 2026, month: 2, amount: 9, isNew: true }],
    }));
    expect(out.lines[0]?.payments.map((p) => p.id)).toEqual(["k-1", "k-fresh"]);
  });

  it("UT-SHEETPATCH-007 an update of a row the cached book never saw is left to the refetch (paid unknown)", () => {
    const b = book();
    expect(apply(b, changes({
      costs: [{ id: "k-unseen", contractId: "c-1", year: 2026, month: 5, amount: 1, isNew: false }],
    }))).toBe(b);
  });

  it("UT-SHEETPATCH-008 a created cell whose id the book already holds (a retry) is an update by id", () => {
    const out = apply(book(), changes({
      costs: [{ id: "K-2", contractId: "c-1", year: 2026, month: 2, amount: 51, isNew: true }],
    }));
    expect(out.lines[0]?.payments.map((p) => [p.id, p.amount, p.paid])).toEqual([["k-1", 100, true], ["k-2", 51, false]]);
  });

  it("UT-SHEETPATCH-009 a contract's total is the saved one, not the sum of payments", () => {
    const out = apply(book(), changes({
      contracts: [{ id: "c-1", isNew: false, totalCost: 300, columns: null }],
    }));
    expect(out.lines[0]?.totalCost).toBe(300);
    expect(out.lines[0]?.payer).toBe("SPV"); // columns null: nothing else moves
  });

  it("UT-SHEETPATCH-010 written columns update payer, VAT, depreciation and distribution; description, account, standard, clusters and the link are left alone", () => {
    const out = apply(book(), changes({
      contracts: [{
        id: "c-1", isNew: false, totalCost: 150,
        columns: { ...NEW_COLUMNS, subaccountId: "sub-other", name: "Renamed" },
      }],
    }));
    const l = out.lines[0] as CostLine;
    expect([l.payer, l.vat, l.depreciation, l.distribution, l.distributionScheme])
      .toEqual(["DevCo", true, true, "individual", "absolute"]);
    expect([l.description, l.accountId, l.standard, l.equalMode, l.clusters, l.frequency, l.linkedClusterOrder, l.comments])
      .toEqual(["Stored label", "sub-1", true, "dates", [2], 3, 3, ["note"]]);
  });

  it("UT-SHEETPATCH-011 a contract this Save created is added as loadCostLines maps the stored row", () => {
    const out = apply(book(), changes({
      contracts: [NEW_CONTRACT],
      costs: [
        { id: "n-k2", contractId: "n-1", year: 2026, month: 3, amount: 20, isNew: true },
        { id: "n-k1", contractId: "n-1", year: 2026, month: 1, amount: 10, isNew: true },
      ],
    }));
    expect(out.lines.map((l) => l.id)).toEqual(["c-1", "n-1"]);
    expect(out.lines[1]).toEqual({
      id: "n-1", accountId: "sub-1",
      // `contractLabel(undefined, vsb_name)` trims.
      description: "New contract",
      payer: "DevCo", depreciation: true, vat: true, standard: false,
      distribution: "individual", distributionScheme: "absolute",
      // Blank JSON columns: no clusters, no dates, so By Cluster (`resolveEqualMode`).
      equalMode: "cluster", startDate: "", endDate: "", frequency: 1, clusters: [],
      payments: [
        { id: "n-k1", year: 2026, month: 1, amount: 10, paid: false },
        { id: "n-k2", year: 2026, month: 3, amount: 20, paid: false },
      ],
      comments: [], totalCost: 30,
    });
  });

  it("UT-SHEETPATCH-012 a created contract under a sub-account outside this book is not added", () => {
    const b = book();
    expect(apply(b, changes({
      contracts: [{ ...NEW_CONTRACT, columns: { ...NEW_COLUMNS, subaccountId: "sub-elsewhere" } }],
    }))).toBe(b);
  });

  it("UT-SHEETPATCH-016 a created contract under a KNOWN sub-account of another category is not added (the book holds the whole chart)", () => {
    const b: CostBook = {
      ...book(),
      accounts: [...book().accounts, { id: "sub-devex", number: "81000_0", name: "Planning", parentId: "acc-2", category: 1 }],
    };
    const created = { ...NEW_CONTRACT, columns: { ...NEW_COLUMNS, subaccountId: "sub-devex" } };
    expect(apply(b, changes({ contracts: [created] }))).toBe(b);
    // The same save patched into the book of category 1 does add it.
    expect(apply(b, changes({ contracts: [created] }), 1).lines.map((l) => l.id)).toEqual(["c-1", "n-1"]);
  });

  it("UT-SHEETPATCH-013an existing contract missing from the cached book is not invented", () => {
    const b = book();
    expect(apply(b, changes({
      contracts: [{ ...NEW_CONTRACT, isNew: false }, { id: "c-9", isNew: false, totalCost: 1, columns: null }],
    }))).toBe(b);
  });

  it("UT-SHEETPATCH-014 a created contract the book already holds (a retry the refetch saw) is updated, not duplicated", () => {
    const out = apply(book([line(), line({ id: "n-1", payments: [] })]), changes({
      contracts: [NEW_CONTRACT],
      costs: [{ id: "n-k1", contractId: "n-1", year: 2026, month: 1, amount: 10, isNew: true }],
    }));
    expect(out.lines.map((l) => l.id)).toEqual(["c-1", "n-1"]);
    expect(out.lines[1]?.payments.map((p) => p.id)).toEqual(["n-k1"]);
    expect(out.lines[1]?.totalCost).toBe(30);
  });

  it("UT-SHEETPATCH-015 a whole save at once: delete, clear, update, create, new contract", () => {
    const b = book([line(), line({ id: "doomed" })]);
    const out = apply(b, changes({
      contracts: [{ id: "c-1", isNew: false, totalCost: 210, columns: null }, NEW_CONTRACT],
      costs: [
        { id: "k-1", contractId: "c-1", year: 2026, month: 1, amount: 200, isNew: false },
        { id: "k-3", contractId: "c-1", year: 2026, month: 4, amount: 10, isNew: true },
        { id: "n-k1", contractId: "n-1", year: 2026, month: 1, amount: 30, isNew: true },
      ],
      deletedContractIds: ["doomed"],
      deletedCostIds: ["k-2"],
    }));
    expect(out.lines.map((l) => [l.id, l.totalCost, l.payments.map((p) => `${p.id}:${p.amount}`)])).toEqual([
      ["c-1", 210, ["k-1:200", "k-3:10"]],
      ["n-1", 30, ["n-k1:30"]],
    ]);
    expect(out.accounts).toBe(b.accounts);
  });
});
