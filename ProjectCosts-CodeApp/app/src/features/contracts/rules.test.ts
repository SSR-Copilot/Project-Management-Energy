import { describe, expect, it } from "vitest";
import {
  CONTRACT_TYPE, CLOSING_DATE_TYPE, TOTAL_COSTS_TYPE, MARGIN_TYPE,
  CAPEX_ROOT_NUMBER, CAPEX_EXCLUDED_ROOT_NUMBER, CONTRACT_COSTS_MAX, RESX, MSG,
  buildAccountTree, applyUsage, applySelection, selectedLeafAccounts,
  costsUntilClosing, costsAfterClosing,
  totalCostsCalculated, totalCostOfContract, totalCostOfContractCanvasParity,
  validateCostField, validateDescription, validateMarginPercentage,
  canSaveContract, contractErrors,
  validatePaymentDate, remainingPercent, validateTargetPercent, paymentTargetErrors,
  contractName, paymentTargetName, devCoCostName, contractCardTitle, panelTitle,
  recalculateForm, contractTotalFromForm,
  currencyCode, costLabel, contractCommands, sortContracts,
  cardShowsClosingCosts, cardTotalLabel, CONTRACT_TYPE_NAME,
  type AccountRow, type CapexCostRow, type ContractForm, type PaymentTarget, type BopContract,
} from "./rules";

/* ------------------------------------------------------------------ fixtures */

const ROOT: AccountRow = { id: "root", number: CAPEX_ROOT_NUMBER, name: "CAPEX" };
const accounts: AccountRow[] = [
  ROOT,
  { id: "l1a", number: "80000", name: "Turbine / PV Supply Agreement", parentId: "root", order: 1 },
  { id: "l1b", number: "80001", name: "Additional WTG / PV Costs", parentId: "root", order: 2 },
  { id: "excl", number: CAPEX_EXCLUDED_ROOT_NUMBER, name: "Excluded", parentId: "root", order: 3 },
  { id: "l2a", number: "80000_0", name: "Turbine supply", parentId: "l1a", order: 1 },
  { id: "l3a", number: "80000_0_1", name: "Turbines", parentId: "l2a", order: 1 },
  { id: "l3b", number: "80000_0_2", name: "Towers", parentId: "l2a", order: 2 },
];

const validForm: ContractForm = {
  description: "Main works",
  contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 5, 15),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsUntilClosingPlan: "1000",
  costsUntilClosingActual: "",
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingPlan: "500",
  costsAfterClosingActual: "",
  totalCostsType: TOTAL_COSTS_TYPE.Calculated,
  totalCostsCalculated: "1500",
  totalCostsOverwrite: "",
  margin: false,
  marginType: MARGIN_TYPE.Percentage,
  marginPercentage: "",
  marginFixedValue: "",
  comment: "",
  isMarginStandardAssumption: false,
};

/* ------------------------------------------------------------- account tree */

