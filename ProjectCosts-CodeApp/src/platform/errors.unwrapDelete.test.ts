import { describe, it, expect } from "vitest";
import { unwrapDelete } from "./errors";

describe("UT-ERR-DELETE — a delete of a row that is already gone counts as done", () => {
  it("treats Dataverse 0x80040217 'Does Not Exist' as success", () => {
    const error = { code: "0x80040217", message: "Entity 'vsb_permit' With Id = d07b Does Not Exist" };
    expect(() => unwrapDelete({ success: false, error } as never, "delete the permit")).not.toThrow();
  });
  it("UT-ERR-DELETE-002 (D157) treats HTTP 404 as gone, and 0x80040217 inside a real Error's message as gone", () => {
    expect(() => unwrapDelete({ success: false, error: Object.assign(new Error("not found"), { status: 404 }) } as never, "op")).not.toThrow();
    expect(() => unwrapDelete({ success: false, error: new Error("Error 0x80040217 occurred") } as never, "op")).not.toThrow();
  });
  it("UT-ERR-DELETE-003 (D157) a 400 whose text says another object 'does not exist' is a FAILURE, not a deleted row", () => {
    const error = Object.assign(new Error("The related Account does not exist"), { status: 400 });
    expect(() => unwrapDelete({ success: false, error } as never, "delete the contract")).toThrow();
    expect(() => unwrapDelete({ success: false, error: "Entity 'x' Does Not Exist" } as never, "delete the contract")).toThrow();
  });
  it("still throws any other failure", () => {
    const error = { code: "0x80040220", message: "Principal user is missing prvDeletevsb_permit privilege" };
    expect(() => unwrapDelete({ success: false, error } as never, "delete the permit")).toThrow();
  });
  it("passes a successful delete", () => {
    expect(() => unwrapDelete({ success: true, data: undefined } as never, "delete the permit")).not.toThrow();
  });
});
