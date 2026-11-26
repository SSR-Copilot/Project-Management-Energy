/**
 * OPT-10 (optimization programme, B3) — the Land Lease write executor: characterised FIRST, then the tiered executor proved
 * against the legacy one.
 *
 * `applyLeaseWrites` ran every write of a plan one after another. A Period-1 edit rewrites every allocated generator row (canvas
 * parity "Patch re-writes"), so 40 WTGs cost about 44 sequential requests. The legacy loop is kept as `applyLeaseWritesSequentially`
 * (the oracle, and what `LEASE_WRITE_PARALLEL = false` runs); the app's `applyLeaseWrites` now runs the writes in tiers.
 *
 * `UT-LLWRITE-###` is this file's own series.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
interface Ev {
  kind: "start" | "end";
  /** Position in the global event log, so "A ended before B started" is a plain comparison. */
  n: number;
  op: "create" | "update" | "delete";
  table: string;
  id: string | undefined;
  payload: Row | undefined;
}

const fake = vi.hoisted(() => {
  const state = {
    events: [] as Ev[],
    n: 0,
    inFlight: 0,
    peak: 0,
    /** Manual mode: every request waits here until the driver releases the wave. */
    manual: false,
    held: [] as (() => void)[],
    /** Otherwise a request resolves after this many microtask ticks (seeded, so completion order is shuffled). */
    ticks: (): number => 0,
    /** A request answers `{ success: false }` (or throws, for a delete) when this says so. */
    fails: (_table: string, _op: string, _id: string | undefined, _payload: Row | undefined): boolean => false,
    created: 0,
    /** The HTTP status a refused request carries (dvopt policy tests); undefined = none, as before. */
    failStatus: undefined as number | undefined,
  };
  const DELETE_TABLE: Record<string, string> = {
    vsb_landleaseprojectcosts: "cost", vsb_landleaseperiods: "period", vsb_landleaseallocationwtgs: "alloc",
  };
  async function request(
    op: Ev["op"], table: string, id: string | undefined, payload: Row | undefined,
  ): Promise<void> {
    state.events.push({ kind: "start", n: state.n++, op, table, id, payload });
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    if (state.manual) await new Promise<void>((resolve) => state.held.push(resolve));
    else for (let i = state.ticks(); i > 0; i -= 1) await Promise.resolve();
    state.inFlight -= 1;
    state.events.push({ kind: "end", n: state.n++, op, table, id, payload });
  }
  const service = (table: string, idColumn: string) => ({
    getAll: async () => ({ success: true, data: [] }),
    create: async (payload: Row) => {
      await request("create", table, undefined, payload);
      if (state.fails(table, "create", undefined, payload)) {
        return { success: false, error: Object.assign(new Error(`${table} create refused ${String(payload["tag"] ?? "")}`), { status: state.failStatus }) };
      }
      state.created += 1;
      return { success: true, data: { [idColumn]: `new-${String(payload["tag"] ?? state.created)}` } };
    },
    update: async (id: string, payload: Row) => {
      await request("update", table, id, payload);
      if (state.fails(table, "update", id, payload)) {
        return { success: false, error: Object.assign(new Error(`${table} update refused ${id}`), { status: state.failStatus }) };
      }
      return { success: true, data: {} };
    },
    delete: async () => ({ success: true, data: {} }),
  });
  return { state, service, request, DELETE_TABLE };
});

vi.mock("./client", () => ({
  fetchAll: async () => [],
  deleteRecord: async (operation: string, entitySet: string, id: string) => {
    const table = fake.DELETE_TABLE[entitySet] ?? entitySet;
    await fake.request("delete", table, id, undefined);
    if (fake.state.fails(table, "delete", id, undefined)) throw Object.assign(new Error(`${operation} failed: refused ${id}`), { status: fake.state.failStatus });
  },
  // dvopt CB-03: the app's deletes go through `deleteIfExists`; with no 404 in this double it is `deleteRecord`.
  deleteIfExists: async (operation: string, entitySet: string, id: string) => {
    const table = fake.DELETE_TABLE[entitySet] ?? entitySet;
    await fake.request("delete", table, id, undefined);
    if (fake.state.fails(table, "delete", id, undefined)) throw Object.assign(new Error(`${operation} failed: refused ${id}`), { status: fake.state.failStatus });
  },
}));
// dvopt CB-01 / CB-14: this file is the OPT-10 differential (tiered vs sequential). The guard is a no-op here and the header create keeps
// the server-issued id (the stable client id is random, so the two runs would differ); both are tested in landLease.dvopt.test.ts.
vi.mock("./costUpdateGuard", () => ({ assertRowsExist: async () => undefined, rowExists: async () => false }));
// dvopt batch 2: the OPT-10 pins below are the D160 tiers, so `LEASE_TIER_WIDER` is off here (CB-07 has its own describe at the end, which turns
// it on), and `COST_WRITES_POLICY` is off (a refused write must fail at once, not wait for a retry; the policy has its own tests).
const widerFlag = vi.hoisted(() => ({ wider: false }));
const policyFlag = vi.hoisted(() => ({ on: false }));
vi.mock("./leaseOpexFlags", () => ({
  GONE_AS_DONE_LEASE_OPEX: true, LEASE_GUARD: true, OPEX_GUARD: true, COST_REFRESH_ON_FAILURE: true, STABLE_CREATE_IDS: false,
  get LEASE_TIER_WIDER() { return widerFlag.wider; },
  LEASE_LEAN_RELOAD: true,
  get COST_WRITES_POLICY() { return policyFlag.on; },
}));
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({
  Vsb_landleaseprojectcostsService: fake.service("cost", "vsb_landleaseprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({
  Vsb_landleaseperiodsService: fake.service("period", "vsb_landleaseperiodid"),
}));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({
  Vsb_landleaseallocationwtgsService: fake.service("alloc", "vsb_landleaseallocationwtgid"),
}));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({
  Vsb_landleasesubaccountsService: fake.service("sub", "vsb_landleasesubaccountid"),
}));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({
  Vsb_generatorinprojectsService: fake.service("gip", "vsb_generatorinprojectid"),
}));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({
  Vsb_generatortypeinprojectsService: fake.service("gtip", "vsb_generatortypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({
  Vsb_pvmoduletypeinprojectsService: fake.service("pvtip", "vsb_pvmoduletypeinprojectid"),
}));
vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({
  Vsb_opexlandleasestandardassumptionsesService: fake.service("assumption", "vsb_id"),
}));
vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({
  Vsb_countryinflationprofilesService: fake.service("cip", "vsb_countryinflationprofileid"),
}));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({
  TransactioncurrenciesService: fake.service("currency", "transactioncurrencyid"),
}));

const rules = await import("@/features/cost/periods/landLeaseRules");
const exec = await import("./landLease");
const { LEASE_ENTITY_SET: ES, LAND_LEASE_PERIOD, OPEX_LAND_LEASE_PERIOD, LAND_LEASE_AGGREGATION, LAND_LEASE_SECURED, TECHNOLOGY } = rules;
type LeaseWrite = import("@/features/cost/periods/landLeaseRules").LeaseWrite;

/* ───────────────────────────────────────────────────────────────── plans of the three real shapes */

const GUID = (i: number): string => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