describe("buildAccountTree", () => {
  it("UT-CON-001 roots at the children of account 00001", () => {
    const tree = buildAccountTree(accounts, []);
    const level1 = tree.filter((n) => n.level === 1).map((n) => n.number);
    expect(level1).toEqual(["80000", "80001"]);
  });

  it("UT-CON-002 excludes account 10006 from the roots", () => {
    // Contracts Screen.OnVisible: Not(ThisRecord.Number = "10006")
    const tree = buildAccountTree(accounts, []);
    expect(tree.some((n) => n.number === CAPEX_EXCLUDED_ROOT_NUMBER)).toBe(false);
  });

  it("UT-CON-003 builds exactly three levels", () => {
    const tree = buildAccountTree(accounts, []);
    expect(tree.filter((n) => n.level === 2).map((n) => n.number)).toEqual(["80000_0"]);
    expect(tree.filter((n) => n.level === 3).map((n) => n.number))
      .toEqual(["80000_0_1", "80000_0_2"]);
  });

  it("UT-CON-004 sums DevCo contract totals onto level 3 only", () => {
    const tree = buildAccountTree(accounts, [
      { id: "c1", accountId: "l3a", totalCost: 400 },
      { id: "c2", accountId: "l3a", totalCost: 600 },
      { id: "c3", accountId: "l2a", totalCost: 999 },
    ]);
    expect(tree.find((n) => n.id === "l3a")?.totalCost).toBe(1000);
    // The canvas only computes TotalCost in the level-3 Collect; levels 1 and 2 are 0.
    expect(tree.find((n) => n.id === "l2a")?.totalCost).toBe(0);
    expect(tree.find((n) => n.id === "l1a")?.totalCost).toBe(0);
  });

  it("UT-CON-005 records the child count at each level", () => {
    const tree = buildAccountTree(accounts, []);
    expect(tree.find((n) => n.id === "l1a")?.childCount).toBe(1);
    expect(tree.find((n) => n.id === "l2a")?.childCount).toBe(2);
    expect(tree.find((n) => n.id === "l3a")?.childCount).toBe(0);
  });

  it("UT-CON-006 sorts by account number ascending", () => {
    const tree = buildAccountTree(accounts, []);
    expect(tree.map((n) => n.number)).toEqual([...tree.map((n) => n.number)].sort());
  });

  it("UT-CON-007 yields nothing when the 00001 root is absent", () => {
    // A filtered/paged account query that drops the root must not silently produce a
    // half-tree that looks plausible.
    expect(buildAccountTree(accounts.filter((a) => a.id !== "root"), [])).toEqual([]);
  });

  it("UT-CON-008 tolerates a missing order", () => {
    const tree = buildAccountTree([ROOT, { id: "x", number: "9", name: "n", parentId: "root" }], []);
    expect(tree[0]?.order).toBe(0);
  });
});

describe("applyUsage", () => {
  const tree = buildAccountTree(accounts, []);

  it("UT-CON-009 marks an account claimed by another contract as used", () => {
    const out = applyUsage(tree, [{ accountId: "l3a", contractId: "other" }], "mine");
    expect(out.find((n) => n.id === "l3a")?.used).toBe(true);
    expect(out.find((n) => n.id === "l3a")?.usedByContractId).toBe("other");
  });

  it("UT-CON-010 leaves your own contract's accounts available", () => {
    const out = applyUsage(tree, [{ accountId: "l3a", contractId: "mine" }], "mine");
    expect(out.find((n) => n.id === "l3a")?.used).toBe(false);
  });

  it("UT-CON-011 marks everything used when creating a new contract", () => {
    // editingContractId is undefined on Add, so every claimed account is unavailable.
    const out = applyUsage(tree, [{ accountId: "l3a", contractId: "other" }], undefined);
    expect(out.find((n) => n.id === "l3a")?.used).toBe(true);
  });
});

describe("applySelection and selectedLeafAccounts", () => {
  it("UT-CON-012 ticks only the named accounts", () => {
    const out = applySelection(buildAccountTree(accounts, []), ["l3a"]);
    expect(out.filter((n) => n.selected).map((n) => n.id)).toEqual(["l3a"]);
  });

  it("UT-CON-013 returns only ticked LEVEL 3 accounts", () => {
    // A save writes one DevCo-cost row per selected level-3 account; a ticked parent must
    // not produce a row.
    const out = applySelection(buildAccountTree(accounts, []), ["l1a", "l2a", "l3a"]);
    expect(selectedLeafAccounts(out).map((n) => n.id)).toEqual(["l3a"]);
  });
});

/* ------------------------------------------------------ closing-date split */

