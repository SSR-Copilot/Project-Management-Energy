/**
 * The CAPEX Add/Edit Cost panel's bulk Save and Delete (D56), against a fake Dataverse.
 *
 * The fake behaves as Dataverse does where it matters here:
 *  - a per-row `update()` is a PATCH without `If-Match`, so it is an UPSERT (it re-creates a
 *    missing row, R-12);
 *  - `UpdateMultiple` refuses the WHOLE request when any target row does not exist;
 *  - `CreateMultiple` refuses the whole request when a target id already exists;
 *  - a delete of a missing row is refused.
 *
 * UT-CAPEXBULK-009 is the property the whole change rests on: for 300 seeded saves, the per-row
 * path and the bulk path (skip on and off) leave the same rows in Dataverse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMENT_TYPE } from "@/features/cost/capex-costs/comments";
import { reconcilePayments } from "@/features/cost/capex-costs/rules";
import type { CostLine, Payment } from "@/features/cost/costing/model";

/* ═════════════════════════════════════════════════════════════ the fake ══ */

interface CostRow { contract: string; year: number; month: number; cost: number; paid: boolean; obu: string | null }

let contracts = new Map<string, Record<string, unknown>>();
let costs = new Map<string, CostRow>();
let comments = new Map<string, { contract: string; type: number }>();
/** Every request, in the order it was SENT (`start:`) and ANSWERED (`end:`). */
let events: string[] = [];
let minted = 0;
let refuse = new Set<string>();
let notImplemented = new Set<string>();
/** When set, the contract update waits for it — proves the cost writes do not wait for the contract. */
let contractHold: Promise<void> | null = null;
let releaseContract: () => void = () => undefined;
/** When set, every bulk request waits for it — proves an error is not thrown while one is in flight. */
let bulkHold: Promise<void> | null = null;

const NEW_CONTRACT = "0c0c0c0c-0000-4000-8000-000000000001";
const CONTRACT = "0c0c0c0c-0000-4000-8000-0000000000aa";
const PROJECT = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const ACCOUNT = "11111111-2222-3333-4444-555555555555";
const BU = "b0b0b0b0-0000-4000-8000-000000000001";

const idInBind = (value: unknown) => (typeof value === "string" ? /\(([^)]+)\)/.exec(value)?.[1] ?? null : null);
const fail = (message: string, status = 400) => ({ success: false, error: { message, status } });
/** A few microtask turns: enough for concurrent senders to interleave, cheap over 900 saves. */
const tick = async () => { for (let i = 0; i < 3; i += 1) await Promise.resolve(); };

function applyCost(id: string, fields: Record<string, unknown>): void {
  const row = costs.get(id) ?? {
    contract: idInBind(fields["vsb_Contract@odata.bind"]) ?? "",
    year: 0, month: 0, cost: 0, paid: false,
    obu: idInBind(fields["owningbusinessunit@odata.bind"]),
  };
  if ("vsb_cost" in fields) row.cost = fields.vsb_cost as number;
  if ("vsb_year" in fields) row.year = fields.vsb_year as number;
  if ("vsb_month" in fields) row.month = fields.vsb_month as number;
  if ("vsb_costpaid" in fields) row.paid = fields.vsb_costpaid as boolean;
  costs.set(id, row);
}

async function request<T>(name: string, task: () => T | Promise<T>): Promise<T> {
  events.push(`start:${name}`);
  await tick();
  try {
    return await task();
  } finally {
    events.push(`end:${name}`);
  }
}

vi.mock("./client", () => ({
  fetchAll: async (label: string) => request(`read:${label}`, () => {
    if (refuse.has("read")) throw new Error("comments read failed");
    return label === "list CAPEX comments"
      ? [...comments].map(([id, c]) => ({ vsb_capexcommentsid: id, _vsb_capexcontract_value: c.contract, vsb_commenttype: c.type }))
      : [];
  }),
  // Comments delete through `deleteRecord` too since CA-18; their events keep the `delete:comment:`
  // name the ordering assertions read.
  deleteRecord: async (_operation: string, tableName: string, id: string) => request(
    tableName === "vsb_capexcommentses" ? `delete:comment:${id}` : `delete:${tableName}:${id}`, () => {
      if (refuse.has(`delete:${id}`)) throw new Error(`delete ${id} denied`);
      const table: Map<string, unknown> = tableName === "vsb_capexcosts" ? costs
        : tableName === "vsb_capexcommentses" ? comments : contracts;
      if (!table.has(id)) throw new Error(`delete ${id}: does not exist`);
      table.delete(id);
    },
  ),
}));

vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    create: async (fields: Record<string, unknown>) => request("contract:create", () => {
      if (refuse.has("contract")) return fail("contract refused");
      contracts.set(NEW_CONTRACT, { ...fields });
      return { success: true, data: { vsb_capexprojectcontractid: NEW_CONTRACT } };
    }),
    update: async (id: string, fields: Record<string, unknown>) => request("contract:update", async () => {
      if (contractHold) await contractHold;
      if (refuse.has("contract")) return fail("contract refused");
      contracts.set(id, { ...contracts.get(id), ...fields });
      return { success: true, data: {} };
    }),
  },
}));

vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    create: async (fields: Record<string, unknown>) => request("cost:create", () => {
      const id = `minted-${++minted}`;
      applyCost(id, fields);
      return { success: true, data: { vsb_capexcostid: id } };
    }),
    // No `If-Match`: an upsert, as in Dataverse.
    update: async (id: string, fields: Record<string, unknown>) => request(`cost:update:${id}`, () => {
      if (refuse.has(`cost:${id}`)) return fail(`cost ${id} refused`);
      applyCost(id, fields);
      return { success: true, data: {} };
    }),
  },
}));