const baseCtx = {
  projectId: "proj-1", projectName: "Windpark A", owningBusinessUnitId: "bu-1",
  countryId: "country-de", countryName: "Germany", isoCurrencyCode: "EUR",
  technology: TECHNOLOGY.wind, codDate: "2027-04-01", areaWithRegion: null,
};
const baseCost = {
  id: "cost-1", name: "Windpark A-Leaseholders-Owner B", description: "Owner B",
  subaccountId: "sub-1", landOwner: "Owner B", currencyId: "cur-eur", currencyName: "Euro",
  secured: LAND_LEASE_SECURED.no, allWtgAllocated: false,
  isStandardContract: false, isStartDateStandardAssumption: false,
  amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
  dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null,
  inflationCountryArea: null, inflationStartYear: null, createdOn: "2025-01-01T00:00:00Z",
};
const basePeriod = (n: number, id = `per-${n}`, start = "2027-01-01") => ({
  id, name: "Owner B", projectCostId: "cost-1",
  period: Object.values(LAND_LEASE_PERIOD)[n - 1] as number, startDate: start,
  durationYears: 5, durationMonths: 0, fixedCosts: 1000, percentOfRevenues: null,
  eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
  aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 12,
});
const baseForm = {
  description: "Owner B", startDate: "2027-01-01", durationYears: 5, durationMonths: 0,
  currencyId: "cur-eur",
  fixedCosts: "1000.00", percentOfRevenues: "", eurPerMwh: "", eurPerMw: "", eurPerWtg: "",
  aggregation: LAND_LEASE_AGGREGATION.sum, distributionFrequency: 12,
  securedChecked: false, allWtgAllocated: false, allocatedGeneratorIds: [] as string[],
  inflationChecked: false, countryInflationChecked: false,
  inflationStartYear: "2028", inflationProfile: "", inflationCountryArea: null,
  oneTimePaymentsOn: false,
  payments: { dueDate: "", amount: "", dueDate2: "", amount2: "", dueDate3: "", amount3: "" },
  showSecondPayment: false, showThirdPayment: false, isStartDateStandardAssumption: false,
};
const wtgs = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: GUID(i + 1), name: `WTG_${i + 1}`, label: `WTG_${i + 1} - Active`, order: i + 1, kind: "wtg" as const,
}));

/** A Period-1 edit of a contract with 40 allocated WTGs: header, 40 allocation re-writes, the period, two following periods. */
function save40(): LeaseWrite[] {
  const generators = wtgs(40);
  const periods = [basePeriod(1), basePeriod(2, "per-2", "2032-01-01"), basePeriod(3, "per-3", "2037-01-01")];
  return rules.planLeaseSave({
    // A longer first period pushes the two later ones: the D118 re-chain adds their start-date updates.
    form: { ...baseForm, durationYears: 6, allocatedGeneratorIds: generators.map((g) => g.id) } as never,
    ctx: baseCtx as never, subaccountId: "sub-1", subaccountName: "Leaseholders",
    selectedCost: baseCost as never, selectedPeriod: periods[0] as never, parentPeriod: null,
    existingAllocations: generators.map((g, i) => ({ id: `a-${i + 1}`, projectCostId: "cost-1", generatorInProjectId: g.id })),
    generators, panelState: "Edit",
    contractPeriods: periods as never,
  }).writes;
}

/** Deleting Period 1 of a contract with 40 allocations and 3 periods: allocations, periods, then the cost. */
function delete40(): LeaseWrite[] {
  const periods = [basePeriod(1), basePeriod(2), basePeriod(3)];
  const contract = rules.buildContracts([baseCost as never], periods as never)[0]!;
  return rules.planLeaseDelete(
    contract, contract.periods[0]!,
    Array.from({ length: 40 }, (_, i) => ({ id: `a-${i + 1}`, projectCostId: "cost-1", generatorInProjectId: GUID(i + 1) })),
  ).writes;
}

/** The Add Standard Contract import of one all-WTG header with 3 periods over 40 generators. */
function import40(): LeaseWrite[] {
  const a = (i: number, period: number) => ({
    id: `sa-${i}`, subaccountId: "sub-1", subaccountName: "Leaseholders",
    name: "Standard Lease Holder", description: `Standard Lease Holder${i === 1 ? "" : ` - ${i}`}`,
    period, durationYears: 5, durationMonths: 0, aggregation: LAND_LEASE_AGGREGATION.sum,
    currencyId: "cur-eur", secured: true, allWtgAllocated: i === 1,
    fixCosts: 1000, percentOfRevenues: null, eurPerMwh: null, eurPerMw: null, eurPerWtg: null,
    amountOneTimePayment: null, amountOneTimePayment2: null, amountOneTimePayment3: null,
    dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
    distributionFrequency: 12, useInflationProfile: false, useCountryInflationProfile: false,
    inflationProfile: null, inflationCountryArea: null,
  });
  return rules.planStandardImport({
    ctx: baseCtx as never, subaccountId: "sub-1", subaccountName: "Leaseholders",
    assumptions: [
      a(1, OPEX_LAND_LEASE_PERIOD.period1), a(2, OPEX_LAND_LEASE_PERIOD.period2), a(3, OPEX_LAND_LEASE_PERIOD.period3),
    ] as never,
    existingCostsInSubaccount: [], generators: wtgs(40), countryInflationProfile: null,
  }).writes;
}

/* ──────────────────────────────────────────────────────────────────────────────── helpers */

function reset(): void {
  const s = fake.state;
  s.events = []; s.n = 0; s.inFlight = 0; s.peak = 0; s.manual = false; s.held = [];
  s.ticks = () => 0; s.fails = () => false; s.created = 0; s.failStatus = undefined;
}

/** The requests in the order they STARTED, as `op:table`. */
const startedOps = (): string[] =>
  fake.state.events.filter((e) => e.kind === "start").map((e) => `${e.op}:${e.table}`);

/**
 * Runs `work` with every request held, and releases the held requests in WAVES: all that are waiting at once go together.
 * The number of waves is the number of sequential round trips the work needs. Deterministic (no clock).
 */
async function inWaves<T>(work: () => Promise<T>): Promise<{ result: PromiseSettledResult<T>; waves: number; widest: number }> {
  fake.state.manual = true;
  let done = false;
  let result!: PromiseSettledResult<T>;
  const running = work().then(
    (value) => { result = { status: "fulfilled", value }; },
    (reason: unknown) => { result = { status: "rejected", reason }; },
  ).finally(() => { done = true; });
  let waves = 0;
  let widest = 0;
  while (!done) {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    const batch = fake.state.held.splice(0);
    if (batch.length > 0) {
      waves += 1;
      widest = Math.max(widest, batch.length);
      for (const release of batch) release();
    } else if (!done) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await running;
  return { result, waves, widest };
}

beforeEach(() => { widerFlag.wider = false; policyFlag.on = false; reset(); });

/* ═════════════════════════════════════════════════════════════════ characterisation (OPT-10) ══ */

describe("OPT-10 characterisation — the legacy executor (kept as the oracle): strictly sequential", () => {
  /*
   * RECORDED FIRST, against the executor as it was before the change (`applyLeaseWrites` was the one-request-at-a-time loop):
   * peak in flight 1 and 44 waves for each of the three plans below. They now run `applyLeaseWritesSequentially`, the same loop.
   */
  it("UT-LLWRITE-001 a 40-WTG Period-1 save sends header, 40 allocation re-writes, the period and its followers one at a time", async () => {
    const writes = save40();
    expect(writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      `update:${ES.cost}`,
      ...Array.from({ length: 40 }, () => `update:${ES.allocation}`),
      `update:${ES.period}`, `update:${ES.period}`, `update:${ES.period}`,
    ]);
    const { waves, result } = await inWaves(() => exec.applyLeaseWritesSequentially(writes, { independentSteps: true }));
    expect(result.status).toBe("fulfilled");
    expect(startedOps()).toEqual(writes.map((w) => `${w.op}:${w.entitySet === ES.cost ? "cost" : w.entitySet === ES.period ? "period" : "alloc"}`));
    // MEASURED, unmodified executor: every request waits for the one before it.
    expect(fake.state.peak).toBe(1);
    expect(waves).toBe(44);
  });

  it("UT-LLWRITE-002 deleting a 40-allocation contract is 44 sequential requests, children before the cost", async () => {
    const writes = delete40();
    expect(writes).toHaveLength(44);
    const { waves } = await inWaves(() => exec.applyLeaseWritesSequentially(writes));
    expect(fake.state.peak).toBe(1);
    expect(waves).toBe(44);
    const order = startedOps();
    expect(order.slice(0, 40).every((o) => o === "delete:alloc")).toBe(true);
    expect(order.slice(40, 43).every((o) => o === "delete:period")).toBe(true);
    expect(order[43]).toBe("delete:cost");
  });

  it("UT-LLWRITE-003 the standard import of one all-WTG header and 3 periods is 44 sequential requests, parent first", async () => {
    const writes = import40();
    expect(writes).toHaveLength(1 + 40 + 3);
    const { waves, result } = await inWaves(() => exec.applyLeaseWritesSequentially(writes));
    expect(result.status).toBe("fulfilled");
    expect(fake.state.peak).toBe(1);
    expect(waves).toBe(44);
    expect(startedOps()[0]).toBe("create:cost");
  });
});