describe("costsUntilClosing / costsAfterClosing", () => {
  const costs: CapexCostRow[] = [
    { contractId: "c", year: 2025, month: 12, cost: 100 }, // before the closing year
    { contractId: "c", year: 2026, month: 5, cost: 200 },  // closing year, before month
    { contractId: "c", year: 2026, month: 6, cost: 300 },  // the closing month itself
    { contractId: "c", year: 2026, month: 7, cost: 400 },  // closing year, after month
    { contractId: "c", year: 2027, month: 1, cost: 500 },  // after the closing year
  ];
  const closingDate = new Date(2026, 5, 15); // June 2026

  it("UT-CON-014 includes the closing month in the 'until' half", () => {
    expect(costsUntilClosing({ closingDate, costs })).toBe(600); // 100 + 200 + 300
  });

  it("UT-CON-015 excludes the closing month from the 'after' half", () => {
    expect(costsAfterClosing({ closingDate, costs })).toBe(900); // 400 + 500
  });

  it("UT-CON-016 the two halves partition the total exactly", () => {
    const total = 100 + 200 + 300 + 400 + 500;
    expect(costsUntilClosing({ closingDate, costs }) + costsAfterClosing({ closingDate, costs }))
      .toBe(total);
  });

  it("UT-CON-017 treats blank costs as zero, as Power Fx Sum does", () => {
    const withBlanks: CapexCostRow[] = [
      { contractId: "c", year: 2026, month: 1 },
      { contractId: "c", year: 2026, month: 2, cost: 50 },
    ];
    expect(costsUntilClosing({ closingDate, costs: withBlanks })).toBe(50);
  });

  it("UT-CON-018 is zero for no cost rows", () => {
    expect(costsUntilClosing({ closingDate, costs: [] })).toBe(0);
    expect(costsAfterClosing({ closingDate, costs: [] })).toBe(0);
  });

  it("UT-CON-019 puts a December closing date's whole year in the 'until' half", () => {
    const dec = new Date(2026, 11, 31);
    expect(costsUntilClosing({ closingDate: dec, costs })).toBe(1000); // 100+200+300+400
    expect(costsAfterClosing({ closingDate: dec, costs })).toBe(500);
  });
});

/* ----------------------------------------------------------- total chain */

describe("totalCostsCalculated", () => {
  const recalculated = { untilClosingPlan: 1000, afterClosingPlan: 500 };

  it("UT-CON-020 sums the two Plan halves", () => {
    expect(totalCostsCalculated(validForm, recalculated, "en-GB")).toBe(1500);
  });

  it("UT-CON-021 takes the typed Actual where that half is set to Actual", () => {
    const form = {
      ...validForm,
      costsUntilClosingType: CLOSING_DATE_TYPE.Actual,
      costsUntilClosingActual: "700",
    };
    expect(totalCostsCalculated(form, recalculated, "en-GB")).toBe(1200); // 700 + 500
  });

  it("UT-CON-022 ignores the halves entirely when the type is Overwrite", () => {
    const form = {
      ...validForm,
      totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
      totalCostsOverwrite: "42",
    };
    expect(totalCostsCalculated(form, recalculated, "en-GB")).toBe(42);
  });

  it("UT-CON-023 rounds, because the target column is a Dataverse integer", () => {
    // vsb_totalcostscalculated is `int`; vsb_cost on CAPEX Cost is `decimal`.
    expect(totalCostsCalculated(validForm, { untilClosingPlan: 0.5, afterClosingPlan: 0 }, "en-GB"))
      .toBe(1);
  });

  it("UT-CON-024 treats an unparseable Overwrite as zero", () => {
    const form = {
      ...validForm,
      totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
      totalCostsOverwrite: "abc",
    };
    expect(totalCostsCalculated(form, recalculated, "en-GB")).toBe(0);
  });
});

describe("totalCostOfContract", () => {
  it("UT-CON-025 returns the calculated total when there is no margin", () => {
    expect(totalCostOfContract({ ...validForm, margin: false }, 1000, "en-GB")).toBe(1000);
  });

  it("UT-CON-026 applies a percentage margin", () => {
    const form = { ...validForm, margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "10" };
    expect(totalCostOfContract(form, 1000, "en-GB")).toBe(1100);
  });

  it("UT-CON-027 adds a fixed margin", () => {
    const form = { ...validForm, margin: true, marginType: MARGIN_TYPE.FixedValue, marginFixedValue: "250" };
    expect(totalCostOfContract(form, 1000, "en-GB")).toBe(1250);
  });

  it("UT-CON-028 leaves the total alone when the percentage is unparseable", () => {
    const form = { ...validForm, margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "abc" };
    expect(totalCostOfContract(form, 1000, "en-GB")).toBe(1000);
  });

  it("UT-CON-029 SOURCE DEFECT C-6a: the canvas adds the fixed margin even with Margin = No", () => {
    // The canvas `Margin = No` branch is byte-identical to the fixed-value branch. Reachable
    // on Edit of a stored row, and on a new contract seeded from a standard assumption whose
    // marginvalue is non-zero but whose margin flag is not set.
    const form = { ...validForm, margin: false, marginFixedValue: "250" };
    expect(totalCostOfContractCanvasParity(form, 1000, "en-GB")).toBe(1250);
    expect(totalCostOfContract(form, 1000, "en-GB")).toBe(1000);
  });

  it("UT-CON-030 SOURCE DEFECT C-6b: the canvas blanks the total on a bad percentage", () => {
    // The percentage branch has no else, so Power Fx yields Blank() and the stored total is
    // wiped rather than left unchanged.
    const form = { ...validForm, margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "" };
    expect(totalCostOfContractCanvasParity(form, 1000, "en-GB")).toBeUndefined();
    expect(totalCostOfContract(form, 1000, "en-GB")).toBe(1000);
  });

  it("UT-CON-031 agrees with the canvas on every path that is not defective", () => {
    const pct = { ...validForm, margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "7.5" };
    const fix = { ...validForm, margin: true, marginType: MARGIN_TYPE.FixedValue, marginFixedValue: "99" };
    expect(totalCostOfContract(pct, 800, "en-GB")).toBe(totalCostOfContractCanvasParity(pct, 800, "en-GB"));
    expect(totalCostOfContract(fix, 800, "en-GB")).toBe(totalCostOfContractCanvasParity(fix, 800, "en-GB"));
  });
});

