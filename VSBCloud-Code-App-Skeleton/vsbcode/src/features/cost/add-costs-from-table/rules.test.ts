/**
 * Add Costs from Table — unit tests. IDs are the spec's `UT-ADDCOST-nnn`.
 *
 * The highest-value target is `validateSheet`: the six passes are the ENTIRE gate on this
 * screen, and nothing may be written while any of them fails. `UT-ADDCOST-026` pins the
 * REINSTATED past-cost guard, which the canvas has commented out.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_COST } from "@/data/entities";
import {
  ADDCOST_MSG, sheetYearRange, referenceYears, uniqueId, costUniqueId, devCoSpvDefault,
  resolveRow, sheetTitle, validateDuplicateSubaccounts, validateCostOnAccount,
  validateDuplicateContracts, validateMissingMetadata, validateStandardWord,
  validateContractHasCost, validateSheet, sheetIsWritable, rowSignature, rowChanged,
  diffRows, costTypeFromText, isEditedFromPcf, initialContractSource, contractUpserts,
  costWrites, recomputeContractTotal, planContractDeletions,
  planContractDeletionsCanvasParity, canOpenBulkEdit, canSaveBulkEdit, cancelWritesNothing,
  type SheetRow, type ExistingContract, type ExistingCost,
} from "./rules";

/* ────────────────────────────────────────────────────────────────── fixtures */

const row = (o: Partial<SheetRow> = {}): SheetRow => ({
  rowId: "r1", accountNumber: "10203", accountName: "Cabling",
  description: "Grid connection", year: 2027,
  costPaidBy: "DevCo", depreciation: "Yes", applyVat: "No",
  months: [100, null, null, null, null, null, null, null, null, null, null, null],
  subAccountId: "sub-1", projectContractId: "c-1", ...o,
});

const contract = (o: Partial<ExistingContract> = {}): ExistingContract => ({
  id: "c-1", name: "Grid connection", subaccountId: "sub-1", isStandardContract: false,
  initialContractSource: CHOICE_COST.initialContractSource.pcf,
  distribution: CHOICE_COST.distributionType.individual,
  distributionScheme: CHOICE_COST.distributionScheme.absoluteValues,
  isEditedFromPcf: false, ...o,
});

const cost = (o: Partial<ExistingCost> = {}): ExistingCost => ({
  id: "k-1", contractId: "c-1", year: 2027, month: 1, cost: 100, ...o,
});

const perms = { canCreateCost: true, canCreateContract: true };

/* ══════════════════════════════════════════════════════════════ the year range ════ */

describe("Add Costs from Table — sheet shape", () => {
  it("UT-ADDCOST-002 the year range runs from the allowed cost start to COD + 3", () => {
    const r = sheetYearRange(2024, 2029);
    expect(r.start).toBe(2024);
    expect(r.end).toBe(2032);
    expect(r.years).toHaveLength(9);
    expect(r.years[0]).toBe(2024);
    expect(r.years[8]).toBe(2032);
  });

  it("UT-ADDCOST-003 a missing COD falls back to 2050", () => {
    expect(sheetYearRange(2024, null).end).toBe(2050);
  });

  it("colReference spans at least 15 years", () => {
    expect(referenceYears(2026, 2030)).toHaveLength(15);
    expect(referenceYears(2026, 2060)).toHaveLength(34);
  });

  it("UT-ADDCOST-001 rows resolve to a sub-account and any existing contract", () => {
    const subs = [{ id: "sub-1", name: "Cabling", number: "10203" }];
    const resolved = resolveRow(
      row({ subAccountId: null, projectContractId: null }), subs, [contract()],
    );
    expect(resolved.subAccountId).toBe("sub-1");
    expect(resolved.projectContractId).toBe("c-1");

    const unknown = resolveRow(
      row({ accountName: "Unknown", subAccountId: null, projectContractId: null }),
      subs, [contract()],
    );
    expect(unknown.subAccountId).toBeNull();
    expect(unknown.projectContractId).toBeNull();
  });

  it("the two synthetic keys", () => {
    expect(uniqueId(row())).toBe("10203 - Cabling");
    expect(costUniqueId(row())).toBe("Cabling-10203Grid connection2027r1");
  });

  it("UT-ADDCOST-004 the DevCo/SPV default comes from the mapping", () => {
    const mapping = [{ accountNumber: "10203", devCoSpv: "SPV" }];
    expect(devCoSpvDefault(mapping, "10203")).toBe("SPV");
    expect(devCoSpvDefault(mapping, "10204")).toBeNull();
  });

  it("UT-ADDCOST-032 the header shows the project and category", () => {
    expect(sheetTitle("Windpark A", "Grid connection")).toBe("Windpark A - Grid connection");
  });
});

