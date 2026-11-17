/**
 * UT-CONTR-160..169 — a Contracts save's DevCo links (`replaceDevCoLinks`) and the tolerant deletes.
 *
 * The real data functions run against a mocked SDK (generated services + `getClient`), not a mock of `./hooks`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const getAll = vi.fn();
const deleteRecordAsync = vi.fn();
vi.mock("@/generated/services/Vsb_bopcontractsdevcocostsesService", () => ({
  Vsb_bopcontractsdevcocostsesService: {
    create: (...args: unknown[]) => create(...args),
    getAll: (...args: unknown[]) => getAll(...args),
  },
}));
vi.mock("@microsoft/power-apps/data", () => ({
  getClient: () => ({ deleteRecordAsync: (...args: unknown[]) => deleteRecordAsync(...args) }),
}));

import { DataError } from "@/platform/errors";
import { WRITE_CONCURRENCY } from "./concurrency";
import {
  ContractLinksError, deleteContract, deletePaymentTarget, isAlreadyGone, replaceDevCoLinks,
} from "./contracts";

const CONTRACT = "33333333-3333-3333-3333-333333333333";
const BU = "22222222-2222-2222-2222-222222222222";
const acc = (id: string) => ({ id, name: `name-${id}` });
const stored = (id: string, accountId: string) => ({
  vsb_bopcontractsdevcocostsid: id, _vsb_account_value: accountId, _vsb_bopcontract_value: CONTRACT,
});
const ok = (data: unknown = {}) => ({ success: true, data });

/** The order the SDK calls were made in, as `create:<account>` / `delete:<row>`. */
let order: string[];

beforeEach(() => {
  order = [];
  create.mockReset();
  getAll.mockReset();
  deleteRecordAsync.mockReset();
  create.mockImplementation(async (body: Record<string, string>) => {
    order.push(`create:${body["vsb_Account@odata.bind"]!.replace(/^.*\(|\)$/g, "")}`);
    return ok({ vsb_bopcontractsdevcocostsid: "new" });
  });
  deleteRecordAsync.mockImplementation(async (_table: string, id: string) => {
    order.push(`delete:${id}`);
    return ok();
  });
});

const existingLinks = (rows: ReturnType<typeof stored>[]) => getAll.mockResolvedValue(ok(rows));

