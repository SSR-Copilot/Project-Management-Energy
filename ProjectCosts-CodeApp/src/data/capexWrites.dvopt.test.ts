/**
 * dvopt T-09 part (CA-07) and T-32 part (CA-12) on the CAPEX panel's writes, against a fake Dataverse:
 *
 *  - `PANEL_STABLE_ID`: a NEW contract is created under its client-minted id, and a retry of the same Add keeps the ids of the
 *    contract and of its month rows, finds what the failed attempt landed and does not create it twice;
 *  - `PANEL_CHANGED_CONTRACT_COLUMNS`: an Edit sends the contract columns that changed, never the ones the line cannot vouch for;
 *  - `onWritten` (CA-05): what the bulk save reports to the caller that patches its cached book.
 *
 * The fake is Dataverse where it matters: `CreateMultiple` refuses the WHOLE request when a target id exists (412), `UpdateMultiple`
 * when one does not (404), and a request may be applied on the server yet answer with a failure (an ambiguous failure, CA-02).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcilePayments } from "@/features/cost/capex-costs/rules";
import type { CostLine, Payment } from "@/features/cost/costing/model";

/* ═════════════════════════════════════════════════════════════ the fake ══ */

interface CostRow { contract: string; year: number; month: number; cost: number; paid: boolean }

let contracts = new Map<string, Record<string, unknown>>();
let costs = new Map<string, CostRow>();
/** Requests, in the order sent. */
let events: string[] = [];
/** Failure injection: `"contract"` refuses the contract write; `"create"` / `"update"` the bulk request. */
let refuse = new Set<string>();
/** Failures that are applied on the server and still answer with an error (a lost response). */
let applyThenFail = new Set<string>();
/** The bodies sent to the contract writes, in order. */
let contractBodies: { kind: "create" | "update"; id?: string; body: Record<string, unknown> }[] = [];

const PROJECT = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const ACCOUNT = "11111111-2222-3333-4444-555555555555";
const BU = "b0b0b0b0-0000-4000-8000-000000000001";
const NEW_ID = "0c0c0c0c-0000-4000-8000-000000000001";
const OLD_ID = "0c0c0c0c-0000-4000-8000-0000000000aa";
const CLUSTER = "c1c1c1c1-0000-4000-8000-000000000001";

const fail = (message: string, status = 400) => ({ success: false, error: { message, status } });
const idInBind = (value: unknown) => (typeof value === "string" ? /\(([^)]+)\)/.exec(value)?.[1] ?? null : null);

function applyCost(id: string, fields: Record<string, unknown>): void {
  const row = costs.get(id) ?? { contract: idInBind(fields["vsb_Contract@odata.bind"]) ?? "", year: 0, month: 0, cost: 0, paid: false };
  if ("vsb_cost" in fields) row.cost = fields.vsb_cost as number;
  if ("vsb_year" in fields) row.year = fields.vsb_year as number;
  if ("vsb_month" in fields) row.month = fields.vsb_month as number;
  if ("vsb_costpaid" in fields) row.paid = fields.vsb_costpaid as boolean;
  costs.set(id, row);
}

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options?: { filter?: string }) => {
    events.push(`read:${label}`);
    const ids = [...(options?.filter ?? "").matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map((m) => m[0]);
    if (label === "check existing vsb_capexprojectcontracts") {
      return ids.filter((id) => contracts.has(id)).map((id) => ({ vsb_capexprojectcontractid: id }));
    }
    if (label === "check existing vsb_capexcosts") return ids.filter((id) => costs.has(id)).map((id) => ({ vsb_capexcostid: id }));
    return [];
  },
  deleteRecord: async (_op: string, table: string, id: string) => {
    events.push(`delete:${table}:${id}`);
    (table === "vsb_capexcosts" ? costs : contracts).delete(id);
  },
}));

vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    create: async (fields: Record<string, unknown>) => {
      events.push("contract:create");
      contractBodies.push({ kind: "create", body: { ...fields } });
      if (refuse.has("contract")) return fail("contract refused");
      const id = (fields.vsb_capexprojectcontractid as string | undefined) ?? NEW_ID;
      if (contracts.has(id)) return fail("Cannot insert duplicate key.", 412);
      contracts.set(id, { ...fields });
      return { success: true, data: { vsb_capexprojectcontractid: id } };
    },
    update: async (id: string, fields: Record<string, unknown>) => {
      events.push("contract:update");
      contractBodies.push({ kind: "update", id, body: { ...fields } });
      if (refuse.has("contract")) return fail("contract refused");
      contracts.set(id, { ...contracts.get(id), ...fields });
      return { success: true, data: {} };
    },
  },
}));

vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    create: async () => fail("single create not expected"),
    update: async () => fail("single update not expected"),
  },
}));

const bulk = (action: "create" | "update") => async (_es: string, targets: Record<string, unknown>[]) => {
  events.push(`bulk:${action}:${targets.length}`);
  if (refuse.has(action)) return fail(`${action} refused`);
  const ids = targets.map((t) => String(t.vsb_capexcostid));
  if (action === "update" && ids.some((id) => !costs.has(id))) return fail("Does Not Exist", 404);
  if (action === "create" && ids.some((id) => costs.has(id))) return fail("Cannot insert duplicate key.", 412);
  for (const t of targets) {
    const { vsb_capexcostid: id, "@odata.type": _type, ...fields } = t;
    applyCost(String(id), fields);
  }
  if (applyThenFail.has(action)) return fail("The request timed out after it was applied.", 504);
  return { success: true, data: {} };
};
vi.mock("@/generated/services/CreateMultipleService", () => ({ CreateMultipleService: { CreateMultiple: bulk("create") } }));
vi.mock("@/generated/services/UpdateMultipleService", () => ({ UpdateMultipleService: { UpdateMultiple: bulk("update") } }));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: { delete: async () => undefined },
}));

const { saveCostLineBulk, resetAddLedger, contractUpdateBody } = await import("./capexWrites");
const { resetBulkWriteAvailability } = await import("./bulkSend");
const { setCapexOptFlags, resetCapexOptFlags, CAPEX_OPT_DEFAULTS } = await import("./capexOptFlags");

/* ═══════════════════════════════════════════════════════════ fixtures ══ */

function line(payments: Payment[], over: Partial<CostLine> = {}): CostLine {
  return {
    id: NEW_ID, accountId: ACCOUNT, description: "Grid works", payer: "SPV", costTypePayer: "SPV",
    depreciation: false, vat: true, standard: false, distribution: "individual", equalMode: "cluster",
    distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1, clusters: [],
    payments, comments: [], totalCost: 1_200, ...over,
  };
}
const proposed = (n: number): Payment[] => Array.from({ length: n }, (_, i) => ({ year: 2026, month: i + 1, amount: 100 * (i + 1), paid: false }));
const addArgs = (over: Record<string, unknown> = {}) => ({
  line: line([]), accountId: ACCOUNT, projectId: PROJECT, owningBusinessUnitId: BU, isNew: true,
  payments: reconcilePayments([], proposed(4)), storedPayments: [] as Payment[], ...over,
});
const sentCount = (prefix: string) => events.filter((e) => e.startsWith(prefix)).length;

