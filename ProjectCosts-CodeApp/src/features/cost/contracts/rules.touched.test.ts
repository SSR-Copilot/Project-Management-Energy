/**
 * Which validation errors the Contracts panel SHOWS (D61, CA-23).
 *
 * `contractErrors` still reports every invalid field; what changed is the display gate. A field's
 * error shows only once the user has touched THAT field, instead of every error showing as soon as
 * anything in the panel had been edited.
 */
import { describe, expect, it } from "vitest";
import {
  CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, NO_FIELDS_TOUCHED, RESX, TOTAL_COSTS_TYPE,
  canSaveContract, contractErrors, touchFields, visibleFieldError, visibleFieldErrorPanelWide,
  type ContractForm, type FieldError,
} from "./rules";

/** A blank new Development contract, as the panel opens it: every required field is empty. */
const BLANK: ContractForm = {
  description: "",
  contractType: CONTRACT_TYPE.Development,
  costsUntilClosingType: CLOSING_DATE_TYPE.Actual,
  costsUntilClosingPlan: "",
  costsUntilClosingActual: "",
  costsAfterClosingType: CLOSING_DATE_TYPE.Actual,
  costsAfterClosingPlan: "",
  costsAfterClosingActual: "",
  totalCostsType: TOTAL_COSTS_TYPE.Overwrite,
  totalCostsCalculated: "",
  totalCostsOverwrite: "",
  margin: false,
  marginType: MARGIN_TYPE.Percentage,
  marginPercentage: "",
  marginFixedValue: "",
  comment: "",
  isMarginStandardAssumption: false,
};

const errors: FieldError[] = contractErrors(BLANK, []);
const fields = (list: readonly FieldError[]) => list.map((e) => e.field);

describe("which contract-panel errors are shown", () => {
  it("UT-CONTOUCH-001 a blank panel is invalid in every required field (the validation itself is unchanged)", () => {
    expect(fields(errors)).toEqual(expect.arrayContaining([
      "description", "closingDate", "costsUntilClosingActual", "costsAfterClosingActual",
      "totalCostsOverwrite", "devCoCosts",
    ]));
    expect(canSaveContract({ form: BLANK, tree: [], recalculated: false })).toBe(false);
  });

  it("UT-CONTOUCH-002 an untouched field shows no error, whatever is wrong with it", () => {
    for (const field of fields(errors)) {
      expect(visibleFieldError(errors, NO_FIELDS_TOUCHED, field)).toBeUndefined();
    }
  });

  it("UT-CONTOUCH-003 touching one field shows that field's error and no other", () => {
    const touched = touchFields(NO_FIELDS_TOUCHED, ["description"]);
    expect(visibleFieldError(errors, touched, "description")).toBe(RESX.inputBlank);
    for (const other of fields(errors).filter((f) => f !== "description")) {
      expect(visibleFieldError(errors, touched, other)).toBeUndefined();
    }
  });

  it("UT-CONTOUCH-004 a touched field that is valid shows nothing, and a fixed field's error goes away", () => {
    const touched = touchFields(NO_FIELDS_TOUCHED, ["description", "closingDate"]);
    const fixed = contractErrors({ ...BLANK, description: "Main works" }, []);
    expect(visibleFieldError(fixed, touched, "description")).toBeUndefined();
    // closingDate is still blank and was touched, so it still shows.
    expect(visibleFieldError(fixed, touched, "closingDate")).toBe(RESX.inputBlank);
  });

  it("UT-CONTOUCH-005 touchFields adds fields, ignores repeats, and returns the same set when nothing is new", () => {
    const a = touchFields(NO_FIELDS_TOUCHED, ["description"]);
    expect([...a]).toEqual(["description"]);
    const b = touchFields(a, ["description"]);
    expect(b).toBe(a);
    const c = touchFields(a, ["description", "closingDate"]);
    expect([...c].sort()).toEqual(["closingDate", "description"]);
    expect(touchFields(a, [])).toBe(a);
    // The starting set is never mutated.
    expect(NO_FIELDS_TOUCHED.size).toBe(0);
    expect(a.size).toBe(1);
  });

  it("UT-CONTOUCH-006 the previous behaviour, kept as a twin: once anything is edited EVERY error shows", () => {
    expect(visibleFieldErrorPanelWide(errors, false, "description")).toBeUndefined();
    for (const field of fields(errors)) {
      expect(visibleFieldErrorPanelWide(errors, true, field)).toBeDefined();
    }
    // The new rule differs exactly there: with one field touched the others stay hidden.
    expect(visibleFieldError(errors, touchFields(NO_FIELDS_TOUCHED, ["description"]), "closingDate"))
      .toBeUndefined();
  });

  it("UT-CONTOUCH-007 a field without an error is simply undefined", () => {
    expect(visibleFieldError(errors, touchFields(NO_FIELDS_TOUCHED, ["comment"]), "comment")).toBeUndefined();
  });
});