/* ----------------------------------------------------------- validation */

describe("validateCostField", () => {
  it("UT-CON-032 reports blank, non-integer and out-of-range in the canvas order", () => {
    expect(validateCostField("f", "", "en-GB")?.message).toBe(RESX.inputBlank);
    expect(validateCostField("f", "1.5", "en-GB")?.message).toBe(RESX.numeric);
    expect(validateCostField("f", "-1", "en-GB")?.message).toContain("between");
  });

  it("UT-CON-033 accepts the bounds inclusively", () => {
    expect(validateCostField("f", "0", "en-GB")).toBeUndefined();
    expect(validateCostField("f", String(CONTRACT_COSTS_MAX), "en-GB")).toBeUndefined();
    expect(validateCostField("f", String(CONTRACT_COSTS_MAX + 1), "en-GB")).toBeDefined();
  });
});

describe("validateDescription", () => {
  it("UT-CON-034 rejects whitespace only, matching IsBlank(Trim(value))", () => {
    expect(validateDescription("   ")?.message).toBe(RESX.inputBlank);
    expect(validateDescription(" x ")).toBeUndefined();
  });
});

describe("validateMarginPercentage", () => {
  it("UT-CON-035 allows one decimal, 0 to 100", () => {
    expect(validateMarginPercentage("7.5", "en-GB")).toBeUndefined();
    expect(validateMarginPercentage("7.55", "en-GB")?.message).toBe(RESX.numericOneDecimals);
    expect(validateMarginPercentage("101", "en-GB")?.message).toContain("between");
    expect(validateMarginPercentage("", "en-GB")?.message).toBe(RESX.inputBlank);
  });
});