/* ═══════════════════════════════════════════════════════════════════════ the new waves ══ */

describe("OPT-10 the tiered executor — waves", () => {
  it("UT-LLWRITE-010 the 40-WTG save needs 9 waves instead of 44: header (1), 40 re-writes 8 wide (5), the period (1), its 2 followers one by one (2)", async () => {
    const writes = save40();
    const { waves, widest, result } = await inWaves(() => exec.applyLeaseWrites(writes, { independentSteps: true }));
    expect(result.status).toBe("fulfilled");
    expect(waves).toBe(9);
    expect(widest).toBe(8);
    expect(fake.state.peak).toBe(8);
    expect(fake.state.events.filter((e) => e.kind === "start")).toHaveLength(44);
  });

  it("UT-LLWRITE-011 the contract delete needs 7 waves instead of 44: 40 allocations 16 wide (3), the 3 periods one by one, the cost", async () => {
    const { waves, widest } = await inWaves(() => exec.applyLeaseWrites(delete40()));
    expect(waves).toBe(7);
    expect(widest).toBe(16);
    expect(fake.state.peak).toBe(16);
    // Children before parents: every allocation delete ended before a period delete started, and those before the cost delete.
    const ev = fake.state.events;
    const lastEnd = (table: string) => Math.max(...ev.filter((e) => e.kind === "end" && e.table === table).map((e) => e.n));
    const firstStart = (table: string) => Math.min(...ev.filter((e) => e.kind === "start" && e.table === table).map((e) => e.n));
    expect(lastEnd("alloc")).toBeLessThan(firstStart("period"));
    expect(lastEnd("period")).toBeLessThan(firstStart("cost"));
  });

  it("UT-LLWRITE-012 the standard import needs 9 waves instead of 44: the header, 40 allocations 8 wide (5), the 3 periods one by one", async () => {
    const { waves, result } = await inWaves(() => exec.applyLeaseWrites(import40()));
    expect(result.status).toBe("fulfilled");
    expect(waves).toBe(9);
    expect(fake.state.peak).toBe(8);
    // The header's id reached every child: no write was sent without its parent bind.
    const creates = fake.state.events.filter((e) => e.kind === "start" && e.op === "create" && e.table !== "cost");
    expect(creates).toHaveLength(43);
    expect(creates.every((e) => typeof e.payload?.["vsb_ProjectCost@odata.bind"] === "string")).toBe(true);
  });

  it("UT-LLWRITE-013 cost (cascade) deletes are sent one at a time, like the loop; allocation deletes are 16 wide", async () => {
    const costs: LeaseWrite[] = Array.from({ length: 6 }, (_, i) => ({ op: "delete", entitySet: ES.cost, id: `c${i}` }));
    const { waves } = await inWaves(() => exec.applyLeaseWrites(costs));
    expect(fake.state.peak).toBe(1);
    expect(waves).toBe(6);
  });

  it("UT-LLWRITE-014 the switch exists and is on", () => {
    expect(exec.LEASE_WRITE_PARALLEL).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════ leaseWriteTiers ══ */

describe("OPT-10 leaseWriteTiers", () => {
  const w = (op: "create" | "update" | "delete", entitySet: string, id = `${entitySet}-x`): LeaseWrite =>
    (op === "create" ? { op, entitySet, payload: {} } : op === "update" ? { op, entitySet, id, payload: {} } : { op, entitySet, id });

  it("UT-LLWRITE-020 an empty plan has no tier; one write is one tier", () => {
    expect(rules.leaseWriteTiers([])).toEqual([]);
    expect(rules.leaseWriteTiers([w("update", ES.cost, "c")])).toEqual([[0]]);
  });

  it("UT-LLWRITE-021 only allocation rows share a tier, and only of one op; header and period writes are sent alone, in planner order", () => {
    const plan = [
      w("update", ES.cost, "c"),
      w("create", ES.allocation), w("create", ES.allocation),
      w("update", ES.allocation, "a1"), w("update", ES.allocation, "a2"),
      w("delete", ES.allocation, "a3"),
      w("update", ES.period, "p1"), w("update", ES.period, "p2"),
    ];
    // header | creates | updates | delete | period | follower
    expect(rules.leaseWriteTiers(plan)).toEqual([[0], [1, 2], [3, 4], [5], [6], [7]]);
  });

  it("UT-LLWRITE-022 two writes to the same row never share a tier (an update then a delete stays in order)", () => {
    const plan = [w("update", ES.allocation, "a1"), w("delete", ES.allocation, "a1"), w("update", ES.allocation, "a2")];
    // different ops never share a tier, so the update, the delete and the later update are three tiers
    expect(rules.leaseWriteTiers(plan)).toEqual([[0], [1], [2]]);
    // same op, same row twice: still apart
    expect(rules.leaseWriteTiers([w("update", ES.allocation, "a1"), w("update", ES.allocation, "a1")])).toEqual([[0], [1]]);
  });

  it("UT-LLWRITE-023 a write that binds a ref waits for the create of that ref, even on the allocation entity set; period creates are alone", () => {
    const plan: LeaseWrite[] = [
      { op: "create", entitySet: ES.allocation, ref: "p", payload: {} },
      { op: "create", entitySet: ES.allocation, parentRef: "p", payload: {} },
      { op: "create", entitySet: ES.allocation, payload: {} },
      { op: "create", entitySet: ES.period, payload: {} },
      { op: "create", entitySet: ES.period, payload: {} },
    ];
    expect(rules.leaseWriteTiers(plan)).toEqual([[0], [1, 2], [3], [4]]);
  });

  it("UT-LLWRITE-024 the import interleaves headers and their allocations: each header opens a tier after the allocations before it", () => {
    const plan: LeaseWrite[] = [
      { op: "create", entitySet: ES.cost, ref: "cost-0", payload: {} },
      { op: "create", entitySet: ES.allocation, parentRef: "cost-0", payload: {} },
      { op: "create", entitySet: ES.allocation, parentRef: "cost-0", payload: {} },
      { op: "create", entitySet: ES.cost, ref: "cost-1", payload: {} },
      { op: "create", entitySet: ES.period, parentRef: "cost-0", payload: {} },
      { op: "create", entitySet: ES.period, parentRef: "cost-1", payload: {} },
    ];
    expect(rules.leaseWriteTiers(plan)).toEqual([[0], [1, 2], [3], [4], [5]]);
  });

  it("UT-LLWRITE-025 the real planners: 40-WTG save, contract delete and import", () => {
    expect(rules.leaseWriteTiers(save40()).map((t) => t.length)).toEqual([1, 40, 1, 1, 1]);
    expect(rules.leaseWriteTiers(delete40()).map((t) => t.length)).toEqual([40, 1, 1, 1, 1]);
    expect(rules.leaseWriteTiers(import40()).map((t) => t.length)).toEqual([1, 40, 1, 1, 1]);
  });
});

/* ═════════════════════════════════════ differential test: tiered executor against the legacy oracle ══ */

/** mulberry32, as `savePlan.test.ts` (UT-ACSAVE): a failing case reproduces from its seed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (rand: () => number, lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const chance = (rand: () => number, p: number): boolean => rand() < p;

const TABLE_OF: Record<string, string> = { [ES.cost]: "cost", [ES.period]: "period", [ES.allocation]: "alloc" };
/** Identity of one write in the fake's log: a create by its tag (= planner index), an update / delete by id. Unique per plan. */
const keyOf = (op: string, table: string, id: string | undefined, payload: Row | undefined): string =>
  `${op}|${table}|${op === "create" ? String(payload?.["tag"]) : id}`;
const keyOfWrite = (w: LeaseWrite, index: number): string =>
  w.op === "create" ? `create|${TABLE_OF[w.entitySet]}|${index}` : `${w.op}|${TABLE_OF[w.entitySet]}|${w.id}`;

/** A random plan of one of four shapes: the three the planners emit, and a free mix that stresses the tiering. */
function randomPlan(rand: () => number): { writes: LeaseWrite[]; independent: boolean } {
  const writes: LeaseWrite[] = [];
  const create = (set: string, extra: { ref?: string; parentRef?: string } = {}): void => {
    writes.push({ op: "create", entitySet: set, payload: { tag: writes.length }, ...extra });
  };
  const update = (set: string, id: string): void => { writes.push({ op: "update", entitySet: set, id, payload: { tag: writes.length } }); };
  const del = (set: string, id: string): void => { writes.push({ op: "delete", entitySet: set, id }); };
  const shape = int(rand, 0, 3);

  if (shape === 0) { // planLeaseSave
    const newContract = chance(rand, 0.3);
    if (newContract) create(ES.cost, { ref: "cost" }); else update(ES.cost, "cost-1");
    const bind = newContract ? { parentRef: "cost" } : {};
    for (let i = int(rand, 0, 25); i > 0; i -= 1) create(ES.allocation, bind);
    for (let i = int(rand, 0, 25); i > 0; i -= 1) update(ES.allocation, `a-u${writes.length}`);
    for (let i = int(rand, 0, 6); i > 0; i -= 1) del(ES.allocation, `a-d${writes.length}`);
    if (chance(rand, 0.5)) create(ES.period, { ref: "period", ...bind }); else update(ES.period, "p-1");
    for (let i = int(rand, 0, 4); i > 0; i -= 1) update(ES.period, `p-f${writes.length}`);
    return { writes, independent: chance(rand, 0.7) };
  }
  if (shape === 1) { // planLeaseDelete
    for (let i = int(rand, 0, 30); i > 0; i -= 1) del(ES.allocation, `a-${writes.length}`);
    for (let i = int(rand, 0, 5); i > 0; i -= 1) del(ES.period, `p-${writes.length}`);
    del(ES.cost, `c-${writes.length}`);
    return { writes, independent: false };
  }
  if (shape === 2) { // planStandardImport
    const headers = int(rand, 1, 3);
    for (let h = 0; h < headers; h += 1) {
      create(ES.cost, { ref: `cost-${h}` });
      if (chance(rand, 0.7)) for (let i = int(rand, 1, 14); i > 0; i -= 1) create(ES.allocation, { parentRef: `cost-${h}` });
    }
    for (let i = int(rand, 1, 6); i > 0; i -= 1) create(ES.period, chance(rand, 0.9) ? { parentRef: `cost-${int(rand, 0, headers - 1)}` } : {});
    return { writes, independent: false };
  }
  // A free mix: random sets and ops, update-then-delete pairs on one row, refs that later writes bind.
  const sets = [ES.cost, ES.allocation, ES.period];
  const refs: string[] = [];
  for (let n = int(rand, 3, 24); n > 0; n -= 1) {
    const set = sets[int(rand, 0, 2)]!;
    const kind = int(rand, 0, 3);
    if (kind === 0) { const ref = `r${refs.length}`; refs.push(ref); create(set, { ref }); }
    else if (kind === 1) create(set, refs.length > 0 && chance(rand, 0.6) ? { parentRef: refs[int(rand, 0, refs.length - 1)]! } : {});
    else if (kind === 2) update(set, `row-${writes.length}`);
    else {
      const id = `row-${writes.length}`;
      update(set, id);
      if (chance(rand, 0.5)) del(set, id); else update(set, `${id}-b`);
    }
  }
  // Plain mode only: the independent-steps mode regroups writes by step, so a ref may then be created in a later step than its binds.
  return { writes, independent: false };
}

/** Everything a run left behind: what landed (with the bound payloads), what it returned, and how it ended. */
interface Outcome {
  landed: string[];
  createdIds: Record<string, string>;
  error: string | null;
  steps: string[] | null;
}

type Apply = (w: readonly LeaseWrite[], o?: { independentSteps?: boolean }) => Promise<{ createdIds: Record<string, string> }>;

async function execute(
  apply: Apply, writes: readonly LeaseWrite[], independent: boolean, failKeys: ReadonlySet<string>, rand: () => number,
  failWhen?: (table: string, op: string) => boolean,
): Promise<Outcome> {
  reset();
  fake.state.ticks = () => int(rand, 0, 3);
  fake.state.fails = (table, op, id, payload) => failKeys.has(keyOf(op, table, id, payload)) || (failWhen?.(table, op) ?? false);
  let createdIds: Record<string, string> = {};
  let error: string | null = null;
  let steps: string[] | null = null;
  try {
    createdIds = (await apply(writes, independent ? { independentSteps: true } : undefined)).createdIds;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (e instanceof rules.LeaseStepsError) steps = e.failures.map((f) => `${f.step}:${f.message}`);
  }
  const landed = fake.state.events
    .filter((e) => e.kind === "end" && !failKeys.has(keyOf(e.op, e.table, e.id, e.payload)))
    .map((e) => `${keyOf(e.op, e.table, e.id, e.payload)}|${JSON.stringify(e.payload ?? null)}`)
    .sort();
  return { landed, createdIds, error, steps };
}

const legacyApply: Apply = (w, o) => exec.applyLeaseWritesSequentially(w, o);
const tieredApply: Apply = (w, o) => exec.applyLeaseWrites(w, o);

/**
 * The orderings a tiered run must keep, written down independently of `leaseWriteTiers`: a bind waits for its create; writes on
 * different entity sets keep the planner's order (header → allocations → periods; deletes children first); on any entity set but the
 * allocation rows every write is ordered; allocation writes of a different op are ordered (creates → updates → deletes); two writes to
 * one row too.
 */
function mustPrecede(a: LeaseWrite, b: LeaseWrite): boolean {
  if (b.op !== "delete" && b.parentRef !== undefined && a.op === "create" && a.ref === b.parentRef) return true;
  if (a.entitySet !== b.entitySet) return true;
  if (a.entitySet !== ES.allocation) return true;
  if (a.op !== b.op) return true;
  return a.op !== "create" && b.op !== "create" && a.id === b.id;
}

describe("OPT-10 differential test: tiered executor against the legacy sequential oracle", () => {
  it("UT-LLWRITE-030 over 400 random plans the same rows land with the same payloads, ids and bindings", async () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { writes, independent } = randomPlan(prng(seed));
      const none = new Set<string>();
      const legacy = await execute(legacyApply, writes, independent, none, prng(seed + 1000));
      const tiered = await execute(tieredApply, writes, independent, none, prng(seed + 2000));
      expect(tiered.error, `seed ${seed}: error`).toBe(legacy.error);
      expect(tiered.landed, `seed ${seed}: landed writes`).toEqual(legacy.landed);
      expect(tiered.createdIds, `seed ${seed}: createdIds`).toEqual(legacy.createdIds);
    }
  });

  it("UT-LLWRITE-031 over 400 random plans every parent-before-child and children-before-parents ordering holds, under shuffled completion", async () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { writes, independent } = randomPlan(prng(seed));
      const out = await execute(tieredApply, writes, independent, new Set(), prng(seed + 3000));
      if (out.error !== null) continue; // plans with an unbound ref in the free mix are refused; UT-LLWRITE-036 covers that
      const at = new Map<string, { start: number; end: number }>();
      for (const e of fake.state.events) {
        const k = keyOf(e.op, e.table, e.id, e.payload);
        const cur = at.get(k) ?? { start: -1, end: -1 };
        if (e.kind === "start") cur.start = e.n; else cur.end = e.n;
        at.set(k, cur);
      }
      for (let j = 0; j < writes.length; j += 1) {
        for (let i = 0; i < j; i += 1) {
          if (!mustPrecede(writes[i]!, writes[j]!)) continue;
          const a = at.get(keyOfWrite(writes[i]!, i));
          const b = at.get(keyOfWrite(writes[j]!, j));
          expect(a && b, `seed ${seed}: ${i} and ${j} both ran`).toBeTruthy();
          expect(a!.end, `seed ${seed}: write ${i} must land before write ${j} starts`).toBeLessThan(b!.start);
        }
      }
      // Never wider than the widest tier width in the repo.
      expect(fake.state.peak, `seed ${seed}: peak`).toBeLessThanOrEqual(16);
    }
  });

  it("UT-LLWRITE-032 an injected failure at EACH index gives the legacy error: the first failing write in planner order", async () => {
    let cases = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { writes, independent } = randomPlan(prng(seed + 7000));
      const tierOf = new Map<number, number>();
      rules.leaseWriteTiers(writes).forEach((t, n) => t.forEach((i) => tierOf.set(i, n)));
      const tierOfKey = new Map(writes.map((x, i) => [keyOfWrite(x, i), tierOf.get(i)!]));
      for (let k = 0; k < writes.length; k += 1) {
        cases += 1;
        const fail = new Set([keyOfWrite(writes[k]!, k)]);
        const legacy = await execute(legacyApply, writes, independent, fail, prng(seed * 100 + k));
        const tiered = await execute(tieredApply, writes, independent, fail, prng(seed * 100 + k + 50_000));
        expect(tiered.error, `seed ${seed} index ${k}: error`).toBe(legacy.error);
        expect(tiered.steps, `seed ${seed} index ${k}: per-step failures`).toEqual(legacy.steps);
        // Everything the sequential loop had landed has landed here too (earlier tiers in full, the earlier writes of the tier).
        for (const row of legacy.landed) expect(tiered.landed, `seed ${seed} index ${k}`).toContain(row);
        // One-plan mode: no write of a tier after the failed one was started.
        if (!independent) {
          const failedTier = tierOf.get(k)!;
          for (const e of fake.state.events.filter((x) => x.kind === "start")) {
            expect(tierOfKey.get(keyOf(e.op, e.table, e.id, e.payload)) ?? -1, `seed ${seed} index ${k}: tier after the failure`).toBeLessThanOrEqual(failedTier);
          }
        }
      }
    }
    expect(cases).toBeGreaterThan(1000);
  });

  it("UT-LLWRITE-033 with several injected failures the error is still the FIRST in planner order", async () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const rand = prng(seed + 9000);
      const { writes, independent } = randomPlan(prng(seed));
      if (writes.length < 3) continue;
      const fail = new Set<string>();
      for (let n = int(rand, 2, 4); n > 0; n -= 1) {
        const k = int(rand, 0, writes.length - 1);
        fail.add(keyOfWrite(writes[k]!, k));
      }
      const legacy = await execute(legacyApply, writes, independent, fail, prng(seed));
      const tiered = await execute(tieredApply, writes, independent, fail, prng(seed + 1));
      expect(tiered.error, `seed ${seed}: error`).toBe(legacy.error);
      expect(tiered.steps, `seed ${seed}: per-step failures`).toEqual(legacy.steps);
    }
  });

  it("UT-LLWRITE-034 a failed header (create) stops the later tiers: nothing binds to a missing id, nothing after it is sent", async () => {
    const writes = import40();
    const out = await execute(tieredApply, writes, false, new Set(), prng(5), (table, op) => table === "cost" && op === "create");
    expect(out.error).toMatch(/Land Lease contract failed/);
    expect(fake.state.events.filter((e) => e.kind === "start")).toHaveLength(1);
  });

  it("UT-LLWRITE-035 a failing allocation of a 40-WTG save: the period step does not start in one-plan mode, and the error names the allocation", async () => {
    const writes = save40();
    const failing = writes.findIndex((x, i) => i > 10 && x.entitySet === ES.allocation);
    const fail = new Set([keyOfWrite(writes[failing]!, failing)]);
    const out = await execute(tieredApply, writes, false, fail, prng(6));
    expect(out.error).toContain(`refused ${(writes[failing] as { id: string }).id}`);
    expect(fake.state.events.some((e) => e.kind === "start" && e.table === "period")).toBe(false);
    // Independent steps (the real Save): the period step still starts, and the failure is reported per step (FT-BR-LEASE-089).
    const independent = await execute(tieredApply, writes, true, fail, prng(7));
    expect(independent.steps).toHaveLength(1);
    expect(independent.steps![0]).toMatch(/^allocation:/);
    expect(fake.state.events.some((e) => e.kind === "start" && e.table === "period")).toBe(true);
  });

  it("UT-LLWRITE-036 an unresolved parent ref is still refused, at its own position, and nothing is POSTed for it", async () => {
    const writes: LeaseWrite[] = [
      { op: "update", entitySet: ES.cost, id: "c1", payload: { tag: 0 } },
      { op: "create", entitySet: ES.period, parentRef: "missing", payload: { tag: 1 } },
    ];
    const legacy = await execute(legacyApply, writes, false, new Set(), prng(1));
    const tiered = await execute(tieredApply, writes, false, new Set(), prng(1));
    expect(tiered.error).toBe(legacy.error);
    expect(tiered.error).toMatch(/parent id/);
    expect(fake.state.events.some((e) => e.table === "period")).toBe(false);
  });

  it("UT-LLWRITE-037 an unknown entity set is refused as before", async () => {
    const writes: LeaseWrite[] = [{ op: "delete", entitySet: "vsb_somethingelse", id: "x" }];
    await expect(exec.applyLeaseWrites(writes)).rejects.toThrow(/No writer/);
  });
});

