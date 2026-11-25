/**
 * dvopt batch 2, the Contracts data module against a mocked SDK client.
 *
 *  - UT-CONTRB2-001..008 (CB-13): `findBopStandardAssumptions` reads Development and Construction in ONE request and picks the oldest ACTIVE
 *    row of each type, the same answer as two `findBopStandardAssumption` reads (differential).
 *  - UT-CONTRB2-010..014 (CB-11): `replaceDevCoLinks` uses the stored links already being read instead of reading them itself.
 *  - UT-COSTPOLICY-040..049: the Contracts writes go through `sendWithPolicy` (create: a 429 only; patch and delete: 429 and transient).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
  updateRecordAsync: vi.fn(),
  createRecordAsync: vi.fn(),
  deleteRecordAsync: vi.fn(),
}));
vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => client }));
const flags = vi.hoisted(() => ({ policy: true }));
vi.mock("./leaseOpexFlags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./leaseOpexFlags")>()),
  get COST_WRITES_POLICY() { return flags.policy; },
  STABLE_CREATE_IDS: false,
}));
// The services are the real generated ones (they call the mocked client); nothing else is replaced.

import { CLOSING_DATE_TYPE, CONTRACT_TYPE, TOTAL_COSTS_TYPE } from "@/features/cost/contracts/rules";
import {
  deleteContract, deletePaymentTarget, findBopStandardAssumption, findBopStandardAssumptions, replaceDevCoLinks, saveContract,
  savePaymentTarget, type ContractWrite, type PaymentTargetWrite,
} from "./contracts";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ok = (data: unknown) => ({ success: true, data });
const COUNTRY = id(5);

interface Call { table: string; options: { select?: string[]; filter?: string; orderBy?: string[]; top?: number } }
const reads = (table: string): Call[] =>
  (client.retrieveMultipleRecordsAsync.mock.calls as [string, Call["options"] | undefined][])
    .map(([t, o]) => ({ table: t, options: o ?? {} })).filter((c) => c.table === table);

beforeEach(() => {
  flags.policy = true;
  Object.values(client).forEach((fn) => fn.mockReset());
});
afterEach(() => { vi.useRealTimers(); });

/* ───────────────────────────────────────────────────────────── CB-13 */

const T = "vsb_bopcontractsstandardassumptionses";
const row = (n: number, type: number, created: string) => ({
  vsb_bopcontractsstandardassumptionsid: id(n), vsb_contracttypes: type, vsb_margin: true, createdon: created,
});

