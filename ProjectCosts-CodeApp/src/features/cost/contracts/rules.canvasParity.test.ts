/**
 * UT-CONTR — the Contracts screen's Canvas-parity fixes of test run 3 (FT-BR-CONTR-xxx).
 *
 * Each case cites the reviewer case id and the canvas line it pins (`Contracts Screen.pa.yaml`).
 */
import { describe, expect, it } from "vitest";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, MSG, PAYMENT_TARGET_DESCRIPTION_MAX_LENGTH, RESX,
  TOTAL_COSTS_TYPE,
  canAddPaymentTarget, canChangePaymentTarget, canSaveRightsContract, cardClosingFigure,
  cardContractTotalText, cardMarginFigure, cardRightsTotalText, cardTotalCostsFigure,
  closingTypePatch, commentCounter, contractErrors, contractNameFor, contractTotalFromForm,
  devCoLeafCostByAccount, marginChangePatch, marginIsStandard, marginTypeChangePatch,
  newPeriodDescription, nextPeriodDescription, oneDecimalText, periodDescriptionLocked,
  recalculateForm, rightsContractName, rightsTotalOutOfRange, saveErrorText,
  selectionAfterHeaderClick, selectionAfterTargetClick, sortPaymentTargets, targetPercentText,
  totalCostsCalculated, usedInContractTooltip, validateMarginFixedValue, validateMarginPercentage,
  validateRightsTotal, wholeNumberText,
  type CapexCostRow, type ContractForm, type PaymentTarget,
} from "./rules";

const L = "en-US";

const form = (over: Partial<ContractForm> = {}): ContractForm => ({
  description: "Main works",
  contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 5, 15),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsUntilClosingPlan: "",
  costsUntilClosingActual: "",
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingPlan: "",
  costsAfterClosingActual: "",
  totalCostsType: TOTAL_COSTS_TYPE.Calculated,
  totalCostsCalculated: "",
  totalCostsOverwrite: "",
  margin: false,
  marginType: MARGIN_TYPE.Percentage,
  marginPercentage: "",
  marginFixedValue: "",
  comment: "",
  isMarginStandardAssumption: false,
  ...over,
});

const target = (id: string, pct: number | undefined, createdOn?: string, description?: string): PaymentTarget => ({
  id, contractId: "c1", totalCostsContract: pct, createdOn, description,
});