beforeEach(() => {
  contracts = new Map();
  costs = new Map();
  events = [];
  refuse = new Set();
  applyThenFail = new Set();
  contractBodies = [];
  resetAddLedger();
  resetBulkWriteAvailability();
  resetCapexOptFlags();
  for (const m of ["info", "warn", "groupCollapsed", "groupEnd", "table", "error", "log"] as const) {
    vi.spyOn(console, m).mockImplementation(() => undefined);
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  resetCapexOptFlags();
});

/* ═════════════════════════════════════════════ CA-07: a retry of the same Add ══ */

describe("PANEL_STABLE_ID (CA-07)", () => {
  it("UT-CAPEXSTABLE-001 a new contract is created under its client-minted id", async () => {
    setCapexOptFlags({ PANEL_STABLE_ID: true }); // ships OFF at integration; this test exercises the switch ON (restored in afterEach)
    const id = await saveCostLineBulk(addArgs(), true);
    expect(id).toBe(NEW_ID);
    expect(contractBodies[0]?.body.vsb_capexprojectcontractid).toBe(NEW_ID);
    expect(contracts.has(NEW_ID)).toBe(true);
    expect(costs.size).toBe(4);
  });

  it("UT-CAPEXSTABLE-002 a first attempt sends no existence read (the request set is the one of the old code plus the id)", async () => {
    await saveCostLineBulk(addArgs(), true);
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([]);
    expect(events.filter((e) => e.startsWith("bulk:"))).toEqual(["bulk:create:4"]);
  });

  it("UT-CAPEXSTABLE-003 a line id that is not a GUID leaves the id to the server", async () => {
    await saveCostLineBulk(addArgs({ line: line([], { id: "new-line-1" }) }), true);
    expect(contractBodies[0]?.body).not.toHaveProperty("vsb_capexprojectcontractid");
  });

  it("UT-CAPEXSTABLE-004 months refused after the contract landed: the retry does not create the contract again and sends the same month ids", async () => {
    setCapexOptFlags({ PANEL_STABLE_ID: true }); // ships OFF at integration; this test exercises the switch ON (restored in afterEach)
    refuse.add("create");
    await expect(saveCostLineBulk(addArgs(), true)).rejects.toThrow();
    expect(contracts.size).toBe(1);
    expect(costs.size).toBe(0);
    refuse.clear();
    events = [];
    await saveCostLineBulk(addArgs(), true);
    expect(sentCount("contract:create")).toBe(0);
    expect(contracts.size).toBe(1);
    expect(costs.size).toBe(4);
    // The retry looked for what the failed attempt landed: the contract, and the month ids it was about to create.
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([
      "read:check existing vsb_capexprojectcontracts", "read:check existing vsb_capexcosts",
    ]);
  });

  it("UT-CAPEXSTABLE-005 an AMBIGUOUS failure (months applied, answer lost): the retry updates them, no duplicate rows, same state as a clean save", async () => {
    setCapexOptFlags({ PANEL_STABLE_ID: true }); // ships OFF at integration; this test exercises the switch ON (restored in afterEach)
    applyThenFail.add("create");
    await expect(saveCostLineBulk(addArgs(), true)).rejects.toThrow();
    expect(costs.size).toBe(4);
    const firstIds = [...costs.keys()].sort();
    applyThenFail.clear();
    events = [];
    await saveCostLineBulk(addArgs(), true);
    expect(sentCount("contract:create")).toBe(0);
    expect([...costs.keys()].sort()).toEqual(firstIds);
    // The landed months were sent as an UpdateMultiple, never as a CreateMultiple that the server would refuse (412).
    expect(events.filter((e) => e.startsWith("bulk:"))).toEqual(["bulk:update:4"]);

    // The clean reference run: the same rows (ids differ, the rest is equal).
    const afterRetry = [...costs.values()].map((r) => `${r.year}|${r.month}|${r.cost}`).sort();
    contracts = new Map();
    costs = new Map();
    resetAddLedger();
    await saveCostLineBulk(addArgs(), true);
    expect([...costs.values()].map((r) => `${r.year}|${r.month}|${r.cost}`).sort()).toEqual(afterRetry);
  });

  it("UT-CAPEXSTABLE-006 the contract create itself refused: the retry creates it, once", async () => {
    refuse.add("contract");
    await expect(saveCostLineBulk(addArgs(), true)).rejects.toThrow();
    expect(contracts.size).toBe(0);
    refuse.clear();
    await saveCostLineBulk(addArgs(), true);
    expect(contracts.size).toBe(1);
    expect(costs.size).toBe(4);
    expect(sentCount("contract:create")).toBe(2); // the refused one, then the one that landed
  });

  it("UT-CAPEXSTABLE-007 a save that landed forgets its ids: nothing is read for the next Add", async () => {
    await saveCostLineBulk(addArgs(), true);
    contracts = new Map();
    costs = new Map();
    events = [];
    await saveCostLineBulk(addArgs(), true);
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([]);
  });

  it("UT-CAPEXSTABLE-008 with PANEL_STABLE_ID off the server chooses the id and a retry creates a second contract, as before", async () => {
    setCapexOptFlags({ PANEL_STABLE_ID: false });
    applyThenFail.add("create");
    await saveCostLineBulk(addArgs(), true).catch(() => undefined);
    expect(contractBodies[0]?.body).not.toHaveProperty("vsb_capexprojectcontractid");
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([]);
  });

  it("UT-CAPEXSTABLE-011 the shipped default is OFF: a new contract is created WITHOUT a client-supplied id (the old behaviour runs)", async () => {
    expect(CAPEX_OPT_DEFAULTS.PANEL_STABLE_ID).toBe(false);
    await saveCostLineBulk(addArgs(), true);
    expect(contractBodies[0]?.body).not.toHaveProperty("vsb_capexprojectcontractid");
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([]);
  });

  it("UT-CAPEXSTABLE-009 an Edit (not an Add) is untouched by the ledger", async () => {
    contracts.set(OLD_ID, { vsb_name: "old" });
    const stored: Payment[] = [{ id: "k1", year: 2026, month: 1, amount: 50, paid: false }];
    costs.set("k1", { contract: OLD_ID, year: 2026, month: 1, cost: 50, paid: false });
    await saveCostLineBulk({
      line: line(stored, { id: OLD_ID }), accountId: ACCOUNT, projectId: PROJECT, isNew: false,
      payments: reconcilePayments(stored, [{ year: 2026, month: 1, amount: 60, paid: false }]), storedPayments: stored,
    }, true);
    expect(events.filter((e) => e.startsWith("read:"))).toEqual([]);
    expect(costs.get("k1")?.cost).toBe(60);
  });

  it("UT-CAPEXSTABLE-010 the failure of a save is the same error as before (the message path is unchanged)", async () => {
    refuse.add("create");
    await expect(saveCostLineBulk(addArgs(), true)).rejects.toThrow("create refused");
  });
});

/* ═══════════════════════════════════════════════ CA-05: what a save reports ══ */

describe("onWritten (CA-05)", () => {
  it("UT-CAPEXWRITTEN-001 an Add reports the contract and the months it created, with their real ids", async () => {
    const onWritten = vi.fn();
    await saveCostLineBulk(addArgs({ onWritten }), true);
    expect(onWritten).toHaveBeenCalledTimes(1);
    const w = onWritten.mock.calls[0]?.[0];
    expect(w.contractId).toBe(NEW_ID);
    expect(w.contractCreated).toBe(true);
    expect(w.created.map((c: { id: string }) => c.id).sort()).toEqual([...costs.keys()].sort());
    expect(w.updated).toEqual([]);
    expect(w.deletedIds).toEqual([]);
  });

  it("UT-CAPEXWRITTEN-002 an Edit reports its updates and deletes; unchanged months are not in it", async () => {
    contracts.set(OLD_ID, { vsb_name: "old" });
    const stored: Payment[] = [1, 2, 3].map((m) => ({ id: `k${m}`, year: 2026, month: m, amount: 10 * m, paid: false }));
    for (const p of stored) costs.set(p.id as string, { contract: OLD_ID, year: 2026, month: p.month, cost: p.amount, paid: false });
    const onWritten = vi.fn();
    await saveCostLineBulk({
      line: line(stored, { id: OLD_ID }), accountId: ACCOUNT, projectId: PROJECT, isNew: false, onWritten,
      payments: reconcilePayments(stored, [{ year: 2026, month: 1, amount: 10, paid: false }, { year: 2026, month: 2, amount: 99, paid: false }]),
      storedPayments: stored,
    }, true);
    const w = onWritten.mock.calls[0]?.[0];
    expect(w.contractCreated).toBe(false);
    expect(w.updated).toEqual([{ id: "k2", cost: 99, resetPaid: false }]);
    expect(w.deletedIds).toEqual(["k3"]);
    expect(w.created).toEqual([]);
  });

  it("UT-CAPEXWRITTEN-003 a failed save reports nothing", async () => {
    const onWritten = vi.fn();
    refuse.add("create");
    await saveCostLineBulk(addArgs({ onWritten }), true).catch(() => undefined);
    expect(onWritten).not.toHaveBeenCalled();
  });

  it("UT-CAPEXWRITTEN-004 a throwing callback never fails a save that landed", async () => {
    await expect(saveCostLineBulk(addArgs({ onWritten: () => { throw new Error("patch broke"); } }), true)).resolves.toBe(NEW_ID);
    expect(costs.size).toBe(4);
  });
});

/* ═════════════════════════════════════════════ CA-12: changed columns only ══ */

const stored = (over: Partial<CostLine> = {}): CostLine => line([], {
  id: OLD_ID, payer: "DevCo", costTypePayer: "DevCo", distribution: "equal", equalMode: "cluster", clusters: [1, 2],
  frequency: 3, totalCost: 900, linkedClusterId: CLUSTER, linkedClusterName: "Cluster 2", linkedClusterOrder: 2, ...over,
});
const editArgs = (edited: CostLine, before: CostLine | undefined = stored()) => ({
  line: edited, accountId: ACCOUNT, projectId: PROJECT, isNew: false,
  payments: [] as { id?: string; year: number; month: number; amount: number | null }[],
  storedPayments: [] as Payment[], ...(before ? { storedLine: before } : {}),
});

describe("PANEL_CHANGED_CONTRACT_COLUMNS (CA-12)", () => {
  it("UT-CAPEXCOLS-001 a description-only edit leaves out every unchanged omittable column and the unchanged Linked Cluster bind", () => {
    const body = contractUpdateBody(editArgs(stored({ description: "Renamed" })));
    expect(Object.keys(body).sort()).toEqual(["vsb_byclusterjson", "vsb_bystartenddatejson", "vsb_description", "vsb_name"]);
    expect(body.vsb_name).toBe("Renamed");
    expect(body.vsb_description).toBe("Renamed");
  });

  it("UT-CAPEXCOLS-002 a changed column is sent: VAT, total, frequency and the link", () => {
    const body = contractUpdateBody(editArgs(stored({
      vat: false, totalCost: 1_000, frequency: 6, linkedClusterId: "c2", linkedClusterName: "Cluster 3", linkedClusterOrder: 3,
    })));
    expect(body.vsb_applyvat).toBe(false);
    expect(body.vsb_totalcost).toBe(1_000);
    expect(body.vsb_distributionfrequency).toBe(6);
    expect(body["vsb_LinkedCluster@odata.bind"]).toContain("vsb_projectstates(c2)");
    expect(body).not.toHaveProperty("vsb_depreciation");
    expect(body).not.toHaveProperty("vsb_isstandardcontract");
  });

  it("UT-CAPEXCOLS-003 an UNLINKED contract still sends the null bind (it also clears a stale link to a deactivated state)", () => {
    const body = contractUpdateBody(editArgs(stored({ linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined }),
      stored({ linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined })));
    expect(body["vsb_LinkedCluster@odata.bind"]).toBeNull();
  });

  it("UT-CAPEXCOLS-004 clearing a link sends the null; a Cost Type that was blank is filled in; name, description, JSON and average are always sent", () => {
    const cleared = contractUpdateBody(editArgs(stored({ linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined })));
    expect(cleared["vsb_LinkedCluster@odata.bind"]).toBeNull();
    const blankType = contractUpdateBody(editArgs(stored(), stored({ costTypePayer: null })));
    expect(blankType.vsb_costtype).toBe(952850001);
    const same = contractUpdateBody(editArgs(stored()));
    expect(same).toHaveProperty("vsb_name");
    expect(same).toHaveProperty("vsb_description");
    expect(same).toHaveProperty("vsb_byclusterjson");
    expect(same).toHaveProperty("vsb_bystartenddatejson");
    expect(same).not.toHaveProperty("vsb_costtype");
  });

  it("UT-CAPEXCOLS-005 without the stored line, with another line's, or with the switch off, the whole bag is sent as before", () => {
    const edited = stored({ description: "Renamed" });
    const whole = contractUpdateBody({ ...editArgs(edited), storedLine: undefined });
    expect(whole).toHaveProperty("vsb_applyvat");
    expect(whole).toHaveProperty("vsb_costtype");
    expect(whole).toHaveProperty("vsb_LinkedCluster@odata.bind");
    expect(contractUpdateBody(editArgs(edited, stored({ id: NEW_ID })))).toEqual(whole);
    setCapexOptFlags({ PANEL_CHANGED_CONTRACT_COLUMNS: false });
    expect(contractUpdateBody(editArgs(edited))).toEqual(whole);
  });

  it("UT-CAPEXCOLS-006 differential: for 300 seeded edits the stored row ends up the same as after the whole bag", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed % n; };
    const pick = <T,>(xs: T[]) => xs[rnd(xs.length)] as T;
    const linkFor = (on: boolean) => on
      ? { linkedClusterId: CLUSTER, linkedClusterName: "Cluster 2", linkedClusterOrder: 2 }
      : { linkedClusterId: undefined, linkedClusterName: undefined, linkedClusterOrder: undefined };
    // A line read from Dataverse with an explicit Cost Type has `costTypePayer === payer` (`loadCostLines`); a blank one has null.
    const make = (): CostLine => { const payer = pick(["SPV", "DevCo"] as const); return stored({
      description: pick(["A", "B", "C"]), payer, costTypePayer: payer, vat: rnd(2) === 0, depreciation: rnd(2) === 0,
      standard: rnd(2) === 0, distribution: pick(["equal", "individual"] as const), distributionScheme: pick(["percent", "absolute"] as const),
      frequency: pick([1, 3, 6, 12]), totalCost: pick([undefined, 100, 900]), clusters: pick([[1], [1, 2], [3]]),
      equalMode: "cluster", ...linkFor(rnd(2) === 0),
    }); };
    for (let i = 0; i < 300; i += 1) {
      const before = make();
      const after = make();
      // The stored row is what a save of `before` leaves (the app's own canonical form).
      const row: Record<string, unknown> = {};
      setCapexOptFlags({ PANEL_CHANGED_CONTRACT_COLUMNS: false });
      Object.assign(row, contractUpdateBody({ ...editArgs(before, before), line: before }));
      const whole = { ...row };
      Object.assign(whole, contractUpdateBody({ ...editArgs(after, before), line: after }));
      setCapexOptFlags({ PANEL_CHANGED_CONTRACT_COLUMNS: true });
      const changed = { ...row };
      Object.assign(changed, contractUpdateBody({ ...editArgs(after, before), line: after }));
      expect(changed).toEqual(whole);
    }
  });
});
