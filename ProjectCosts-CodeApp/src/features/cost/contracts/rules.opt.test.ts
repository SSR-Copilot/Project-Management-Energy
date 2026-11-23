/**
 * OPT-28 (B4, D160) - the Contracts panel derives its Save gate from the errors it already computed, and recalculates the
 * closing-date split in one pass. The replaced code (`canSaveContract`, `costsUntilClosing`, `costsAfterClosing`) is still
 * exported and is the oracle: generated forms and cost rows, many seeds, including negative, NaN and blank amounts and a month
 * outside 1-12.
 */
import { describe, expect, it } from "vitest";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, TOTAL_COSTS_TYPE, canSaveContract, canSaveContractFromErrors, closingSplit,
  contractErrors, costsAfterClosing, costsUntilClosing, recalculateForm,
  type AccountNode, type CapexCostRow, type ContractForm,
} from "./rules";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const node = (id: string, selected: boolean, level: 1 | 2 | 3 = 3): AccountNode => ({
  id, number: id, name: id, order: 1, level, childCount: 0, totalCost: 1, selected, used: false,
});

describe("OPT-28 closingSplit (differential against the two-pass functions)", () => {
  const amounts = [0, 1, 2.5, -3, 1e15, 0.1, 0.2, 0.3, Number.NaN, undefined, 1234.5678];
  it("UT-CONTR-OPT-001 is bit-identical to costsUntilClosing / costsAfterClosing over 500 generated books", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const r = rng(seed); const int = (n: number) => Math.floor(r() * n);
      const costs: CapexCostRow[] = Array.from({ length: int(80) }, () => ({
        contractId: "c", year: 2024 + int(6), month: [0, 1, 2, 6, 12, 12, 13][int(7)] ?? int(12) + 1,
        cost: amounts[int(amounts.length)],
      }));
      const closingDate = new Date(2024 + int(6), int(12), 1 + int(28));
      const { until, after } = closingSplit({ closingDate, costs });
      // Object.is: NaN must stay NaN and -0 must stay -0, as before.
      expect(Object.is(until, costsUntilClosing({ closingDate, costs })), `until, seed ${seed}`).toBe(true);
      expect(Object.is(after, costsAfterClosing({ closingDate, costs })), `after, seed ${seed}`).toBe(true);
    }
  });

  it("UT-CONTR-OPT-002 recalculateForm still fills the Plan boxes and the total from those figures", () => {
    const costs: CapexCostRow[] = [
      { contractId: "c", year: 2025, month: 12, cost: 100 }, { contractId: "c", year: 2026, month: 3, cost: 40 },
      { contractId: "c", year: 2026, month: 9, cost: 60 }, { contractId: "c", year: 2027, month: 1, cost: 7 },
    ];
    const form = {
      description: "x", contractType: CONTRACT_TYPE.Development, closingDate: new Date(2026, 5, 15),
      costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsUntilClosingPlan: "", costsUntilClosingActual: "",
      costsAfterClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingPlan: "", costsAfterClosingActual: "",
      totalCostsType: TOTAL_COSTS_TYPE.Calculated, totalCostsCalculated: "", totalCostsOverwrite: "",
      margin: false, marginType: MARGIN_TYPE.Percentage, marginPercentage: "", marginFixedValue: "", comment: "",
      isMarginStandardAssumption: false,
    } as ContractForm;
    const next = recalculateForm(form, costs, "en-GB");
    expect(next.costsUntilClosingPlan).toBe("140"); // 2025 + Mar 2026
    expect(next.costsAfterClosingPlan).toBe("67"); // Sep 2026 + 2027
    expect(next.totalCostsCalculated).toBe("207");
  });
});

describe("OPT-28 canSaveContractFromErrors (differential against canSaveContract)", () => {
  const texts = ["", "0", "100", "abc", "-1", "1e3", "99999999999999", "7.5", "100.5", " 5"];
  it("UT-CONTR-OPT-003 equals canSaveContract for every contract type over 1500 generated forms", () => {
    const r = rng(5);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    // mostly valid figures, so a good share of the forms can be saved
    const txt = () => (r() < 0.85 ? pick(["0", "100", "7", "7.5"]) : pick(texts));
    const types = Object.values(CONTRACT_TYPE);
    let saves = 0, refusals = 0;
    for (let i = 0; i < 1500; i++) {
      const form: ContractForm = {
        description: r() < 0.85 ? "Turbine" : pick(["", " "]), contractType: pick(types) as ContractForm["contractType"],
        closingDate: r() < 0.95 ? new Date(2026, 5, 15) : undefined,
        costsUntilClosingType: pick([CLOSING_DATE_TYPE.Plan, CLOSING_DATE_TYPE.Actual]),
        costsUntilClosingPlan: txt(), costsUntilClosingActual: txt(),
        costsAfterClosingType: pick([CLOSING_DATE_TYPE.Plan, CLOSING_DATE_TYPE.Actual]),
        costsAfterClosingPlan: txt(), costsAfterClosingActual: txt(),
        totalCostsType: pick([TOTAL_COSTS_TYPE.Calculated, TOTAL_COSTS_TYPE.Overwrite]),
        totalCostsCalculated: txt(), totalCostsOverwrite: txt(),
        margin: r() < 0.5, marginType: pick([MARGIN_TYPE.Percentage, MARGIN_TYPE.FixedValue]),
        marginPercentage: txt(), marginFixedValue: txt(), comment: "", isMarginStandardAssumption: false,
      } as ContractForm;
      const tree = [node("p", false, 1), node("l3a", r() < 0.7), node("l3b", r() < 0.3)];
      const recalculated = r() < 0.8;
      for (const editing of [false, true]) {
        const errors = contractErrors(form, tree, "en-GB", editing);
        const now = canSaveContractFromErrors({ form, tree, recalculated, locale: "en-GB", errors });
        expect(now, `case ${i}`).toBe(canSaveContract({ form, tree, recalculated, locale: "en-GB" }));
        if (now) saves++; else refusals++;
      }
    }
    expect(saves).toBeGreaterThan(30);
    expect(refusals).toBeGreaterThan(100);
  });

  it("UT-CONTR-OPT-004 the supplied errors are the ones used (no second validation pass)", () => {
    const form = {
      description: "x", contractType: CONTRACT_TYPE.Development, closingDate: new Date(2026, 5, 15),
      costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsUntilClosingPlan: "1", costsUntilClosingActual: "",
      costsAfterClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingPlan: "1", costsAfterClosingActual: "",
      totalCostsType: TOTAL_COSTS_TYPE.Calculated, totalCostsCalculated: "2", totalCostsOverwrite: "",
      margin: false, marginType: MARGIN_TYPE.Percentage, marginPercentage: "", marginFixedValue: "", comment: "",
      isMarginStandardAssumption: false,
    } as ContractForm;
    const tree = [node("l3a", true)];
    const base = { form, tree, recalculated: true, locale: "en-GB" };
    expect(canSaveContractFromErrors({ ...base, errors: [] })).toBe(true);
    expect(canSaveContractFromErrors({ ...base, errors: [{ field: "x", message: "m" }] })).toBe(false);
    expect(canSaveContractFromErrors({ ...base, recalculated: false, errors: [] })).toBe(false);
  });
});