describe("card figures and formats (CONTR-020/021/022/023/024/028/058)", () => {
  it("UT-CONTR-001 Text(n, '###,##0'): whole, grouped, a blank is 0 (CONTR-020/021)", () => {
    expect(wholeNumberText(1234.5, L)).toBe("1,235");
    expect(wholeNumberText(undefined, L)).toBe("0");
    expect(wholeNumberText(0, L)).toBe("0");
  });

  it("UT-CONTR-002 the closing figure reads Plan only when the type is Plan, so None reads Actual (CONTR-020)", () => {
    expect(cardClosingFigure(CLOSING_DATE_TYPE.Plan, 10, 20)).toBe(10);
    expect(cardClosingFigure(CLOSING_DATE_TYPE.Actual, 10, 20)).toBe(20);
    expect(cardClosingFigure(CLOSING_DATE_TYPE.None, 10, 20)).toBe(20);
    expect(cardClosingFigure(CLOSING_DATE_TYPE.Plan, undefined, 20)).toBe(0);
  });

  it("UT-CONTR-003 Total Costs: Calculated, else Overwrite, blank as 0 (CONTR-021)", () => {
    const base = { totalCostsCalculated: 5, totalCostsOverwrite: 9 };
    expect(cardTotalCostsFigure({ ...base, totalCostsType: TOTAL_COSTS_TYPE.Calculated })).toBe(5);
    expect(cardTotalCostsFigure({ ...base, totalCostsType: TOTAL_COSTS_TYPE.Overwrite })).toBe(9);
    expect(cardTotalCostsFigure({ totalCostsType: TOTAL_COSTS_TYPE.Calculated })).toBe(0);
  });

  it("UT-CONTR-004 the Margin figure is shown only when Margin = Yes (CONTR-022)", () => {
    const stored = { marginType: MARGIN_TYPE.Percentage, marginPercentage: 12.5, marginFixedValue: 700 };
    expect(cardMarginFigure({ ...stored, margin: false })).toBe(0);
    expect(cardMarginFigure({ ...stored, margin: true })).toBe(12.5);
    expect(cardMarginFigure({ ...stored, margin: true, marginType: MARGIN_TYPE.FixedValue })).toBe(700);
    expect(cardMarginFigure({ margin: true, marginType: MARGIN_TYPE.Percentage })).toBe(0);
  });

  it("UT-CONTR-005 the Margin is written with one decimal (CONTR-022)", () => {
    expect(oneDecimalText(2.5, L)).toBe("2.5");
    expect(oneDecimalText(0, L)).toBe("0.0");
    expect(oneDecimalText(1234.56, L)).toBe("1,234.6");
  });

  it("UT-CONTR-006 the standard-assumption condition is the flag itself (rule 20, CONTR-023)", () => {
    expect(marginIsStandard({ isMarginStandardAssumption: true })).toBe(true);
    expect(marginIsStandard({ isMarginStandardAssumption: false })).toBe(false);
  });

  it("UT-CONTR-007 totals: Dev/Construction '###,##0' (blank 0), Project Rights '###,###' (blank or 0 empty) (CONTR-024)", () => {
    expect(cardContractTotalText(112500.5, L)).toBe("112,501");
    expect(cardContractTotalText(undefined, L)).toBe("0");
    expect(cardRightsTotalText(5000, L)).toBe("5,000");
    expect(cardRightsTotalText(0, L)).toBe("");
    expect(cardRightsTotalText(undefined, L)).toBe("");
  });

  it("UT-CONTR-008 a payment target's % always has one decimal, a blank is empty (CONTR-028)", () => {
    expect(targetPercentText(30, L)).toBe("30.0");
    expect(targetPercentText(45.5, L)).toBe("45.5");
    expect(targetPercentText(undefined, L)).toBe("");
  });

  it("UT-CONTR-009 the DevCo leaf amount sums the monthly CAPEX costs of that account's contracts; none shows 0 (CONTR-058)", () => {
    const contracts = [
      { id: "k1", accountId: "a1", totalCost: 999 },
      { id: "k2", accountId: "a1", totalCost: 999 },
      { id: "k3", accountId: "a2", totalCost: 999 },
    ];
    const costs: CapexCostRow[] = [
      { contractId: "k1", year: 2026, month: 1, cost: 100.5 },
      { contractId: "k2", year: 2026, month: 2, cost: 200 },
      { contractId: "other", year: 2026, month: 2, cost: 5000 },
    ];
    const byAccount = devCoLeafCostByAccount(contracts, costs);
    expect(byAccount.get("a1")).toBe(300.5);
    expect(byAccount.get("a2")).toBeUndefined();
    expect(wholeNumberText(byAccount.get("a2"), L)).toBe("0");
  });
});

