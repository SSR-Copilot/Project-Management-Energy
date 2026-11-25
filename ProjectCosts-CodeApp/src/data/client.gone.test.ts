/**
 * UT-CLIENTGONE-001..008 — `isAlreadyGone` / `deleteIfExists` (dvopt T-03, CB-03). Moved from `contracts.ts` into `client.ts`; the
 * rule is the one `unwrapDeleteStrict` reads (D157): HTTP 404 or `0x80040217`, nothing else.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ deleteRecordAsync: vi.fn() }));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => sdk }));

import { DataError } from "@/platform/errors";
import { deleteIfExists, deleteRecord, isAlreadyGone } from "./client";
import * as contracts from "./contracts";

beforeEach(() => sdk.deleteRecordAsync.mockReset());

describe("isAlreadyGone", () => {
  it("UT-CLIENTGONE-001 reads 404 and 0x80040217 as gone", () => {
    expect(isAlreadyGone(new DataError("x", "nope", 404))).toBe(true);
    expect(isAlreadyGone(new DataError("x", { message: "0x80040217 Does Not Exist" }, 400))).toBe(true);
  });

  it("UT-CLIENTGONE-002 reads nothing else as gone (a 400 naming another missing object, a 403, a 500, a plain Error)", () => {
    expect(isAlreadyGone(new DataError("x", "a related object does not exist", 400))).toBe(false);
    expect(isAlreadyGone(new DataError("x", "denied", 403))).toBe(false);
    expect(isAlreadyGone(new DataError("x", "boom", 500))).toBe(false);
    expect(isAlreadyGone(new Error("404"))).toBe(false);
    expect(isAlreadyGone(undefined)).toBe(false);
  });

  it("UT-CLIENTGONE-002b QA-05 superset: a plain SDK error object (not a DataError) with status 404, a DataError without a status whose cause has one, and a 0x80040217 inside a cause", () => {
    expect(isAlreadyGone({ message: "Not Found", status: 404 })).toBe(true);
    expect(isAlreadyGone({ message: "Not Found", statusCode: 404 })).toBe(true);
    expect(isAlreadyGone(new DataError("x", { message: "x", status: 404 }))).toBe(true);
    expect(isAlreadyGone(new Error("0x80040217 Does Not Exist"))).toBe(true);
    expect(isAlreadyGone({ error: { code: "0x80040217" } })).toBe(true);
    expect(isAlreadyGone(Object.assign(new Error("wrapped"), { cause: { code: "0x80040217" } }))).toBe(true);
  });

  it("UT-CLIENTGONE-002c QA-05 the superset still refuses everything that is not gone (plain 400 / 403 / 500 objects, a 400 naming another object)", () => {
    for (const status of [400, 403, 409, 429, 500]) expect(isAlreadyGone({ message: "x", status })).toBe(false);
    expect(isAlreadyGone({ message: "a related object does not exist", status: 400 })).toBe(false);
    expect(isAlreadyGone(new Error("boom"))).toBe(false);
    expect(isAlreadyGone("404")).toBe(false);
    expect(isAlreadyGone(null)).toBe(false);
  });

  it("UT-CLIENTGONE-003 contracts.ts still exports the same function (existing imports keep working)", () => {
    expect(contracts.isAlreadyGone).toBe(isAlreadyGone);
  });
});

describe("deleteIfExists", () => {
  it("UT-CLIENTGONE-004 a delete that succeeds is one request", async () => {
    sdk.deleteRecordAsync.mockResolvedValue({ success: true, data: undefined });
    await deleteIfExists("delete x", "vsb_things", "id-1");
    expect(sdk.deleteRecordAsync).toHaveBeenCalledTimes(1);
    expect(sdk.deleteRecordAsync).toHaveBeenCalledWith("vsb_things", "id-1");
  });

  it("UT-CLIENTGONE-005 a 404 counts as done (resolves)", async () => {
    sdk.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "Not Found", status: 404 } });
    await expect(deleteIfExists("delete x", "vsb_things", "id-1")).resolves.toBeUndefined();
  });

  it("UT-CLIENTGONE-006 0x80040217 counts as done (resolves)", async () => {
    sdk.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "0x80040217: Does Not Exist", status: 400 } });
    await expect(deleteIfExists("delete x", "vsb_things", "id-1")).resolves.toBeUndefined();
  });

  it("UT-CLIENTGONE-007 any other refusal still throws (403 and 500)", async () => {
    sdk.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "denied", status: 403 } });
    await expect(deleteIfExists("delete x", "vsb_things", "id-1")).rejects.toBeInstanceOf(DataError);
    sdk.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "boom", status: 500 } });
    await expect(deleteIfExists("delete x", "vsb_things", "id-1")).rejects.toBeInstanceOf(DataError);
  });

  it("UT-CLIENTGONE-008 the plain deleteRecord still fails on a 404 (the old behaviour is unchanged for its other callers)", async () => {
    sdk.deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "Not Found", status: 404 } });
    await expect(deleteRecord("delete x", "vsb_things", "id-1")).rejects.toBeInstanceOf(DataError);
  });
});
