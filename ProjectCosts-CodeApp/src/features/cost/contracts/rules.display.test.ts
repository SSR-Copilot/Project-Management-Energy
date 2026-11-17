/**
 * UT-CONTR-228..232 — small display and message rules of the Contracts screen:
 * `showTotalCostOfContract` (LD-1, canvas `:6126`) and `deleteErrorText` (WR-5).
 */
import { describe, expect, it } from "vitest";
import { MARGIN_TYPE, MSG, deleteErrorText, saveErrorText, showTotalCostOfContract } from "./rules";

const pct = { margin: true, marginType: MARGIN_TYPE.Percentage };
const fixed = { margin: true, marginType: MARGIN_TYPE.FixedValue };

describe("showTotalCostOfContract", () => {
  it("UT-CONTR-228 a new contract shows the box for Percentage and hides it for Fixed Value", () => {
    expect(showTotalCostOfContract(pct, undefined, false)).toBe(true);
    expect(showTotalCostOfContract(fixed, undefined, false)).toBe(false);
    expect(showTotalCostOfContract({ margin: false, marginType: MARGIN_TYPE.Percentage }, undefined, false)).toBe(true);
  });

  it("UT-CONTR-229 an Edit with Margin = Yes follows the radio's type, stored or chosen", () => {
    expect(showTotalCostOfContract(pct, MARGIN_TYPE.Percentage, true)).toBe(true);
    expect(showTotalCostOfContract(fixed, MARGIN_TYPE.Percentage, true)).toBe(false);
    expect(showTotalCostOfContract(fixed, MARGIN_TYPE.FixedValue, true)).toBe(false);
  });

  it("UT-CONTR-230 an Edit with Margin = No and a stored, non-blank type hides the box: the radio selects nothing", () => {
    expect(showTotalCostOfContract({ margin: false, marginType: MARGIN_TYPE.Percentage }, MARGIN_TYPE.Percentage, true)).toBe(false);
    expect(showTotalCostOfContract({ margin: false, marginType: MARGIN_TYPE.FixedValue }, MARGIN_TYPE.FixedValue, true)).toBe(false);
  });

  it("UT-CONTR-231 an Edit with Margin = No and a BLANK stored type shows the box: the radio defaults to Percentage", () => {
    expect(showTotalCostOfContract({ margin: false, marginType: MARGIN_TYPE.Percentage }, undefined, true)).toBe(true);
  });
});

describe("deleteErrorText", () => {
  it("UT-CONTR-232 a failed delete reads 'deleted', never the save text, with the detail appended like the save text", () => {
    expect(deleteErrorText("contract", undefined)).toBe(MSG.deleteErrorContract);
    expect(deleteErrorText("paymentTarget", undefined)).toBe(MSG.deleteErrorPaymentTarget);
    expect(deleteErrorText("contract", "403")).toBe(`${MSG.deleteErrorContract} 403`);
    expect(deleteErrorText("contract", undefined)).not.toBe(saveErrorText("contract", undefined));
    expect(MSG.deleteErrorContract).toContain("deleted");
    expect(MSG.deleteErrorPaymentTarget).toContain("deleted");
  });
});