describe("CB-13 findBopStandardAssumptions", () => {
  it("UT-CONTRB2-001 ONE request: country, technology, Development OR Construction, ACTIVE, oldest first, no top", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([]));
    await findBopStandardAssumptions({ countryId: COUNTRY, technology: 1 });
    const calls = reads(T);
    expect(calls).toHaveLength(1);
    expect(client.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
    expect(calls[0]!.options.filter).toBe(
      `(_vsb_country_value eq ${COUNTRY}) and (vsb_technology eq 1) and `
      + `((vsb_contracttypes eq ${CONTRACT_TYPE.Development}) or (vsb_contracttypes eq ${CONTRACT_TYPE.Construction})) and (statecode eq 0)`,
    );
    expect(calls[0]!.options.orderBy).toEqual(["createdon asc"]);
    expect(calls[0]!.options.top).toBeUndefined();
    expect(calls[0]!.options.select).toContain("vsb_contracttypes");
  });

  it("UT-CONTRB2-002 the OLDEST row of each type wins (rows arrive oldest first); a type with no row has no entry", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([
      row(1, CONTRACT_TYPE.Development, "2024-01-01"), row(2, CONTRACT_TYPE.Construction, "2024-02-01"),
      row(3, CONTRACT_TYPE.Development, "2025-01-01"),
    ]));
    const map = await findBopStandardAssumptions({ countryId: COUNTRY, technology: 1 });
    expect(map.get(CONTRACT_TYPE.Development)?.vsb_bopcontractsstandardassumptionsid).toBe(id(1));
    expect(map.get(CONTRACT_TYPE.Construction)?.vsb_bopcontractsstandardassumptionsid).toBe(id(2));
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([row(9, CONTRACT_TYPE.Construction, "2024-01-01")]));
    const only = await findBopStandardAssumptions({ countryId: COUNTRY, technology: 1 });
    expect(only.has(CONTRACT_TYPE.Development)).toBe(false);
    expect(only.get(CONTRACT_TYPE.Construction)?.vsb_bopcontractsstandardassumptionsid).toBe(id(9));
  });

  it("UT-CONTRB2-003 without a country or a technology: an empty map and NO request; technology 0 is a value", async () => {
    expect((await findBopStandardAssumptions({ countryId: undefined, technology: 1 })).size).toBe(0);
    expect((await findBopStandardAssumptions({ countryId: COUNTRY, technology: undefined })).size).toBe(0);
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([]));
    await findBopStandardAssumptions({ countryId: COUNTRY, technology: 0 });
    expect(reads(T)[0]!.options.filter).toContain("vsb_technology eq 0");
  });

  it("UT-CONTRB2-004 the single-type read is unchanged: type filter without an OR, top 1", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([row(1, CONTRACT_TYPE.Construction, "2024-01-01")]));
    const found = await findBopStandardAssumption({ countryId: COUNTRY, technology: 1, contractType: CONTRACT_TYPE.Construction });
    expect(reads(T)[0]!.options.filter).toBe(
      `(_vsb_country_value eq ${COUNTRY}) and (vsb_technology eq 1) and (vsb_contracttypes eq ${CONTRACT_TYPE.Construction}) and (statecode eq 0)`,
    );
    expect(reads(T)[0]!.options.top).toBe(1);
    expect(found?.vsb_bopcontractsstandardassumptionsid).toBe(id(1));
  });

  it("UT-CONTRB2-005 differential: over 200 random row sets the pair equals the two single-type answers", async () => {
    let a = 1;
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let seed = 0; seed < 200; seed += 1) {
      const n = Math.floor(rand() * 7);
      const rows = Array.from({ length: n }, (_, i) =>
        row(i + 1, rand() < 0.5 ? CONTRACT_TYPE.Development : CONTRACT_TYPE.Construction, `2024-01-${String(i + 1).padStart(2, "0")}`));
      // The server returns the rows oldest first and applies the type filter: the double does both.
      client.retrieveMultipleRecordsAsync.mockImplementation(async (_t: string, o: { filter?: string; top?: number }) => {
        const wanted: number[] = [CONTRACT_TYPE.Development, CONTRACT_TYPE.Construction].filter((t) => String(o.filter).includes(`vsb_contracttypes eq ${t}`));
        const hit = rows.filter((r) => wanted.includes(r.vsb_contracttypes));
        return ok(o.top ? hit.slice(0, o.top) : hit);
      });
      const pair = await findBopStandardAssumptions({ countryId: COUNTRY, technology: 1 });
      for (const type of [CONTRACT_TYPE.Development, CONTRACT_TYPE.Construction]) {
        const single = await findBopStandardAssumption({ countryId: COUNTRY, technology: 1, contractType: type });
        expect(pair.get(type), `seed ${seed} type ${type}`).toEqual(single);
      }
    }
  });
});

/* ───────────────────────────────────────────────────────────── CB-11 */