const bulk = (action: "create" | "update") => async (_es: string, targets: Record<string, unknown>[]) =>
  request(`bulk:${action}:${targets.length}`, async () => {
    releaseContract();
    if (bulkHold) await bulkHold;
    if (notImplemented.has(action)) return fail("The server returned an HTTP error with code 501.", 501);
    if (refuse.has(`bulk:${action}`)) return fail(`${action} refused`);
    const ids = targets.map((t) => String(t.vsb_capexcostid));
    if (action === "update" && ids.some((id) => !costs.has(id))) return fail("Does Not Exist", 404);
    if (action === "create" && ids.some((id) => costs.has(id))) return fail("Cannot insert duplicate key.", 412);
    for (const t of targets) {
      const { vsb_capexcostid: id, "@odata.type": _type, ...fields } = t;
      applyCost(String(id), fields);
    }
    return { success: true, data: {} };
  });

vi.mock("@/generated/services/CreateMultipleService", () => ({ CreateMultipleService: { CreateMultiple: bulk("create") } }));
vi.mock("@/generated/services/UpdateMultipleService", () => ({ UpdateMultipleService: { UpdateMultiple: bulk("update") } }));

/**
 * The generated comment `delete()` as the real one behaves: it DISCARDS the result, so a refusal
 * resolves like a success. Nothing may reach it (CA-18); if `deleteComment` went back to it, the
 * refused deletes of UT-CMTDEL-001…004 would resolve and those tests fail.
 */
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    delete: async (id: string): Promise<void> => {
      await request(`delete:comment:${id}`, () => {
        if (!refuse.has(`delete:${id}`)) comments.delete(id);
        return refuse.has(`delete:${id}`) ? fail(`delete ${id} denied`, 403) : { success: true, data: {} };
      });
    },
  },
}));

/** For UT-CAPEXLOG-012: the hook, with its query client and session mocked (it is never rendered). */
const hookClient = vi.hoisted(() => ({ invalidateQueries: vi.fn(async (): Promise<void> => undefined) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ ...hookClient, setQueryData: vi.fn(), cancelQueries: vi.fn(async () => undefined) }),
}));
vi.mock("@/app/SessionContext", () => ({ useSession: () => ({ projectId: "p-1", project: null }) }));
vi.mock("@/components/useNotify", () => ({ useNotify: () => ({ error: vi.fn() }) }));

const {
  deleteCostLineBulk, deleteCostLineLegacy, panelBusyLogLine, panelSaveLogLine, saveCostLine,
  saveCostLineBulk, saveCostLineLegacy, LEGACY_SAVE_OVERRIDE_KEY,
} = await import("./capexWrites");
const { resetBulkWriteAvailability } = await import("./bulkSend");

/* ═══════════════════════════════════════════════════════════ fixtures ══ */

const cost = (id: string, month: number, amount: number, paid = false): Payment =>
  ({ id, year: 2026, month, amount, paid });

function seed(stored: Payment[], contractId = CONTRACT): void {
  contracts.set(contractId, { vsb_name: "old" });
  for (const p of stored) {
    costs.set(p.id as string, { contract: contractId, year: p.year, month: p.month, cost: p.amount, paid: p.paid, obu: BU });
  }
}

function line(payments: Payment[], over: Partial<CostLine> = {}): CostLine {
  return {
    id: CONTRACT, accountId: ACCOUNT, description: "Grid works", payer: "SPV",
    depreciation: false, vat: true, standard: false, distribution: "individual", equalMode: "cluster",
    distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1, clusters: [],
    payments, comments: [], totalCost: 1_200, ...over,
  };
}

const months = (n: number, amount: (m: number) => number, from = 1): Payment[] =>
  Array.from({ length: n }, (_, i) => ({ year: 2026, month: from + i, amount: amount(from + i), paid: false }));

/** The save the panel sends for `stored` → `proposed`. */
function args(stored: Payment[], proposed: Payment[], over: Partial<Parameters<typeof saveCostLineBulk>[0]> = {}) {
  return {
    line: line(stored), accountId: ACCOUNT, projectId: PROJECT, owningBusinessUnitId: BU, isNew: false,
    payments: reconcilePayments(stored, proposed), storedPayments: stored, ...over,
  };
}

/** What Dataverse holds, without the ids (a new row's id differs by path). */
function snapshot() {
  return {
    contracts: [...contracts].sort(([a], [b]) => a.localeCompare(b)),
    costs: [...costs.values()]
      .map((r) => `${r.contract}|${r.year}|${r.month}|${r.cost}|${r.paid}|${r.obu}`)
      .sort(),
    comments: [...comments.keys()].sort(),
  };
}

const sent = (prefix: string) => events.filter((e) => e.startsWith(`start:${prefix}`));
const at = (event: string) => events.indexOf(event);

