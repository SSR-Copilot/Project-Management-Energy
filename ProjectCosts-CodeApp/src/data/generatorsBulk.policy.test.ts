/**
 * UT-GENBULKPOL-001.. — the Generators bulk backend's per-row path after a 501 and its guard read through the request policy
 * (dvopt T-11, WE-02, CA-01; switches `POLICY_BULK_TRANSPORT`, `POLICY_VERIFY_READS`). The bulk transport itself keeps its own
 * `retryDelay` loop (batch 1) and is not wrapped: pinned by UT-GENBULK-038..043 in `generatorsBulk.test.ts`.
 * Per-row create: retried on a 429 only. Per-row PATCH (absolute values): also on a 5xx. Guard read: 429 / 5xx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  flags: { POLICY_BULK_TRANSPORT: true, POLICY_VERIFY_READS: true },
  script: { rowCreate: [] as unknown[], rowUpdate: [] as unknown[], read: [] as unknown[], bulkCreate: [] as unknown[], bulkUpdate: [] as unknown[] },
  calls: { rowCreate: 0, rowUpdate: 0, read: 0, bulkCreate: 0, bulkUpdate: 0 },
}));
const next = (kind: keyof typeof h.calls): unknown => {
  const list = h.script[kind];
  const answer = list[Math.min(h.calls[kind], list.length - 1)];
  h.calls[kind] += 1;
  return answer;
};

vi.mock("@microsoft/power-apps/data", () => ({ getClient: () => ({}) }));
vi.mock("./requestFlags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./requestFlags")>();
  return {
    ...actual,
    get POLICY_BULK_TRANSPORT() { return h.flags.POLICY_BULK_TRANSPORT; },
    get POLICY_VERIFY_READS() { return h.flags.POLICY_VERIFY_READS; },
  };
});
vi.mock("@/generated/services/CreateMultipleService", () => ({ CreateMultipleService: { CreateMultiple: async () => next("bulkCreate") } }));
vi.mock("@/generated/services/UpdateMultipleService", () => ({ UpdateMultipleService: { UpdateMultiple: async () => next("bulkUpdate") } }));
const rowService = () => ({
  create: async () => next("rowCreate"),
  update: async () => next("rowUpdate"),
  getAll: async () => next("read"),
});
for (const [path, name] of [
  ["Vsb_landleaseallocationwtgsService", "Vsb_landleaseallocationwtgsService"], ["Vsb_generatorinprojectsService", "Vsb_generatorinprojectsService"],
  ["Vsb_opexprojectcostsService", "Vsb_opexprojectcostsService"], ["Vsb_generatortypeinprojectsService", "Vsb_generatortypeinprojectsService"],
  ["Vsb_pvmoduletypeinprojectsService", "Vsb_pvmoduletypeinprojectsService"], ["Vsb_capexprojectcontractsService", "Vsb_capexprojectcontractsService"],
  ["Vsb_capexcostsService", "Vsb_capexcostsService"],
] as const) {
  vi.doMock(`@/generated/services/${path}`, () => ({ [name]: rowService() }));
}

const { setPolicyTestSeams } = await import("./requestPolicy");
const { createGeneratorsBulkBackend, resetGeneratorsBulkAvailability, setGeneratorsBulkSleeper } = await import("./generatorsBulk");
type BulkRow = import("./bulkBackend").BulkRow;

const LL = "vsb_landleaseallocationwtgs";
const OBU = "owningbusinessunit@odata.bind";
const BU = "/businessunits(11111111-1111-4111-8111-111111111111)";
const guid = (i: number) => `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const bad = (status: number) => ({ success: false as const, error: Object.assign(new Error(`HTTP ${status}`), { status }) });
const ok = { success: true as const, data: {} };
const createRows = (n: number): BulkRow[] => Array.from({ length: n }, (_, i) => ({ id: guid(i), data: { vsb_x: i, [OBU]: BU } }));
const updateRows = (n: number): BulkRow[] => Array.from({ length: n }, (_, i) => ({ id: guid(i), data: { vsb_x: i } }));
const waits: number[] = [];
let session: Map<string, string>;

beforeEach(() => {
  h.flags.POLICY_BULK_TRANSPORT = true;
  h.flags.POLICY_VERIFY_READS = true;
  for (const k of Object.keys(h.calls) as (keyof typeof h.calls)[]) { h.calls[k] = 0; h.script[k] = [ok]; }
  waits.length = 0;
  session = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => { session.set(k, v); },
    removeItem: (k: string) => { session.delete(k); },
  });
  resetGeneratorsBulkAvailability();
  setGeneratorsBulkSleeper(async () => {});
  setPolicyTestSeams({ sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
});
afterEach(() => {
  setPolicyTestSeams(null);
  setGeneratorsBulkSleeper(null);
  vi.unstubAllGlobals();
});

/** Every bulk request answers 501, so the backend falls back to one request per row. */
const to501 = () => { h.script.bulkCreate = [bad(501)]; h.script.bulkUpdate = [bad(501)]; };