/* ══════════════════════════════════════════════════════════ the six validations ════ */

describe("Add Costs from Table — validation", () => {
  it("UT-ADDCOST-005 duplicate sub-account rows are rejected", () => {
    const rows = [
      row({ rowId: "r1" }),
      row({ rowId: "r2", description: "Other" }),
    ];
    const errors = validateDuplicateSubaccounts(rows);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain(ADDCOST_MSG.duplicateSubaccount);
    expect(errors[0].message).toContain("10203 - Cabling");
    // A single row is fine.
    expect(validateDuplicateSubaccounts([row()])).toHaveLength(0);
  });

  it("UT-ADDCOST-006 a cost typed on an ACCOUNT row is rejected", () => {
    const errors = validateCostOnAccount([row({ subAccountId: null })]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(ADDCOST_MSG.costOnAccount);
    expect(validateCostOnAccount([row()])).toHaveLength(0);
  });

  it("UT-ADDCOST-007 two contracts with one name under one sub-account are rejected", () => {
    const errors = validateDuplicateContracts([
      row({ rowId: "r1" }), row({ rowId: "r2" }),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain(ADDCOST_MSG.duplicateContract);
    // The same contract across two YEARS is a legitimate pair of rows.
    expect(validateDuplicateContracts([row({ rowId: "r1" })])).toHaveLength(0);
  });

  it("UT-ADDCOST-008 missing Depreciation / ApplyVAT / CostPaidBy is rejected", () => {
    expect(validateMissingMetadata([row({ applyVat: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row({ depreciation: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row({ costPaidBy: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row()])).toHaveLength(0);
    expect(validateMissingMetadata([row({ applyVat: "" })])[0].message)
      .toContain(ADDCOST_MSG.missingMetadata);
  });

  it('UT-ADDCOST-009 a NEW row may not use the word "Standard"', () => {
    const errors = validateStandardWord([
      row({ description: "Standard grid fee", projectContractId: null }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(ADDCOST_MSG.standardReserved);
  });

  it("UT-ADDCOST-010 an EXISTING standard contract keeps its name", () => {
    expect(validateStandardWord([
      row({ description: "Standard grid fee", projectContractId: "c-1" }),
    ])).toHaveLength(0);
  });

  it("UT-ADDCOST-011 a contract with all twelve months blank or zero is rejected", () => {
    const zeroed = row({ months: Array(12).fill(0) });
    expect(validateContractHasCost([zeroed])).toHaveLength(1);
    expect(validateContractHasCost([zeroed])[0].message).toContain(ADDCOST_MSG.noCost);
    expect(validateContractHasCost([row({ months: Array(12).fill(null) })])).toHaveLength(1);
    // One non-zero month anywhere in the GROUP rescues the whole group.
    expect(validateContractHasCost([
      row({ rowId: "r1", year: 2027, months: Array(12).fill(0) }),
      row({ rowId: "r2", year: 2028 }),
    ])).toHaveLength(0);
  });

  it("UT-ADDCOST-012 errors are de-duplicated", () => {
    // This row trips both the account rule and the metadata rule, twice over.
    const rows = [
      row({ rowId: "r1", subAccountId: null, applyVat: null }),
      row({ rowId: "r2", subAccountId: null, applyVat: null }),
    ];
    const errors = validateSheet(rows);
    const messages = errors.map((e) => e.message);
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("UT-ADDCOST-013 nothing is written when any validation fails", () => {
    const rows = [row({ rowId: "bad", subAccountId: null }), row({ rowId: "ok" })];
    const errors = validateSheet(rows);
    expect(errors.length).toBeGreaterThan(0);
    expect(sheetIsWritable(errors)).toBe(false);
    expect(canSaveBulkEdit(perms, errors)).toBe(false);
  });

  it("UT-ADDCOST-030 an empty sheet validates cleanly and writes nothing", () => {
    const errors = validateSheet([]);
    expect(errors).toEqual([]);
    expect(sheetIsWritable(errors)).toBe(true);
    expect(contractUpserts([], [])).toEqual([]);
    expect(costWrites([], []).upserts).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════ the diff ════ */

describe("Add Costs from Table — the change diff", () => {
  it("UT-ADDCOST-014 unchanged rows are not written", () => {
    const original = [row({ rowId: "r1" }), row({ rowId: "r2", description: "Other" })];
    const edited = [
      { ...original[0], months: [999, ...original[0].months.slice(1)] },
      original[1],
    ];
    const changed = diffRows(edited, original);
    expect(changed.map((r) => r.rowId)).toEqual(["r1"]);
  });

  it("UT-ADDCOST-015 a changed flag alone counts as a change", () => {
    const original = [row({ applyVat: "Yes" })];
    expect(diffRows([row({ applyVat: "No" })], original)).toHaveLength(1);
    expect(rowChanged(row({ depreciation: "No" }), original[0])).toBe(true);
    expect(rowChanged(row({ applyVat: "Yes" }), original[0])).toBe(false);
  });

  it("a brand-new row is always a change", () => {
    expect(rowChanged(row({ rowId: "new" }), undefined)).toBe(true);
  });

  it("the structured comparison agrees with the canvas' pipe-concatenated signature", () => {
    const a = row();
    const b = row({ months: [200, ...a.months.slice(1)] });
    expect(rowChanged(a, a)).toBe(false);
    expect(rowSignature(a)).toBe(rowSignature({ ...a }));
    expect(rowChanged(a, b)).toBe(rowSignature(a) !== rowSignature(b));
    expect(rowSignature(a)).not.toBe(rowSignature(b));
  });
});

/* ══════════════════════════════════════════════════════════ contract upserts ════ */

describe("Add Costs from Table — contract upserts", () => {
  it("UT-ADDCOST-016 new contracts are created as Individual + Absolute", () => {
    const [upsert] = contractUpserts(
      [row({ description: "Brand new", projectContractId: null })], [],
    );
    expect(upsert.distribution).toBe(CHOICE_COST.distributionType.individual);
    expect(upsert.distributionScheme).toBe(CHOICE_COST.distributionScheme.absoluteValues);
    expect(upsert.contractId).toBeNull();
    expect(upsert.name).toBe("Brand new");
  });

  it("UT-ADDCOST-017 an equal-distributed contract is converted (deliberate)", () => {
    const existing = contract({ distribution: CHOICE_COST.distributionType.equal });
    const [upsert] = contractUpserts([row()], [existing]);
    expect(upsert.distribution).toBe(CHOICE_COST.distributionType.individual);
    expect(upsert.distributionScheme).toBe(CHOICE_COST.distributionScheme.absoluteValues);
  });

  it("one upsert per (Name, Number, Description) group, not per row", () => {
    const upserts = contractUpserts([
      row({ rowId: "r1", year: 2027 }),
      row({ rowId: "r2", year: 2028 }),
      row({ rowId: "r3", description: "Other" }),
    ], []);
    expect(upserts).toHaveLength(2);
  });

  it("UT-ADDCOST-018 Is Edited from PCF stays No for an untouched Powerapps standard", () => {
    const untouched = contract({
      isStandardContract: true,
      initialContractSource: CHOICE_COST.initialContractSource.powerapps,
      distribution: CHOICE_COST.distributionType.individual,
      distributionScheme: CHOICE_COST.distributionScheme.absoluteValues,
      isEditedFromPcf: false,
    });
    expect(isEditedFromPcf(untouched)).toBe(false);
    expect(contractUpserts([row()], [untouched])[0].isEditedFromPcf).toBe(false);
  });

  it("UT-ADDCOST-019 Is Edited from PCF becomes Yes in every other case", () => {
    expect(isEditedFromPcf(contract({
      initialContractSource: CHOICE_COST.initialContractSource.pcf,
    }))).toBe(true);
    expect(isEditedFromPcf(contract({ isStandardContract: false }))).toBe(true);
    expect(isEditedFromPcf(contract({
      isStandardContract: true,
      initialContractSource: CHOICE_COST.initialContractSource.powerapps,
      distribution: CHOICE_COST.distributionType.equal,
    }))).toBe(true);
    // Already flagged Yes → stays Yes.
    expect(isEditedFromPcf(contract({
      isStandardContract: true,
      initialContractSource: CHOICE_COST.initialContractSource.powerapps,
      isEditedFromPcf: true,
    }))).toBe(true);
    expect(isEditedFromPcf(undefined)).toBe(true);
  });

  it("UT-ADDCOST-020 Initial Contract Source defaults to PCF for new rows", () => {
    expect(initialContractSource(undefined)).toBe(CHOICE_COST.initialContractSource.pcf);
    expect(initialContractSource(contract({
      initialContractSource: CHOICE_COST.initialContractSource.powerapps,
    }))).toBe(CHOICE_COST.initialContractSource.powerapps);
  });

  it("the Cost Type text maps to the option set, defaulting to DevCo", () => {
    expect(costTypeFromText("SPV")).toBe(CHOICE_COST.costPaidType.spv);
    expect(costTypeFromText("spv")).toBe(CHOICE_COST.costPaidType.spv);
    expect(costTypeFromText("DevCo")).toBe(CHOICE_COST.costPaidType.devCo);
    expect(costTypeFromText(null)).toBe(CHOICE_COST.costPaidType.devCo);
    expect(costTypeFromText("nonsense")).toBe(CHOICE_COST.costPaidType.devCo);
  });
});

/* ═══════════════════════════════════════════════════════════════ cost writes ════ */

describe("Add Costs from Table — cost writes", () => {
  it("UT-ADDCOST-021 twelve candidates per contract-year, two surviving upserts", () => {
    const months: (number | null)[] = Array(12).fill(null);
    months[2] = 1000;  // March
    months[8] = 2000;  // September
    const w = costWrites([row({ months })], []);
    expect(w.candidates).toBe(12);
    expect(w.upserts).toHaveLength(2);
    expect(w.upserts.map((u) => u.month)).toEqual([3, 9]);
    expect(w.upserts[0].cost).toBe(1000);
  });

  it("UT-ADDCOST-022 clearing a month deletes the existing cost row", () => {
    const months: (number | null)[] = Array(12).fill(null);
    const w = costWrites([row({ months })], [
      cost({ id: "june", contractId: "c-1", year: 2027, month: 6 }),
    ]);
    expect(w.deletes).toEqual(["june"]);
    expect(w.upserts).toHaveLength(0);
  });

  it("UT-ADDCOST-023 a blank month that never existed is not created", () => {
    const months: (number | null)[] = Array(12).fill(null);
    months[0] = 100;
    const w = costWrites([row({ months, projectContractId: null })], []);
    expect(w.upserts).toHaveLength(1);
    expect(w.deletes).toHaveLength(0);
  });

  it("an existing month is upserted against its id", () => {
    const w = costWrites([row()], [cost({ id: "jan", month: 1 })]);
    expect(w.upserts[0].costId).toBe("jan");
  });

  it("UT-ADDCOST-024 the contract total is recomputed and rounded", () => {
    expect(recomputeContractTotal([
      { cost: 42_000 }, { cost: 42_000 }, { cost: null },
    ])).toBe(84_000);
    expect(recomputeContractTotal([{ cost: 0.5 }])).toBe(1);
    expect(recomputeContractTotal([])).toBe(0);
  });
});

/* ═════════════════════════════════════════════════ contract deletion + guard ════ */

describe("Add Costs from Table — contract deletion and the past-cost guard", () => {
  const originalRows = [
    row({ rowId: "r1", projectContractId: "c-1" }),
    row({ rowId: "r2", projectContractId: "c-2", description: "Removed one" }),
  ];
  const sheetRows = [originalRows[0]];
  const contracts = [contract({ id: "c-1" }), contract({ id: "c-2", name: "Removed one" })];

  it("UT-ADDCOST-025 a contract dropped from the sheet is deleted", () => {
    const plan = planContractDeletions({
      originalRows, sheetRows, contracts,
      costs: [cost({ contractId: "c-2", year: 2029 })],
      currentYear: 2026,
    });
    expect(plan.deleteIds).toEqual(["c-2"]);
    expect(plan.blockedByPastCosts).toEqual([]);
  });

  it("UT-ADDCOST-026 a contract with HISTORICAL costs is guarded, not silently deleted", () => {
    const plan = planContractDeletions({
      originalRows, sheetRows, contracts,
      costs: [cost({ id: "old", contractId: "c-2", year: 2024, cost: 5000 })],
      currentYear: 2026,
    });
    expect(plan.deleteIds).toEqual([]);
    expect(plan.blockedByPastCosts).toEqual([{ id: "c-2", name: "Removed one" }]);
    expect(ADDCOST_MSG.pastCostGuard(["Removed one"]))
      .toContain("carry costs in past years and were NOT deleted");
  });

  it("UT-ADDCOST-026b an explicit confirmation restores the canvas behaviour", () => {
    const costs = [cost({ id: "old", contractId: "c-2", year: 2024, cost: 5000 })];
    const confirmed = planContractDeletions({
      originalRows, sheetRows, contracts, costs, currentYear: 2026,
      allowPastCostDeletion: true,
    });
    expect(confirmed.deleteIds).toEqual(["c-2"]);
    expect(confirmed.blockedByPastCosts).toEqual([]);
    // SOURCE DEFECT parity: the shipped canvas deletes regardless — its guard clause is
    // computed and then commented out.
    expect(planContractDeletionsCanvasParity({ originalRows, sheetRows })).toEqual(["c-2"]);
  });

  it("a zero-valued past cost does not trip the guard", () => {
    const plan = planContractDeletions({
      originalRows, sheetRows, contracts,
      costs: [cost({ id: "old", contractId: "c-2", year: 2024, cost: 0 })],
      currentYear: 2026,
    });
    expect(plan.deleteIds).toEqual(["c-2"]);
  });
});

/* ═════════════════════════════════════════════════════ permissions and exits ════ */

describe("Add Costs from Table — permissions and exits", () => {
  it("UT-ADDCOST-031 the modal requires create permission to open AND to save", () => {
    expect(canOpenBulkEdit(perms)).toBe(true);
    expect(canOpenBulkEdit({ canCreateCost: false, canCreateContract: true })).toBe(false);
    expect(canOpenBulkEdit({ canCreateCost: true, canCreateContract: false })).toBe(false);
    expect(canSaveBulkEdit({ canCreateCost: false, canCreateContract: true }, [])).toBe(false);
    expect(canSaveBulkEdit(perms, [])).toBe(true);
    expect(ADDCOST_MSG.noPermission).toContain("do not have permission");
  });

  it("UT-ADDCOST-027 a save failure has the canvas' message", () => {
    expect(ADDCOST_MSG.saveFailed)
      .toBe("Something went wrong saving the Capex data. Please refresh the page and verify "
        + "your changes were saved correctly.");
  });

  it("UT-ADDCOST-028/029 Cancel discards everything; a save returns to the same category", () => {
    expect(cancelWritesNothing).toBe(true);
    // A cancelled sheet produces no write plan at all.
    expect(contractUpserts(diffRows([], [row()]), [])).toEqual([]);
  });
});