describe("replaceDevCoLinks writes only the difference", () => {
  it("UT-CONTR-160 an unchanged selection reads once and writes nothing", async () => {
    existingLinks([stored("r1", "a1"), stored("r2", "a2")]);
    await replaceDevCoLinks({ contractId: CONTRACT, isNewContract: false, accounts: [acc("a1"), acc("a2")] });
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(deleteRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-161 creates the added account, deletes the removed one, keeps the rest, creates first", async () => {
    existingLinks([stored("r1", "a1"), stored("r2", "a2")]);
    await replaceDevCoLinks({
      contractId: CONTRACT, isNewContract: false, owningBusinessUnitId: BU, accounts: [acc("a2"), acc("a3")],
    });
    expect(order).toEqual(["create:a3", "delete:r1"]);
    const body = create.mock.calls[0]![0] as Record<string, string>;
    expect(body["vsb_BoPContract@odata.bind"]).toBe(`/vsb_bopprojectscontractses(${CONTRACT})`);
    expect(body["owningbusinessunit@odata.bind"]).toBe(`/businessunits(${BU})`);
  });

  it("UT-CONTR-162 a new contract reads nothing, deletes nothing and creates every ticked account once", async () => {
    await replaceDevCoLinks({
      contractId: CONTRACT, isNewContract: true, accounts: [acc("a1"), acc("a2"), acc("a1")],
    });
    expect(getAll).not.toHaveBeenCalled();
    expect(deleteRecordAsync).not.toHaveBeenCalled();
    expect(order.sort()).toEqual(["create:a1", "create:a2"]);
  });

  it("UT-CONTR-163 a stored link whose row is already gone (404) counts as deleted", async () => {
    existingLinks([stored("r1", "a1")]);
    deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "Not Found", status: 404 } });
    await expect(
      replaceDevCoLinks({ contractId: CONTRACT, isNewContract: false, accounts: [] }),
    ).resolves.toBeUndefined();
  });

  it("UT-CONTR-164 a refused delete (403) still rejects", async () => {
    existingLinks([stored("r1", "a1")]);
    deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "denied", status: 403 } });
    await expect(
      replaceDevCoLinks({ contractId: CONTRACT, isNewContract: false, accounts: [] }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("UT-CONTR-165 a refused create stops before any delete, so the contract keeps its old links", async () => {
    existingLinks([stored("r1", "a1")]);
    create.mockResolvedValue({ success: false, error: { message: "boom", status: 500 } });
    await expect(
      replaceDevCoLinks({ contractId: CONTRACT, isNewContract: false, accounts: [acc("a2")] }),
    ).rejects.toBeInstanceOf(DataError);
    expect(deleteRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTR-166 creates run in a bounded pool and the call returns only after every started request settled", async () => {
    let inFlight = 0;
    let peak = 0;
    let started = 0;
    let settled = 0;
    create.mockImplementation(async () => {
      started += 1;
      const mine = started;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      settled += 1;
      // The third request is refused; the others are already in flight and must finish before the call returns.
      return mine === 3 ? { success: false, error: { message: "boom", status: 500 } } : ok();
    });
    const accounts = Array.from({ length: 40 }, (_, i) => acc(`a${i}`));
    await expect(
      replaceDevCoLinks({ contractId: CONTRACT, isNewContract: true, accounts }),
    ).rejects.toBeInstanceOf(DataError);
    expect(peak).toBeLessThanOrEqual(WRITE_CONCURRENCY);
    expect(settled).toBe(started);
    expect(started).toBeLessThan(40);
  });
});

describe("the tolerant deletes", () => {
  it("UT-CONTR-167 deleting a contract or a payment target that is already gone is not an error", async () => {
    deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "Not Found", status: 404 } });
    await expect(deleteContract("c-1")).resolves.toBeUndefined();
    await expect(deletePaymentTarget("t-1")).resolves.toBeUndefined();
  });

  it("UT-CONTR-168 a refusal other than 'gone' still throws", async () => {
    deleteRecordAsync.mockResolvedValue({ success: false, error: { message: "denied", status: 403 } });
    await expect(deleteContract("c-1")).rejects.toMatchObject({ status: 403 });
  });

  it("UT-CONTR-169 isAlreadyGone reads 404 and 0x80040217 only", () => {
    expect(isAlreadyGone(new DataError("x", "nope", 404))).toBe(true);
    expect(isAlreadyGone(new DataError("x", { message: "0x80040217 Does Not Exist" }, 400))).toBe(true);
    expect(isAlreadyGone(new DataError("x", "a related object does not exist", 400))).toBe(false);
    expect(isAlreadyGone(new Error("404"))).toBe(false);
  });

  it("UT-CONTR-169b ContractLinksError keeps the saved id and the cause's status", () => {
    const error = new ContractLinksError("c-9", new DataError("create DevCo cost link", "no", 403));
    expect(error.contractId).toBe("c-9");
    expect(error.status).toBe(403);
    expect(error.isForbidden).toBe(true);
  });
});

describe("replaceDevCoLinks leaves links to accounts the picker cannot show (D120 §2, N1)", () => {
  it("UT-CONTR-217 an unseen link survives a save; a visible un-ticked one is deleted and a ticked new one created", async () => {
    existingLinks([stored("r-visible", "a1"), stored("r-inactive", "gone")]);
    await replaceDevCoLinks({
      contractId: CONTRACT, isNewContract: false, accounts: [acc("a2")], visibleAccountIds: ["a1", "a2"],
    });
    expect(order).toEqual(["create:a2", "delete:r-visible"]);
    expect(deleteRecordAsync).not.toHaveBeenCalledWith(expect.anything(), "r-inactive", expect.anything());
  });

  it("UT-CONTR-218 an unchanged selection with an unseen link writes nothing", async () => {
    existingLinks([stored("r1", "a1"), stored("r-inactive", "gone")]);
    await replaceDevCoLinks({
      contractId: CONTRACT, isNewContract: false, accounts: [acc("a1")], visibleAccountIds: ["a1"],
    });
    expect(create).not.toHaveBeenCalled();
    expect(deleteRecordAsync).not.toHaveBeenCalled();
  });
});