/* ═════════════════════════════════ safety: nothing lands after a failure that the loop would not have sent ══ */

/** The executor's units: the whole plan, or (independent steps) the writes of each step, as `applyPlan` runs them. */
function unitsOf(writes: readonly LeaseWrite[], independent: boolean): number[][] {
  if (!independent) return [writes.map((_, i) => i)];
  return (["contract", "allocation", "period"] as const).map((step) =>
    writes.map((x, i) => [x, i] as const).filter(([x]) => rules.leaseStepOf(x.entitySet) === step).map(([, i]) => i));
}

/**
 * The only writes the tiered executor may send beyond what the loop sent: those in the SAME tier and the SAME op as the write that
 * failed (the other allocation rows of one kind that were already in flight). Everything else it started, the loop started too.
 */
function permittedExtras(writes: readonly LeaseWrite[], independent: boolean, legacyStarted: ReadonlySet<string>, failing: ReadonlySet<string>): Set<string> {
  const extras = new Set<string>();
  for (const unit of unitsOf(writes, independent)) {
    const failedIdx = unit.find((i) => failing.has(keyOfWrite(writes[i]!, i)) && legacyStarted.has(keyOfWrite(writes[i]!, i)));
    if (failedIdx === undefined) continue;
    for (const tier of rules.leaseWriteTiers(unit.map((i) => writes[i]!))) {
      const global = tier.map((t) => unit[t]!);
      if (!global.includes(failedIdx)) continue;
      for (const i of global) if (writes[i]!.op === writes[failedIdx]!.op) extras.add(keyOfWrite(writes[i]!, i));
    }
  }
  return extras;
}