describe("canSaveContract", () => {
  const tree = applySelection(buildAccountTree(accounts, []), ["l3a"]);

  it("UT-CON-036 stays disabled until Recalculate has run", () => {
    // The canvas gate's FIRST term is locContractDevCoCostsDirty, which only Recalculate
    // sets. It is what guarantees the stored totals match the stored inputs.
    expect(canSaveContract({ form: validForm, tree, recalculated: false, locale: "en-GB" })).toBe(false);
    expect(canSaveContract({ form: validForm, tree, recalculated: true, locale: "en-GB" })).toBe(true);
  });

  it("UT-CON-037 requires at least one level-3 DevCo account", () => {
    const bare = buildAccountTree(accounts, []);
    expect(canSaveContract({ form: validForm, tree: bare, recalculated: true, locale: "en-GB" })).toBe(false);
  });

  it("UT-CON-038 requires a description and a closing date", () => {
    expect(canSaveContract({
      form: { ...validForm, description: "  " }, tree, recalculated: true, locale: "en-GB",
    })).toBe(false);
    expect(canSaveContract({
      form: { ...validForm, closingDate: undefined }, tree, recalculated: true, locale: "en-GB",
    })).toBe(false);
  });

  it("UT-CON-039 validates only the half each radio selects", () => {
    // Actual is blank, but the radio says Plan, so the blank Actual must not block Save.
    const planOnly = { ...validForm, costsUntilClosingActual: "" };
    expect(canSaveContract({ form: planOnly, tree, recalculated: true, locale: "en-GB" })).toBe(true);

    const actualSelected = { ...validForm, costsUntilClosingType: CLOSING_DATE_TYPE.Actual };
    expect(canSaveContract({ form: actualSelected, tree, recalculated: true, locale: "en-GB" })).toBe(false);
  });

  it("UT-CON-040 skips margin validation entirely when there is no margin", () => {
    const noMargin = { ...validForm, margin: false, marginPercentage: "nonsense" };
    expect(canSaveContract({ form: noMargin, tree, recalculated: true, locale: "en-GB" })).toBe(true);
  });

  it("UT-CON-041 validates the margin field the margin type selects", () => {
    const badPct = { ...validForm, margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "abc" };
    expect(canSaveContract({ form: badPct, tree, recalculated: true, locale: "en-GB" })).toBe(false);
    const goodFixed = { ...validForm, margin: true, marginType: MARGIN_TYPE.FixedValue, marginFixedValue: "10", marginPercentage: "abc" };
    expect(canSaveContract({ form: goodFixed, tree, recalculated: true, locale: "en-GB" })).toBe(true);
  });
});

describe("contractErrors", () => {
  it("UT-CON-042 DIVERGENCE D-4: a blank required field now reports why", () => {
    // The canvas *_ErrorMessage.Visible requires Not(IsBlank(field)), so a blank field showed
    // no message while still disabling Save — a greyed-out button with no explanation.
    const blank: ContractForm = { ...validForm, description: "", costsUntilClosingPlan: "" };
    const errors = contractErrors(blank, buildAccountTree(accounts, []), "en-GB");
    expect(errors.map((e) => e.field)).toContain("description");
    expect(errors.map((e) => e.field)).toContain("costsUntilClosingPlan");
    expect(errors.map((e) => e.field)).toContain("devCoCosts");
  });

  it("UT-CON-043 is empty for a valid form", () => {
    const tree = applySelection(buildAccountTree(accounts, []), ["l3a"]);
    expect(contractErrors(validForm, tree, "en-GB")).toEqual([]);
  });
});

/* ------------------------------------------------- payment target rules */

describe("validatePaymentDate", () => {
  const projectStart = new Date(2026, 2, 15); // 15 March 2026

  it("UT-CON-044 requires MM/YYYY", () => {
    expect(validatePaymentDate("", projectStart)?.message).toBe(RESX.inputBlank);
    expect(validatePaymentDate("3/2026", projectStart)?.message).toBe(MSG.paymentDateFormat);
    expect(validatePaymentDate("13/2026", projectStart)?.message).toBe(MSG.paymentDateFormat);
    expect(validatePaymentDate("00/2026", projectStart)?.message).toBe(MSG.paymentDateFormat);
    expect(validatePaymentDate("2026/03", projectStart)?.message).toBe(MSG.paymentDateFormat);
  });

  it("UT-CON-045 accepts the project's own start month", () => {
    // The canvas comparison borrows Day(projectStart), so 03/2026 becomes 2026-03-15 and
    // compares equal.
    expect(validatePaymentDate("03/2026", projectStart)).toBeUndefined();
  });

  it("UT-CON-046 rejects a month before the project start", () => {
    expect(validatePaymentDate("02/2026", projectStart)?.message)
      .toBe("Payment date must be greater project start date 03/2026");
  });

  it("UT-CON-047 zero-pads the month in the message", () => {
    const january = new Date(2026, 0, 10);
    expect(validatePaymentDate("12/2025", january)?.message).toContain("01/2026");
  });

  it("UT-CON-048 skips the range check when the project has no start date", () => {
    expect(validatePaymentDate("01/1999", undefined)).toBeUndefined();
  });

  it("UT-CON-049 does not throw on input that cannot be parsed as a date", () => {
    // The canvas version binds DateValue("--15") eagerly in a `With` and raises an error
    // that App.OnError then swallows.
    expect(() => validatePaymentDate("nonsense", projectStart)).not.toThrow();
  });
});