describe("CB-11 replaceDevCoLinks takes the stored links already being read", () => {
  const stored = [{ id: id(21), accountId: id(31), contractId: id(1) }, { id: id(22), accountId: id(32), contractId: id(1) }];
  const args = { contractId: id(1), isNewContract: false, owningBusinessUnitId: id(2), accounts: [{ id: id(31), name: "A" }, { id: id(33), name: "C" }] };

  it("UT-CONTRB2-010 with existingLinks it sends NO links read of its own and writes the same difference", async () => {
    client.createRecordAsync.mockResolvedValue(ok({ vsb_bopcontractsdevcocostsid: id(40) }));
    client.deleteRecordAsync.mockResolvedValue({ success: true });
    await replaceDevCoLinks({ ...args, existingLinks: Promise.resolve(stored) });
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1); // account C is new
    expect(client.createRecordAsync.mock.calls[0]![1]).toMatchObject({ vsb_name: "C" });
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1); // account B was unticked
    expect(client.deleteRecordAsync.mock.calls[0]![1]).toBe(id(22));
  });

  it("UT-CONTRB2-011 without it, it reads the links itself, once, and writes the same difference (the old path)", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok(stored.map((l) => ({
      vsb_bopcontractsdevcocostsid: l.id, _vsb_account_value: l.accountId, _vsb_bopcontract_value: l.contractId,
    }))));
    client.createRecordAsync.mockResolvedValue(ok({ vsb_bopcontractsdevcocostsid: id(40) }));
    client.deleteRecordAsync.mockResolvedValue({ success: true });
    await replaceDevCoLinks(args);
    expect(reads("vsb_bopcontractsdevcocostses")).toHaveLength(1);
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    expect(client.deleteRecordAsync.mock.calls[0]![1]).toBe(id(22));
  });

  it("UT-CONTRB2-012 a NEW contract ignores existingLinks (nothing is stored) and reads nothing", async () => {
    client.createRecordAsync.mockResolvedValue(ok({ vsb_bopcontractsdevcocostsid: id(40) }));
    await replaceDevCoLinks({ ...args, isNewContract: true, existingLinks: Promise.resolve(stored) });
    expect(client.retrieveMultipleRecordsAsync).not.toHaveBeenCalled();
    expect(client.createRecordAsync).toHaveBeenCalledTimes(2);
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
  });

  it("UT-CONTRB2-013 a rejected existingLinks rejects the call BEFORE any link is written", async () => {
    await expect(replaceDevCoLinks({ ...args, existingLinks: Promise.reject(new Error("links read failed")) })).rejects.toThrow("links read failed");
    expect(client.createRecordAsync).not.toHaveBeenCalled();
    expect(client.deleteRecordAsync).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────────────────────────────── write policy */

const write: ContractWrite = {
  projectId: id(9), owningBusinessUnitId: id(2), name: "BoP-P-1-Grid", description: "Grid", contractType: CONTRACT_TYPE.Development,
  closingDate: new Date(2026, 8, 18), costsUntilClosingType: CLOSING_DATE_TYPE.Plan, costsAfterClosingType: CLOSING_DATE_TYPE.Plan,
  totalCostsType: TOTAL_COSTS_TYPE.Calculated, margin: false, totalCostOfContract: 1, comment: "", isMarginStandardAssumption: false,
};
const target: PaymentTargetWrite = {
  contractId: id(1), owningBusinessUnitId: id(2), name: "BoP-PT-x", description: "x", paymentDate: "01/2027", totalCostsContract: 10, note: "",
};
const refused = (status: number) => ({ success: false, error: { message: `HTTP ${status}`, status } });

/** Runs `work` with fake timers, letting every backoff elapse. */
async function settle<T>(work: () => Promise<T>): Promise<PromiseSettledResult<T>> {
  vi.useFakeTimers();
  const run = work().then((value) => ({ status: "fulfilled", value }) as const, (reason: unknown) => ({ status: "rejected", reason }) as const);
  await vi.advanceTimersByTimeAsync(60_000);
  return run;
}

describe("Contracts writes through the request policy (T-11 adoption)", () => {
  it("UT-COSTPOLICY-040 a payment-target CREATE answered 429 is sent again and succeeds", async () => {
    client.createRecordAsync.mockResolvedValueOnce(refused(429)).mockResolvedValue(ok({ vsb_bopcontractspaymenttargetsid: id(50) }));
    const out = await settle(() => savePaymentTarget(target));
    expect(out.status).toBe("fulfilled");
    expect(client.createRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-COSTPOLICY-041 a payment-target CREATE answered 503 is NOT sent again (it may have landed): one call, the error reaches the caller", async () => {
    client.createRecordAsync.mockResolvedValue(refused(503));
    const out = await settle(() => savePaymentTarget(target));
    expect(out.status).toBe("rejected");
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-COSTPOLICY-042 a contract UPDATE (existence read + PATCH) answered 503 is retried once and succeeds; the PATCH carries the same payload", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([{ vsb_bopprojectscontractsid: id(1) }]));
    client.updateRecordAsync.mockResolvedValueOnce(refused(503)).mockResolvedValue(ok({ vsb_bopprojectscontractsid: id(1) }));
    const out = await settle(() => saveContract({ ...write, id: id(1) }));
    expect(out.status).toBe("fulfilled");
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(2);
    expect(client.updateRecordAsync.mock.calls[1]![2]).toEqual(client.updateRecordAsync.mock.calls[0]![2]);
  });

  it("UT-COSTPOLICY-043 a 403 is never retried (update and delete): one call each, the error reaches the caller", async () => {
    client.retrieveMultipleRecordsAsync.mockResolvedValue(ok([{ vsb_bopcontractspaymenttargetsid: id(1) }]));
    client.updateRecordAsync.mockResolvedValue(refused(403));
    expect((await settle(() => savePaymentTarget({ ...target, id: id(1) }))).status).toBe("rejected");
    expect(client.updateRecordAsync).toHaveBeenCalledTimes(1);
    client.deleteRecordAsync.mockResolvedValue(refused(403));
    expect((await settle(() => deleteContract(id(1)))).status).toBe("rejected");
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-COSTPOLICY-044 a DELETE answered 503 is retried and succeeds; one answered 404 counts as done with NO retry", async () => {
    client.deleteRecordAsync.mockResolvedValueOnce(refused(503)).mockResolvedValue({ success: true });
    expect((await settle(() => deletePaymentTarget(id(1)))).status).toBe("fulfilled");
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(2);
    client.deleteRecordAsync.mockReset();
    client.deleteRecordAsync.mockResolvedValue(refused(404));
    expect((await settle(() => deleteContract(id(1)))).status).toBe("fulfilled");
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });

  it("UT-COSTPOLICY-045 a DevCo link create answered 429 is retried, a link delete answered 503 is retried", async () => {
    client.createRecordAsync.mockResolvedValueOnce(refused(429)).mockResolvedValue(ok({ vsb_bopcontractsdevcocostsid: id(60) }));
    client.deleteRecordAsync.mockResolvedValueOnce(refused(503)).mockResolvedValue({ success: true });
    const out = await settle(() => replaceDevCoLinks({
      contractId: id(1), isNewContract: false, owningBusinessUnitId: id(2), accounts: [{ id: id(33), name: "C" }],
      existingLinks: Promise.resolve([{ id: id(22), accountId: id(32), contractId: id(1) }]),
    }));
    expect(out.status).toBe("fulfilled");
    expect(client.createRecordAsync).toHaveBeenCalledTimes(2);
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(2);
  });

  it("UT-COSTPOLICY-046 the switch off: every refused write is sent ONCE (the old behaviour)", async () => {
    flags.policy = false;
    client.createRecordAsync.mockResolvedValue(refused(429));
    expect((await settle(() => savePaymentTarget(target))).status).toBe("rejected");
    expect(client.createRecordAsync).toHaveBeenCalledTimes(1);
    client.deleteRecordAsync.mockResolvedValue(refused(503));
    expect((await settle(() => deletePaymentTarget(id(1)))).status).toBe("rejected");
    expect(client.deleteRecordAsync).toHaveBeenCalledTimes(1);
  });
});
