import { describe, it, expect } from "vitest";
import { unwrapDelete } from "./errors";

describe("UT-ERR-DELETE — a delete of a row that is already gone counts as done", () => {
  it("treats Dataverse 0x80040217 'Does Not Exist' as success", () => {
    const error = { code: "0x80040217", message: "Entity 'vsb_permit' With Id = d07b Does Not Exist" };
    expect(() => unwrapDelete({ success: false, error } as never, "delete the permit")).not.toThrow();
  });
  it("still throws any other failure", () => {
    const error = { code: "0x80040220", message: "Principal user is missing prvDeletevsb_permit privilege" };
    expect(() => unwrapDelete({ success: false, error } as never, "delete the permit")).toThrow();
  });
  it("passes a successful delete", () => {
    expect(() => unwrapDelete({ success: true, data: undefined } as never, "delete the permit")).not.toThrow();
  });
});