describe("remainingPercent and validateTargetPercent", () => {
  const targets: PaymentTarget[] = [
    { id: "t1", contractId: "c", totalCostsContract: 30 },
    { id: "t2", contractId: "c", totalCostsContract: 25 },
  ];

  it("UT-CON-050 leaves what the other targets have not claimed", () => {
    expect(remainingPercent(targets, undefined)).toBe(45);
  });

  it("UT-CON-051 gives an edited target its own share back", () => {
    // Editing t1 must not count t1's own 30 against it.
    expect(remainingPercent(targets, "t1")).toBe(75);
  });

  it("UT-CON-052 is 100 when there are no targets", () => {
    expect(remainingPercent([], undefined)).toBe(100);
  });

  it("UT-CON-053 rounds to one decimal, as Round(..., 1) did", () => {
    expect(remainingPercent([{ id: "x", contractId: "c", totalCostsContract: 33.33 }], undefined))
      .toBe(66.7);
  });

  it("UT-CON-054 enforces one decimal and the remaining bound", () => {
    expect(validateTargetPercent("45", 45, "en-GB")).toBeUndefined();
    expect(validateTargetPercent("45.5", 45, "en-GB")?.message).toContain("between");
    expect(validateTargetPercent("4.55", 45, "en-GB")?.message).toBe(RESX.numericOneDecimals);
    expect(validateTargetPercent("", 45, "en-GB")?.message).toBe(RESX.inputBlank);
  });
});

describe("paymentTargetErrors", () => {
  it("UT-CON-055 collects every failing field", () => {
    const errors = paymentTargetErrors({
      form: { description: "", paymentDate: "bad", totalCostsContract: "", note: "" },
      projectStart: new Date(2026, 0, 1),
      targets: [],
      locale: "en-GB",
    });
    expect(errors.map((e) => e.field).sort())
      .toEqual(["description", "paymentDate", "totalCostsContract"]);
  });

  it("UT-CON-056 caps the note at the length the counter advertises", () => {
    // lbl_..._PaymentTarget_Note_Details.Text renders `{Len(value)}/55`.
    const errors = paymentTargetErrors({
      form: { description: "d", paymentDate: "01/2026", totalCostsContract: "10", note: "x".repeat(56) },
      projectStart: new Date(2026, 0, 1),
      targets: [],
      locale: "en-GB",
    });
    expect(errors.map((e) => e.field)).toEqual(["note"]);
  });
});

/* ----------------------------------------------------------- derived text */

describe("derived names", () => {
  it("UT-CON-057 builds the contract name from the Project ID code", () => {
    expect(contractName("9999940", " Main works ")).toBe("BoP-9999940-Main works");
  });

  it("UT-CON-058 builds the payment-target name from the contract description", () => {
    expect(paymentTargetName("Main works", "Milestone 1")).toBe("BoP-PT-Main works-Milestone 1");
  });

  it("UT-CON-059 tolerates a contract with no description", () => {
    expect(paymentTargetName(undefined, "M1")).toBe("BoP-PT--M1");
  });

  it("UT-CON-060 names a DevCo-cost row number-then-name", () => {
    expect(devCoCostName({ number: "80000_0_1", name: "Turbines" })).toBe("80000_0_1-Turbines");
  });

  it("UT-CON-061 titles a contract card as type then description", () => {
    expect(contractCardTitle({ contractType: CONTRACT_TYPE.Development, description: "Main" }))
      .toBe("Development Contract - Main");
  });

  it("UT-CON-062 titles the panel Add or Edit", () => {
    expect(panelTitle(false, CONTRACT_TYPE.Construction)).toBe("Add Construction Contract");
    expect(panelTitle(true, CONTRACT_TYPE.ProjectRights)).toBe("Edit Project Rights Contract");
  });
});

describe("currency labels", () => {
  it("UT-CON-063 falls back to EUR when the country has no ISO code", () => {
    expect(currencyCode({})).toBe("EUR");
    expect(currencyCode({ isoCurrencyCode: "  " })).toBe("EUR");
    expect(currencyCode({ isoCurrencyCode: "PLN" })).toBe("PLN");
  });

  it("UT-CON-064 suffixes a cost label with the currency", () => {
    expect(costLabel("Total Costs", { isoCurrencyCode: "PLN" })).toBe("Total Costs [PLN]");
  });
});

