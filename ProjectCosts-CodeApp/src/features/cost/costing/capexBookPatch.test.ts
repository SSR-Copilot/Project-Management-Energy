/**
 * CA-05 (dvopt T-20, `CAPEX_PATCH_BOOK`): the cached category book patched from a panel write must EQUAL the book a reload would
 * return for the same server rows. The oracle is the real loader (`loadCostLines`) over a fake Dataverse that applies the real
 * writes' payloads (`setCostPaid`, `clearLinkedCluster`, `saveCostLineBulk`, `deleteCostLineBulk`) to loader-shaped rows.
 *
 * Seeded scenarios mix rows this app wrote and rows the canvas left (blank Cost Type, empty description, null columns). A case
 * `patchBook*` declines (returns `null`: the caller reloads) is allowed only for the documented reasons, and is counted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcilePayments } from "@/features/cost/capex-costs/rules";
import type { CostBook, CostLine, Payment } from "./model";
import type { PanelSaveWritten } from "@/data/capexWrites";

/* ═════════════════════════════════════════════════════════════ the fake ══ */

type Row = Record<string, unknown>;
let contracts = new Map<string, Row>();
let costs = new Map<string, Row>();

const PROJECT = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const ACCOUNT = "11111111-2222-3333-4444-555555555555";
const OTHER_ACCOUNT = "11111111-2222-3333-4444-555555555556";
const BU = "b0b0b0b0-0000-4000-8000-000000000001";
const STATES = [
  { id: "c1c1c1c1-0000-4000-8000-000000000001", name: "Cluster 1", order: 1 },
  { id: "c1c1c1c1-0000-4000-8000-000000000002", name: "Cluster 2", order: 2 },
  { id: "c1c1c1c1-0000-4000-8000-000000000003", name: "Cluster 3", order: 3 },
];
const ASSUMPTION = "a5a5a5a5-0000-4000-8000-000000000001";

const fail = (message: string, status = 400) => ({ success: false, error: { message, status } });
const idInBind = (value: unknown) => (typeof value === "string" ? /\(([^)]+)\)/.exec(value)?.[1] ?? null : null);

let serverIds = 0;

function applyContract(row: Row, fields: Row): void {
  for (const [key, value] of Object.entries(fields)) {
    if (key === "vsb_LinkedCluster@odata.bind") row._vsb_linkedcluster_value = idInBind(value);
    else if (key === "vsb_Account@odata.bind") row._vsb_account_value = idInBind(value);
    else if (key === "vsb_CapexStandardAssumptionContract@odata.bind") row._vsb_capexstandardassumptioncontract_value = idInBind(value);
    else if (key.includes("@odata.bind")) continue;
    else row[key] = value;
  }
}
function applyCost(id: string, fields: Row): void {
  const row = costs.get(id) ?? { vsb_capexcostid: id, vsb_cost: null, vsb_costpaid: false };
  if ("vsb_Contract@odata.bind" in fields) row._vsb_contract_value = idInBind(fields["vsb_Contract@odata.bind"]);
  for (const k of ["vsb_cost", "vsb_year", "vsb_month", "vsb_costpaid"]) if (k in fields) row[k] = fields[k];
  costs.set(id, row);
}

vi.mock("@/data/client", () => ({
  fetchAll: async (label: string, _page: unknown, options?: { filter?: string }) => {
    if (label === "list CAPEX project contracts") return [...contracts.values()];
    if (label === "list CAPEX costs for the cost book") {
      const ids = new Set([...(options?.filter ?? "").matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map((m) => m[0]));
      return [...costs.values()].filter((r) => ids.has(r._vsb_contract_value as string));
    }
    return [];
  },
  deleteRecord: async (_op: string, table: string, id: string) => { (table === "vsb_capexcosts" ? costs : contracts).delete(id); },
}));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    create: async (fields: Row) => {
      // The server issues the key when the POST names none (`PANEL_STABLE_ID` is off by default since the dvopt integration);
      // the fixture used to assume the client-minted id was always sent and stored the row under `undefined`.
      const id = (fields.vsb_capexprojectcontractid as string | undefined) ?? `5e5e5e5e-0000-4000-8000-${String(++serverIds).padStart(12, "0")}`;
      const row: Row = { vsb_capexprojectcontractid: id, vsb_iseditedfrompcf: false };
      applyContract(row, fields);
      contracts.set(id, row);
      return { success: true, data: { vsb_capexprojectcontractid: id } };
    },
    update: async (id: string, fields: Row) => {
      const row = contracts.get(id);
      if (!row) return fail("missing", 404);
      applyContract(row, fields);
      return { success: true, data: {} };
    },
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    create: async () => fail("single create not expected"),
    update: async (id: string, fields: Row) => { applyCost(id, fields); return { success: true, data: {} }; },
  },
}));
const bulk = (action: "create" | "update") => async (_es: string, targets: Row[]) => {
  for (const t of targets) {
    const { vsb_capexcostid: id, "@odata.type": _type, ...fields } = t;
    if (action === "update" && !costs.has(String(id))) return fail("Does Not Exist", 404);
    applyCost(String(id), fields);
  }
  return { success: true, data: {} };
};
vi.mock("@/generated/services/CreateMultipleService", () => ({ CreateMultipleService: { CreateMultiple: bulk("create") } }));
vi.mock("@/generated/services/UpdateMultipleService", () => ({ UpdateMultipleService: { UpdateMultiple: bulk("update") } }));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({ Vsb_capexcommentsesService: { delete: async () => undefined } }));