const startedKeys = (): Set<string> =>
  new Set(fake.state.events.filter((e) => e.kind === "start").map((e) => keyOf(e.op, e.table, e.id, e.payload)));

describe("OPT-10 safety: after a failure the tiered executor sends no more than the legacy loop, but same-op allocation siblings", () => {
  it("UT-LLWRITE-038 a tier with more than one write is allocation rows of ONE op, over 400 random plans", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { writes } = randomPlan(prng(seed));
      for (const tier of rules.leaseWriteTiers(writes)) {
        if (tier.length < 2) continue;
        expect(new Set(tier.map((i) => writes[i]!.entitySet)), `seed ${seed}`).toEqual(new Set([ES.allocation]));
        expect(new Set(tier.map((i) => writes[i]!.op)).size, `seed ${seed}: one op`).toBe(1);
      }
    }
  });

  it("UT-LLWRITE-039 an injected failure at EVERY index of 60 random plans: every write started is one the loop started, or a same-tier same-op sibling", async () => {
    let cases = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { writes, independent } = randomPlan(prng(seed + 11_000));
      for (let k = 0; k < writes.length; k += 1) {
        cases += 1;
        const fail = new Set([keyOfWrite(writes[k]!, k)]);
        await execute(legacyApply, writes, independent, fail, prng(seed * 77 + k));
        const legacyStarted = startedKeys();
        await execute(tieredApply, writes, independent, fail, prng(seed * 77 + k + 40_000));
        const extras = permittedExtras(writes, independent, legacyStarted, fail);
        for (const key of startedKeys()) {
          expect(legacyStarted.has(key) || extras.has(key), `seed ${seed} index ${k}: ${key} was sent`).toBe(true);
        }
      }
    }
    expect(cases).toBeGreaterThan(1000);
  });

  it("UT-LLWRITE-040 the same holds with 2 to 4 failures injected at once, over 400 random plans", async () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const rand = prng(seed + 13_000);
      const { writes, independent } = randomPlan(prng(seed));
      if (writes.length < 3) continue;
      const fail = new Set<string>();
      for (let n = int(rand, 2, 4); n > 0; n -= 1) { const k = int(rand, 0, writes.length - 1); fail.add(keyOfWrite(writes[k]!, k)); }
      await execute(legacyApply, writes, independent, fail, prng(seed));
      const legacyStarted = startedKeys();
      await execute(tieredApply, writes, independent, fail, prng(seed + 1));
      const extras = permittedExtras(writes, independent, legacyStarted, fail);
      for (const key of startedKeys()) expect(legacyStarted.has(key) || extras.has(key), `seed ${seed}: ${key}`).toBe(true);
    }
  });

  it("UT-LLWRITE-041 SCENARIO A: a refused period update sends NO follower start-date update (nothing rewrites periods for a duration that was never saved)", async () => {
    const writes = save40();
    const periodUpdates = writes.map((x, i) => [x, i] as const).filter(([x]) => x.entitySet === ES.period);
    expect(periodUpdates).toHaveLength(3); // the saved period and its two followers
    const [selected, ...followers] = periodUpdates;
    for (const independent of [false, true]) {
      const out = await execute(tieredApply, writes, independent, new Set([keyOfWrite(selected![0], selected![1])]), prng(41));
      expect(out.error, `independent ${independent}`).not.toBeNull();
      const sent = startedKeys();
      for (const [f, i] of followers) expect(sent.has(keyOfWrite(f, i)), `follower ${i} sent (independent ${independent})`).toBe(false);
      expect(sent.has(keyOfWrite(selected![0], selected![1]))).toBe(true);
    }
  });

  it("UT-LLWRITE-042 SCENARIO B: a refused allocation create sends NO allocation delete and no allocation update (a contract never loses an allocation with no replacement)", async () => {
    const generators = wtgs(6);
    const existing = [0, 1, 2].map((i) => ({ id: `a-${i + 1}`, projectCostId: "cost-1", generatorInProjectId: generators[i]!.id }));
    // Selected: G1, G2 stay (re-written), G3 is dropped (delete), G4 and G5 are new (creates).
    const writes = rules.planLeaseSave({
      form: { ...baseForm, allocatedGeneratorIds: [generators[0]!.id, generators[1]!.id, generators[3]!.id, generators[4]!.id] } as never,
      ctx: baseCtx as never, subaccountId: "sub-1", subaccountName: "Leaseholders",
      selectedCost: baseCost as never, selectedPeriod: basePeriod(1) as never, parentPeriod: null,
      existingAllocations: existing, generators, panelState: "Edit",
    }).writes;
    expect(writes.filter((x) => x.entitySet === ES.allocation).map((x) => x.op)).toEqual(["create", "create", "update", "update", "delete"]);
    for (const independent of [false, true]) {
      reset();
      fake.state.ticks = () => 0;
      fake.state.fails = (table, op, _id, payload) => table === "alloc" && op === "create"
        && String(payload?.["vsb_GeneratorInProject@odata.bind"]).includes(generators[3]!.id);
      let error: unknown = null;
      try { await exec.applyLeaseWrites(writes, independent ? { independentSteps: true } : undefined); } catch (e) { error = e; }
      expect(error, `independent ${independent}`).not.toBeNull();
      const sent = fake.state.events.filter((e) => e.kind === "start");
      expect(sent.some((e) => e.table === "alloc" && e.op === "delete"), `delete sent (independent ${independent})`).toBe(false);
      expect(sent.some((e) => e.table === "alloc" && e.op === "update"), `update sent (independent ${independent})`).toBe(false);
      // The other create of the same tier was in flight beside the refused one: the only permitted extra.
      expect(sent.filter((e) => e.table === "alloc" && e.op === "create").length).toBeLessThanOrEqual(2);
    }
  });
});

