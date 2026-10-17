import { beforeEach, describe, expect, it } from "vitest";
import { BulkWriteError } from "@/data/bulkWrite";
import { DataError } from "./errors";
import { clearTraces, lastError, traces } from "./telemetry";
import { ERROR_HINT, dataErrorIn, errorHint, httpStatusOf, userErrorText, userLoadErrorText, userReason } from "./userMessage";

class RuleError extends Error {}

const dataError = (status?: number, message = "raw SDK detail {\"code\":\"0x80040220\"}") =>
  new DataError("update vsb_things", new Error(message), status);

beforeEach(() => clearTraces());

describe("userErrorText", () => {
  it.each([
    [401, "You do not have permission to save items. Ask your administrator if you believe you should."],
    [403, "You do not have permission to save items. Ask your administrator if you believe you should."],
    [404, `Could not save items. ${ERROR_HINT.notFound}`],
    [412, `Could not save items. ${ERROR_HINT.conflict}`],
    [429, `Could not save items. ${ERROR_HINT.throttled}`],
    [500, `Could not save items. ${ERROR_HINT.server}`],
    [503, `Could not save items. ${ERROR_HINT.server}`],
    [400, `Could not save items. ${ERROR_HINT.retry}`],
  ])("status %s", (status, expected) => {
    expect(userErrorText(dataError(status), "save items")).toBe(expected);
  });

  it("finds a 403 inside a bulk / wrapped error", () => {
    const wrapped = new BulkWriteError(dataError(403), true);
    expect(userErrorText(wrapped, "reorder tasks")).toMatch(/^You do not have permission to reorder tasks/);
  });

  it("partial and failed bulk writes", () => {
    expect(userErrorText(new BulkWriteError(dataError(500), true), "save the order"))
      .toBe(`Could not save the order. ${ERROR_HINT.partial}`);
    expect(userErrorText(new BulkWriteError(dataError(500), false), "save the order"))
      .toBe(`Could not save the order. ${ERROR_HINT.nothingSaved}`);
  });

  it("network failure", () => {
    expect(userErrorText(new TypeError("Failed to fetch"), "load"))
      .toBe(`Could not load. ${ERROR_HINT.network}`);
    expect(userErrorText(new DataError("read x", new TypeError("NetworkError when attempting to fetch")), "load"))
      .toBe(`Could not load. ${ERROR_HINT.network}`);
  });

  it("unknown errors never leak raw text", () => {
    const text = userErrorText(new Error("Internal <html>stack</html>"), "save");
    expect(text).toBe(`Could not save. ${ERROR_HINT.retry}`);
    expect(userErrorText("boom", "save")).toBe(`Could not save. ${ERROR_HINT.retry}`);
    expect(userErrorText(dataError(undefined), "save")).not.toContain("0x80040220");
  });

  it("uses the screen's lead sentence", () => {
    expect(userErrorText(dataError(412), "save standard costs", { lead: "The standard cost could not be saved." }))
      .toBe(`The standard cost could not be saved. ${ERROR_HINT.conflict}`);
  });

  it("shows business errors verbatim", () => {
    expect(userErrorText(new RuleError("Periods must be contiguous."), "save", { businessErrors: [RuleError] }))
      .toBe("Periods must be contiguous.");
  });

  it("serverReason appends a short plain plug-in message, never JSON", () => {
    expect(userErrorText(dataError(400, "Account is in use"), "delete", { serverReason: true }))
      .toBe("Could not delete. Account is in use.");
    expect(userErrorText(dataError(400, "{\"error\":1}"), "delete", { serverReason: true }))
      .toBe(`Could not delete. ${ERROR_HINT.retry}`);
    expect(userErrorText(dataError(400, "x".repeat(400)), "delete", { serverReason: true }))
      .toBe(`Could not delete. ${ERROR_HINT.retry}`);
  });

  it("traces the raw error unless asked not to", () => {
    const err = dataError(500);
    userErrorText(err, "save");
    expect(lastError()?.detail).toBe(err);
    clearTraces();
    userErrorText(err, "save", { trace: false });
    expect(traces()).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("dataErrorIn / httpStatusOf walk the cause chain", () => {
    const inner = dataError(412);
    const outer = new Error("outer", { cause: new Error("mid", { cause: inner }) });
    expect(dataErrorIn(outer)).toBe(inner);
    expect(httpStatusOf(outer)).toBe(412);
    expect(httpStatusOf(new Error("x"))).toBeUndefined();
  });
  it("errorHint without a lead", () => {
    expect(errorHint(dataError(429))).toBe(ERROR_HINT.throttled);
  });
  it("userLoadErrorText", () => {
    expect(userLoadErrorText(dataError(500), "Checklist tasks")).toBe(`Checklist tasks could not be loaded. ${ERROR_HINT.server}`);
    expect(userLoadErrorText(dataError(403), "Checklist tasks")).toMatch(/permission to read this data/);
  });
});

describe("userReason (E12)", () => {
  it("403 / 401 on the error → the permission wording", () => {
    expect(userReason(dataError(403), "change milestone assumptions"))
      .toBe("You do not have permission to change milestone assumptions. Ask your administrator if you believe you should.");
    expect(userReason(dataError(401), "read CAPEX accounts", "fallback")).toMatch(/^You do not have permission to read CAPEX accounts/);
  });

  it("otherwise the fallback when given", () => {
    expect(userReason(dataError(500), "read CAPEX accounts", "Please try again later.")).toBe("Please try again later.");
  });

  it("otherwise the hint", () => {
    expect(userReason(dataError(404), "x")).toBe(ERROR_HINT.notFound);
    expect(userReason(new Error("boom"), "x")).toBe(ERROR_HINT.retry);
  });

  it("is not traced", () => {
    userReason(dataError(500), "x");
    expect(traces()).toHaveLength(0);
  });
});