beforeEach(() => {
  contracts = new Map();
  costs = new Map();
  comments = new Map();
  events = [];
  minted = 0;
  refuse = new Set();
  notImplemented = new Set();
  contractHold = null;
  releaseContract = () => undefined;
  bulkHold = null;
  resetBulkWriteAvailability();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  // The readable groups (D58): kept out of the test output, and inspected by UT-CAPEXLOG-*.
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

/** The panel's one-line summaries (`CAPEX panel …`), in the order printed. */
const summaries = () => vi.mocked(console.info).mock.calls.map((c) => String(c[0]))
  .filter((l) => l.startsWith("CAPEX panel "));
const lastSummary = () => summaries().at(-1) ?? "";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ══════════════════════════════════════════════════════════════ save ══ */

describe("saveCostLineBulk", () => {
  it("UT-CAPEXBULK-001 an edit of 12 months is one contract update and one UpdateMultiple, sent together", async () => {
    const stored = months(12, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    // The contract update cannot answer until the UpdateMultiple was SENT: a sequential save
    // would never get there and the test would time out.
    contractHold = new Promise<void>((resolve) => { releaseContract = resolve; });
    await saveCostLineBulk(args(stored, months(12, () => 150)), true);

    expect(sent("contract:")).toEqual(["start:contract:update"]);
    expect(sent("bulk:")).toEqual(["start:bulk:update:12"]);
    expect(sent("cost:")).toEqual([]);
    expect([...costs.values()].every((r) => r.cost === 150)).toBe(true);
  });

  it("UT-CAPEXBULK-002 a new contract is created first; its months follow as one CreateMultiple", async () => {
    const id = await saveCostLineBulk({
      ...args([], months(12, () => 100)), line: line([], { id: "panel-minted" }), isNew: true, storedPayments: [],
    }, true);

    expect(id).toBe(NEW_CONTRACT);
    expect(at("end:contract:create")).toBeLessThan(at("start:bulk:create:12"));
    expect(sent("cost:")).toEqual([]);
    // Every new row carries the contract bind and the owning business unit (rule 4).
    expect([...costs.values()].every((r) => r.contract === NEW_CONTRACT && r.obu === BU)).toBe(true);
    expect(contracts.get(NEW_CONTRACT)).toMatchObject({
      "vsb_Project@odata.bind": `/vsb_projects(${PROJECT})`,
      "vsb_Account@odata.bind": `/vsb_capexaccountlists(${ACCOUNT})`,
      "owningbusinessunit@odata.bind": `/businessunits(${BU})`,
    });
  });

  it("UT-CAPEXBULK-003 a shrink deletes the dropped months only after every write has answered", async () => {
    const stored = months(12, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    await saveCostLineBulk(args(stored, months(6, () => 200)), true);

    const firstDelete = events.findIndex((e) => e.startsWith("start:delete:"));
    expect(sent("delete:")).toHaveLength(6);
    expect(firstDelete).toBeGreaterThan(at("end:contract:update"));
    expect(firstDelete).toBeGreaterThan(at("end:bulk:update:6"));
    expect(costs.size).toBe(6);
  });

  it("UT-CAPEXBULK-004 a refused contract update sends no delete, waits for the cost writes, and throws its own error", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    refuse.add("contract");
    await expect(saveCostLineBulk(args(stored, months(2, () => 5)), true)).rejects.toThrow(/contract refused/);

    expect(sent("delete:")).toEqual([]);
    // Settled before the throw: nothing is still in flight.
    expect(sent("bulk:").length).toBe(events.filter((e) => e.startsWith("end:bulk:")).length);
  });

  it("UT-CAPEXBULK-005 a refused month write sends no delete and throws", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    refuse.add("bulk:update");
    await expect(saveCostLineBulk(args(stored, months(2, () => 5)), true)).rejects.toThrow(/update refused/);
    expect(sent("delete:")).toEqual([]);
  });

  it("UT-CAPEXBULK-006 the relink reset rides in the month update; payment-date comments go before any month delete", async () => {
    const stored = [cost("c1", 1, 100, true), cost("c2", 2, 100, false), cost("c3", 3, 100, true)];
    seed(stored);
    comments.set("k-general", { contract: CONTRACT, type: COMMENT_TYPE.general });
    comments.set("k-payment", { contract: CONTRACT, type: COMMENT_TYPE.paymentDate });
    // Month 3 is dropped: its row is deleted, not reset.
    await saveCostLineBulk({
      ...args(stored, months(2, () => 100)), resetPaidAndPaymentDateComments: true,
    }, true);

    expect(sent("bulk:")).toEqual(["start:bulk:update:1"]);
    expect(costs.get("c1")).toMatchObject({ cost: 100, paid: false });
    expect(costs.has("c3")).toBe(false);
    expect([...comments.keys()]).toEqual(["k-general"]);
    expect(at("end:delete:comment:k-payment")).toBeLessThan(at("start:delete:vsb_capexcosts:c3"));
  });

  it("UT-CAPEXBULK-007 skips unchanged months; the contract is still written", async () => {
    const stored = months(4, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    await saveCostLineBulk(args(stored, months(4, () => 100)), true);
    expect(sent("bulk:")).toEqual([]);
    expect(sent("contract:")).toEqual(["start:contract:update"]);
  });

  it("UT-CAPEXBULK-008 with the skip off every existing month is written", async () => {
    const stored = months(4, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    await saveCostLineBulk(args(stored, months(4, () => 100)), false);
    expect(sent("bulk:")).toEqual(["start:bulk:update:4"]);
  });

  it("UT-CAPEXBULK-009 per-row and bulk (skip on and off) leave the same rows, 300 seeds", async () => {
    for (let s0 = 1; s0 <= 300; s0 += 1) {
      let s = s0;
      const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
      const isNew = rnd() < 0.2;
      const stored: Payment[] = isNew ? [] : months(1 + Math.floor(rnd() * 14), () => Math.floor(rnd() * 4) * 50)
        .map((p, i) => ({ ...p, id: `c${i + 1}`, paid: rnd() < 0.3 }));
      const proposed = months(Math.floor(rnd() * 16), () => (rnd() < 0.15 ? 0 : Math.floor(rnd() * 4) * 50), 1 + Math.floor(rnd() * 3));
      const reset = !isNew && rnd() < 0.4;
      const commentSeed = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) =>
        [`k${i}`, rnd() < 0.5 ? COMMENT_TYPE.paymentDate : COMMENT_TYPE.general] as const);

      const results = [];
      for (const run of ["legacy", "bulk-skip", "bulk-all"] as const) {
        contracts = new Map(); costs = new Map(); comments = new Map(); minted = 0;
        if (!isNew) seed(stored);
        for (const [id, type] of commentSeed) comments.set(id, { contract: CONTRACT, type });
        const a = {
          ...args(stored, proposed, { isNew, resetPaidAndPaymentDateComments: reset }),
          ...(isNew ? { line: line([]) } : {}),
        };
        if (run === "legacy") await saveCostLineLegacy(a);
        else await saveCostLineBulk(a, run === "bulk-skip");
        results.push(snapshot());
      }
      expect(results[1], `seed ${s0} (bulk, skip on)`).toEqual(results[0]);
      expect(results[2], `seed ${s0} (bulk, skip off)`).toEqual(results[0]);
    }
  });

  it("UT-CAPEXBULK-010 an UpdateMultiple 501 falls back to per-row PATCHes for that action", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    notImplemented.add("update");
    await saveCostLineBulk(args(stored, months(3, () => 7)), true);
    expect(sent("cost:update:")).toHaveLength(3);
    expect([...costs.values()].every((r) => r.cost === 7)).toBe(true);
  });

  it("UT-CAPEXBULK-011 DIVERGENCE (D56 §4): a month deleted by someone else is refused by bulk, re-created per row", async () => {
    const stored = [cost("c1", 1, 100), cost("c2", 2, 100)];
    seed(stored);
    costs.delete("c2");
    await expect(saveCostLineBulk(args(stored, months(2, () => 9)), true)).rejects.toThrow(/Does Not Exist/);
    expect(costs.has("c2")).toBe(false);

    seed([cost("c1", 1, 100)]);
    await saveCostLineLegacy(args(stored, months(2, () => 9)));
    expect(costs.get("c2")).toMatchObject({ cost: 9 });
  });

  it("UT-CAPEXBULK-012 prints one save line, also on failure", async () => {
    seed([cost("c1", 1, 100)]);
    await saveCostLineBulk(args([cost("c1", 1, 100)], months(1, () => 5)), true);
    expect(summaries()).toHaveLength(1);
    expect(lastSummary()).toMatch(/^CAPEX panel save \(bulk\): [\d,]+ ms, 2 requests; /);

    refuse.add("contract");
    await expect(saveCostLineBulk(args([cost("c1", 1, 100)], months(1, () => 6)), true)).rejects.toThrow();
    expect(summaries()).toHaveLength(2);
    expect(lastSummary()).toMatch(/^CAPEX panel save \(bulk\) FAILED after /);
  });
});

describe("saveCostLineBulk, review follow-ups", () => {
  const relinkStored = () => [cost("c1", 1, 100, true), cost("c2", 2, 100, false)];
  const relinkComments = () => {
    comments.set("k-payment", { contract: CONTRACT, type: COMMENT_TYPE.paymentDate });
  };

  it("UT-CAPEXBULK-013 a relink save whose contract update is refused resets nothing and deletes nothing", async () => {
    const stored = relinkStored();
    seed(stored);
    relinkComments();
    refuse.add("contract");
    await expect(saveCostLineBulk({
      ...args(stored, months(2, () => 150)), resetPaidAndPaymentDateComments: true,
    }, true)).rejects.toThrow(/contract refused/);

    expect(costs.get("c1")).toMatchObject({ cost: 100, paid: true });
    expect(comments.has("k-payment")).toBe(true);
    expect(sent("bulk:")).toEqual([]);
    expect(sent("read:")).toEqual([]);
  });

  it("UT-CAPEXBULK-014 a relink save sends its months and the comment read only after the contract answered", async () => {
    const stored = relinkStored();
    seed(stored);
    relinkComments();
    await saveCostLineBulk({ ...args(stored, months(2, () => 150)), resetPaidAndPaymentDateComments: true }, true);
    const contractEnd = at("end:contract:update");
    expect(at("start:bulk:update:2")).toBeGreaterThan(contractEnd);
    expect(at("start:read:list CAPEX comments")).toBeGreaterThan(contractEnd);
    expect(costs.get("c1")).toMatchObject({ cost: 150, paid: false });
  });

  it("UT-CAPEXBULK-015 DIVERGENCE (D56 §2): a plain edit whose contract update is refused may still write its months", async () => {
    const stored = [cost("c1", 1, 100)];
    seed(stored);
    refuse.add("contract");
    await expect(saveCostLineBulk(args(stored, months(1, () => 150)), true)).rejects.toThrow(/contract refused/);
    expect(costs.get("c1")?.cost).toBe(150);

    // The per-row twin stops before any month.
    seed(stored);
    await expect(saveCostLineLegacy(args(stored, months(1, () => 175)))).rejects.toThrow(/contract refused/);
    expect(costs.get("c1")?.cost).toBe(100);
  });

  it("UT-CAPEXBULK-016 the error waits for every request in flight", async () => {
    const stored = [cost("c1", 1, 100)];
    seed(stored);
    refuse.add("contract");
    let release: () => void = () => undefined;
    bulkHold = new Promise<void>((resolve) => { release = resolve; });
    let settled = false;
    const save = saveCostLineBulk(args(stored, months(1, () => 150)), true).finally(() => { settled = true; });
    save.catch(() => undefined);
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    expect(events).toContain("end:contract:update");
    expect(settled).toBe(false);
    release();
    await expect(save).rejects.toThrow(/contract refused/);
    expect(events).toContain("end:bulk:update:1");
  });

  it("UT-CAPEXBULK-017 a reset flag on a NEW contract resets nothing and reads no comments", async () => {
    await saveCostLineBulk({
      ...args([], months(1, () => 5)), line: line([cost("x", 1, 5, true)]), isNew: true,
      storedPayments: [], resetPaidAndPaymentDateComments: true,
    }, true);
    expect(sent("read:")).toEqual([]);
    expect(sent("bulk:")).toEqual(["start:bulk:create:1"]);
  });

  it("UT-CAPEXBULK-018 a failed comments read fails the save and sends no month delete", async () => {
    const stored = [...relinkStored(), cost("c3", 3, 100)];
    seed(stored);
    refuse.add("read");
    await expect(saveCostLineBulk({
      ...args(stored, months(2, () => 100)), resetPaidAndPaymentDateComments: true,
    }, true)).rejects.toThrow(/comments read failed/);
    expect(sent("delete:")).toEqual([]);
  });

  it("UT-CAPEXBULK-019 a 0 typed on a month the book shows as 0 is written (the stored value may be null)", async () => {
    seed([cost("c1", 1, 0)]);
    (costs.get("c1") as { cost: number | null }).cost = null;
    await saveCostLineBulk(args([cost("c1", 1, 0)], months(1, () => 0)), true);
    expect(costs.get("c1")?.cost).toBe(0);
  });
});

describe("saveCostLineLegacy", () => {
  it("UT-CAPEXBULK-020 stays strictly one request at a time, in the canvas order", async () => {
    const stored = [cost("c1", 1, 100), cost("c2", 2, 100), cost("c3", 3, 100)];
    seed(stored);
    await saveCostLineLegacy(args(stored, months(2, () => 5)));
    const starts = events.filter((e) => e.startsWith("start:")).map((e) => e.slice(6));
    expect(starts).toEqual(["contract:update", "cost:update:c1", "cost:update:c2", "delete:vsb_capexcosts:c3"]);
    // Each request answers before the next is sent.
    for (let i = 0; i < events.length; i += 2) {
      expect(events[i]?.slice(6)).toBe(events[i + 1]?.slice(4));
    }
  });
});

describe("saveCostLine routing", () => {
  it("UT-CAPEXBULK-030 goes through the bulk path by default", async () => {
    seed([cost("c1", 1, 100)]);
    await saveCostLine(args([cost("c1", 1, 100)], months(1, () => 5)));
    expect(sent("bulk:update:")).toHaveLength(1);
  });

  it("UT-CAPEXBULK-031 the DEV override sends it through the per-row path", async () => {
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => (k === LEGACY_SAVE_OVERRIDE_KEY ? "1" : null) });
    seed([cost("c1", 1, 100)]);
    await saveCostLine(args([cost("c1", 1, 100)], months(1, () => 5)));
    expect(sent("bulk:")).toEqual([]);
    expect(sent("cost:update:")).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════ delete ══ */

describe("deleteCostLineBulk", () => {
  const payments = [cost("c1", 1, 1), cost("c2", 2, 1), cost("c3", 3, 1)];

  it("UT-CAPEXBULK-040 comments, then every cost row, then the contract — the per-row order", async () => {
    seed(payments);
    comments.set("k1", { contract: CONTRACT, type: COMMENT_TYPE.general });
    await deleteCostLineBulk(line(payments));

    const lastComment = at("end:delete:comment:k1");
    const costStarts = payments.map((p) => at(`start:delete:vsb_capexcosts:${p.id}`));
    const costEnds = payments.map((p) => at(`end:delete:vsb_capexcosts:${p.id}`));
    expect(Math.min(...costStarts)).toBeGreaterThan(lastComment);
    expect(at("start:delete:vsb_capexprojectcontracts:" + CONTRACT)).toBeGreaterThan(Math.max(...costEnds));
    expect(costs.size).toBe(0);
    expect(contracts.size).toBe(0);
  });

  it("UT-CAPEXBULK-041 the cost deletes run together, not one by one", async () => {
    seed(payments);
    await deleteCostLineBulk(line(payments));
    const secondStart = at("start:delete:vsb_capexcosts:c2");
    expect(secondStart).toBeLessThan(at("end:delete:vsb_capexcosts:c1"));
  });

  it("UT-CAPEXBULK-042 a refused cost delete: every other is attempted, the contract is not", async () => {
    seed(payments);
    refuse.add("delete:c2");
    await expect(deleteCostLineBulk(line(payments))).rejects.toThrow(/1 delete\(s\) on vsb_capexcosts failed/);
    expect(sent("delete:vsb_capexcosts:")).toHaveLength(3);
    expect(sent("delete:vsb_capexprojectcontracts:")).toEqual([]);
    expect(contracts.has(CONTRACT)).toBe(true);
  });

  it("UT-CAPEXBULK-043 the per-row twin deletes the same rows, one at a time", async () => {
    seed(payments);
    await deleteCostLineLegacy(line(payments));
    const starts = events.filter((e) => e.startsWith("start:delete:"));
    expect(starts.map((e) => e.split(":").at(-1))).toEqual(["c1", "c2", "c3", CONTRACT]);
    expect(costs.size).toBe(0);
  });
});

/* ═══════════════════════════════════════ a refused comment delete (CA-18) ══ */

describe("a refused comment delete stops the next phase (CA-18, rule 14)", () => {
  const payments = [cost("c1", 1, 1), cost("c2", 2, 1)];
  const infoLines = () => vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
  const seedComments = () => {
    comments.set("k1", { contract: CONTRACT, type: COMMENT_TYPE.general });
    comments.set("k2", { contract: CONTRACT, type: COMMENT_TYPE.paymentDate });
  };

  it("UT-CMTDEL-001 bulk Delete: every comment is attempted, no cost row or contract is deleted, the step is FAILED", async () => {
    seed(payments);
    seedComments();
    refuse.add("delete:k1");
    await expect(deleteCostLineBulk(line(payments))).rejects.toThrow(/1 delete\(s\) on vsb_capexcommentses failed/);
    expect(sent("delete:comment:")).toHaveLength(2);
    expect(sent("delete:vsb_capexcosts:")).toEqual([]);
    expect(sent("delete:vsb_capexprojectcontracts:")).toEqual([]);
    expect([...comments.keys()]).toEqual(["k1"]);
    expect(costs.size).toBe(2);
    expect(contracts.has(CONTRACT)).toBe(true);
    expect(lastSummary()).toMatch(/^CAPEX panel delete \(bulk\) FAILED after [\d,]+ ms, 3 requests; comments read 1 req [\d,]+ ms; comment deletes FAILED /);
    expect(infoLines()).toEqual(expect.arrayContaining([
      "Steps completed: comments read",
      "Steps failed: comment deletes",
      "Not sent: cost deletes; contract delete",
    ]));
  });

  it("UT-CMTDEL-002 per-row Delete: stops at the refused comment; nothing after it is sent", async () => {
    seed(payments);
    seedComments();
    refuse.add("delete:k1");
    await expect(deleteCostLineLegacy(line(payments))).rejects.toThrow(/delete k1 denied/);
    expect(sent("delete:")).toEqual(["start:delete:comment:k1"]);
    expect(costs.size).toBe(2);
    expect(contracts.has(CONTRACT)).toBe(true);
    expect(lastSummary()).toMatch(/^CAPEX panel delete \(per-row\) FAILED after [\d,]+ ms, 2 requests; .*comment deletes FAILED .*; error: .*delete k1 denied/);
    expect(infoLines()).toContain("Steps failed: comment deletes");
  });

  it("UT-CMTDEL-003 bulk relink Save: a refused payment-date comment delete fails the save and sends no month delete", async () => {
    const stored = [cost("c1", 1, 100, true), cost("c2", 2, 100), cost("c3", 3, 100)];
    seed(stored);
    seedComments();
    refuse.add("delete:k2");
    await expect(saveCostLineBulk({
      ...args(stored, months(2, () => 100)), resetPaidAndPaymentDateComments: true,
    }, true)).rejects.toThrow(/1 delete\(s\) on vsb_capexcommentses failed/);
    expect(sent("delete:comment:")).toEqual(["start:delete:comment:k2"]);
    expect(sent("delete:vsb_capexcosts:")).toEqual([]);
    expect(costs.has("c3")).toBe(true);
    expect(comments.has("k2")).toBe(true);
    expect(infoLines()).toEqual(expect.arrayContaining([
      "Steps failed: payment-date comments",
      "Not sent: cost deletes",
    ]));
  });

  it("UT-CMTDEL-004 per-row relink Save: a refused payment-date comment delete stops before the month writes", async () => {
    const stored = [cost("c1", 1, 100, true), cost("c2", 2, 100), cost("c3", 3, 100)];
    seed(stored);
    seedComments();
    refuse.add("delete:k2");
    await expect(saveCostLineLegacy({
      ...args(stored, months(2, () => 100)), resetPaidAndPaymentDateComments: true,
    })).rejects.toThrow(/delete k2 denied/);
    expect(sent("cost:")).toEqual(["start:cost:update:c1"]); // the paid reset only
    expect(sent("delete:vsb_capexcosts:")).toEqual([]);
    expect(costs.has("c3")).toBe(true);
    expect(infoLines()).toEqual(expect.arrayContaining([
      "Steps failed: payment-date comments",
      "Not sent: costs; cost deletes",
    ]));
  });
});

/* ══════════════════════════════════════════════════════════════ log ══ */

describe("the console lines", () => {
  it("UT-CAPEXBULK-050 the save line", () => {
    expect(panelSaveLogLine({
      what: "CAPEX panel save", path: "bulk", failed: false, ms: 1312.4, requests: 2,
      steps: ["contract update 1 req 1,301 ms", "costs 1 req 1,204 ms (update 1 req bulk [1,204 ms])"],
      gate: "gate peak 2/16, req avg 1,253 ms max 1,301 ms",
    })).toBe("CAPEX panel save (bulk): 1,312 ms, 2 requests; contract update 1 req 1,301 ms; "
      + "costs 1 req 1,204 ms (update 1 req bulk [1,204 ms]); gate peak 2/16, req avg 1,253 ms max 1,301 ms");
    // D58: "1 request" in the singular; the failure line ends with the readable error.
    expect(panelSaveLogLine({
      what: "CAPEX panel delete", path: "per-row", failed: true, ms: 50, requests: 1, steps: [], error: "x refused",
    })).toBe("CAPEX panel delete (per-row) FAILED after 50 ms, 1 request; error: x refused");
  });

  it("UT-CAPEXBULK-051 the busy line", () => {
    expect(panelBusyLogLine(1200, 800.6)).toBe("CAPEX panel save busy: 2,001 ms (writes 1,200 ms, refetch 801 ms)");
  });
});

/* ═════════════════════════════════════════════════ readable log (D58) ══ */

describe("the readable panel log (D58)", () => {
  const groupTitles = () => vi.mocked(console.groupCollapsed).mock.calls.map((c) => String(c[0]));
  const infoLines = () => vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
  const twelve = () => months(12, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));

  it("UT-CAPEXLOG-001 steps are listed in START order, though the months answered before the contract", async () => {
    const stored = twelve();
    seed(stored);
    let release: () => void = () => undefined;
    contractHold = new Promise<void>((resolve) => { release = resolve; });
    const save = saveCostLineBulk(args(stored, months(12, () => 150)), true);
    // `releaseContract` (fired when the bulk request starts) is replaced, so the contract waits.
    releaseContract = () => undefined;
    for (let i = 0; i < 60 && !events.includes("end:bulk:update:12"); i += 1) await Promise.resolve();
    // Let the costs step settle and be recorded before the contract answers.
    await new Promise((r) => setTimeout(r, 0));
    release();
    await save;
    expect(at("end:bulk:update:12")).toBeLessThan(at("end:contract:update"));
    expect(lastSummary()).toMatch(
      /^CAPEX panel save \(bulk\): [\d,]+ ms, 2 requests; contract update 1 req [\d,]+ ms; costs 1 req [\d,]+ ms \(update 1 req bulk \[[\d,]+ ms\]\); cost deletes 0 req [\d,]+ ms; gate peak \d+\/16, /,
    );
  });

  it("UT-CAPEXLOG-002 singular request, thousands separators on every ms", () => {
    expect(panelSaveLogLine({ what: "CAPEX panel save", path: "bulk", failed: false, ms: 12_345.6, requests: 1, steps: [] }))
      .toBe("CAPEX panel save (bulk): 12,346 ms, 1 request");
    expect(panelBusyLogLine(10_000, 2_500)).toBe("CAPEX panel save busy: 12,500 ms (writes 10,000 ms, refetch 2,500 ms)");
  });

  it("UT-CAPEXLOG-003 a failed step's requests are counted: a refused UpdateMultiple is still a request", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    refuse.add("bulk:update");
    await expect(saveCostLineBulk(args(stored, months(3, () => 5)), true)).rejects.toThrow(/update refused/);
    expect(lastSummary()).toMatch(
      /^CAPEX panel save \(bulk\) FAILED after [\d,]+ ms, 2 requests; contract update 1 req [\d,]+ ms; costs FAILED [\d,]+ ms \(update failed bulk \[[\d,]+ ms\]\); gate peak /,
    );
  });

  it("UT-CAPEXLOG-004 the failure line ends with the readable error, GUIDs replaced", async () => {
    const guid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const payments = [cost(guid, 1, 1)];
    seed(payments);
    refuse.add(`delete:${guid}`);
    await expect(deleteCostLineBulk(line(payments))).rejects.toThrow();
    const summary = lastSummary();
    expect(summary).toMatch(/^CAPEX panel delete \(bulk\) FAILED after [\d,]+ ms, 2 requests; .*; error: .*<id>/);
    expect(summary).not.toContain(guid);
    // The raw error is kept, for support, in its own group (D58 decision 3).
    expect(groupTitles()).toEqual(["Failure", "Steps (start order)", "Requests", "Raw error (for support)"]);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(infoLines().filter((l) => !l.startsWith("CAPEX panel ")).join("\n")).not.toContain(guid);
  });

  it("UT-CAPEXLOG-005 the gate tail is this save's own; another writer only raises the shared peak", async () => {
    const { gatedWrite } = await import("./bulkSend");
    const stored = twelve();
    seed(stored);
    let releaseOther: () => void = () => undefined;
    const other = gatedWrite(() => new Promise<void>((resolve) => { releaseOther = resolve; }));
    contractHold = new Promise<void>((resolve) => { releaseContract = resolve; });
    await saveCostLineBulk(args(stored, months(12, () => 150)), true);
    releaseOther();
    await other;
    const summary = lastSummary();
    expect(summary).toMatch(/, 2 requests; /);
    expect(summary).toMatch(/; gate peak 2\/16, req avg [\d,]+ ms max [\d,]+ ms, shared gate peak 3\/16$/);
  });

  it("UT-CAPEXLOG-006 a Delete line counts every request and carries no gate tail", async () => {
    const payments = [cost("c1", 1, 1), cost("c2", 2, 1), cost("c3", 3, 1)];
    seed(payments);
    comments.set("k1", { contract: CONTRACT, type: COMMENT_TYPE.general });
    await deleteCostLineBulk(line(payments));
    const summary = lastSummary();
    expect(summary).toMatch(
      /^CAPEX panel delete \(bulk\): [\d,]+ ms, 6 requests; comments read 1 req [\d,]+ ms; comment deletes 1 req [\d,]+ ms; cost deletes 3 req [\d,]+ ms; contract delete 1 req [\d,]+ ms$/,
    );
    expect(summary).not.toContain("gate peak");
    expect(groupTitles()).toEqual(["Steps (start order)", "Requests"]);
    expect(infoLines()).toContain("Requests sent: 6 (bulk); none pass the shared write gate");
  });

  it("UT-CAPEXLOG-007 the delete busy line", () => {
    expect(panelBusyLogLine(1120, 420, "delete")).toBe("CAPEX panel delete busy: 1,540 ms (deletes 1,120 ms, refetch 420 ms)");
  });

  it("UT-CAPEXLOG-008 the per-row path: its own line, attempts counted, no gate tail", async () => {
    const stored = [cost("c1", 1, 100), cost("c2", 2, 100), cost("c3", 3, 100)];
    seed(stored);
    await saveCostLineLegacy(args(stored, months(2, () => 5)));
    expect(lastSummary()).toMatch(
      /^CAPEX panel save \(per-row\): [\d,]+ ms, 4 requests; contract update 1 req [\d,]+ ms; costs 2 req [\d,]+ ms \(create 0, update 2\); cost deletes 1 req [\d,]+ ms$/,
    );
    refuse.add("cost:c2");
    seed(stored);
    await expect(saveCostLineLegacy(args(stored, months(3, () => 6)))).rejects.toThrow(/cost c2 refused/);
    // contract update + the refused c2 PATCH after c1's: 3 requests; deletes never sent.
    expect(lastSummary()).toMatch(/^CAPEX panel save \(per-row\) FAILED after [\d,]+ ms, 3 requests; .*costs FAILED .*; error: .*cost c2 refused/);
    // The innermost cause is the SDK's plain `{ message, status }` object: read by its message.
    expect(lastSummary()).toMatch(/; error: Dataverse error \(HTTP 400\): cost c2 refused$/);
  });

  it("UT-CAPEXLOG-009 success prints Steps and Requests groups; a failure lists what was not sent", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    await saveCostLineBulk(args(stored, months(2, () => 5)), true);
    expect(groupTitles()).toEqual(["Steps (start order)", "Requests"]);
    expect(infoLines()).toContain("Path: bulk");
    expect(vi.mocked(console.table).mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ Step: "contract update", Requests: 1, Result: "ok" }),
      expect.objectContaining({ Step: "costs", Requests: 1, How: expect.stringMatching(/^update 2 rows: 1 request, bulk \[\d+ ms\]$/), Result: "ok" }),
      expect.objectContaining({ Step: "cost deletes", Requests: 1, How: "1 row, 4 at a time", Result: "ok" }),
    ]);

    vi.mocked(console.groupCollapsed).mockClear();
    vi.mocked(console.info).mockClear();
    seed(stored);
    refuse.add("bulk:update");
    await expect(saveCostLineBulk(args(stored, months(2, () => 6)), true)).rejects.toThrow();
    expect(groupTitles()).toEqual(["Failure", "Steps (start order)", "Requests", "Raw error (for support)"]);
    expect(infoLines()).toEqual(expect.arrayContaining([
      "Steps completed: contract update",
      "Steps failed: costs",
      "Not sent: cost deletes",
      "Requests sent before it stopped: 2",
    ]));
  });

  it("UT-CAPEXLOG-010 the request count per case, as the header prints it", async () => {
    // New contract, 12 months: contract create + 1 CreateMultiple.
    await saveCostLineBulk({
      ...args([], months(12, () => 100)), line: line([], { id: "panel-minted" }), isNew: true, storedPayments: [],
    }, true);
    expect(lastSummary()).toMatch(/, 2 requests; contract create 1 req/);
    // Edit of 12 months: contract update ∥ 1 UpdateMultiple.
    seed(twelve());
    await saveCostLineBulk(args(twelve(), months(12, () => 150)), true);
    expect(lastSummary()).toMatch(/, 2 requests; /);
    // Shrink 12 → 6: + 6 deletes.
    costs = new Map();
    seed(twelve());
    await saveCostLineBulk(args(twelve(), months(6, () => 200)), true);
    expect(lastSummary()).toMatch(/, 8 requests; .*cost deletes 6 req /);
    // Relink reset, 2 paid months, 1 payment-date comment: contract, then months ∥ (1 read + 1 delete).
    costs = new Map();
    const relink = [cost("c1", 1, 100, true), cost("c2", 2, 100, true)];
    seed(relink);
    comments.set("k-payment", { contract: CONTRACT, type: COMMENT_TYPE.paymentDate });
    await saveCostLineBulk({ ...args(relink, months(2, () => 100)), resetPaidAndPaymentDateComments: true }, true);
    expect(lastSummary()).toMatch(/, 4 requests; contract update 1 req [\d,]+ ms; .*payment-date comments 2 req [\d,]+ ms \(1 read, 1 deleted\)/);
    expect(lastSummary()).toMatch(/costs 1 req [\d,]+ ms \(update 1 req bulk \[[\d,]+ ms\], 2 paid reset\)/);
    // Delete with 1 comment and 3 cost rows: 1 read + 1 + 3 + 1 (UT-CAPEXLOG-006).
  });

  it("UT-CAPEXLOG-012 the hook prints the delete busy line only after the awaited refetch", async () => {
    const { useCapexWrites } = await import("@/features/cost/costing/useCostBook");
    const pending: (() => void)[] = [];
    const refetched = () => { for (const r of pending) r(); };
    hookClient.invalidateQueries.mockImplementation(() => new Promise<void>((r) => { pending.push(r); }));
    const { deleteLine } = useCapexWrites() as unknown as {
      deleteLine: {
        onMutate: () => { startedAt: number };
        onSuccess: (d: unknown, l: unknown, c: { startedAt: number }) => Promise<void>;
      };
    };
    const context = deleteLine.onMutate();
    const done = deleteLine.onSuccess(undefined, undefined, context);
    await Promise.resolve();
    expect(infoLines().some((l) => l.startsWith("CAPEX panel delete busy:"))).toBe(false);
    refetched();
    await done;
    expect(infoLines().at(-1)).toMatch(/^CAPEX panel delete busy: [\d,]+ ms \(deletes [\d,]+ ms, refetch [\d,]+ ms\)$/);
  });

  it("UT-CAPEXLOG-011 an UpdateMultiple 501: the refused request and each PATCH are counted", async () => {
    const stored = months(3, () => 100).map((p, i) => ({ ...p, id: `c${i + 1}` }));
    seed(stored);
    notImplemented.add("update");
    await saveCostLineBulk(args(stored, months(3, () => 7)), true);
    expect(lastSummary()).toMatch(/, 5 requests; contract update 1 req [\d,]+ ms; costs 4 req [\d,]+ ms \(update 4 req per-row after 501\); /);
  });
});