const { loadCostLines } = await import("@/data/costBook");
const { saveCostLineBulk, deleteCostLineBulk, setCostPaid, clearLinkedCluster } = await import("@/data/capexWrites");
const { resetBulkWriteAvailability } = await import("@/data/bulkSend");
const { resetAddLedger } = await import("@/data/capexWrites");
const { patchBookDeleted, patchBookPaid, patchBookSaved } = await import("./capexBookPatch");

/* ═══════════════════════════════════════════════════════════ scenarios ══ */

let seed = 1;
const rnd = (n: number) => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return Math.floor(seed / 7) % n; };
const pick = <T,>(xs: readonly T[]): T => xs[rnd(xs.length)] as T;
let counter = 0;
const guid = (prefix: string) => `${prefix}000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

const reload = async (): Promise<CostLine[]> => loadCostLines(PROJECT, [ACCOUNT, OTHER_ACCOUNT], new Map(), async () => STATES);
const bookOf = (lines: CostLine[]): CostBook => ({
  accounts: [{ id: ACCOUNT, number: "1", name: "Sub", parentId: "P", category: 0 }, { id: OTHER_ACCOUNT, number: "2", name: "Other", parentId: "P", category: 1 }],
  lines, periods: [], extraGroups: { om: [], land: [], other: [] },
});

function seedServer(): void {
  contracts = new Map();
  costs = new Map();
  const n = 1 + rnd(3);
  for (let i = 0; i < n; i += 1) {
    const id = guid("c0");
    const canvasLeft = rnd(2) === 0;
    contracts.set(id, {
      vsb_capexprojectcontractid: id, _vsb_account_value: ACCOUNT, vsb_name: `Seed ${i}`,
      ...(canvasLeft ? {} : { vsb_description: `Seed ${i}` }),
      ...(canvasLeft && rnd(2) === 0 ? {} : { vsb_costtype: pick([952850001, 952850002]) }),
      vsb_totalcost: pick([null, 500, 1_200]),
      vsb_depreciation: rnd(2) === 0, vsb_applyvat: rnd(2) === 0, vsb_isstandardcontract: false,
      vsb_distribution: pick([null, 952850000, 952850001]), vsb_distributionscheme: pick([null, 952850000, 952850001]),
      vsb_distributionfrequency: pick([null, 1, 3]),
      vsb_byclusterjson: pick([null, '[{"Cluster1":true,"Cluster2":false,"Cluster3":false,"Cluster4":false,"Cluster5":false}]']),
      vsb_bystartenddatejson: pick([null, '[{"EndDate":"06/2027","StartDate":"01/2026"}]']),
      _vsb_linkedcluster_value: pick([null, STATES[1]?.id ?? null]),
      _vsb_capexstandardassumptioncontract_value: null, vsb_iseditedfrompcf: rnd(3) === 0, vsb_initialcontractsource: pick([null, 952850000]),
    });
    const months = rnd(6);
    for (let m = 1; m <= months; m += 1) {
      const cid = guid("e0");
      costs.set(cid, { vsb_capexcostid: cid, _vsb_contract_value: id, vsb_year: 2026, vsb_month: m, vsb_cost: pick([null, 100, 250]), vsb_costpaid: rnd(3) === 0 });
    }
  }
}

function proposedMonths(): Payment[] {
  const out: Payment[] = [];
  for (let m = 1; m <= 12; m += 1) if (rnd(3) !== 0) out.push({ year: 2026, month: m, amount: pick([0, 10, 125, 1_000]), paid: false });
  return out;
}

function editedLine(prev: CostLine, isNew: boolean): CostLine {
  const linkTo = pick([undefined, STATES[0], STATES[1], STATES[2]]);
  const equal = pick(["equal", "individual"] as const);
  return {
    ...prev,
    description: `Edited ${++counter}`, payer: pick(["SPV", "DevCo"] as const), vat: rnd(2) === 0, depreciation: rnd(2) === 0,
    standard: isNew ? false : prev.standard, distribution: equal, distributionScheme: pick(["percent", "absolute"] as const),
    equalMode: pick(["cluster", "dates"] as const), clusters: pick([[], [1], [2, 3]]),
    startDate: "2026-03-01", endDate: "2027-05-01", frequency: pick([1, 3, 6]), totalCost: pick([undefined, 0, 900, 12_000]),
    linkedClusterId: linkTo?.id, linkedClusterName: linkTo?.name, linkedClusterOrder: linkTo?.order,
    ...(isNew ? { standardAssumptionId: pick([undefined, ASSUMPTION]) } : {}),
  };
}

let declined = 0;

beforeEach(() => {
  counter = 0;
  resetBulkWriteAvailability();
  resetAddLedger();
  for (const m of ["info", "warn", "groupCollapsed", "groupEnd", "table", "error", "log"] as const) {
    vi.spyOn(console, m).mockImplementation(() => undefined);
  }
});
afterEach(() => { vi.restoreAllMocks(); });

describe("patch equals reload (CA-05)", () => {
  it("UT-CAPEXPATCH-001 a paid toggle, with and without clearing the Linked Cluster: 300 seeded cases", async () => {
    seed = 11;
    for (let i = 0; i < 300; i += 1) {
      seedServer();
      const before = await reload();
      const withPayments = before.filter((l) => l.payments.length > 0);
      if (withPayments.length === 0) continue;
      const line = pick(withPayments);
      const payment = pick(line.payments);
      const paid = !payment.paid;
      const clear = rnd(2) === 0 && line.linkedClusterId !== undefined;
      if (clear) await clearLinkedCluster(line.id);
      await setCostPaid(payment.id as string, paid);
      const patched = patchBookPaid(bookOf(before), { lineId: line.id, costId: payment.id as string, paid, clearLinkedCluster: clear });
      expect(patched).not.toBeNull();
      expect((patched as CostBook).lines).toEqual(await reload());
    }
  });

  it("UT-CAPEXPATCH-002 a panel Edit: 400 seeded cases (payer, flags, distribution, link, months, relink reset)", async () => {
    seed = 23;
    let compared = 0;
    for (let i = 0; i < 400; i += 1) {
      seedServer();
      const before = await reload();
      const stored = pick(before);
      const edited = editedLine(stored, false);
      const reset = rnd(4) === 0 && stored.payments.some((p) => p.paid);
      let written: PanelSaveWritten | undefined;
      const payments = reconcilePayments(stored.payments, edited.distribution === "individual" ? proposedMonths() : proposedMonths());
      const line = { ...edited, totalCost: edited.totalCost };
      await saveCostLineBulk({
        line, accountId: ACCOUNT, projectId: PROJECT, owningBusinessUnitId: BU, isNew: false, payments,
        storedPayments: stored.payments, storedLine: stored, resetPaidAndPaymentDateComments: reset,
        onWritten: (w) => { written = w; },
      }, true);
      const patched = patchBookSaved(bookOf(before), { line: { ...line, payments: stored.payments }, accountId: ACCOUNT, isNew: false, written: written as PanelSaveWritten }, 0);
      if (!patched) { declined += 1; continue; }
      compared += 1;
      expect(patched.lines).toEqual(await reload());
    }
    expect(compared).toBeGreaterThan(300);
  });

  it("UT-CAPEXPATCH-003 a panel Add: 300 seeded cases (new line appended; a tying description is declined, the rest equal a reload)", async () => {
    seed = 37;
    let compared = 0;
    for (let i = 0; i < 300; i += 1) {
      seedServer();
      const before = await reload();
      const fresh: CostLine = {
        id: guid("d0"), accountId: ACCOUNT, description: "", payer: "SPV", depreciation: false, vat: false, standard: false,
        distribution: "equal", equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1,
        clusters: [], payments: [], comments: [],
      };
      const line = editedLine(fresh, true);
      let written: PanelSaveWritten | undefined;
      await saveCostLineBulk({
        line, accountId: ACCOUNT, projectId: PROJECT, owningBusinessUnitId: BU, isNew: true,
        payments: reconcilePayments([], proposedMonths()), storedPayments: [], onWritten: (w) => { written = w; },
      }, true);
      const patched = patchBookSaved(bookOf(before), { line, accountId: ACCOUNT, isNew: true, written: written as PanelSaveWritten }, 0);
      if (!patched) { declined += 1; continue; }
      compared += 1;
      expect(patched.lines).toEqual(await reload());
    }
    expect(compared).toBeGreaterThan(250);
  });

  it("UT-CAPEXPATCH-004 a panel Delete: 100 seeded cases", async () => {
    seed = 41;
    for (let i = 0; i < 100; i += 1) {
      seedServer();
      const before = await reload();
      const line = pick(before);
      await deleteCostLineBulk(line);
      const patched = patchBookDeleted(bookOf(before), line.id);
      expect((patched as CostBook).lines).toEqual(await reload());
    }
  });
});

describe("what the patch declines (the caller then reloads)", () => {
  const line = (over: Partial<CostLine> = {}): CostLine => ({
    id: "c-1", accountId: ACCOUNT, description: "Grid", payer: "SPV", depreciation: false, vat: false, standard: false,
    distribution: "individual", equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1,
    clusters: [], payments: [{ id: "k-1", year: 2026, month: 1, amount: 10, paid: false }], comments: [], totalCost: 100, ...over,
  });
  const written = (over: Partial<PanelSaveWritten> = {}): PanelSaveWritten => ({
    contractId: "c-1", contractCreated: false, created: [], updated: [], deletedIds: [], ...over,
  });

  it("UT-CAPEXPATCH-005 a line, or a payment, the cached book does not hold", () => {
    const book = bookOf([line()]);
    expect(patchBookPaid(book, { lineId: "nope", costId: "k-1", paid: true })).toBeNull();
    expect(patchBookPaid(book, { lineId: "c-1", costId: "nope", paid: true })).toBeNull();
    expect(patchBookDeleted(book, "nope")).toBeNull();
    expect(patchBookSaved(book, { line: line(), accountId: ACCOUNT, isNew: false, written: written({ contractId: "nope" }) }, 0)).toBeNull();
    expect(patchBookSaved(book, { line: line(), accountId: ACCOUNT, isNew: false, written: written({ updated: [{ id: "unknown", cost: 5, resetPaid: false }] }) }, 0)).toBeNull();
  });

  it("UT-CAPEXPATCH-006 a fractional amount or total (the stored column may round it)", () => {
    const book = bookOf([line()]);
    expect(patchBookSaved(book, { line: line({ totalCost: 10.5 }), accountId: ACCOUNT, isNew: false, written: written() }, 0)).toBeNull();
    expect(patchBookSaved(book, { line: line(), accountId: ACCOUNT, isNew: false, written: written({ updated: [{ id: "k-1", cost: 1.25, resetPaid: false }] }) }, 0)).toBeNull();
    expect(patchBookSaved(book, { line: line(), accountId: ACCOUNT, isNew: false, written: written({ updated: [{ id: "k-1", cost: 12, resetPaid: false }] }) }, 0)).not.toBeNull();
  });

  it("UT-CAPEXPATCH-007 a new line whose description ties with a line of its sub-account, one outside the category, or an Add of a known id", () => {
    const book = bookOf([line()]);
    const fresh = line({ id: "c-2", description: "Grid" });
    const add = { line: fresh, accountId: ACCOUNT, isNew: true, written: written({ contractId: "c-2", contractCreated: true }) };
    expect(patchBookSaved(book, add, 0)).toBeNull();
    expect(patchBookSaved(book, { ...add, line: line({ id: "c-2", description: "Other" }) }, 0)?.lines).toHaveLength(2);
    expect(patchBookSaved(book, { ...add, line: line({ id: "c-2", description: "Other" }) }, 1)).toBeNull();
    expect(patchBookSaved(book, { ...add, line: line({ id: "c-1", description: "Other" }), written: written({ contractCreated: true }) }, 0)).toBeNull();
  });

  it("UT-CAPEXPATCH-008 a linked cluster whose name or order the line does not carry", () => {
    const book = bookOf([line()]);
    expect(patchBookSaved(book, { line: line({ linkedClusterId: "s1" }), accountId: ACCOUNT, isNew: false, written: written() }, 0)).toBeNull();
  });
});

describe("the patch leaves what it does not touch alone", () => {
  it("UT-CAPEXPATCH-009 other lines keep their identity; an unchanged paid flag returns the book itself", () => {
    const a: CostLine = {
      id: "c-1", accountId: ACCOUNT, description: "A", payer: "SPV", depreciation: false, vat: false, standard: false, distribution: "individual",
      equalMode: "cluster", distributionScheme: "absolute", startDate: "", endDate: "", frequency: 1, clusters: [],
      payments: [{ id: "k-1", year: 2026, month: 1, amount: 10, paid: true }], comments: [],
    };
    const b = { ...a, id: "c-2", description: "B", payments: [] };
    const book = bookOf([a, b]);
    expect(patchBookPaid(book, { lineId: "c-1", costId: "k-1", paid: true })).toBe(book);
    const next = patchBookPaid(book, { lineId: "c-1", costId: "k-1", paid: false }) as CostBook;
    expect(next.lines[1]).toBe(b);
    expect(next.lines[0]?.payments[0]?.paid).toBe(false);
    expect(book.lines[0]?.payments[0]?.paid).toBe(true); // the cached book is not mutated
  });

  it("UT-CAPEXPATCH-010 the declined cases of the seeded runs stay a small minority", () => {
    expect(declined).toBeLessThan(120);
  });
});