describe("RoundUp of the plan, calculated and contract totals (CONTR-066/070/071/075/079)", () => {
  const rows = (...costs: number[]): CapexCostRow[] =>
    costs.map((cost, i) => ({ contractId: "k", year: 2026, month: i + 1, cost }));

  it("UT-CONTR-010 a Plan figure is RoundUp(…, 0), so 1234.2 shows and stores 1235 (CONTR-066)", () => {
    const next = recalculateForm(form({ closingDate: new Date(2026, 11, 31) }), rows(1234.2), L);
    expect(next.costsUntilClosingPlan).toBe("1235");
  });

  it("UT-CONTR-011 a fractional Plan 100.3 is stored as 101 (CONTR-079)", () => {
    const next = recalculateForm(form({ closingDate: new Date(2026, 11, 31) }), rows(100.3), L);
    expect(next.costsUntilClosingPlan).toBe("101");
  });

  it("UT-CONTR-012 the calculated total is RoundUp of the UNROUNDED sum: 1234.2 + 10.2 -> 1245 (CONTR-070)", () => {
    // Until = 1234.2 (Jan..Jan), After = 10.2 (Feb): closing in January 2026.
    const next = recalculateForm(
      form({ closingDate: new Date(2026, 0, 31) }),
      [
        { contractId: "k", year: 2026, month: 1, cost: 1234.2 },
        { contractId: "k", year: 2026, month: 2, cost: 10.2 },
      ],
      L,
    );
    expect(next.totalCostsCalculated).toBe("1245");
    expect(totalCostsCalculated(form(), { untilClosingPlan: 1234.2, afterClosingPlan: 10.2 }, L)).toBe(1245);
  });

  it("UT-CONTR-013 the contract total is RoundUp: 1001 with 2.5 % shows and stores 1027 (CONTR-075)", () => {
    const f = form({
      totalCostsCalculated: "1001", margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "2.5",
    });
    expect(contractTotalFromForm(f, L)).toBe(1027);
  });

  it("UT-CONTR-014 the margin applies to the UNROUNDED total and binary noise is not rounded up (CONTR-075)", () => {
    // 1000 * 1.1 is 1100.0000000000002 in binary floating point: the canvas shows 1,100, not 1,101.
    const f = form({
      totalCostsCalculated: "1000", totalCostsCalculatedRaw: 1000,
      margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "10",
    });
    expect(contractTotalFromForm(f, L)).toBe(1100);
    const raw = form({
      totalCostsCalculated: "1001", totalCostsCalculatedRaw: 1000.2,
      margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "100",
    });
    expect(contractTotalFromForm(raw, L)).toBe(2001); // RoundUp(1000.2 * 2), not 2 * 1001
  });

  it("UT-CONTR-015 a fixed margin with two decimals: 100000 + 2500.50 -> 102501 (CONTR-072)", () => {
    const f = form({
      totalCostsCalculated: "100000", margin: true, marginType: MARGIN_TYPE.FixedValue,
      marginFixedValue: "2500.50",
    });
    expect(contractTotalFromForm(f, L)).toBe(102501);
  });
});

describe("validation messages (CONTR-063/071/072/090)", () => {
  it("UT-CONTR-020 the percentage range message reads 'between 0 and 100.0' (CONTR-071)", () => {
    expect(validateMarginPercentage("101", L)?.message).toBe("Please select a value between 0 and 100.0");
    expect(validateMarginPercentage("100", L)).toBeUndefined();
  });

  it("UT-CONTR-021 the fixed margin accepts two decimals and says 'two decimals' for three (CONTR-072)", () => {
    expect(validateMarginFixedValue("2500.50", L)).toBeUndefined();
    expect(validateMarginFixedValue("2500.555", L)?.message).toBe(RESX.numericTwoDecimals);
    expect(validateMarginFixedValue("", L)?.message).toBe(RESX.inputBlank);
    // IsTwoDecimal accepts a sign, so a negative reaches the range message.
    expect(validateMarginFixedValue("-1", L)?.message).toMatch(/^Please select a value between 0 and /);
  });

  it("UT-CONTR-022 the Project Rights total blocks only a non-integer; -1 and 20000000 are accepted (CONTR-090)", () => {
    expect(validateRightsTotal("-1")).toBeUndefined();
    expect(validateRightsTotal("20000000")).toBeUndefined();
    expect(validateRightsTotal("10000000")).toBeUndefined();
    expect(validateRightsTotal("1.5")?.message).toBe(RESX.numeric);
    expect(validateRightsTotal("")?.message).toBe(RESX.inputBlank);
    expect(rightsTotalOutOfRange()).toMatch(/^Please select a value between 0 and 10[.,]000[.,]000$/);
  });

  it("UT-CONTR-023 the Project Rights Save gate follows the canvas (CONTR-090)", () => {
    const ok = { description: "Right", closingDate: new Date(2026, 1, 1), totalCostsOverwrite: "-5" };
    expect(canSaveRightsContract(ok)).toBe(true);
    expect(canSaveRightsContract({ ...ok, description: "  " })).toBe(false);
    expect(canSaveRightsContract({ ...ok, closingDate: undefined })).toBe(false);
    expect(canSaveRightsContract({ ...ok, totalCostsOverwrite: "1.5" })).toBe(false);
    expect(canSaveRightsContract({ ...ok, totalCostsOverwrite: "" })).toBe(false);
  });

  it("UT-CONTR-024 an empty closing date says 'The Contract Closing Date cannot be empty.' on Edit, the D4 text on Add (CONTR-063)", () => {
    const empty = form({ closingDate: undefined });
    const add = contractErrors(empty, [], L, false).find((e) => e.field === "closingDate");
    const edit = contractErrors(empty, [], L, true).find((e) => e.field === "closingDate");
    expect(add?.message).toBe(RESX.inputBlank);
    expect(edit?.message).toBe("The Contract Closing Date cannot be empty.");
    expect(MSG.closingDateEmpty).toBe("The Contract Closing Date cannot be empty.");
    const rights = contractErrors(form({ contractType: CONTRACT_TYPE.ProjectRights, closingDate: undefined }), [], L, true);
    expect(rights.find((e) => e.field === "closingDate")?.message).toBe(MSG.closingDateEmpty);
    // A Project Rights contract is not asked for cost types or accounts.
    expect(rights.map((e) => e.field)).not.toContain("devCoCosts");
  });
});

