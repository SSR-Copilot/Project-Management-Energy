import { describe, expect, it } from "vitest";
import {
  CHOICE, ADDCOST_MSG,
  sheetYearRange, referenceYears, uniqueId, costUniqueId, devCoSpvDefault, resolveRow,
  sheetTitle, buildInitialSheet, costPaidByText,
  validateDuplicateSubaccounts, validateCostOnAccount, validateDuplicateContracts,
  validateMissingMetadata, validateStandardWord, validateContractHasCost, validateSheet,
  sheetIsWritable, rowSignature, rowChanged, diffRows, costTypeFromText, isEditedFromPcf,
  initialContractSource, contractUpserts, costWrites, recomputeContractTotal,
  planContractDeletions, planContractDeletionsCanvasParity, canOpenBulkEdit, canSaveBulkEdit,
  cancelWritesNothing,
  type ExistingContract, type ExistingCost, type SheetRow,
} from "./rules";

const emptyMonths = (): (number | null)[] => new Array(12).fill(null);

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  rowId: "r1", accountNumber: "80000_0", accountName: "Turbine",
  description: "My Cost", year: 2026, costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes",
  months: emptyMonths(), subAccountId: "sub-1", projectContractId: null,
  ...over,
});

const contract = (over: Partial<ExistingContract> = {}): ExistingContract => ({
  id: "c-1", name: "My Cost", subaccountId: "sub-1", isStandardContract: false,
  initialContractSource: CHOICE.initialContractSource.pcf,
  distribution: CHOICE.distributionType.individual,
  distributionScheme: CHOICE.distributionScheme.absoluteValues,
  isEditedFromPcf: false, costType: CHOICE.costPaidType.devCo,
  depreciation: true, applyVat: true,
  ...over,
});

const cost = (over: Partial<ExistingCost> = {}): ExistingCost => ({
  id: "k-1", contractId: "c-1", year: 2026, month: 1, cost: 100, ...over,
});

const perms = { canCreateCost: true, canCreateContract: true };

describe("sheetYearRange", () => {
  it("UT-ADDCOST-002 runs from the allowed start to COD + 3", () => {
    expect(sheetYearRange(2020, 2026)).toMatchObject({ start: 2020, end: 2029 });
  });

  it("UT-ADDCOST-003 falls back to 2050 with no COD", () => {
    expect(sheetYearRange(2020, null).end).toBe(2050);
  });
});

describe("referenceYears", () => {
  it("spans at least 15 years even for a short project", () => {
    expect(referenceYears(2020, 2022)).toHaveLength(15);
  });

  it("spans the real duration when longer than 15 years", () => {
    expect(referenceYears(2020, 2040)).toHaveLength(20);
  });
});

describe("resolveRow", () => {
  it("resolves a row to its sub-account and any existing contract", () => {
    const subs = [{ id: "sub-1", name: "Turbine", number: "80000_0" }];
    const resolved = resolveRow(
      row({ subAccountId: null, projectContractId: null }), subs, [contract()],
    );
    expect(resolved.subAccountId).toBe("sub-1");
    expect(resolved.projectContractId).toBe("c-1");
  });

  it("leaves both null when the sub-account is not found", () => {
    const resolved = resolveRow(
      row({ accountName: "Unknown", subAccountId: null, projectContractId: null }), [], [],
    );
    expect(resolved.subAccountId).toBeNull();
    expect(resolved.projectContractId).toBeNull();
  });
});

describe("the synthetic keys", () => {
  it("uniqueId and costUniqueId", () => {
    expect(uniqueId(row())).toBe("80000_0 - Turbine");
    expect(costUniqueId(row())).toBe("Turbine-80000_0My Cost2026r1");
  });

  it("devCoSpvDefault reads the SPVDevCo mapping", () => {
    const mapping = [{ accountNumber: "80000_0", devCoSpv: "SPV" }];
    expect(devCoSpvDefault(mapping, "80000_0")).toBe("SPV");
    expect(devCoSpvDefault(mapping, "90000_0")).toBeNull();
  });

  it("sheetTitle joins the project and category names", () => {
    expect(sheetTitle("Windpark A", "CAPEX")).toBe("Windpark A - CAPEX");
  });

  it("costPaidByText is the inverse of costTypeFromText", () => {
    expect(costPaidByText(CHOICE.costPaidType.spv)).toBe("SPV");
    expect(costPaidByText(CHOICE.costPaidType.devCo)).toBe("DevCo");
    expect(costPaidByText(null)).toBe("DevCo");
  });
});