describe("per-row writes after a 501", () => {
  it("UT-GENBULKPOL-001 a per-row create answered 429 on row k is retried and the call completes", async () => {
    to501();
    h.script.rowCreate = [ok, bad(429), ok, ok];
    const result = await createGeneratorsBulkBackend().createMany(LL, createRows(3));
    expect(result.ids).toHaveLength(3);
    expect(h.calls.rowCreate).toBe(4);
    expect(waits).toHaveLength(1);
  });

  it("UT-GENBULKPOL-002 a per-row create is NOT retried after a 500 (the row may exist): one request, a BulkBatchError with the exact counts", async () => {
    to501();
    h.script.rowCreate = [bad(500)];
    const error = await createGeneratorsBulkBackend().createMany(LL, createRows(2)).catch((e: unknown) => e) as { name: string; rowsLanded: number; rowsTotal: number };
    expect(error.name).toBe("BulkBatchError");
    expect([error.rowsLanded, error.rowsTotal]).toEqual([0, 2]);
    expect(h.calls.rowCreate).toBe(2); // each row once; no row sent again
    expect(waits).toEqual([]);
  });

  it("UT-GENBULKPOL-003 a per-row PATCH (absolute values) is retried after a 503; 400, 403, 404, 409 are never retried", async () => {
    to501();
    h.script.read = [{ success: true, data: [{ vsb_landleaseallocationwtgid: guid(0) }] }];
    h.script.rowUpdate = [bad(503), ok];
    await createGeneratorsBulkBackend().updateMany(LL, updateRows(1));
    expect(h.calls.rowUpdate).toBe(2);
    for (const status of [400, 403, 404, 409]) {
      resetGeneratorsBulkAvailability();
      session.clear();
      h.calls.rowUpdate = 0;
      to501();
      h.script.rowUpdate = [bad(status)];
      await expect(createGeneratorsBulkBackend().updateMany(LL, updateRows(1))).rejects.toBeDefined();
      expect(h.calls.rowUpdate).toBe(1);
    }
  });

  it("UT-GENBULKPOL-004 the switch OFF: a 429 per-row create and a 503 per-row PATCH are sent once", async () => {
    h.flags.POLICY_BULK_TRANSPORT = false;
    to501();
    h.script.rowCreate = [bad(429), ok];
    await expect(createGeneratorsBulkBackend().createMany(LL, createRows(1))).rejects.toBeDefined();
    expect(h.calls.rowCreate).toBe(1);
    resetGeneratorsBulkAvailability();
    session.clear();
    to501();
    h.script.read = [{ success: true, data: [{ vsb_landleaseallocationwtgid: guid(0) }] }];
    h.script.rowUpdate = [bad(503), ok];
    await expect(createGeneratorsBulkBackend().updateMany(LL, updateRows(1))).rejects.toBeDefined();
    expect(h.calls.rowUpdate).toBe(1);
  });
});

describe("guard read of updateMany", () => {
  it("UT-GENBULKPOL-010 a 503 on the existence read is retried, and the update then goes out", async () => {
    h.script.read = [bad(503), { success: true, data: [{ vsb_landleaseallocationwtgid: guid(0) }] }];
    await createGeneratorsBulkBackend().updateMany(LL, updateRows(1));
    expect(h.calls.read).toBe(2);
    expect(h.calls.bulkUpdate).toBe(1);
  });

  it("UT-GENBULKPOL-011 a guard read that keeps failing sends NOTHING (fail closed), as before; the switch OFF reads once", async () => {
    h.script.read = [bad(503)];
    await expect(createGeneratorsBulkBackend().updateMany(LL, updateRows(1))).rejects.toBeDefined();
    expect(h.calls.read).toBe(3);
    expect(h.calls.bulkUpdate).toBe(0);
    h.flags.POLICY_VERIFY_READS = false;
    h.calls.read = 0;
    await expect(createGeneratorsBulkBackend().updateMany(LL, updateRows(1))).rejects.toBeDefined();
    expect(h.calls.read).toBe(1);
    expect(h.calls.bulkUpdate).toBe(0);
  });
});