/* ------------------------------------------------------------ command bar */

describe("contractCommands", () => {
  it("UT-CON-065 gates the three Add commands on create permission", () => {
    const denied = contractCommands({ canCreate: false, canWrite: true, canDelete: true, hasSelection: true });
    expect(denied.slice(0, 3).every((c) => !c.enabled)).toBe(true);
  });

  it("UT-CON-066 disables Edit and Delete with no selection", () => {
    const none = contractCommands({ canCreate: true, canWrite: true, canDelete: true, hasSelection: false });
    expect(none.find((c) => c.key === "editContarct")?.enabled).toBe(false);
    expect(none.find((c) => c.key === "deleteContarct")?.enabled).toBe(false);
  });

  it("UT-CON-067 SOURCE DEFECT D-5: passing canWrite as canDelete reproduces the canvas", () => {
    // cmd_Contracts_CommandBar.Items gates Delete on RecordInfo.EditPermission, so a user who
    // may edit but not delete sees Delete enabled and gets a 403.
    const canvas = contractCommands({ canCreate: true, canWrite: true, canDelete: true, hasSelection: true });
    const correct = contractCommands({ canCreate: true, canWrite: true, canDelete: false, hasSelection: true });
    expect(canvas.find((c) => c.key === "deleteContarct")?.enabled).toBe(true);
    expect(correct.find((c) => c.key === "deleteContarct")?.enabled).toBe(false);
  });

  it("UT-CON-068 uses the transcribed canvas labels", () => {
    const cmds = contractCommands({ canCreate: true, canWrite: true, canDelete: true, hasSelection: true });
    expect(cmds.map((c) => c.label)).toEqual([
      "Add Development Contract",
      "Add Construction Contract",
      "Add Project Rights Contract",
      "Edit",
      "Delete",
    ]);
  });
});

describe("sortContracts", () => {
  it("UT-CON-069 sorts by contract type then description", () => {
    const list = [
      { contractType: CONTRACT_TYPE.ProjectRights, description: "R" },
      { contractType: CONTRACT_TYPE.Development, description: "B" },
      { contractType: CONTRACT_TYPE.Development, description: "A" },
    ] as BopContract[];
    expect(sortContracts(list).map((c) => c.description)).toEqual(["A", "B", "R"]);
  });

  it("UT-CON-070 does not mutate its input", () => {
    const list = [
      { contractType: CONTRACT_TYPE.ProjectRights, description: "R" },
      { contractType: CONTRACT_TYPE.Development, description: "A" },
    ] as BopContract[];
    const before = list.map((c) => c.description);
    sortContracts(list);
    expect(list.map((c) => c.description)).toEqual(before);
  });
});

describe("recalculateForm", () => {
  const costs: CapexCostRow[] = [
    { contractId: "c", year: 2026, month: 3, cost: 400 },
    { contractId: "c", year: 2026, month: 9, cost: 600 },
  ];
  const base: ContractForm = { ...validForm, closingDate: new Date(2026, 5, 15) };

  it("UT-CON-071 writes both Plan halves and the calculated total in one pass", () => {
    const out = recalculateForm(base, costs, "en-GB");
    expect(out.costsUntilClosingPlan).toBe("400");
    expect(out.costsAfterClosingPlan).toBe("600");
    expect(out.totalCostsCalculated).toBe("1000");
  });

  it("UT-CON-072 leaves a half alone when its radio says Actual", () => {
    const form = {
      ...base,
      costsUntilClosingType: CLOSING_DATE_TYPE.Actual,
      costsUntilClosingActual: "111",
      costsUntilClosingPlan: "untouched",
    };
    const out = recalculateForm(form, costs, "en-GB");
    expect(out.costsUntilClosingPlan).toBe("untouched");
    expect(out.totalCostsCalculated).toBe("711"); // 111 actual + 600 plan
  });

  it("UT-CON-073 leaves the total alone when the type is Overwrite", () => {
    const form = {
      ...base,
      totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
      totalCostsCalculated: "untouched",
      totalCostsOverwrite: "42",
    };
    expect(recalculateForm(form, costs, "en-GB").totalCostsCalculated).toBe("untouched");
  });

  it("UT-CON-074 returns the form unchanged with no closing date", () => {
    // Both canvas halves are If(Not(IsBlank(closingDate)), …) and are Blank() without one.
    const form = { ...validForm, closingDate: undefined };
    expect(recalculateForm(form, costs, "en-GB")).toBe(form);
  });

  it("UT-CON-075 is idempotent", () => {
    const once = recalculateForm(base, costs, "en-GB");
    expect(recalculateForm(once, costs, "en-GB")).toEqual(once);
  });
});