/* ═══════════════════════════════════════════ dvopt CB-07 (`LEASE_TIER_WIDER`): followers and period deletes together ══ */

describe("CB-07 wider tiers — waves (switch on)", () => {
  it("UT-LLWRITE-050 the 40-WTG save needs 8 waves, one fewer: the two follower start-date updates go together (behind the saved period)", async () => {
    widerFlag.wider = true;
    const { waves, widest, result } = await inWaves(() => exec.applyLeaseWrites(save40(), { independentSteps: true }));
    expect(result.status).toBe("fulfilled");
    expect(waves).toBe(8); // header 1, 40 re-writes 8 wide 5, the saved period 1, its 2 followers 1
    expect(widest).toBe(8);
    expect(fake.state.events.filter((e) => e.kind === "start")).toHaveLength(44);
    // The followers started only after the saved period's own update had ended (D160 section 12).
    const ev = fake.state.events;
    const savedEnd = ev.find((e) => e.kind === "end" && e.table === "period")!;
    const followerStarts = ev.filter((e) => e.kind === "start" && e.table === "period").slice(1);
    expect(followerStarts).toHaveLength(2);
    for (const s of followerStarts) expect(s.n).toBeGreaterThan(savedEnd.n);
  });

  it("UT-LLWRITE-051 the contract delete needs 5 waves, two fewer: allocations 3, the 3 periods together 1, the cost 1; children still before the parent", async () => {
    widerFlag.wider = true;
    const { waves, widest } = await inWaves(() => exec.applyLeaseWrites(delete40()));
    expect(waves).toBe(5);
    expect(widest).toBe(16);
    const ev = fake.state.events;
    const lastEnd = (table: string) => Math.max(...ev.filter((e) => e.kind === "end" && e.table === table).map((e) => e.n));
    const firstStart = (table: string) => Math.min(...ev.filter((e) => e.kind === "start" && e.table === table).map((e) => e.n));
    expect(lastEnd("alloc")).toBeLessThan(firstStart("period"));
    expect(lastEnd("period")).toBeLessThan(firstStart("cost"));
  });

  it("UT-LLWRITE-052 the switch off gives the D160 numbers again (9 and 7 waves)", async () => {
    widerFlag.wider = false;
    expect((await inWaves(() => exec.applyLeaseWrites(save40(), { independentSteps: true }))).waves).toBe(9);
    reset();
    expect((await inWaves(() => exec.applyLeaseWrites(delete40()))).waves).toBe(7);
  });

  it("UT-LLWRITE-053 the standard import keeps its tiers: period creates are NOT widened (same waves with the switch on and off)", async () => {
    widerFlag.wider = true;
    const on = await inWaves(() => exec.applyLeaseWrites(import40()));
    reset();
    widerFlag.wider = false;
    const off = await inWaves(() => exec.applyLeaseWrites(import40()));
    expect(on.waves).toBe(off.waves);
  });
});

