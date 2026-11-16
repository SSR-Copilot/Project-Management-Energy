/**
 * The Generators bulk backend (`./generatorsBulk.ts`, work package T): fail-closed validation,
 * the table registry, chunking and request counts, exact failure counts (sequential prefix vs
 * parallel set), the per-action 501 fallback and its flag, the guarded update, the `Retry-After`
 * retry of 429, the default-backend wiring and the `[VSB]` line.
 *
 * Only the SDK edge is faked: the two bulk services, the per-table services and `fetchAll`. The
 * validation, the splitter, the executor, the gate and the logger all run for real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Action = "create" | "update";
type Outcome = { ok: true } | { ok: false; status: number; message?: string; headers?: Record<string, string> } | { throws: Error };

const fx = vi.hoisted(() => ({
  /** Lower-case ids that exist in the fake Dataverse. */
  stored: new Set<string>(),
  calls: { create: [] as { es: string; targets: Record<string, unknown>[] }[], update: [] as { es: string; targets: Record<string, unknown>[] }[] },
  rowCreates: [] as { es: string; body: Record<string, unknown> }[],
  rowUpdates: [] as { es: string; id: string; fields: Record<string, unknown> }[],
  reads: [] as { label: string; options: { select: string[]; filter?: string } }[],
  /** Decides each bulk call by its 0-based index within its action; default success. */
  script: { create: null as null | ((i: number, targets: Record<string, unknown>[]) => unknown), update: null as null | ((i: number, targets: Record<string, unknown>[]) => unknown) },
  /** Decides each per-row write by its 0-based index; default success. */
  rowScript: null as null | ((i: number) => boolean),
  rowCount: 0,
  /** What a per-row create answers as its row (default `{}`: no id); receives the sent body. */
  rowCreateData: null as null | ((body: Record<string, unknown>) => Record<string, unknown>),
}));

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function answer(action: Action, es: string, targets: Record<string, unknown>[]): unknown {
  const list = fx.calls[action];
  const index = list.length;
  list.push({ es, targets });
  const outcome = fx.script[action]?.(index, targets) as Outcome | undefined;
  if (outcome && "throws" in outcome) throw outcome.throws;
  if (outcome && !outcome.ok) {
    return {
      success: false,
      error: Object.assign(new Error(outcome.message ?? `bulk ${action} refused`), {
        status: outcome.status, ...(outcome.headers ? { headers: outcome.headers } : {}),
      }),
    };
  }
  return { success: true, data: {} };
}

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: { CreateMultiple: async (es: string, t: Record<string, unknown>[]) => answer("create", es, t) },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: { UpdateMultiple: async (es: string, t: Record<string, unknown>[]) => answer("update", es, t) },
}));

const rowService = (es: string) => ({
  create: async (body: Record<string, unknown>) => {
    const ok = fx.rowScript?.(fx.rowCount++) ?? true;
    if (!ok) return { success: false, error: new Error("row create refused") };
    fx.rowCreates.push({ es, body });
    return { success: true, data: fx.rowCreateData?.(body) ?? {} };
  },
  update: async (id: string, fields: Record<string, unknown>) => {
    const ok = fx.rowScript?.(fx.rowCount++) ?? true;
    if (!ok) return { success: false, error: new Error("row update refused") };
    fx.rowUpdates.push({ es, id, fields });
    return { success: true, data: {} };
  },
  getAll: async () => ({ success: true, data: [] }),
});
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({ Vsb_landleaseallocationwtgsService: rowService("vsb_landleaseallocationwtgs") }));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({ Vsb_generatorinprojectsService: rowService("vsb_generatorinprojects") }));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({ Vsb_opexprojectcostsService: rowService("vsb_opexprojectcosts") }));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({ Vsb_generatortypeinprojectsService: rowService("vsb_generatortypeinprojects") }));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({ Vsb_pvmoduletypeinprojectsService: rowService("vsb_pvmoduletypeinprojects") }));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({ Vsb_capexprojectcontractsService: rowService("vsb_capexprojectcontracts") }));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({ Vsb_capexcostsService: rowService("vsb_capexcosts") }));

vi.mock("./client", async (original) => ({
  ...(await original<typeof import("./client")>()),
  fetchAll: async (label: string, _page: unknown, options: { select: string[]; filter?: string }) => {
    fx.reads.push({ label, options });
    return (options.filter?.match(GUID) ?? [])
      .filter((id) => fx.stored.has(id.toLowerCase()))
      .map((id) => ({ [options.select[0] as string]: id.toUpperCase() })); // upper case: matched case-insensitively
  },
}));

