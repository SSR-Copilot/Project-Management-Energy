/**
 * UT-PLAN-911.. — `unwrapDeleteStrict`: the strict "gone" of a hardened delete (Generators delete hardening, DEL-2).
 * `unwrapDelete` (the lenient one every other caller uses) is pinned alongside, to show it is untouched.
 */
import { describe, expect, it } from "vitest";
import { DataError, unwrapDelete, unwrapDeleteStrict } from "./errors";

const fail = (error: unknown) => ({ success: false as const, error }) as never;
const withStatus = (message: string, status?: number) => Object.assign(new Error(message), status === undefined ? {} : { status });

describe("unwrapDeleteStrict", () => {
  it("UT-PLAN-911 a successful delete is \"deleted\"", () => {
    expect(unwrapDeleteStrict({ success: true, data: undefined } as never, "op")).toBe("deleted");
  });

  it("UT-PLAN-912 HTTP 404 and the code 0x80040217 are \"gone\"", () => {
    expect(unwrapDeleteStrict(fail(withStatus("not found", 404)), "op")).toBe("gone");
    expect(unwrapDeleteStrict(fail(withStatus("Error 0x80040217 occurred")), "op")).toBe("gone");
    expect(unwrapDeleteStrict(fail({ error: { code: "0x80040217", message: "x" } }), "op")).toBe("gone");
    expect(unwrapDeleteStrict(fail("0x80040217"), "op")).toBe("gone");
  });

  it("UT-PLAN-913 the free text \"does not exist\" on a 400 is NOT gone for a hardened delete (the lenient one still accepts it)", () => {
    const e = withStatus("Entity 'other' Does Not Exist", 400);
    expect(() => unwrapDeleteStrict(fail(e), "op")).toThrow(DataError);
    expect(() => unwrapDeleteStrict(fail("record does not exist"), "op")).toThrow(DataError);
    expect(() => unwrapDelete(fail({ status: 400, message: "Entity other Does Not Exist" }), "op")).not.toThrow();
  });

  it.each([400, 401, 403, 409, 429, 500, 503])("UT-PLAN-914 HTTP %i throws a DataError carrying the status", (status) => {
    let thrown: unknown;
    try { unwrapDeleteStrict(fail(withStatus("boom", status)), "delete x"); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(DataError);
    expect((thrown as DataError).status).toBe(status);
    expect((thrown as DataError).operation).toBe("delete x");
  });
});