describe("Project Rights naming (CONTR-091)", () => {
  it("UT-CONTR-030 a rights contract is named 'BoP RC-<Project ID>-', the others 'BoP-<id>-<description>'", () => {
    expect(rightsContractName("P-1")).toBe("BoP RC-P-1-");
    expect(contractNameFor(CONTRACT_TYPE.ProjectRights, "P-1", "Rights")).toBe("BoP RC-P-1-");
    expect(contractNameFor(CONTRACT_TYPE.Development, "P-1", " Grid ")).toBe("BoP-P-1-Grid");
  });
});

describe("selection and the period bar (CONTR-017/029/030/031/032)", () => {
  it("UT-CONTR-040 a header click toggles the contract and clears the target on both branches (CONTR-017)", () => {
    expect(selectionAfterHeaderClick({ contractId: "a", targetId: "t" }, "a")).toEqual({ contractId: undefined, targetId: undefined });
    expect(selectionAfterHeaderClick({ contractId: "a", targetId: "t" }, "b")).toEqual({ contractId: "b", targetId: undefined });
    expect(selectionAfterHeaderClick({ contractId: undefined, targetId: undefined }, "a")).toEqual({ contractId: "a", targetId: undefined });
  });

  it("UT-CONTR-041 a target row selects its contract; a second click clears only the target (CONTR-029)", () => {
    expect(selectionAfterTargetClick({ contractId: "a", targetId: undefined }, "b", "t2")).toEqual({ contractId: "b", targetId: "t2" });
    expect(selectionAfterTargetClick({ contractId: "b", targetId: "t2" }, "b", "t2")).toEqual({ contractId: "b", targetId: undefined });
  });

  it("UT-CONTR-042 Add Period needs the selected card and a total below 100 (CONTR-030/031)", () => {
    const at = (...pct: number[]) => pct.map((p, i) => target(`t${i}`, p));
    expect(canAddPaymentTarget({ selectedContractId: undefined, cardContractId: "c1", targets: [] })).toBe(false);
    expect(canAddPaymentTarget({ selectedContractId: "other", cardContractId: "c1", targets: [] })).toBe(false);
    expect(canAddPaymentTarget({ selectedContractId: "c1", cardContractId: "c1", targets: [] })).toBe(true);
    expect(canAddPaymentTarget({ selectedContractId: "c1", cardContractId: "c1", targets: at(60) })).toBe(true);
    expect(canAddPaymentTarget({ selectedContractId: "c1", cardContractId: "c1", targets: at(50, 49.9) })).toBe(true);
    expect(canAddPaymentTarget({ selectedContractId: "c1", cardContractId: "c1", targets: at(50, 50) })).toBe(false);
    expect(canAddPaymentTarget({ selectedContractId: "c1", cardContractId: "c1", targets: at(70, 30.1) })).toBe(false);
  });

  it("UT-CONTR-043 Edit and Delete need the selected card AND a selected target (CONTR-032)", () => {
    expect(canChangePaymentTarget({ selectedContractId: "c1", cardContractId: "c1", hasSelectedTarget: true })).toBe(true);
    expect(canChangePaymentTarget({ selectedContractId: "c2", cardContractId: "c1", hasSelectedTarget: true })).toBe(false);
    expect(canChangePaymentTarget({ selectedContractId: "c1", cardContractId: "c1", hasSelectedTarget: false })).toBe(false);
  });

  it("UT-CONTR-044 payment targets sort by Created On ascending, not by their MM/YYYY text (CONTR-027)", () => {
    const sorted = sortPaymentTargets([
      target("late", 10, "2026-03-01T00:00:00Z"),
      target("early", 10, "2026-01-01T00:00:00Z"),
      target("mid", 10, "2026-02-01T00:00:00Z"),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["early", "mid", "late"]);
  });
});

describe("Add Period description (CONTR-033/034/035)", () => {
  it("UT-CONTR-050 the next description numbers on from the newest period (CONTR-033)", () => {
    expect(nextPeriodDescription("Advance")).toBe("Advance - 2");
    expect(nextPeriodDescription("Advance - 2")).toBe("Advance - 3");
    expect(nextPeriodDescription("Advance - 9")).toBe("Advance - 10");
    expect(nextPeriodDescription("Phase - A - 4")).toBe("Phase - 5");
    expect(nextPeriodDescription(undefined)).toBe("");
  });

  it("UT-CONTR-051 a new period follows the NEWEST target; none gives an empty box (CONTR-033)", () => {
    expect(newPeriodDescription([])).toBe("");
    expect(newPeriodDescription([target("a", 10, "1", "Advance"), target("b", 10, "2", "Advance - 2")])).toBe("Advance - 3");
  });

  it("UT-CONTR-052 the Description is locked once the contract has a period (CONTR-033/034)", () => {
    expect(periodDescriptionLocked([])).toBe(false);
    expect(periodDescriptionLocked([target("a", 10)])).toBe(true);
  });

  it("UT-CONTR-053 the Description box takes at most 55 characters (CONTR-035)", () => {
    expect(PAYMENT_TARGET_DESCRIPTION_MAX_LENGTH).toBe(55);
  });
});

describe("panel resets (CONTR-052/054/068/076/078)", () => {
  it("UT-CONTR-060 choosing Plan resets the Actual box to its stored value (blank for a new contract) (CONTR-068)", () => {
    expect(closingTypePatch("until", CLOSING_DATE_TYPE.Plan, undefined))
      .toEqual({ costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsUntilClosingActual: "" });
    expect(closingTypePatch("after", CLOSING_DATE_TYPE.Plan, { costsAfterClosingActual: 750 }))
      .toEqual({ costsAfterClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingActual: "750" });
    expect(closingTypePatch("until", CLOSING_DATE_TYPE.Actual, undefined))
      .toEqual({ costsUntilClosingType: CLOSING_DATE_TYPE.Actual });
  });

  it("UT-CONTR-061 a Margin change zeroes both boxes, clears the flag and resets the type (CONTR-076/054)", () => {
    expect(marginChangePatch(true, undefined)).toEqual({
      margin: true, marginType: MARGIN_TYPE.Percentage, marginPercentage: "0", marginFixedValue: "0",
      isMarginStandardAssumption: false,
    });
    expect(marginChangePatch(true, { marginType: MARGIN_TYPE.FixedValue }).marginType).toBe(MARGIN_TYPE.FixedValue);
  });

  it("UT-CONTR-062 a Margin-type change zeroes both boxes and clears the flag (CONTR-054)", () => {
    expect(marginTypeChangePatch(MARGIN_TYPE.FixedValue)).toEqual({
      marginType: MARGIN_TYPE.FixedValue, marginPercentage: "0", marginFixedValue: "0",
      isMarginStandardAssumption: false,
    });
  });

  it("UT-CONTR-063 the comment counter counts the trimmed text (CONTR-078)", () => {
    expect(commentCounter("  abc  ")).toBe("3/255");
    expect(commentCounter("")).toBe("0/255");
  });
});

describe("error and tooltip texts (CONTR-044/059)", () => {
  it("UT-CONTR-070 a failed payment-target save says 'payment target' (CONTR-044)", () => {
    expect(saveErrorText("paymentTarget", undefined)).toBe("Error: BoP Contract payment target could not be saved correctly.");
    expect(saveErrorText("contract", "boom")).toBe("Error: BoP Contract could not be saved correctly. boom");
  });

  it("UT-CONTR-071 the used-account tooltip names the contract (CONTR-059)", () => {
    expect(usedInContractTooltip("Grid works")).toBe('Used in contract "Grid works"');
  });
});
