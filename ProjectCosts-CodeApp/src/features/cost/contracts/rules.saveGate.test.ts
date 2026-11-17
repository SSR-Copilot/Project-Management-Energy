/**
 * UT-CONTR-248..250 — the two implementations of the contract Save gate agree.
 *
 * `canSaveContract` (the button's `DisplayMode`) and `contractErrors` (the messages under the fields) are written
 * separately in `rules.ts`. The equivalence that really holds, and is asserted here over 3,000 seeded random forms:
 *
 *   Development / Construction:  canSaveContract({ recalculated: true })  <=>  contractErrors(...) is empty
 *                                canSaveContract({ recalculated: false }) is always false (the canvas's first term,
 *                                `locContractDevCoCostsDirty`, has no error message)
 *   Project Rights:              canSaveRightsContract(form)  <=>  contractErrors(...) is empty
 *                                (`contractErrors` takes the rights branch and ignores the DevCo and cost fields,
 *                                so `canSaveContract` is NOT the rights gate and is not compared for that type)
 *
 * The only things the error list does not carry are `recalculated` and, by construction, nothing else.
 */
import { describe, expect, it } from "vitest";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, TOTAL_COSTS_TYPE,
  canSaveContract, canSaveRightsContract, contractErrors,
  type AccountNode, type ContractForm,
} from "./rules";

/** A small deterministic generator (mulberry32), so a failure reproduces from its seed. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const money = ["", "  ", "0", "100", "1,5", "1.5", "12.50", "abc", "-1", "1e3", "1000000000", "1000000001", "2000000000", "9999999999"];
const percent = ["", "0", "7", "7.5", "7,5", "100", "100.1", "101", "abc", "-1", "5.25", "5,25"];
const validMoney = ["0", "100", "1000000"];
const validPercent = ["0", "7", "100"];
const descriptions = ["", "   ", "Grid", " Grid "];
const rightsTotals = ["", "0", "1", "1500", "1,5", "abc", "-3", "999999999", "99999999999"];

function leaf(selected: boolean, n: number): AccountNode {
  return {
    id: `a${n}`, number: String(n), name: `Account ${n}`, order: n, level: 3, childCount: 0,
    totalCost: 0, selected, used: false,
  };
}

function randomCase(next: () => number) {
  const any = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  /** Mostly a value that passes, sometimes any value, so both outcomes of the gate are reached. */
  const pick = <T,>(items: readonly T[], passing?: readonly T[]): T =>
    passing && next() < 0.85 ? any(passing) : any(items);
  const form: ContractForm = {
    description: pick(descriptions, ["Grid", " Grid "]),
    contractType: pick([CONTRACT_TYPE.Development, CONTRACT_TYPE.Construction, CONTRACT_TYPE.ProjectRights]),
    closingDate: pick([undefined, new Date(2026, 8, 18)], [new Date(2026, 8, 18)]),
    costsUntilClosingType: pick([CLOSING_DATE_TYPE.Plan, CLOSING_DATE_TYPE.Actual]),
    costsUntilClosingPlan: pick(money, validMoney),
    costsUntilClosingActual: pick(money, validMoney),
    costsAfterClosingType: pick([CLOSING_DATE_TYPE.Plan, CLOSING_DATE_TYPE.Actual]),
    costsAfterClosingPlan: pick(money, validMoney),
    costsAfterClosingActual: pick(money, validMoney),
    totalCostsType: pick([TOTAL_COSTS_TYPE.Calculated, TOTAL_COSTS_TYPE.Overwrite]),
    totalCostsCalculated: pick(money, validMoney),
    totalCostsOverwrite: pick(money, validMoney),
    margin: next() < 0.5,
    marginType: pick([MARGIN_TYPE.Percentage, MARGIN_TYPE.FixedValue]),
    marginPercentage: pick(percent, validPercent),
    marginFixedValue: pick(money, validMoney),
    comment: "",
    isMarginStandardAssumption: false,
  };
  if (form.contractType === CONTRACT_TYPE.ProjectRights) form.totalCostsOverwrite = pick(rightsTotals, ["0", "1", "1500"]);
  const tree = [leaf(next() < 0.85, 1), leaf(next() < 0.3, 2)];
  return { form, tree, locale: pick(["en-US", "de-DE"]), editing: next() < 0.5 };
}

const CASES = 3000;

describe("the contract Save gate and the field errors agree", () => {
  it("UT-CONTR-248 Development / Construction: canSaveContract is true exactly when contractErrors is empty", () => {
    const next = rng(20261117);
    let checked = 0;
    let saveable = 0;
    for (let i = 0; i < CASES; i += 1) {
      const { form, tree, locale, editing } = randomCase(next);
      if (form.contractType === CONTRACT_TYPE.ProjectRights) continue;
      const errors = contractErrors(form, tree, locale, editing);
      const can = canSaveContract({ form, tree, recalculated: true, locale });
      expect(can, `case ${i}: ${JSON.stringify({ form, errors })}`).toBe(errors.length === 0);
      checked += 1;
      if (can) saveable += 1;
    }
    // The generator must reach both outcomes, or the property proves nothing.
    expect(checked).toBeGreaterThan(1500);
    expect(saveable).toBeGreaterThan(20);
    expect(saveable).toBeLessThan(checked);
  });

  it("UT-CONTR-249 without a recalculation Save is never allowed, whatever the errors say", () => {
    const next = rng(7);
    for (let i = 0; i < 500; i += 1) {
      const { form, tree, locale } = randomCase(next);
      expect(canSaveContract({ form, tree, recalculated: false, locale })).toBe(false);
    }
  });

  it("UT-CONTR-250 Project Rights: canSaveRightsContract is true exactly when contractErrors is empty", () => {
    const next = rng(99);
    let checked = 0;
    let saveable = 0;
    for (let i = 0; i < CASES; i += 1) {
      const { form, tree, locale, editing } = randomCase(next);
      if (form.contractType !== CONTRACT_TYPE.ProjectRights) continue;
      const errors = contractErrors(form, tree, locale, editing);
      const can = canSaveRightsContract(form);
      expect(can, `case ${i}: ${JSON.stringify({ form, errors })}`).toBe(errors.length === 0);
      checked += 1;
      if (can) saveable += 1;
    }
    expect(checked).toBeGreaterThan(500);
    expect(saveable).toBeGreaterThan(5);
    expect(saveable).toBeLessThan(checked);
  });
});
