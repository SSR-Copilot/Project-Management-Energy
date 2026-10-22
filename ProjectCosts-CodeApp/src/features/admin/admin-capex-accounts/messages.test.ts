/**
 * `describeWriteError`: readable text per error shape, raw error traced. The generic tail is the
 * shared `userErrorText`: the raw error goes to the telemetry trace (not `console.error`), and
 * HTTP / bulk failures carry the shared `ERROR_HINT`.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { DataError } from "@/platform/errors";
import { clearTraces, lastError } from "@/platform/telemetry";
import { ERROR_HINT } from "@/platform/userMessage";
import { RowWriteError } from "@/data/adminRowWrites";
import { DeleteBlockedError, PartialStepError } from "@/data/adminCapexAccounts";
import { OUT_OF_SCOPE } from "./rules";
import { OutOfScopeError, describeWriteError } from "./messages";

const forbidden = () => new DataError("deactivate CAPEX account", { message: "denied" }, 403);

describe("DescribeWriteError", () => {
  beforeEach(() => clearTraces());

  it("UT-ADCAPEX-037 traces the raw error and never shows raw Dataverse detail", () => {
    const error = new DataError("rename CAPEX account", { message: "SQL timeout 0x80040216" }, 500);
    const text = describeWriteError(error, "save the account");
    expect(text).toBe(`Could not save the account. ${ERROR_HINT.server}`);
    expect(text).not.toContain("0x80040216");
    expect(lastError()).toMatchObject({ message: "Could not save the account", detail: error });
  });

  it("UT-ADCAPEX-038 an error without an HTTP status keeps the plain retry text", () => {
    expect(describeWriteError(new Error("x"), "save the account")).toBe("Could not save the account. Please try again.");
  });

  it("UT-ADCAPEX-039 a PartialStepError is traced too", () => {
    const error = new PartialStepError("Account set to Inactive", [], new Error("x"));
    describeWriteError(error, "deactivate the account");
    expect(lastError()).toMatchObject({ message: "Could not deactivate the account", detail: error });
  });

  it("UT-ADCAPEX-040 turns a 403 into the permission message", () => {
    expect(describeWriteError(forbidden(), "delete the account"))
      .toBe("You do not have permission to delete the account. Ask your administrator if you believe you should.");
  });

  it("UT-ADCAPEX-041 shows a delete-guard refusal verbatim", () => {
    expect(describeWriteError(new DeleteBlockedError("Blocked: contracts booked."), "delete the subaccount"))
      .toBe("Blocked: contracts booked.");
  });

  it("UT-ADCAPEX-042 PartialStepError with no completed step says nothing was changed", () => {
    const error = new PartialStepError("Account set to Inactive", [], new Error("x"));
    expect(describeWriteError(error, "deactivate the account")).toBe(
      "Could not deactivate the account. Failed step: Account set to Inactive. Nothing was changed. You can retry.",
    );
  });

  it("UT-ADCAPEX-043 PartialStepError lists the completed steps and the in-step detail", () => {
    const error = new PartialStepError(
      "Subaccounts set to Inactive", ["Account set to Inactive"], new Error("x"),
      "1 of 3 subaccounts were set to Inactive",
    );
    expect(describeWriteError(error, "deactivate the account")).toBe(
      "Could not deactivate the account. Failed step: Subaccounts set to Inactive. " +
        "Within this step: 1 of 3 subaccounts were set to Inactive. " +
        "Already completed: Account set to Inactive. You can retry.",
    );
  });

  it("UT-ADCAPEX-044 an in-step detail without completed steps does not claim nothing was changed", () => {
    const error = new PartialStepError("Subaccounts set to Inactive", [], new Error("x"), "2 of 3 subaccounts were set to Inactive");
    const text = describeWriteError(error, "deactivate the account");
    expect(text).toContain("Within this step: 2 of 3 subaccounts were set to Inactive.");
    expect(text).not.toContain("Nothing was changed");
  });

  it("UT-ADCAPEX-045 PartialStepError caused by a 403 leads with the permission message", () => {
    const error = new PartialStepError("Subaccount set to Inactive", [], forbidden());
    expect(describeWriteError(error, "deactivate the subaccount")).toMatch(
      /^You do not have permission to deactivate the subaccount\..* Failed step: Subaccount set to Inactive\./,
    );
  });

  it("UT-ADCAPEX-046 PartialStepError caused by a partial bulk write says part of the step was saved", () => {
    const error = new PartialStepError(
      "Future-month costs set to 0 (120 rows)", ["Subaccount set to Inactive"], new RowWriteError(new Error("x"), true),
    );
    const text = describeWriteError(error, "deactivate the subaccount");
    expect(text).toContain("Part of this step was saved.");
    expect(text).toContain("Already completed: Subaccount set to Inactive.");
  });

  it("UT-ADCAPEX-047 RowWriteError: partial vs nothing saved (shared wording)", () => {
    expect(describeWriteError(new RowWriteError(new Error("x"), true), "save the new order"))
      .toBe("Could not save the new order. Only part of the change was saved. Reopen and save again.");
    expect(describeWriteError(new RowWriteError(new Error("x"), false), "save the new order"))
      .toBe("Could not save the new order. Nothing was saved. Please try again.");
  });

  it("UT-ADCAPEX-048 a write refused by the admin rule shows the scope message, whatever the action", () => {
    expect(describeWriteError(new OutOfScopeError(), "delete the account")).toBe(OUT_OF_SCOPE);
  });
});