/** A random plan that HAS follower start-date updates and period deletes (what the wider rule changes), with the real payload shape. */
function randomWiderPlan(rand: () => number): { writes: LeaseWrite[]; independent: boolean } {
  const writes: LeaseWrite[] = [];
  const push = (w: LeaseWrite): void => { writes.push(w); };
  if (chance(rand, 0.6)) { // a Period-1 / Period-n save
    push({ op: "update", entitySet: ES.cost, id: "cost-1", payload: { tag: 0 } });
    for (let i = int(rand, 0, 12); i > 0; i -= 1) push({ op: "update", entitySet: ES.allocation, id: `a-u${writes.length}`, payload: { tag: writes.length } });
    for (let i = int(rand, 0, 4); i > 0; i -= 1) push({ op: "delete", entitySet: ES.allocation, id: `a-d${writes.length}` });
    push({ op: "update", entitySet: ES.period, id: "p-1", payload: { tag: writes.length, vsb_name: "n", vsb_startdate: "2027-01-01" } });
    for (let i = int(rand, 0, 8); i > 0; i -= 1) {
      push({ op: "update", entitySet: ES.period, id: `p-f${writes.length}`, payload: { vsb_startdate: `2030-0${int(rand, 1, 9)}-01` } });
    }
    return { writes, independent: chance(rand, 0.7) };
  }
  for (let i = int(rand, 0, 20); i > 0; i -= 1) push({ op: "delete", entitySet: ES.allocation, id: `a-${writes.length}` });
  for (let i = int(rand, 1, 9); i > 0; i -= 1) push({ op: "delete", entitySet: ES.period, id: `p-${writes.length}` });
  push({ op: "delete", entitySet: ES.cost, id: "c-1" });
  return { writes, independent: false };
}

/** `permittedExtras` for the WIDER tiers: only the same-tier, same-op siblings of the failed write may have started beyond the loop. */
function permittedExtrasWider(writes: readonly LeaseWrite[], independent: boolean, legacyStarted: ReadonlySet<string>, failing: ReadonlySet<string>): Set<string> {
  const extras = new Set<string>();
  for (const unit of unitsOf(writes, independent)) {
    const failedIdx = unit.find((i) => failing.has(keyOfWrite(writes[i]!, i)) && legacyStarted.has(keyOfWrite(writes[i]!, i)));
    if (failedIdx === undefined) continue;
    for (const tier of rules.leaseWriteTiers(unit.map((i) => writes[i]!), { wider: true })) {
      const global = tier.map((t) => unit[t]!);
      if (!global.includes(failedIdx)) continue;
      for (const i of global) if (writes[i]!.op === writes[failedIdx]!.op) extras.add(keyOfWrite(writes[i]!, i));
    }
  }
  return extras;
}

