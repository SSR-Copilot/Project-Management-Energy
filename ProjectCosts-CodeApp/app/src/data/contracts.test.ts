/**
 * The BoP contract write payload.
 *
 * Both cases below were live save failures on the Contracts screen, and both were rejections of
 * the PAYLOAD SHAPE rather than of any value in it — the kind of thing no amount of UI testing
 * catches, because the screen is correct and the request is not.
 */
import { describe, expect, it } from "vitest";
import { contractPayload, type ContractWrite } from "./contracts";
import { CLOSING_DATE_TYPE, CONTRACT_TYPE, MARGIN_TYPE, TOTAL_COSTS_TYPE } from
  "@/features/contracts/rules";

const write: ContractWrite = {
  projectId: "11111111-1111-1111-1111-111111111111",
  owningBusinessUnitId: "22222222-2222-2222-2222-222222222222",
  name: "Development Contract - Test Description 101",
  description: "Test Description 101",
  contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 8, 18),
  costsUntilClosingType: CLOSING_DATE_TYPE.Plan,
  costsUntilClosingPlan: 9750,
  costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  costsAfterClosingPlan: 2250,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated,
  totalCostsCalculated: 12000,
  margin: true,
  marginType: MARGIN_TYPE.Percentage,
  marginPercentage: 10,
  totalCostOfContract: 13200,
  comment: "",
  isMarginStandardAssumption: false,
};

describe("contractPayload", () => {
  it("UT-CW-001 binds the owning BU in lower case", () => {
    // PascalCase made the Web API reject the whole request:
    //   An undeclared property 'OwningBusinessUnit' which only has property annotations in the
    //   payload but no property value was found in the payload.
    const payload = contractPayload(write) as Record<string, unknown>;
    expect(payload["owningbusinessunit@odata.bind"]).toBe("/businessunits(22222222-2222-2222-2222-222222222222)");
    expect(payload["OwningBusinessUnit@odata.bind"]).toBeUndefined();
  });

  it("UT-CW-002 keeps the custom project lookup at its schema casing", () => {
    // The two are not inconsistent: a CUSTOM lookup's navigation property keeps its schema-name
    // casing, a system-owned one is declared lower case. Asserting both together is the point.
    const payload = contractPayload(write) as Record<string, unknown>;
    expect(payload["vsb_Project@odata.bind"]).toBe("/vsb_projects(11111111-1111-1111-1111-111111111111)");
  });

  it("UT-CW-003 sends the closing date as a bare Edm.Date", () => {
    //   Cannot convert the literal '2026-09-17T18:30:00.000Z' to the expected type 'Edm.Date'
    const payload = contractPayload(write) as Record<string, unknown>;
    expect(payload.vsb_closingdate).toBe("2026-09-18");
  });

  it("UT-CW-005 does not re-bind the owning BU on update", () => {
    // Ownership is not an editable field on an existing row; reassignment is what `Assign` is
    // for. `comments.ts` keeps its bind inside the create branch for the same reason.
    const payload = contractPayload({ ...write, id: "33333333-3333-3333-3333-333333333333" }) as
      Record<string, unknown>;
    expect("owningbusinessunit@odata.bind" in payload).toBe(false);
  });

  it("UT-CW-004 omits the BU bind entirely when there is no business unit", () => {
    // Absent is correct — Dataverse then derives it from the caller. A null bind would error.
    const payload = contractPayload({ ...write, owningBusinessUnitId: undefined }) as
      Record<string, unknown>;
    expect("owningbusinessunit@odata.bind" in payload).toBe(false);
  });
});