describe("contractTotalFromForm", () => {
  it("UT-CON-076 reads the calculated or the overwrite figure per the radio", () => {
    expect(contractTotalFromForm({ ...validForm, totalCostsCalculated: "1000" }, "en-GB")).toBe(1000);
    expect(contractTotalFromForm({
      ...validForm, totalCostsType: TOTAL_COSTS_TYPE.Overwrite, totalCostsOverwrite: "250",
    }, "en-GB")).toBe(250);
  });

  it("UT-CON-077 applies the margin on top", () => {
    expect(contractTotalFromForm({
      ...validForm, totalCostsCalculated: "1000",
      margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "10",
    }, "en-GB")).toBe(1100);
  });

  it("UT-CON-078 is zero for a genuinely blank form rather than NaN", () => {
    // `validForm` above is a valid, fully populated fixture despite the name — an actually
    // blank form is what has to coalesce to 0, because `undefined + 1` in JS is NaN.
    const blank: ContractForm = {
      ...validForm,
      costsUntilClosingPlan: "", costsAfterClosingPlan: "",
      totalCostsCalculated: "", totalCostsOverwrite: "",
    };
    expect(contractTotalFromForm(blank, "en-GB")).toBe(0);
  });
});

describe("contract card body (canvas parity)", () => {
  it("UT-CON-079 shows the closing-cost block for Development and Construction", () => {
    expect(cardShowsClosingCosts(CONTRACT_TYPE.Development)).toBe(true);
    expect(cardShowsClosingCosts(CONTRACT_TYPE.Construction)).toBe(true);
  });

  it("UT-CON-080 hides the closing-cost block for a Project Rights contract", () => {
    // `con_…_Fields_{CostsUntilClosing,Margins,TotalDevContract,CostsAfterClosing,TotalCosts}
    // .Visible = Not(Contract Types = Project Rights Contract)`.
    expect(cardShowsClosingCosts(CONTRACT_TYPE.ProjectRights)).toBe(false);
  });

  it("UT-CON-081 names the total after the contract type, not 'cost of contract'", () => {
    // `$"Total {ThisItem.'Contract Types'} [{cur}]"` (`:1163`). "Total cost of contract" is the
    // EDIT PANEL's label (`:6200`) and must never appear on the card.
    expect(cardTotalLabel(CONTRACT_TYPE.Development, "EUR"))
      .toBe("Total Development Contract [EUR]");
    expect(cardTotalLabel(CONTRACT_TYPE.Construction, "PLN"))
      .toBe("Total Construction Contract [PLN]");
  });

  it("UT-CON-082 uses the Project Rights wording for an RC card", () => {
    // The separate `lbl_…_TotalCosts_RC` control (`:1023`) resolves to the same string.
    expect(cardTotalLabel(CONTRACT_TYPE.ProjectRights, "EUR"))
      .toBe("Total Project Rights Contract [EUR]");
  });

  it("UT-CON-083 degrades to 'Total [cur]' when the type is missing", () => {
    expect(cardTotalLabel(undefined, "EUR")).toBe("Total [EUR]");
    expect(cardTotalLabel(CONTRACT_TYPE.None, "EUR")).toBe("Total [EUR]");
  });

  it("UT-CON-084 labels the card's date 'Closing Date', not the panel's wording", () => {
    // `lbl_…_Card_Body_Fields_ClosingDate.Text = "Closing Date"`; the right panel's
    // "Contract Closing Date" is a different control and stays available for it.
    expect(MSG.closingDate).toBe("Closing Date");
    expect(MSG.contractClosingDate).toBe("Contract Closing Date");
    expect(CONTRACT_TYPE_NAME[CONTRACT_TYPE.Development]).toBe("Development Contract");
  });
});