describe("CB-07 wider tiers — differential against the sequential oracle and failure injection", () => {
  it("UT-LLWRITE-054 without a failure, 200 random plans land exactly what the legacy loop lands, with the same result", async () => {
    widerFlag.wider = true;
    for (let seed = 1; seed <= 200; seed += 1) {
      const { writes, independent } = randomWiderPlan(prng(seed + 21_000));
      const legacy = await execute(legacyApply, writes, independent, new Set(), prng(seed));
      const wider = await execute(tieredApply, writes, independent, new Set(), prng(seed + 1));
      expect(wider.error, `seed ${seed}`).toBeNull();
      expect(wider.landed, `seed ${seed}`).toEqual(legacy.landed);
      expect(wider.createdIds, `seed ${seed}`).toEqual(legacy.createdIds);
    }
  });

  it("UT-LLWRITE-055 a failure injected at EVERY index of 60 random plans: every write started is one the loop started or a same-tier same-op sibling; nothing of a later tier", async () => {
    widerFlag.wider = true;
    let cases = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const { writes, independent } = randomWiderPlan(prng(seed + 23_000));
      for (let k = 0; k < writes.length; k += 1) {
        cases += 1;
        const fail = new Set([keyOfWrite(writes[k]!, k)]);
        await execute(legacyApply, writes, independent, fail, prng(seed * 71 + k));
        const legacyStarted = startedKeys();
        const out = await execute(tieredApply, writes, independent, fail, prng(seed * 71 + k + 50_000));
        expect(out.error, `seed ${seed} index ${k}`).not.toBeNull();
        const extras = permittedExtrasWider(writes, independent, legacyStarted, fail);
        for (const key of startedKeys()) expect(legacyStarted.has(key) || extras.has(key), `seed ${seed} index ${k}: ${key}`).toBe(true);
      }
    }
    expect(cases).toBeGreaterThan(500);
  });

  it("UT-LLWRITE-056 SCENARIO: with a refused period delete the cost header is NEVER deleted; running the plan again finishes it", async () => {
    widerFlag.wider = true;
    const writes = delete40();
    const refused = writes.findIndex((w) => w.entitySet === ES.period && w.op === "delete");
    const out = await execute(tieredApply, writes, false, new Set([keyOfWrite(writes[refused]!, refused)]), prng(56));
    expect(out.error).not.toBeNull();
    expect(fake.state.events.filter((e) => e.kind === "start").some((e) => e.table === "cost")).toBe(false);
    // The retry: rows that landed answer 404 in the real client (deleteIfExists, CB-03); here the second run simply succeeds in full.
    const again = await execute(tieredApply, writes, false, new Set(), prng(57));
    expect(again.error).toBeNull();
    expect(fake.state.events.filter((e) => e.kind === "start" && e.table === "cost")).toHaveLength(1);
  });

  it("UT-LLWRITE-057 SCENARIO: a refused saved-period update sends NO follower (they are a later tier), switch on, plain and independent", async () => {
    widerFlag.wider = true;
    const writes = save40();
    const periodUpdates = writes.map((x, i) => [x, i] as const).filter(([x]) => x.entitySet === ES.period);
    const [selected, ...followers] = periodUpdates;
    for (const independent of [false, true]) {
      const out = await execute(tieredApply, writes, independent, new Set([keyOfWrite(selected![0], selected![1])]), prng(58));
      expect(out.error, `independent ${independent}`).not.toBeNull();
      for (const [f, i] of followers) expect(startedKeys().has(keyOfWrite(f, i)), `follower ${i} (independent ${independent})`).toBe(false);
    }
  });

  it("UT-LLWRITE-058 SCENARIO: one refused follower beside a good one: the good one may land, the error is the refused one's, the other steps still ran", async () => {
    widerFlag.wider = true;
    const writes = save40();
    const followers = writes.map((x, i) => [x, i] as const).filter(([x]) => x.entitySet === ES.period).slice(1);
    const out = await execute(tieredApply, writes, true, new Set([keyOfWrite(followers[0]![0], followers[0]![1])]), prng(59));
    expect(out.steps).not.toBeNull();
    expect(out.steps!.filter((s) => s.startsWith("period:"))).toHaveLength(1);
    expect(startedKeys().has(keyOfWrite(followers[1]![0], followers[1]![1]))).toBe(true);
  });
});

/* ═══════════════════════════════════════════ dvopt T-11 adoption (`COST_WRITES_POLICY`): Land Lease writes retry by kind ══ */

describe("Land Lease writes through the request policy", () => {
  const periodUpdate = (): LeaseWrite[] => [{ op: "update", entitySet: ES.period, id: "p-1", payload: { vsb_name: "x" } }];
  const periodCreate = (): LeaseWrite[] => [{ op: "create", entitySet: ES.period, payload: { tag: 7, vsb_name: "x" }, ref: "period" }];
  const periodDelete = (): LeaseWrite[] => [{ op: "delete", entitySet: ES.period, id: "p-9" }];
  const starts = (table: string, op: string): number =>
    fake.state.events.filter((e) => e.kind === "start" && e.table === table && e.op === op).length;

  /** Runs `work` under fake timers and lets every backoff elapse. */
  async function settle<T>(work: () => Promise<T>): Promise<PromiseSettledResult<T>> {
    vi.useFakeTimers();
    try {
      const run = work().then((value) => ({ status: "fulfilled", value }) as const, (reason: unknown) => ({ status: "rejected", reason }) as const);
      await vi.advanceTimersByTimeAsync(60_000);
      return await run;
    } finally {
      vi.useRealTimers();
    }
  }
  /** The first `n` requests of this table and op are refused with `status`; later ones answer. */
  function refuse(table: string, op: string, status: number, n = 1): void {
    let left = n;
    fake.state.failStatus = status;
    fake.state.fails = (t, o) => t === table && o === op && left-- > 0;
  }

  it("UT-COSTPOLICY-010 a period UPDATE answered 503 is sent again and the plan succeeds (patch: transient is retried)", async () => {
    policyFlag.on = true;
    refuse("period", "update", 503);
    const out = await settle(() => exec.applyLeaseWrites(periodUpdate()));
    expect(out.status).toBe("fulfilled");
    expect(starts("period", "update")).toBe(2);
  });

  it("UT-COSTPOLICY-011 a period CREATE answered 503 is NOT sent again (it may have landed): one request, the error reaches the caller", async () => {
    policyFlag.on = true;
    refuse("period", "create", 503, 9);
    const out = await settle(() => exec.applyLeaseWrites(periodCreate()));
    expect(out.status).toBe("rejected");
    expect(starts("period", "create")).toBe(1);
  });

  it("UT-COSTPOLICY-012 a period CREATE answered 429 (not processed) is sent again and succeeds, the same payload", async () => {
    policyFlag.on = true;
    refuse("period", "create", 429);
    const out = await settle(() => exec.applyLeaseWrites(periodCreate()));
    expect(out.status).toBe("fulfilled");
    const sent = fake.state.events.filter((e) => e.kind === "start" && e.table === "period" && e.op === "create");
    expect(sent).toHaveLength(2);
    expect(sent[1]!.payload).toEqual(sent[0]!.payload);
  });

  it("UT-COSTPOLICY-013 a DELETE answered 503 is sent again and succeeds", async () => {
    policyFlag.on = true;
    refuse("period", "delete", 503);
    const out = await settle(() => exec.applyLeaseWrites(periodDelete()));
    expect(out.status).toBe("fulfilled");
    expect(starts("period", "delete")).toBe(2);
  });

  it("UT-COSTPOLICY-014 a 403 is never retried: one request, the failure is the plan's error", async () => {
    policyFlag.on = true;
    refuse("period", "update", 403, 9);
    const out = await settle(() => exec.applyLeaseWrites(periodUpdate()));
    expect(out.status).toBe("rejected");
    expect(starts("period", "update")).toBe(1);
  });

  it("UT-COSTPOLICY-015 the switch off: a refused write is sent once, whatever the status (the old behaviour)", async () => {
    policyFlag.on = false;
    refuse("period", "update", 503, 9);
    expect((await settle(() => exec.applyLeaseWrites(periodUpdate()))).status).toBe("rejected");
    expect(starts("period", "update")).toBe(1);
  });

  it("UT-COSTPOLICY-016 a retried write leaves the plan's order intact: a refused-then-accepted allocation does not let the period start early", async () => {
    policyFlag.on = true;
    refuse("alloc", "update", 503);
    const writes: LeaseWrite[] = [
      { op: "update", entitySet: ES.allocation, id: "a-1", payload: { tag: 1 } },
      { op: "update", entitySet: ES.period, id: "p-1", payload: { vsb_name: "x" } },
    ];
    const out = await settle(() => exec.applyLeaseWrites(writes));
    expect(out.status).toBe("fulfilled");
    const ev = fake.state.events;
    const lastAllocEnd = Math.max(...ev.filter((e) => e.kind === "end" && e.table === "alloc").map((e) => e.n));
    const periodStart = ev.find((e) => e.kind === "start" && e.table === "period")!.n;
    expect(lastAllocEnd).toBeLessThan(periodStart);
  });
});
