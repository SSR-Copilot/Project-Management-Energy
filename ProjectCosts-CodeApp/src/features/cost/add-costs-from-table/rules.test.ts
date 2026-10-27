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
  cancelWritesNothing, ADDCOST_SAVE_MSG, saveFailureText,
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
    // One sub-account's contract rows share one Row_ID, as the grid emits them (CA-12).
    const errors = validateDuplicateContracts([row({ rowId: "Row_3" }), row({ rowId: "Row_3" })]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toBe(`My Cost${ADDCOST_MSG.duplicateContract}`);
  });

  it("UT-ADDCOST-084 CA-12: two NEW same-named rows, one sub-account, one year, months NOT overlapping, are refused", () => {
    const a = row({ rowId: "Row_3", description: "Twin", months: [100, ...emptyMonths().slice(1)] });
    const b = row({ rowId: "Row_3", description: "Twin", months: [null, 200, ...emptyMonths().slice(2)] });
    expect(validateDuplicateContracts([a, b])).toEqual([
      { rowKey: "Row_3", accountNumber: "80000_0", accountName: "Turbine", message: `Twin${ADDCOST_MSG.duplicateContract}` },
      { rowKey: "Row_3", accountNumber: "80000_0", accountName: "Turbine", message: `Twin${ADDCOST_MSG.duplicateContract}` },
    ]);
    // The screen disables Save on any validation error.
    const errors = validateSheet([a, b]);
    expect(errors.map((e) => e.message)).toEqual([`Twin${ADDCOST_MSG.duplicateContract}`]);
    expect(sheetIsWritable(errors)).toBe(false);
    expect(ADDCOST_MSG.duplicateContract)
      .toBe(" :- There cannot be two contracts with the same name under the same sub-account.");
  });

  it("UT-ADDCOST-085 the key is all five canvas fields: a difference in any one of them is not a duplicate", () => {
    const base = row({ rowId: "Row_3", description: "Twin" });
    for (const other of [
      { accountName: "Grid" }, { year: 2027 }, { rowId: "Row_4" }, { accountNumber: "80000_1" }, { description: "Twin 2" },
    ] satisfies Partial<SheetRow>[]) {
      expect(validateDuplicateContracts([base, { ...base, ...other }]), JSON.stringify(other)).toEqual([]);
    }
    // Three rows on one key: all three are flagged; a fourth on its own key is not.
    const three = [base, { ...base }, { ...base }, { ...base, year: 2027 }];
    expect(validateDuplicateContracts(three).map((e) => e.rowKey)).toEqual(["Row_3", "Row_3", "Row_3"]);
    // No separator collision: "a|b" + "c" and "a" + "b|c" are different keys.
    expect(validateDuplicateContracts([
      row({ rowId: "Row_3", accountName: "a|b", description: "c" }),
      row({ rowId: "Row_3", accountName: "a", description: "b|c" }),
    ])).toEqual([]);
  });

  it("UT-ADDCOST-086 one name under one sub-account at two Row_IDs is no longer a contract duplicate, but the sub-account check still refuses it", () => {
    // The old rule's only case (more than one distinct Row_ID). The canvas `CostCountRows`
    // counts 1 for each row; `locDuplicateSubaccounts` refuses the pair instead.
    const jan = [1, ...emptyMonths().slice(1)];
    const rows = [row({ rowId: "Row_3", months: jan }), row({ rowId: "Row_5", months: jan })];
    expect(validateDuplicateContracts(rows)).toEqual([]);
    const errors = validateSheet(rows);
    expect(errors.map((e) => e.message)).toEqual([`80000_0 - Turbine${ADDCOST_MSG.duplicateSubaccount}`]);
    expect(sheetIsWritable(errors)).toBe(false);
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

/* ═════════════════════════════ the diff pairs rows by identity (UT-ADDCOST-074..) ══ */

describe("diffRows pairs by identity, not Row_ID", () => {
  /** One contract row per (contract, year), all sharing ONE Row_ID, as the grid emits them. */
  const contractRow = (contractId: string, year: number, jan: number | null, rowId = "Row_3") =>
    row({ rowId, projectContractId: contractId, description: `Name ${contractId}`, year,
      months: [jan, ...emptyMonths().slice(1)] });

  it("UT-ADDCOST-074 compares rows sharing a Row_ID but not a year with the RIGHT originals", () => {
    const original = [contractRow("c-1", 2020, 1), contractRow("c-1", 2021, 2), contractRow("c-2", 2020, 3)];
    // Unedited, every row shares "Row_3": a Row_ID map would pair all three with c-2/2020.
    expect(diffRows(original.map((r) => ({ ...r })), original)).toEqual([]);
    // The current sheet's walk handed out a different Row_ID; identity still pairs them.
    const shifted = original.map((r) => ({ ...r, rowId: "Row_9" }));
    expect(diffRows(shifted, original)).toEqual([]);
    // Editing 2021 alone reports 2021 alone.
    const edited = [original[0] as SheetRow, contractRow("c-1", 2021, 99), original[2] as SheetRow];
    expect(diffRows(edited, original).map((r) => `${r.projectContractId}/${r.year}`)).toEqual(["c-1/2021"]);
  });

  it("UT-ADDCOST-075 one edited cell on a many-contract, many-year sheet gives exactly that row", () => {
    const original = ["c-1", "c-2", "c-3"].flatMap((c) => [2020, 2021, 2022].map((y) => contractRow(c, y, y)));
    const current = original.map((r) => ({ ...r, months: [...r.months] }));
    (current[4] as SheetRow).months[7] = 123; // c-2 / 2021, August
    expect(diffRows(current, original)).toEqual([current[4]]);
  });

  it("UT-ADDCOST-076 a new row is changed; a removed row is not in the diff", () => {
    const original = [contractRow("c-1", 2020, 1), contractRow("c-1", 2021, 2)];
    const fresh = row({ rowId: "Row_3", description: "Brand new", year: 2020, projectContractId: null });
    // c-1/2021 removed (the orphan clean-up blanks it), a new row added under the same Row_ID.
    const current = [original[0] as SheetRow, fresh];
    expect(diffRows(current, original)).toEqual([fresh]);
    // A new year of an existing contract has no original either.
    expect(diffRows([...original, contractRow("c-1", 2022, null)], original).map((r) => r.year)).toEqual([2022]);
  });

  it("UT-ADDCOST-077 an identity two rows share cannot be paired, so every row carrying it is changed", () => {
    // Two NEW rows with the same name under one sub-account share a Row_ID. Since CA-12
    // validation refuses them (Save is disabled, UT-ADDCOST-084); `diffRows` still reports both,
    // as a guard. The ORIGINAL side below is what validation never sees.
    const twin = row({ rowId: "Row_3", description: "Twin", year: 2020, projectContractId: null });
    const twins = [twin, { ...twin }];
    expect(validateDuplicateContracts(twins)).toHaveLength(2);
    expect(diffRows(twins, [twin])).toHaveLength(2);
    // Two ORIGINALS on one identity: the single current row is changed, even when it equals one.
    expect(diffRows([twin], twins)).toEqual([twin]);
    // Rows with a unique identity beside them are still judged on their own.
    const other = contractRow("c-9", 2020, 5);
    expect(diffRows([...twins, other], [twin, other])).toEqual(twins);
  });

  it("UT-ADDCOST-078 property: over random sheets and edits, no edit is lost and no unedited row is reported", () => {
    function seeded(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    // The ORACLE: a current row is unchanged iff exactly one current and exactly one original row
    // carry its identity, and every compared field equals that original's. Linear scans, no
    // index, no Row_ID.
    const same = (a: SheetRow, b: SheetRow) => a.description === b.description
      && a.depreciation === b.depreciation && a.costPaidBy === b.costPaidBy && a.applyVat === b.applyVat
      && a.months.every((m, i) => (m ?? null) === (b.months[i] ?? null))
      && b.months.every((m, i) => (m ?? null) === (a.months[i] ?? null));
    const identityOf = (r: SheetRow) => JSON.stringify(r.projectContractId !== null
      ? ["c", r.projectContractId, r.year] : ["n", r.accountNumber, r.accountName, r.description, r.year]);
    const oracle = (current: readonly SheetRow[], original: readonly SheetRow[]) => current.filter((r) => {
      const peers = current.filter((c) => identityOf(c) === identityOf(r));
      const matches = original.filter((o) => identityOf(o) === identityOf(r));
      return !(peers.length === 1 && matches.length === 1 && same(r, matches[0] as SheetRow));
    });

    let edits = 0;
    let unchanged = 0;
    let ambiguous = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const rand = seeded(seed);
      const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
      const months = () => Array.from({ length: 12 }, () => (rand() < 0.6 ? null : Math.round(rand() * 50)));
      const original: SheetRow[] = [];
      for (let i = 0; i < 6 + Math.floor(rand() * 10); i += 1) {
        const contractId = rand() < 0.8 ? `c-${Math.floor(rand() * 6)}` : null;
        original.push(row({
          rowId: `Row_${Math.floor(rand() * 3)}`, projectContractId: contractId,
          accountNumber: pick(["80000_0", "80000_1"]), description: contractId ?? pick(["New A", "New B"]),
          year: pick([2020, 2021, 2022]), costPaidBy: pick(["DevCo", "SPV"]), applyVat: pick(["Yes", "No"]),
          months: months(),
        }));
      }
      // The user's session: drop some rows, edit some, renumber Row_IDs, add a few.
      const current: SheetRow[] = [];
      original.forEach((o) => {
        if (rand() < 0.15) return;
        let r: SheetRow = { ...o, rowId: `Row_${Math.floor(rand() * 3)}`, months: [...o.months] };
        if (rand() < 0.35) {
          const what = Math.floor(rand() * 4);
          if (what === 0) r.months[Math.floor(rand() * 12)] = Math.round(rand() * 50);
          else if (what === 1) r = { ...r, applyVat: r.applyVat === "Yes" ? "No" : "Yes" };
          else if (what === 2) r = { ...r, costPaidBy: r.costPaidBy === "SPV" ? "DevCo" : "SPV" };
          else r = { ...r, depreciation: r.depreciation === "Yes" ? null : "Yes" };
        }
        current.push(r);
      });
      for (let n = 0; n < Math.floor(rand() * 3); n += 1) {
        current.splice(Math.floor(rand() * (current.length + 1)), 0, row({
          rowId: "Row_1", description: pick(["New A", "New C"]), year: pick([2020, 2021]), months: months(),
        }));
      }

      const diff = diffRows(current, original);
      expect(diff, `seed ${seed}`).toEqual(oracle(current, original));
      // Spelled out: every row that differs from its sole original is in the diff…
      const inDiff = new Set(diff);
      for (const r of current) {
        const matches = original.filter((o) => identityOf(o) === identityOf(r));
        const peers = current.filter((c) => identityOf(c) === identityOf(r));
        if (peers.length > 1 || matches.length !== 1) {
          ambiguous += peers.length > 1 || matches.length > 1 ? 1 : 0;
          expect(inDiff.has(r), `seed ${seed}: unpaired row must be changed`).toBe(true);
        } else if (!same(r, matches[0] as SheetRow)) {
          edits += 1;
          expect(inDiff.has(r), `seed ${seed}: edit lost`).toBe(true);
        } else {
          unchanged += 1;
          expect(inDiff.has(r), `seed ${seed}: unedited row reported`).toBe(false);
        }
      }
    }
    // Every branch is really exercised.
    expect(edits).toBeGreaterThan(100);
    expect(unchanged).toBeGreaterThan(100);
    expect(ambiguous).toBeGreaterThan(0);
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

/* ═══════════════════════════════════════════════════════ failed-save messages ══ */

describe("saveFailureText", () => {
  const FAILED = ADDCOST_MSG.saveFailed;

  it("UT-ADDCOST-SAVEMSG-001 an unknown failure is exactly the canvas message", () => {
    expect(saveFailureText({ kind: "other" })).toBe(FAILED);
  });

  it("UT-ADDCOST-SAVEMSG-002 a phase-1 failure with nothing committed names the step only", () => {
    expect(saveFailureText({ kind: "phase", phase: 1, reconciled: true, committedBefore: false })).toBe(
      `${FAILED} The save stopped at step 1 of 4 (saving contracts).`,
    );
  });

  it("UT-ADDCOST-SAVEMSG-003 a later failure after a commit says Save again is safe", () => {
    expect(saveFailureText({ kind: "phase", phase: 2, reconciled: true, committedBefore: true })).toBe(
      `${FAILED} The save stopped at step 2 of 4 (saving costs). The changes written before it were `
      + "saved. Press Save again to finish the save without duplicating anything.",
    );
  });

  it("UT-ADDCOST-SAVEMSG-004 an unreconciled failure gives the reload hint instead of Save again", () => {
    expect(saveFailureText({ kind: "phase", phase: 3, reconciled: false, committedBefore: true })).toBe(
      `${FAILED} The save stopped at step 3 of 4 (deleting costs). `
      + "Contract totals may not match the saved costs: reload the screen before saving again.",
    );
    expect(saveFailureText({ kind: "phase", phase: 1, reconciled: false, committedBefore: false })).toBe(
      `${FAILED} The save stopped at step 1 of 4 (saving contracts). ${ADDCOST_SAVE_MSG.totalsMayBeStale}`,
    );
  });

  it("UT-ADDCOST-SAVEMSG-005 every phase has its step name", () => {
    expect(saveFailureText({ kind: "phase", phase: 4, reconciled: true, committedBefore: true }))
      .toContain("step 4 of 4 (deleting contracts).");
    expect(ADDCOST_SAVE_MSG.phase).toEqual({
      1: "saving contracts", 2: "saving costs", 3: "deleting costs", 4: "deleting contracts",
    });
  });

  it("UT-ADDCOST-SAVEMSG-006 a sheet conflict says nothing was saved and why", () => {
    expect(saveFailureText({ kind: "conflict", detail: '"A" under account "B" has more than one row for 2026.' }))
      .toBe(`${FAILED} Nothing was saved: "A" under account "B" has more than one row for 2026.`);
  });

  it("UT-ADDCOST-SAVEMSG-007 rows deleted by someone else: counts, singular and plural", () => {
    const tail = "deleted by someone else after this sheet was loaded. Reload the screen and try again.";
    expect(saveFailureText({ kind: "gone", contracts: 2, costs: 3, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: 2 contracts and 3 cost rows were ${tail}`);
    expect(saveFailureText({ kind: "gone", contracts: 1, costs: 1, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: 1 contract and 1 cost row were ${tail}`);
    expect(saveFailureText({ kind: "gone", contracts: 1, costs: 0, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: 1 contract was ${tail}`);
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 1, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: 1 cost row was ${tail}`);
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 4, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: 4 cost rows were ${tail}`);
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 0, committedBefore: false }))
      .toBe(`${FAILED} Nothing was saved: some rows were ${tail}`);
  });

  it("UT-ADDCOST-SAVEMSG-009 gone with nothing committed before: exactly the 'Nothing was saved' text", () => {
    expect(saveFailureText({ kind: "gone", contracts: 2, costs: 3, committedBefore: false })).toBe(
      `${FAILED} Nothing was saved: 2 contracts and 3 cost rows were deleted by someone else after `
      + "this sheet was loaded. Reload the screen and try again.",
    );
  });

  it("UT-ADDCOST-SAVEMSG-010 gone after writes landed: never 'Nothing was saved'; says some changes were saved", () => {
    const text = saveFailureText({ kind: "gone", contracts: 2, costs: 3, committedBefore: true });
    expect(text).toBe(
      `${FAILED} 2 contracts and 3 cost rows were deleted by someone else after this sheet was loaded. `
      + "Some of your changes were already saved: reload the screen before saving again.",
    );
    expect(text).not.toContain("Nothing was saved");
    expect(text.startsWith(`${ADDCOST_MSG.saveFailed} `)).toBe(true);
    expect(saveFailureText({ kind: "gone", contracts: 1, costs: 0, committedBefore: true })).toBe(
      `${FAILED} 1 contract was deleted by someone else after this sheet was loaded. `
      + "Some of your changes were already saved: reload the screen before saving again.",
    );
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 1, committedBefore: true })).toBe(
      `${FAILED} 1 cost row was deleted by someone else after this sheet was loaded. `
      + "Some of your changes were already saved: reload the screen before saving again.",
    );
  });

  it("UT-ADDCOST-SAVEMSG-011 unknown counts (0 / 0) say 'some rows', never '0 contracts and 0 cost rows', in both branches", () => {
    for (const committedBefore of [false, true]) {
      const text = saveFailureText({ kind: "gone", contracts: 0, costs: 0, committedBefore });
      expect(text.toLowerCase()).toContain(" some rows were deleted by someone else after this sheet was loaded.");
      expect(text).not.toMatch(/\b0 (contracts?|cost rows?)\b/);
    }
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 0, committedBefore: false })).toBe(
      `${FAILED} Nothing was saved: some rows were deleted by someone else after this sheet was loaded. `
      + "Reload the screen and try again.",
    );
    // Starts a sentence here, so it is capitalised.
    expect(saveFailureText({ kind: "gone", contracts: 0, costs: 0, committedBefore: true })).toBe(
      `${FAILED} Some rows were deleted by someone else after this sheet was loaded. `
      + "Some of your changes were already saved: reload the screen before saving again.",
    );
    expect(ADDCOST_SAVE_MSG.goneAfterCommit(0, 0)).toBe(
      "Some rows were deleted by someone else after this sheet was loaded. "
      + "Some of your changes were already saved: reload the screen before saving again.",
    );
  });

  it("UT-ADDCOST-SAVEMSG-008 the conflict details read naturally", () => {
    expect(ADDCOST_SAVE_MSG.conflictSameCell("My Cost", "Turbine", 2026))
      .toBe('"My Cost" under account "Turbine" has more than one row for 2026.');
    expect(ADDCOST_SAVE_MSG.conflictSameGroup("X", ['"A"', '"B"']))
      .toBe('"X" is listed under "A" and "B", which are the same sub-account.');
    expect(ADDCOST_SAVE_MSG.conflictSameGroup("X", ['"A"']))
      .toBe('"X" under account "A" is listed more than once.');
    expect(ADDCOST_SAVE_MSG.conflictSameContract(['"A"', '"B"'], "Turbine"))
      .toBe('"A" and "B" under account "Turbine" point to the same saved cost item.');
  });
});

/* ═══════════════ indexed rules behave exactly like the scans (UT-ADDCOST-067..) ══ */

/**
 * `buildInitialSheet`, `planContractDeletions` and three of the six validations were rewritten
 * to index once instead of scanning per row (`prepare.bench.test.ts` has the numbers). The
 * implementations they replaced are kept here, verbatim, as the ORACLE, and every seeded
 * random input must come out identical from both — including the awkward ones: duplicated
 * sub-accounts and contract ids, contracts with no sub-account, two costs on one cell, months
 * outside 1-12, null and zero costs, contracts with no costs at all.
 */
describe("the indexed rules match the scanning ones they replaced", () => {
  /* ── the oracle: the pre-index implementations, verbatim ── */

  const yesNoTextOrDefault = (v: boolean | null): string => (v === true ? "Yes" : v === false ? "No" : "No");

  function oracleBuildInitialSheet(args: Parameters<typeof buildInitialSheet>[0]): SheetRow[] {
    const payerDefaults = args.payerDefaults ?? new Map<string, string>();
    const rows: SheetRow[] = [];
    for (const sub of args.subaccounts) {
      const subContracts = args.contracts.filter((c) => c.subaccountId === sub.id);
      if (subContracts.length === 0) {
        rows.push({
          rowId: `new-${sub.id}`, accountNumber: sub.number, accountName: sub.name, description: "",
          year: args.currentYear, costPaidBy: payerDefaults.get(sub.id) ?? null, depreciation: null,
          applyVat: null, months: new Array(12).fill(null), subAccountId: sub.id, projectContractId: null,
        });
        continue;
      }
      for (const contract of subContracts) {
        const contractCosts = args.costs.filter((c) => c.contractId === contract.id);
        const years = [...new Set(contractCosts.map((c) => c.year))].sort((a, b) => a - b);
        const yearsToShow = years.length > 0 ? years : [args.currentYear];
        for (const year of yearsToShow) {
          const months: (number | null)[] = new Array(12).fill(null);
          for (const c of contractCosts) {
            if (c.year === year && c.month >= 1 && c.month <= 12) months[c.month - 1] = c.cost ?? null;
          }
          rows.push({
            rowId: `${contract.id}-${year}`, accountNumber: sub.number, accountName: sub.name,
            description: contract.name, year, costPaidBy: costPaidByText(contract.costType),
            depreciation: yesNoTextOrDefault(contract.depreciation),
            applyVat: yesNoTextOrDefault(contract.applyVat), months, subAccountId: sub.id,
            projectContractId: contract.id,
          });
        }
      }
    }
    return rows;
  }

  function oraclePlanContractDeletions(args: Parameters<typeof planContractDeletions>[0]) {
    const { originalRows, sheetRows, contracts, costs, currentYear } = args;
    const stillPresent = new Set(sheetRows.map((r) => r.projectContractId).filter((x): x is string => x !== null));
    const removed = [...new Set(
      originalRows.map((r) => r.projectContractId).filter((x): x is string => x !== null && !stillPresent.has(x)),
    )];
    const hasPastCosts = (contractId: string) =>
      costs.some((c) => c.contractId === contractId && c.year < currentYear && (c.cost ?? 0) !== 0);
    if (args.allowPastCostDeletion) return { deleteIds: removed, blockedByPastCosts: [] };
    const blocked = removed.filter(hasPastCosts);
    return {
      deleteIds: removed.filter((id) => !blocked.includes(id)),
      blockedByPastCosts: blocked.map((id) => ({ id, name: contracts.find((c) => c.id === id)?.name ?? id })),
    };
  }

  const oKey = (r: SheetRow) => ({ rowKey: r.rowId, accountNumber: r.accountNumber, accountName: r.accountName });

  function oracleDuplicateSubaccounts(rows: readonly SheetRow[]) {
    const groupKey = (r: SheetRow) => `${uniqueId(r)}|${r.year}`;
    const byUnique = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = byUnique.get(groupKey(r)) ?? new Set<string>();
      set.add(r.rowId);
      byUnique.set(groupKey(r), set);
    }
    return rows.filter((r) => (byUnique.get(groupKey(r))?.size ?? 0) > 1)
      .map((r) => ({ ...oKey(r), message: `${uniqueId(r)}${ADDCOST_MSG.duplicateSubaccount}` }));
  }

  /**
   * Not the pre-index implementation (that rule was the reverse of the canvas, bug CA-12): the
   * canvas formula itself, `CountIf(colPCFDataOut, Name = Current.Name, CurrentYear =
   * Current.CurrentYear, row_ID = Current.row_ID, Number = Current.Number, Description =
   * Current.Description) > 1`, as a quadratic scan with no key strings.
   */
  function oracleDuplicateContracts(rows: readonly SheetRow[]) {
    const costCountRows = (c: SheetRow) => rows.filter((r) => r.accountName === c.accountName
      && String(r.year) === String(c.year) && r.rowId === c.rowId
      && r.accountNumber === c.accountNumber && r.description === c.description).length;
    return rows.filter((r) => costCountRows(r) > 1)
      .map((r) => ({ ...oKey(r), message: `${r.description}${ADDCOST_MSG.duplicateContract}` }));
  }

  function oracleContractHasCost(rows: readonly SheetRow[]) {
    const groupKey = (r: SheetRow) => `${r.accountName}|${r.accountNumber}|${r.description}`;
    const hasCost = new Map<string, boolean>();
    for (const r of rows) {
      const any = r.months.some((m) => m !== null && m !== 0);
      hasCost.set(groupKey(r), (hasCost.get(groupKey(r)) ?? false) || any);
    }
    return rows.filter((r) => hasCost.get(groupKey(r)) === false)
      .map((r) => ({ ...oKey(r), message: `${r.description}${ADDCOST_MSG.noCost}` }));
  }

  /* ── seeded, hostile inputs ── */

  function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function world(seed: number) {
    const rand = seeded(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
    const subIds = ["sub-1", "sub-2", "sub-3", "sub-1"];
    const subaccounts = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => ({
      id: pick(subIds), number: `8000${i}_0`, name: pick(["Turbine", "Grid"]),
    }));
    const contracts: ExistingContract[] = Array.from({ length: Math.floor(rand() * 8) }, (_, i) => contract({
      id: rand() < 0.15 ? "c-dup" : `c-${i}`, name: pick(["Alpha", "Beta", "", "Standard X"]),
      subaccountId: rand() < 0.15 ? null : pick(subIds),
      costType: pick([null, CHOICE.costPaidType.spv, CHOICE.costPaidType.devCo]),
      depreciation: pick([null, true, false]), applyVat: pick([null, true, false]),
    }));
    const costs: ExistingCost[] = Array.from({ length: Math.floor(rand() * 25) }, (_, i) => cost({
      id: `k-${i}`, contractId: contracts.length > 0 && rand() < 0.9 ? pick(contracts).id : "c-none",
      year: pick([2018, 2019, 2020, 2021]), month: pick([0, 1, 2, 12, 13, 5]),
      cost: pick([null, 0, 10, 250]),
    }));
    const sheetRow = (): SheetRow => row({
      rowId: `Row_${Math.floor(rand() * 3)}`, accountNumber: pick(["80000_0", "80001_0"]),
      accountName: pick(["Turbine", "Grid"]), description: pick(["Alpha", "Beta", "", "standard y"]),
      year: pick([2019, 2020]), costPaidBy: pick(["DevCo", null, " "]), depreciation: pick(["Yes", null]),
      applyVat: pick(["No", ""]),
      months: Array.from({ length: 12 }, () => pick([null, null, 0, 3])),
      subAccountId: rand() < 0.85 ? "sub-1" : null,
      projectContractId: contracts.length > 0 && rand() < 0.7 ? pick(contracts).id : null,
    });
    const sheet = (n: number) => Array.from({ length: n }, sheetRow);
    return { rand, subaccounts, contracts, costs, sheet };
  }

  const SEEDS = Array.from({ length: 400 }, (_, i) => 5000 + i);

  it("UT-ADDCOST-067 buildInitialSheet builds the same rows as the per-contract cost filter", () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const args = {
        subaccounts: w.subaccounts, contracts: w.contracts, costs: w.costs, currentYear: 2020,
        payerDefaults: new Map([["sub-2", "SPV"]]),
      };
      expect(buildInitialSheet(args), `seed ${seed}`).toEqual(oracleBuildInitialSheet(args));
    }
  });

  it("UT-ADDCOST-068 planContractDeletions blocks, deletes and names exactly the same contracts", () => {
    let blocked = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const originalRows = w.sheet(12);
      const sheetRows = originalRows.filter(() => w.rand() < 0.5);
      for (const allowPastCostDeletion of [undefined, true]) {
        const args = {
          originalRows, sheetRows, contracts: w.contracts, costs: w.costs, currentYear: 2020,
          allowPastCostDeletion,
        };
        const expected = oraclePlanContractDeletions(args);
        expect(planContractDeletions(args), `seed ${seed}`).toEqual(expected);
        blocked += expected.blockedByPastCosts.length;
      }
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it("UT-ADDCOST-069 the three regrouped validations, and validateSheet, report the same errors", () => {
    let reported = 0;
    for (const seed of SEEDS) {
      const rows = world(seed).sheet(15);
      expect(validateDuplicateSubaccounts(rows), `seed ${seed}`).toEqual(oracleDuplicateSubaccounts(rows));
      expect(validateDuplicateContracts(rows), `seed ${seed}`).toEqual(oracleDuplicateContracts(rows));
      expect(validateContractHasCost(rows), `seed ${seed}`).toEqual(oracleContractHasCost(rows));
      const all = [
        ...oracleDuplicateSubaccounts(rows), ...validateCostOnAccount(rows), ...oracleDuplicateContracts(rows),
        ...validateMissingMetadata(rows), ...validateStandardWord(rows), ...oracleContractHasCost(rows),
      ];
      const seen = new Set<string>();
      const expected = all.filter((e) => (seen.has(e.message) ? false : (seen.add(e.message), true)));
      expect(validateSheet(rows), `seed ${seed}`).toEqual(expected);
      reported += expected.length;
    }
    expect(reported).toBeGreaterThan(0);
  });
});