const { flushDataLog, resetRequestLog } = await import("@/platform/requestLog");
const { getBulkBackend, registerDefaultBulkBackend, setBulkBackend } = await import("./bulkBackend");
const {
  BulkBackendValidationError, BulkBatchError, BulkRowsGoneError,
} = await import("./bulkTypes");
const {
  GENERATORS_TABLES, MAX_BULK_TRIES, MAX_RETRY_WAIT_MS, createGeneratorsBulkBackend, generatorsBulk501Line,
  generatorsBulkRequestCount, isGeneratorsBulkPerRow, resetGeneratorsBulkAvailability, retryAfterMs, retryDelay,
  setGeneratorsBulkChunking, setGeneratorsBulkSleeper,
} = await import("./generatorsBulk");
const { GENERATORS_BULK } = await import("./generatorsBulkFlags");
type BulkRow = import("./bulkBackend").BulkRow;

const LL = "vsb_landleaseallocationwtgs";
const GI = "vsb_generatorinprojects";
const OBU = "owningbusinessunit@odata.bind";
const BU = "/businessunits(11111111-1111-4111-8111-111111111111)";

const guid = (i: number) => `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const createRows = (n: number, from = 0): BulkRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: guid(from + i), data: { vsb_x: i, [OBU]: BU } }));
const updateRows = (n: number, from = 0): BulkRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: guid(from + i), data: { vsb_x: i } }));
const store = (rows: readonly BulkRow[]) => rows.forEach((r) => fx.stored.add(r.id.toLowerCase()));
const sentRequests = () => fx.calls.create.length + fx.calls.update.length + fx.rowCreates.length + fx.rowUpdates.length + fx.reads.length;

let sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };
let sessionStore: Map<string, string>;

beforeEach(() => {
  fx.stored.clear();
  fx.calls.create.length = 0;
  fx.calls.update.length = 0;
  fx.rowCreates.length = 0;
  fx.rowUpdates.length = 0;
  fx.reads.length = 0;
  fx.script.create = null;
  fx.script.update = null;
  fx.rowScript = null;
  fx.rowCreateData = null;
  fx.rowCount = 0;
  sleeps = [];
  sessionStore = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string) => { sessionStore.set(k, v); },
    removeItem: (k: string) => { sessionStore.delete(k); },
  });
  resetGeneratorsBulkAvailability();
  setGeneratorsBulkChunking(null);
  setGeneratorsBulkSleeper(sleep);
  setBulkBackend(null);
  resetRequestLog();
});

afterEach(() => {
  setGeneratorsBulkSleeper(null);
  setGeneratorsBulkChunking(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const backend = () => createGeneratorsBulkBackend();

describe("fail-closed validation: zero requests", () => {
  const bad: [string, string, (rows: BulkRow[]) => BulkRow[]][] = [
    ["UT-GENBULK-001", "an empty id", (r) => [...r, { id: "", data: { [OBU]: BU } }]],
    ["UT-GENBULK-002", "a blank id", (r) => [...r, { id: "   ", data: { [OBU]: BU } }]],
    ["UT-GENBULK-003", "a duplicate id", (r) => [...r, { id: r[0]!.id, data: { [OBU]: BU } }]],
    ["UT-GENBULK-004", "a duplicate id in another letter case", (r) => [...r, { id: r[0]!.id.toUpperCase(), data: { [OBU]: BU } }]],
    ["UT-GENBULK-005", "@odata.type in data", (r) => [...r, { id: guid(900), data: { [OBU]: BU, "@odata.type": "x" } }]],
    ["UT-GENBULK-006", "the primary key in data", (r) => [...r, { id: guid(901), data: { [OBU]: BU, vsb_landleaseallocationwtgid: guid(901) } }]],
    ["UT-GENBULK-007", "@odata.id in data", (r) => [...r, { id: guid(902), data: { [OBU]: BU, "@odata.id": "x" } }]],
    ["UT-GENBULK-008", "a row without the owning business unit bind (rule 4)", (r) => [...r, { id: guid(903), data: { vsb_x: 1 } }]],
    ["UT-GENBULK-009", "an empty owning business unit bind", (r) => [...r, { id: guid(904), data: { [OBU]: "" } }]],
  ];
  it.each(bad)("%s createMany refuses %s and sends nothing, however late the bad row comes", async (_id, _name, build) => {
    await expect(backend().createMany(LL, build(createRows(3)))).rejects.toBeInstanceOf(BulkBackendValidationError);
    expect(sentRequests()).toBe(0);
  });

  it("UT-GENBULK-010 updateMany refuses an id twice (UpdateMultiple would ignore it silently), in any letter case, before any read", async () => {
    const rows = updateRows(3);
    store(rows);
    await expect(backend().updateMany(LL, [...rows, { id: rows[1]!.id.toUpperCase(), data: { vsb_x: 9 } }]))
      .rejects.toBeInstanceOf(BulkBackendValidationError);
    expect(sentRequests()).toBe(0);
  });

  it("UT-GENBULK-011 updateMany refuses an empty id and a reserved key, and needs NO owning business unit bind", async () => {
    await expect(backend().updateMany(LL, [{ id: "", data: { vsb_x: 1 } }])).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend().updateMany(LL, [{ id: guid(1), data: { "@odata.type": "x" } }])).rejects.toBeInstanceOf(BulkBackendValidationError);
    expect(sentRequests()).toBe(0);
    const rows = updateRows(2);
    store(rows);
    await backend().updateMany(LL, rows);
    expect(fx.calls.update).toHaveLength(1);
    expect(JSON.stringify(fx.calls.update[0]!.targets)).not.toContain("owningbusinessunit");
  });

  it("UT-GENBULK-012 an empty call sends nothing and succeeds", async () => {
    await expect(backend().createMany(LL, [])).resolves.toEqual({ ids: [], requests: 0 });
    await expect(backend().updateMany(LL, [])).resolves.toEqual({ requests: 0 });
    expect(sentRequests()).toBe(0);
  });
});

describe("the table registry", () => {
  it("UT-GENBULK-013 the registry names, logical names and primary keys are the verified ones", () => {
    expect(Object.keys(GENERATORS_TABLES).sort()).toEqual([
      "vsb_generatorinprojects", "vsb_generatortypeinprojects", "vsb_landleaseallocationwtgs",
      "vsb_opexprojectcosts", "vsb_pvmoduletypeinprojects",
    ]);
    const t = GENERATORS_TABLES[LL]!;
    expect([t.logicalName, t.primaryKey, t.creates]).toEqual(["vsb_landleaseallocationwtg", "vsb_landleaseallocationwtgid", true]);
    const g = GENERATORS_TABLES[GI]!;
    expect([g.logicalName, g.primaryKey, g.creates]).toEqual(["vsb_generatorinproject", "vsb_generatorinprojectid", true]);
    expect(GENERATORS_TABLES["vsb_opexprojectcosts"]).toMatchObject({ logicalName: "vsb_opexprojectcost", primaryKey: "vsb_opexprojectcostid", creates: false });
  });

  it("UT-GENBULK-014 an unknown entity set (create and update) is refused, nothing sent", async () => {
    await expect(backend().createMany("vsb_capexcosts", createRows(1))).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend().updateMany("vsb_projects", updateRows(1))).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend().createMany("constructor", [])).rejects.toBeInstanceOf(BulkBackendValidationError);
    expect(sentRequests()).toBe(0);
  });

  it("UT-GENBULK-015 an update-only table refuses createMany but updates", async () => {
    await expect(backend().createMany("vsb_opexprojectcosts", createRows(1))).rejects.toBeInstanceOf(BulkBackendValidationError);
    expect(sentRequests()).toBe(0);
    const rows = updateRows(2);
    store(rows);
    await backend().updateMany("vsb_opexprojectcosts", rows);
    expect(fx.calls.update[0]!.es).toBe("vsb_opexprojectcosts");
    expect(fx.calls.update[0]!.targets[0]).toMatchObject({
      "@odata.type": "Microsoft.Dynamics.CRM.vsb_opexprojectcost", vsb_opexprojectcostid: guid(0),
    });
  });
});

describe("createMany: targets, ids, chunking", () => {
  it("UT-GENBULK-016 builds @odata.type, primary key = id and the data, and returns the ids in input order", async () => {
    const rows = createRows(3);
    const result = await backend().createMany(LL, rows);
    expect(result).toEqual({ ids: rows.map((r) => r.id), requests: 1 });
    expect(fx.calls.create).toHaveLength(1);
    expect(fx.calls.create[0]!.es).toBe(LL);
    expect(fx.calls.create[0]!.targets[1]).toEqual({
      "@odata.type": "Microsoft.Dynamics.CRM.vsb_landleaseallocationwtg",
      vsb_landleaseallocationwtgid: guid(1), vsb_x: 1, [OBU]: BU,
    });
  });

  it.each([[1, 1, 1], [10, 1, 1], [500, 8, 1], [501, 8, 2], [1200, 8, 3]])(
    "UT-GENBULK-017 %i rows: %i request(s) with the tuned split (parallel), %i with strictly sequential chunks of 500",
    async (n, parallelRequests, sequentialRequests) => {
      const rows = createRows(n);
      const result = await backend().createMany(LL, rows);
      expect(result.requests).toBe(parallelRequests);
      expect(generatorsBulkRequestCount(n)).toBe(parallelRequests);
      expect(fx.calls.create.reduce((sum, c) => sum + c.targets.length, 0)).toBe(n);
      expect(fx.calls.create.flatMap((c) => c.targets.map((t) => t["vsb_landleaseallocationwtgid"]))).toEqual(rows.map((r) => r.id));
      expect(Math.max(...fx.calls.create.map((c) => c.targets.length))).toBeLessThanOrEqual(500);

      fx.calls.create.length = 0;
      setGeneratorsBulkChunking({ parallel: 1 });
      expect((await backend().createMany(LL, rows)).requests).toBe(sequentialRequests);
      expect(fx.calls.create).toHaveLength(sequentialRequests);
    },
  );

  it("UT-GENBULK-018 the chunk size is configurable for this path (setter and factory option)", async () => {
    setGeneratorsBulkChunking({ chunkSize: 100, parallel: 1 });
    expect((await backend().createMany(LL, createRows(250))).requests).toBe(3);
    fx.calls.create.length = 0;
    setGeneratorsBulkChunking(null);
    expect((await createGeneratorsBulkBackend({ chunkSize: 50, parallel: 1 }).createMany(LL, createRows(120))).requests).toBe(3);
    expect(fx.calls.create.map((c) => c.targets.length)).toEqual([50, 50, 20]);
  });

  it("UT-GENBULK-019 a create row's data is never mutated and the result ids are the input ids", async () => {
    const rows = createRows(2);
    const frozen = rows.map((r) => Object.freeze({ id: r.id, data: Object.freeze({ ...r.data }) }));
    await expect(backend().createMany(LL, frozen)).resolves.toMatchObject({ ids: [guid(0), guid(1)] });
  });
});

describe("exact failure counts", () => {
  const code500 = (message = "server error"): Outcome => ({ ok: false, status: 500, message });

  it("UT-GENBULK-020 sequential chunks: the committed prefix is exact and later chunks are never sent", async () => {
    setGeneratorsBulkChunking({ chunkSize: 100, parallel: 1 });
    fx.script.create = (i) => (i === 2 ? code500() : undefined);
    const rows = createRows(350);
    const error = await backend().createMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect([error.rowsLanded, error.rowsTotal]).toEqual([200, 350]);
    expect(error.landedIds).toEqual(rows.slice(0, 200).map((r) => r.id));
    expect(fx.calls.create).toHaveLength(3);
  });

  it("UT-GENBULK-021 parallel chunks: the landed ids are a set (one chunk failed) and rowsLanded is their sum", async () => {
    setGeneratorsBulkChunking({ chunkSize: 100, parallel: 4, minChunk: 10 });
    fx.script.create = (i) => (i === 1 ? code500() : undefined);
    const rows = createRows(350);
    const error = await backend().createMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(fx.calls.create).toHaveLength(4);
    const failed = new Set(fx.calls.create[1]!.targets.map((t) => t["vsb_landleaseallocationwtgid"] as string));
    const expected = rows.map((r) => r.id).filter((id) => !failed.has(id));
    expect(error.rowsTotal).toBe(350);
    expect(error.rowsLanded).toBe(350 - failed.size);
    expect([...error.landedIds].sort()).toEqual([...expected].sort());
  });

  it("UT-GENBULK-022 parallel chunks that ALL fail: rowsLanded 0, no landed ids", async () => {
    setGeneratorsBulkChunking({ chunkSize: 100, parallel: 4, minChunk: 10 });
    fx.script.create = () => code500();
    const error = await backend().createMany(LL, createRows(350)).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect([error.rowsLanded, error.rowsTotal, error.landedIds.length]).toEqual([0, 350, 0]);
  });

  it("UT-GENBULK-023 a thrown transport error is a failed chunk, not a crash", async () => {
    fx.script.create = () => ({ throws: new Error("network down") });
    const error = await backend().createMany(LL, createRows(3)).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(error.rowsLanded).toBe(0);
    expect(error.message).toContain("network down");
  });

  it("UT-GENBULK-024 updateMany reports the same exact counts (sequential prefix)", async () => {
    setGeneratorsBulkChunking({ chunkSize: 10, parallel: 1 });
    const rows = updateRows(30);
    store(rows);
    fx.script.update = (i) => (i === 1 ? code500() : undefined);
    const error = await backend().updateMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect([error.rowsLanded, error.rowsTotal]).toEqual([10, 30]);
    expect(fx.calls.update).toHaveLength(2);
  });
});

describe("the 501 fallback", () => {
  const notImplemented = (): Outcome => ({ ok: false, status: 501, message: "not implemented" });

  it("UT-GENBULK-025 a 501 on the first chunk falls back to ONE POST per row with the SAME ids, counts the refused request and logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    fx.script.create = () => notImplemented();
    const rows = createRows(5);
    const result = await backend().createMany(LL, rows);
    expect(result).toEqual({ ids: rows.map((r) => r.id), requests: 6 });
    expect(fx.rowCreates.map((c) => c.body["vsb_landleaseallocationwtgid"])).toEqual(rows.map((r) => r.id));
    expect(fx.rowCreates.every((c) => c.body[OBU] === BU)).toBe(true);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("CreateMultiple answered 501 Not Implemented");
  });

  it("UT-GENBULK-026 the flag is remembered (memory and sessionStorage under its own key): later calls skip the bulk request", async () => {
    fx.script.create = () => notImplemented();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await backend().createMany(LL, createRows(2));
    expect(isGeneratorsBulkPerRow("create")).toBe(true);
    expect(isGeneratorsBulkPerRow("update")).toBe(false);
    expect(sessionStore.get("vsb.generators.createMultiple501")).toBe("1");
    expect(sessionStore.has("vsb.addCostSheet.createMultiple501")).toBe(false);
    const before = fx.calls.create.length;
    const result = await backend().createMany(LL, createRows(3, 10));
    expect(fx.calls.create).toHaveLength(before);
    expect(result.requests).toBe(3);
    resetGeneratorsBulkAvailability();
    expect(isGeneratorsBulkPerRow("create")).toBe(false);
    expect(sessionStore.size).toBe(0);
  });

  it("UT-GENBULK-027 a 501 on a LATER chunk is the partial error, never the fallback", async () => {
    setGeneratorsBulkChunking({ chunkSize: 10, parallel: 1 });
    fx.script.create = (i) => (i === 1 ? notImplemented() : undefined);
    const error = await backend().createMany(LL, createRows(30)).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(error.rowsLanded).toBe(10);
    expect(fx.rowCreates).toHaveLength(0);
    expect(isGeneratorsBulkPerRow("create")).toBe(false);
  });

  it("UT-GENBULK-028 mixed parallel outcomes (one chunk landed, the others 501) give the partial error, not the fallback", async () => {
    setGeneratorsBulkChunking({ chunkSize: 10, parallel: 4, minChunk: 5 });
    fx.script.create = (i) => (i === 0 ? undefined : notImplemented());
    const error = await backend().createMany(LL, createRows(40)).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect([error.rowsLanded, error.rowsTotal]).toEqual([10, 40]);
    expect(fx.rowCreates).toHaveLength(0);
    expect(isGeneratorsBulkPerRow("create")).toBe(false);
  });

  it("UT-GENBULK-029 when every parallel chunk answers 501 nothing landed, so the per-row fallback runs", async () => {
    setGeneratorsBulkChunking({ chunkSize: 10, parallel: 4, minChunk: 5 });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fx.script.create = () => notImplemented();
    const result = await backend().createMany(LL, createRows(40));
    expect(fx.rowCreates).toHaveLength(40);
    expect(result.requests).toBe(4 + 40);
  });

  it("UT-GENBULK-030 a per-row failure stops the rows not yet started and reports the exact number that landed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fx.script.create = () => notImplemented();
    fx.rowScript = (i) => i < 3; // rows 0-2 land, row 3 is refused
    const rows = createRows(40);
    const error = await backend().createMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(error.rowsLanded).toBe(fx.rowCreates.length);
    expect(error.landedIds).toHaveLength(fx.rowCreates.length);
    expect(error.rowsTotal).toBe(40);
    expect(fx.rowCreates.length).toBeLessThan(40);
  });

  it("UT-GENBULK-031 update: a 501 falls back to one PATCH per row, after ONE guard read, with its own flag", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fx.script.update = () => notImplemented();
    const rows = updateRows(3);
    store(rows);
    const result = await backend().updateMany(LL, rows);
    expect(fx.rowUpdates.map((u) => u.id)).toEqual(rows.map((r) => r.id));
    expect(fx.rowUpdates[0]!.fields).toEqual(rows[0]!.data);
    expect(fx.reads).toHaveLength(1);
    expect(result.requests).toBe(1 + 1 + 3); // guard read + refused bulk request + rows
    expect(sessionStore.get("vsb.generators.updateMultiple501")).toBe("1");
    expect(isGeneratorsBulkPerRow("update")).toBe(true);
    const before = fx.calls.update.length;
    await backend().updateMany(LL, rows);
    expect(fx.calls.update).toHaveLength(before);
    expect(fx.reads).toHaveLength(2); // the guard still runs
  });

  it("UT-GENBULK-032 the 501 line names the verb of the per-row path", () => {
    expect(generatorsBulk501Line("create", "land-lease allocations", 1)).toMatch(/1 row goes out as one POST each/);
    expect(generatorsBulk501Line("update", "land-lease allocations", 2)).toMatch(/2 rows go out as one PATCH each/);
  });
});

describe("updateMany is guarded", () => {
  it("UT-GENBULK-033 reads by id in chunks of 40 with only the primary key selected, then sends one request", async () => {
    const rows = updateRows(85);
    store(rows);
    const result = await backend().updateMany(LL, rows);
    expect(fx.reads).toHaveLength(3);
    expect(fx.reads.every((r) => r.options.select.length === 1 && r.options.select[0] === "vsb_landleaseallocationwtgid")).toBe(true);
    expect(fx.reads.map((r) => (r.options.filter?.match(GUID) ?? []).length)).toEqual([40, 40, 5]);
    expect(result.requests).toBe(3 + generatorsBulkRequestCount(85));
  });

  it("UT-GENBULK-034 a missing id sends nothing and throws BulkRowsGoneError naming it", async () => {
    const rows = updateRows(5);
    store(rows.filter((_, i) => i !== 3));
    const error = await backend().updateMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkRowsGoneError>;
    expect(error).toBeInstanceOf(BulkRowsGoneError);
    expect(error.missingIds).toEqual([guid(3)]);
    expect(fx.calls.update).toHaveLength(0);
    expect(fx.rowUpdates).toHaveLength(0);
  });

  it("UT-GENBULK-035 a null value in a bind key (clear the lookup) and every changed column pass through unchanged", async () => {
    const rows: BulkRow[] = [{ id: guid(1), data: { "vsb_Generator@odata.bind": null, vsb_hub: 120.5 } }];
    store(rows);
    await backend().updateMany(GI, rows);
    const target = fx.calls.update[0]!.targets[0]!;
    expect(Object.prototype.hasOwnProperty.call(target, "vsb_Generator@odata.bind")).toBe(true);
    expect(target["vsb_Generator@odata.bind"]).toBeNull();
    expect(target).toEqual({
      "@odata.type": "Microsoft.Dynamics.CRM.vsb_generatorinproject", vsb_generatorinprojectid: guid(1),
      "vsb_Generator@odata.bind": null, vsb_hub: 120.5,
    });
  });

  it("UT-GENBULK-036 a failed guard read propagates and sends nothing", async () => {
    const rows = updateRows(2);
    store(rows);
    const client = await import("./client");
    vi.spyOn(client, "fetchAll").mockRejectedValueOnce(new Error("read failed"));
    await expect(backend().updateMany(LL, rows)).rejects.toThrow("read failed");
    expect(fx.calls.update).toHaveLength(0);
  });
});

describe("429: Retry-After retry, inside the backend only", () => {
  const tooMany = (header?: string): Outcome => ({
    ok: false, status: 429, message: "Too many requests", ...(header ? { headers: { "Retry-After": header } } : {}),
  });

  it("UT-GENBULK-037 a 429 is retried after the Retry-After seconds and the retry lands (both attempts count)", async () => {
    fx.script.create = (i) => (i === 0 ? tooMany("2") : undefined);
    const result = await backend().createMany(LL, createRows(3));
    expect(sleeps).toEqual([2000]);
    expect(fx.calls.create).toHaveLength(2);
    expect(result.requests).toBe(2);
  });

  it("UT-GENBULK-038 it stops after 3 tries and then fails with exact counts (nothing landed)", async () => {
    fx.script.create = () => tooMany("1");
    const error = await backend().createMany(LL, createRows(3)).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(fx.calls.create).toHaveLength(3);
    expect(sleeps).toEqual([1000, 1000]);
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(error.rowsLanded).toBe(0);
    expect(MAX_BULK_TRIES).toBe(3);
  });

  it("UT-GENBULK-039 the wait is capped at 30 s, and without a header it grows 1 s, 2 s", async () => {
    fx.script.create = (i) => (i === 0 ? tooMany("120") : undefined);
    await backend().createMany(LL, createRows(1));
    expect(sleeps).toEqual([MAX_RETRY_WAIT_MS]);
    sleeps.length = 0;
    fx.script.update = (i) => (i < 2 ? tooMany() : undefined);
    const rows = updateRows(1);
    store(rows);
    await backend().updateMany(LL, rows);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("UT-GENBULK-040 other statuses are never retried: 400, 500 and a bare 503 send once", async () => {
    for (const status of [400, 403, 500, 503]) {
      fx.calls.create.length = 0;
      fx.script.create = () => ({ ok: false, status });
      await expect(backend().createMany(LL, createRows(1))).rejects.toBeInstanceOf(BulkBatchError);
      expect(fx.calls.create).toHaveLength(1);
    }
    expect(sleeps).toEqual([]);
  });

  it("UT-GENBULK-041 a thrown network error is not retried; a 503 WITH Retry-After is", async () => {
    fx.script.create = () => ({ throws: new Error("socket hang up") });
    await expect(backend().createMany(LL, createRows(1))).rejects.toBeInstanceOf(BulkBatchError);
    expect(fx.calls.create).toHaveLength(1);
    fx.calls.create.length = 0;
    fx.script.create = (i) => (i === 0 ? { ok: false, status: 503, headers: { "retry-after": "3" } } : undefined);
    await backend().createMany(LL, createRows(1));
    expect(fx.calls.create).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
  });

  it("UT-GENBULK-042 the sleeper can be injected per backend", async () => {
    const mine: number[] = [];
    fx.script.create = (i) => (i === 0 ? tooMany("4") : undefined);
    await createGeneratorsBulkBackend({ sleep: async (ms) => { mine.push(ms); } }).createMany(LL, createRows(1));
    expect(mine).toEqual([4000]);
    expect(sleeps).toEqual([]);
  });

  it("UT-GENBULK-043 retryAfterMs reads seconds, an HTTP date, a Headers object and a plain field; retryDelay is pure", () => {
    expect(retryAfterMs({ headers: { "Retry-After": "7" } })).toBe(7000);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "1.5" }) })).toBe(1500);
    expect(retryAfterMs({ response: { headers: { "retry-after": "2" } } })).toBe(2000);
    expect(retryAfterMs({ retryAfter: 9 })).toBe(9000);
    expect(retryAfterMs({ headers: { "retry-after": new Date(10_000 + 5000).toUTCString() } }, 10_000)).toBe(5000);
    expect(retryAfterMs({ headers: { "retry-after": "soon" } })).toBeUndefined();
    expect(retryAfterMs(new Error("x"))).toBeUndefined();
    expect(retryAfterMs(undefined)).toBeUndefined();
    expect(retryDelay({ status: 429 }, 3)).toBeUndefined();
    expect(retryDelay({ status: 429 }, 1)).toBe(1000);
    expect(retryDelay({ status: 404, headers: { "retry-after": "1" } }, 1)).toBeUndefined();
  });
});

describe("the default backend and the [VSB] lines", () => {
  it("UT-GENBULK-044 getBulkBackend lazily returns the real backend, setBulkBackend overrides it, null restores the same default", async () => {
    // The engine does not import the transport (F2): the module that owns it registers it (`./generators.ts` does).
    registerDefaultBulkBackend(createGeneratorsBulkBackend);
    const first = getBulkBackend();
    expect(getBulkBackend()).toBe(first);
    const rows = createRows(2);
    await expect(first.createMany(LL, rows)).resolves.toEqual({ ids: rows.map((r) => r.id), requests: 1 });
    const fake = { createMany: vi.fn(), updateMany: vi.fn() };
    setBulkBackend(fake);
    expect(getBulkBackend()).toBe(fake);
    setBulkBackend(null);
    expect(getBulkBackend()).toBe(first);
  });

  it("UT-GENBULK-045 one DATA line per bulk write, with the row count and the entity set, and no ids", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const rows = createRows(3);
    store(rows);
    await backend().createMany(LL, rows);
    await backend().updateMany(GI, rows);
    flushDataLog();
    const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[VSB] DATA "));
    expect(lines).toContainEqual(expect.stringMatching(/^\[VSB\] DATA create vsb_landleaseallocationwtgs: 3 rows, \d+ ms/));
    expect(lines).toContainEqual(expect.stringMatching(/^\[VSB\] DATA update vsb_generatorinprojects: 3 rows, \d+ ms/));
    expect(lines.join("\n")).not.toMatch(GUID);
  });

  it("UT-GENBULK-046 a refused bulk request is a FAILED warning with the row ids redacted and no rows counted", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fx.script.create = () => ({ ok: false, status: 400, message: `Entity With Id = ${guid(1)} refused` });
    await expect(backend().createMany(LL, createRows(2))).rejects.toBeInstanceOf(BulkBatchError);
    flushDataLog();
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContainEqual(expect.stringMatching(/^\[VSB\] DATA create vsb_landleaseallocationwtgs: 0 rows, .*1 FAILED \(.*<id>/));
    expect(lines.join("\n")).not.toMatch(GUID);
  });
});

describe("the rollout flags", () => {
  it("UT-GENBULK-047 every flag exists and is false until its DEV check has passed", () => {
    expect(GENERATORS_BULK).toEqual({
      allocations: false, status: false, applyAll: false, turbines: false, replace: false, createRollback: false,
    });
  });
});

describe("review fix F2 (per-row create key, row data)", () => {
  const notImplemented = (): Outcome => ({ ok: false, status: 501, message: "not implemented" });

  it("UT-GENBULK-100 a per-row create that Dataverse answers under ANOTHER id is a BulkBatchError saying the client key was not honoured, with the exact rows landed", async () => {
    fx.script.create = () => notImplemented();
    const rows = createRows(3);
    fx.rowCreateData = (body) => ({ vsb_landleaseallocationwtgid: body["vsb_landleaseallocationwtgid"] === rows[0]!.id ? guid(999) : body["vsb_landleaseallocationwtgid"] });
    const error = await backend().createMany(LL, rows).catch((e: unknown) => e) as InstanceType<typeof BulkBatchError>;
    expect(error).toBeInstanceOf(BulkBatchError);
    expect(error.message).toMatch(/client key was not honoured/);
    expect(error.message).toContain(guid(999));
    expect([error.rowsLanded, error.rowsTotal]).toEqual([2, 3]);
    expect(error.landedIds).toEqual([rows[1]!.id, rows[2]!.id]);
  });

  it("UT-GENBULK-101 a per-row create answered under the same id (any letter case) or with no id in the answer is accepted", async () => {
    fx.script.create = () => notImplemented();
    const rows = createRows(2);
    fx.rowCreateData = (body) => ({ vsb_landleaseallocationwtgid: String(body["vsb_landleaseallocationwtgid"]).toUpperCase() });
    await expect(backend().createMany(LL, rows)).resolves.toMatchObject({ ids: rows.map((r) => r.id) });
    fx.rowCreateData = null; // the answer carries no id at all: unverifiable, accepted
    await expect(backend().createMany(LL, createRows(2, 10))).resolves.toMatchObject({ ids: createRows(2, 10).map((r) => r.id) });
  });

  it("UT-GENBULK-102 a row without data is refused with BulkBackendValidationError (not a TypeError), and nothing is sent", async () => {
    const bad = [{ id: guid(1) } as unknown as BulkRow];
    await expect(backend().createMany(LL, bad)).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend().updateMany(GI, bad)).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend().createMany(LL, [{ id: guid(1), data: null } as unknown as BulkRow])).rejects.toThrow(/has no data/);
    expect(sentRequests()).toBe(0);
  });
});