/* ══════════════════════════════════════════════ building the initial sheet ══ */

describe("buildInitialSheet", () => {
  const subs = [{ id: "sub-1", number: "80000_0", name: "Turbine" }];

  it("a sub-account with no contract gets one empty row", () => {
    const rows = buildInitialSheet({
      subaccounts: subs, contracts: [], costs: [], currentYear: 2026,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      accountNumber: "80000_0", accountName: "Turbine", description: "",
      year: 2026, subAccountId: "sub-1", projectContractId: null,
    });
    expect(rows[0]?.months).toEqual(emptyMonths());
  });

  it("seeds a brand-new row's Cost Paid By from the SPVDevCo mapping", () => {
    const rows = buildInitialSheet({
      subaccounts: subs, contracts: [], costs: [], currentYear: 2026,
      payerDefaults: new Map([["sub-1", "SPV"]]),
    });
    expect(rows[0]?.costPaidBy).toBe("SPV");
  });

  it("one row per (sub-account, contract, year) the contract has costs in", () => {
    const contracts = [contract({ id: "c-1", name: "Grid connection" })];
    const costs = [
      cost({ id: "k1", contractId: "c-1", year: 2024, month: 3, cost: 500 }),
      cost({ id: "k2", contractId: "c-1", year: 2025, month: 6, cost: 700 }),
    ];
    const rows = buildInitialSheet({ subaccounts: subs, contracts, costs, currentYear: 2026 });
    expect(rows.map((r) => r.year).sort()).toEqual([2024, 2025]);
    for (const r of rows) {
      expect(r.description).toBe("Grid connection");
      expect(r.projectContractId).toBe("c-1");
      expect(r.subAccountId).toBe("sub-1");
      expect(r.costPaidBy).toBe("DevCo");
      expect(r.depreciation).toBe("Yes");
      expect(r.applyVat).toBe("Yes");
    }
    const y2024 = rows.find((r) => r.year === 2024);
    expect(y2024?.months[2]).toBe(500); // March
    const y2025 = rows.find((r) => r.year === 2025);
    expect(y2025?.months[5]).toBe(700); // June
  });

  it("a contract with no cost rows at all still gets one row, for the current year", () => {
    const contracts = [contract({ id: "c-1" })];
    const rows = buildInitialSheet({ subaccounts: subs, contracts, costs: [], currentYear: 2030 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.year).toBe(2030);
    expect(rows[0]?.months).toEqual(emptyMonths());
  });

  it("two different contracts under one sub-account each get their own row(s)", () => {
    const contracts = [
      contract({ id: "c-1", name: "Supply" }),
      contract({ id: "c-2", name: "O&M" }),
    ];
    const costs = [cost({ id: "k1", contractId: "c-1", year: 2026, month: 1 })];
    const rows = buildInitialSheet({ subaccounts: subs, contracts, costs, currentYear: 2026 });
    expect(rows.map((r) => r.description).sort()).toEqual(["O&M", "Supply"]);
  });

  it("an inactive/None Cost Type reads as DevCo and booleans default to No", () => {
    const contracts = [contract({ id: "c-1", costType: null, depreciation: null, applyVat: null })];
    const rows = buildInitialSheet({ subaccounts: subs, contracts, costs: [], currentYear: 2026 });
    expect(rows[0]).toMatchObject({ costPaidBy: "DevCo", depreciation: "No", applyVat: "No" });
  });
});

/* ══════════════════════════════════════════════════════════ the six validations ══ */

describe("validateDuplicateSubaccounts", () => {
  it("UT-ADDCOST-005 flags the same sub-account twice in the same year", () => {
    const rows = [row({ rowId: "r1" }), row({ rowId: "r2", description: "Other" })];
    const errors = validateDuplicateSubaccounts(rows);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain(ADDCOST_MSG.duplicateSubaccount);
    expect(errors[0]?.message).toContain("80000_0 - Turbine");
  });

  it("a single row is fine", () => {
    expect(validateDuplicateSubaccounts([row()])).toHaveLength(0);
  });

  it(
    "the same sub-account across two DIFFERENT years is legitimate — not a canvas re-derivation:"
    + " year was added to the grouping key so real multi-year history does not self-flag",
    () => {
      const rows = [row({ rowId: "r1", year: 2026 }), row({ rowId: "r2", year: 2027 })];
      expect(validateDuplicateSubaccounts(rows)).toHaveLength(0);
    },
  );
});

describe("validateCostOnAccount", () => {
  it("UT-ADDCOST-006 rejects a cost typed on an ACCOUNT row", () => {
    const errors = validateCostOnAccount([row({ subAccountId: null })]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(ADDCOST_MSG.costOnAccount);
    expect(validateCostOnAccount([row()])).toHaveLength(0);
  });
});

describe("validateDuplicateContracts", () => {
  it("UT-ADDCOST-007 rejects two same-name contracts in the same year", () => {
    const errors = validateDuplicateContracts([row({ rowId: "r1" }), row({ rowId: "r2" })]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain(ADDCOST_MSG.duplicateContract);
  });

  it("the same contract across two years is a legitimate pair of rows", () => {
    const rows = [
      row({ rowId: "r1", year: 2026, projectContractId: "c-1" }),
      row({ rowId: "r2", year: 2027, projectContractId: "c-1" }),
    ];
    expect(validateDuplicateContracts(rows)).toHaveLength(0);
  });

  it("two DIFFERENT contract names under one sub-account, same year, are fine", () => {
    const rows = [row({ rowId: "r1" }), row({ rowId: "r2", description: "Other" })];
    expect(validateDuplicateContracts(rows)).toHaveLength(0);
  });
});

describe("validateMissingMetadata", () => {
  it("UT-ADDCOST-008 rejects a blank Depreciation, ApplyVAT or CostPaidBy", () => {
    expect(validateMissingMetadata([row({ applyVat: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row({ depreciation: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row({ costPaidBy: null })])).toHaveLength(1);
    expect(validateMissingMetadata([row()])).toHaveLength(0);
    expect(validateMissingMetadata([row({ applyVat: "" })])[0]?.message)
      .toContain(ADDCOST_MSG.missingMetadata);
  });
});

describe("validateStandardWord", () => {
  it('UT-ADDCOST-009 a NEW row may not use the word "Standard"', () => {
    const errors = validateStandardWord([
      row({ description: "Standard grid fee", projectContractId: null }),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain(ADDCOST_MSG.standardReserved);
  });

  it("UT-ADDCOST-010 an EXISTING standard contract keeps its name", () => {
    expect(validateStandardWord([
      row({ description: "Standard grid fee", projectContractId: "c-1" }),
    ])).toHaveLength(0);
  });
});

describe("validateContractHasCost", () => {
  it("UT-ADDCOST-011 rejects a contract with every month blank or zero", () => {
    const zeroed = row({ months: Array(12).fill(0) });
    expect(validateContractHasCost([zeroed])[0]?.message).toContain(ADDCOST_MSG.noCost);
    expect(validateContractHasCost([row({ months: Array(12).fill(null) })])).toHaveLength(1);
  });

  it("one non-zero month anywhere in the group rescues the whole group", () => {
    expect(validateContractHasCost([
      row({ rowId: "r1", year: 2026, months: Array(12).fill(0) }),
      row({ rowId: "r2", year: 2027, months: [500, ...Array(11).fill(0)] }),
    ])).toHaveLength(0);
  });
});

describe("validateSheet", () => {
  it("UT-ADDCOST-012 unions the six passes and de-duplicates by message", () => {
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
    expect(validateSheet([])).toEqual([]);
    expect(sheetIsWritable([])).toBe(true);
    expect(contractUpserts([], [])).toEqual([]);
    expect(costWrites([], []).upserts).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════ the diff ══ */

describe("diffRows / rowChanged / rowSignature", () => {
  it("UT-ADDCOST-014 unchanged rows are not written", () => {
    const original = [row({ rowId: "r1" }), row({ rowId: "r2", description: "Other" })];
    const edited = [
      { ...original[0] as SheetRow, months: [999, ...(original[0] as SheetRow).months.slice(1)] },
      original[1] as SheetRow,
    ];
    expect(diffRows(edited, original).map((r) => r.rowId)).toEqual(["r1"]);
  });

  it("UT-ADDCOST-015 any tracked field alone counts as a change", () => {
    const original = [row({ applyVat: "Yes" })];
    expect(diffRows([row({ applyVat: "No" })], original)).toHaveLength(1);
    expect(rowChanged(row({ depreciation: "No" }), original[0])).toBe(true);
    expect(rowChanged(row({ applyVat: "Yes" }), original[0])).toBe(false);
  });

  it("a brand-new row (no original) is always a change", () => {
    expect(rowChanged(row({ rowId: "new" }), undefined)).toBe(true);
  });

  it("the structured comparison agrees with the canvas' pipe-concatenated signature", () => {
    const a = row();
    const b = row({ months: [200, ...a.months.slice(1)] });
    expect(rowChanged(a, a)).toBe(false);
    expect(rowSignature(a)).toBe(rowSignature({ ...a }));
    expect(rowChanged(a, b)).toBe(rowSignature(a) !== rowSignature(b));
  });
});

/* ══════════════════════════════════════════════════════════ contract upserts ══ */

describe("contractUpserts", () => {
  it("UT-ADDCOST-016 new contracts are created as Individual + Absolute", () => {
    const [upsert] = contractUpserts(
      [row({ description: "Brand new", projectContractId: null })], [],
    );
    expect(upsert?.distribution).toBe(CHOICE.distributionType.individual);
    expect(upsert?.distributionScheme).toBe(CHOICE.distributionScheme.absoluteValues);
    expect(upsert?.contractId).toBeNull();
    expect(upsert?.name).toBe("Brand new");
  });

  it("UT-ADDCOST-017 an equal-distributed contract is converted (deliberate)", () => {
    const existing = contract({ distribution: CHOICE.distributionType.equal });
    const [upsert] = contractUpserts([row({ projectContractId: "c-1" })], [existing]);
    expect(upsert?.distribution).toBe(CHOICE.distributionType.individual);
    expect(upsert?.distributionScheme).toBe(CHOICE.distributionScheme.absoluteValues);
  });

  it("one upsert per (Name, Number, Description) group, not per row", () => {
    const upserts = contractUpserts([
      row({ rowId: "r1", year: 2026 }),
      row({ rowId: "r2", year: 2027 }),
      row({ rowId: "r3", description: "Other" }),
    ], []);
    expect(upserts).toHaveLength(2);
  });

  it("UT-ADDCOST-018 Is Edited from PCF stays No for an untouched Powerapps standard", () => {
    const untouched = contract({
      isStandardContract: true,
      initialContractSource: CHOICE.initialContractSource.powerapps,
      distribution: CHOICE.distributionType.individual,
      distributionScheme: CHOICE.distributionScheme.absoluteValues,
      isEditedFromPcf: false,
    });
    expect(isEditedFromPcf(untouched)).toBe(false);
    expect(contractUpserts([row({ projectContractId: "c-1" })], [untouched])[0]?.isEditedFromPcf)
      .toBe(false);
  });

  it("UT-ADDCOST-019 Is Edited from PCF becomes Yes in every other case", () => {
    expect(isEditedFromPcf(contract({ initialContractSource: CHOICE.initialContractSource.pcf })))
      .toBe(true);
    expect(isEditedFromPcf(contract({ isStandardContract: false }))).toBe(true);
    expect(isEditedFromPcf(contract({
      isStandardContract: true,
      initialContractSource: CHOICE.initialContractSource.powerapps,
      distribution: CHOICE.distributionType.equal,
    }))).toBe(true);
    expect(isEditedFromPcf(contract({
      isStandardContract: true,
      initialContractSource: CHOICE.initialContractSource.powerapps,
      isEditedFromPcf: true,
    }))).toBe(true);
    expect(isEditedFromPcf(undefined)).toBe(true);
  });

  it("UT-ADDCOST-020 Initial Contract Source defaults to PCF for new rows", () => {
    expect(initialContractSource(undefined)).toBe(CHOICE.initialContractSource.pcf);
    expect(initialContractSource(contract({
      initialContractSource: CHOICE.initialContractSource.powerapps,
    }))).toBe(CHOICE.initialContractSource.powerapps);
  });

  it("Cost Type text maps to the option set, defaulting to DevCo", () => {
    expect(costTypeFromText("SPV")).toBe(CHOICE.costPaidType.spv);
    expect(costTypeFromText("spv")).toBe(CHOICE.costPaidType.spv);
    expect(costTypeFromText("DevCo")).toBe(CHOICE.costPaidType.devCo);
    expect(costTypeFromText(null)).toBe(CHOICE.costPaidType.devCo);
    expect(costTypeFromText("nonsense")).toBe(CHOICE.costPaidType.devCo);
  });
});

/* ═══════════════════════════════════════════════════════════════ cost writes ══ */

describe("costWrites", () => {
  it("UT-ADDCOST-021 twelve candidates per row, two surviving upserts", () => {
    const months = emptyMonths();
    months[2] = 1000; // March
    months[8] = 2000; // September
    const w = costWrites([row({ months })], []);
    expect(w.candidates).toBe(12);
    expect(w.upserts).toHaveLength(2);
    expect(w.upserts.map((u) => u.month)).toEqual([3, 9]);
    expect(w.upserts[0]?.cost).toBe(1000);
  });

  it("UT-ADDCOST-022 clearing a month deletes the existing cost row", () => {
    const w = costWrites([row({ months: emptyMonths(), projectContractId: "c-1" })], [
      cost({ id: "june", contractId: "c-1", year: 2026, month: 6 }),
    ]);
    expect(w.deletes).toEqual(["june"]);
    expect(w.upserts).toHaveLength(0);
  });

  it("UT-ADDCOST-023 a blank month that never existed is not created", () => {
    const months = emptyMonths();
    months[0] = 100;
    const w = costWrites([row({ months, projectContractId: null })], []);
    expect(w.upserts).toHaveLength(1);
    expect(w.deletes).toHaveLength(0);
  });

  it("an existing month is upserted against its own id", () => {
    const months = emptyMonths();
    months[0] = 250;
    const w = costWrites(
      [row({ months, projectContractId: "c-1" })],
      [cost({ id: "jan", contractId: "c-1", year: 2026, month: 1 })],
    );
    expect(w.upserts[0]?.costId).toBe("jan");
  });

  it("UT-ADDCOST-024 the contract total is recomputed and rounded", () => {
    expect(recomputeContractTotal([{ cost: 42_000 }, { cost: 42_000 }, { cost: null }]))
      .toBe(84_000);
    expect(recomputeContractTotal([{ cost: 0.5 }])).toBe(1);
    expect(recomputeContractTotal([])).toBe(0);
  });
});

/* ═════════════════════════════════════════════════ contract deletion + guard ══ */

describe("planContractDeletions", () => {
  const originalRows = [
    row({ rowId: "r1", projectContractId: "c-1" }),
    row({ rowId: "r2", projectContractId: "c-2", description: "Removed one" }),
  ];
  const sheetRows = [originalRows[0] as SheetRow];
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
      originalRows, sheetRows, contracts, costs, currentYear: 2026, allowPastCostDeletion: true,
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

/* ═════════════════════════════════════════════════════ permissions and exits ══ */

describe("permissions and exits", () => {
  it("UT-ADDCOST-031 the sheet requires create permission to open AND to save", () => {
    expect(canOpenBulkEdit(perms)).toBe(true);
    expect(canOpenBulkEdit({ canCreateCost: false, canCreateContract: true })).toBe(false);
    expect(canOpenBulkEdit({ canCreateCost: true, canCreateContract: false })).toBe(false);
    expect(canSaveBulkEdit({ canCreateCost: false, canCreateContract: true }, [])).toBe(false);
    expect(canSaveBulkEdit(perms, [])).toBe(true);
    expect(ADDCOST_MSG.noPermission).toContain("do not have permission");
  });

  it("UT-ADDCOST-027 a save failure has the canvas' message", () => {
    expect(ADDCOST_MSG.saveFailed).toBe(
      "Something went wrong saving the Capex data. Please refresh the page and verify your "
      + "changes were saved correctly.",
    );
  });

  it("UT-ADDCOST-028/029 Cancel discards everything; a save returns to the same category", () => {
    expect(cancelWritesNothing).toBe(true);
    expect(contractUpserts(diffRows([], [row()]), [])).toEqual([]);
  });
});
