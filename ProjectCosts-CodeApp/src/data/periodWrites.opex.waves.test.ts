/**
 * OPT-11 (optimization programme, B3) — OPEX period save, delete and standard import: waves and requests, recorded FIRST on the
 * unmodified `periodWrites.ts` and then pinned at the new numbers.
 *
 * A request through the host costs one round trip, so the cost of an action is its number of SEQUENTIAL WAVES. Every read and write
 * of the fake below waits until the driver releases it; the requests that wait together are one wave. The existing
 * `periodWrites.test.ts` (UT-PWRITE) keeps pinning the payloads and the order.
 *
 * `UT-PWOPEX-###` is this file's own series.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CostPeriod } from "@/features/cost/costing/model";

type Row = Record<string, unknown>;
interface Call { kind: "read" | "create" | "update" | "delete"; label: string; id?: string; fields?: Row; wave: number; seq: number }

const fake = vi.hoisted(() => {
  const state = {
    calls: [] as { kind: "read" | "create" | "update" | "delete"; label: string; id?: string; fields?: Row; wave: number; seq: number }[],
    wave: 0,
    seq: 0,
    held: [] as (() => void)[],
    inFlight: 0,
    peak: 0,
    rows: {} as Record<string, unknown[]>,
    /** The chain children by head id: the `list OPEX chain children` read answers for the id in its filter. */
    children: {} as Record<string, unknown[]>,
    /** An update / delete / create of this id answers a failure. */
    failing: new Set<string>(),
    newIds: [] as string[],
  };
  async function hold(kind: "read" | "create" | "update" | "delete", label: string, id?: string, fields?: Row): Promise<void> {
    state.calls.push({ kind, label, id, fields, wave: state.wave, seq: state.seq++ });
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    await new Promise<void>((resolve) => state.held.push(resolve));
    state.inFlight -= 1;
  }
  const service = (label: string, idColumn: string) => ({
    getAll: async () => ({ success: true, data: [] }),
    create: async (fields: Row) => {
      await hold("create", label, undefined, fields);
      const id = state.newIds.shift() ?? `${label}-new-${state.seq}`;
      if (state.failing.has(`create:${String(fields["vsb_description"])}`)) return { success: false, error: new Error("refused") };
      return { success: true, data: { [idColumn]: id } };
    },
    update: async (id: string, fields: Row) => {
      await hold("update", label, id, fields);
      if (state.failing.has(id)) return { success: false, error: new Error(`refused ${id}`) };
      return { success: true, data: {} };
    },
    delete: async () => ({ success: true, data: {} }),
  });
  return { state, service, hold };
});

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options?: { filter?: string }) => {
    await fake.hold("read", label);
    if (label === "list OPEX chain children") {
      const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(String(options?.filter))?.[0] ?? "";
      return fake.state.children[id] ?? [];
    }
    return fake.state.rows[label] ?? [];
  },
  deleteRecord: async (_operation: string, _entitySet: string, id: string) => {
    await fake.hold("delete", "opex", id);
    if (fake.state.failing.has(id)) throw new Error(`refused ${id}`);
  },
}));
vi.mock("@/generated/services/Vsb_opexprojectcostsService", () => ({
  Vsb_opexprojectcostsService: fake.service("opex", "vsb_opexprojectcostid"),
}));
vi.mock("@/generated/services/Vsb_landleaseprojectcostsService", () => ({ Vsb_landleaseprojectcostsService: fake.service("llcost", "id") }));
vi.mock("@/generated/services/Vsb_landleaseperiodsService", () => ({ Vsb_landleaseperiodsService: fake.service("llperiod", "id") }));
vi.mock("@/generated/services/Vsb_landleaseallocationwtgsService", () => ({ Vsb_landleaseallocationwtgsService: fake.service("llalloc", "id") }));
vi.mock("@/generated/services/Vsb_opexaccountsService", () => ({ Vsb_opexaccountsService: fake.service("account", "id") }));
vi.mock("@/generated/services/Vsb_opexsubaccountsService", () => ({ Vsb_opexsubaccountsService: fake.service("subaccount", "id") }));
vi.mock("@/generated/services/Vsb_landleasesubaccountsService", () => ({ Vsb_landleasesubaccountsService: fake.service("llsub", "id") }));
vi.mock("@/generated/services/Vsb_devicetypesinprojectsService", () => ({ Vsb_devicetypesinprojectsService: fake.service("device", "id") }));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({ Vsb_generatortypeinprojectsService: fake.service("gen", "id") }));
vi.mock("@/generated/services/Vsb_pvmoduletypeinprojectsService", () => ({ Vsb_pvmoduletypeinprojectsService: fake.service("pv", "id") }));
vi.mock("@/generated/services/Vsb_opexlandleasestandardassumptionsesService", () => ({ Vsb_opexlandleasestandardassumptionsesService: fake.service("assumption", "id") }));
vi.mock("@/generated/services/TransactioncurrenciesService", () => ({ TransactioncurrenciesService: fake.service("currency", "id") }));
vi.mock("@/generated/services/Vsb_countryinflationprofilesService", () => ({ Vsb_countryinflationprofilesService: fake.service("inflation", "id") }));

const writes = await import("./periodWrites");
const { invalidateCurrencies } = await import("./currencies");

/* ─────────────────────────────────────────────────────────────────────────── fixtures */

const PROJECT = "ac3168e6-2b7c-ef11-ac20-6045bda08851";
const BU = "7f4aade5-2b7c-ef11-ac20-000d3a466ab7";
const EURO = "b8b1e37d-1f57-ea11-a811-000d3a4a9d2f";
const OM_ACCOUNT = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d21";
const OTHER_ACCOUNT = "3a1e4d8f-1f57-ea11-a811-000d3a4a9d22";
const OM_SUB = "61a30faa-b7e1-eddc-a5b5-fc1376f538f5";
const OTHER_SUB = "a24d0c2b-ed2a-ee52-ac21-b4b2eb73e752";
const DEVICE = "1b1cb4ed-0b64-effb-b30b-6212d05ad0ff";
const G = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HEAD = G(1);
const CHILD = (n: number): string => G(100 + n);
const CTX = { projectId: PROJECT, owningBusinessUnitId: BU, projectName: "Quellendorf I" };

const referenceRows = (): Record<string, unknown[]> => ({
  "list transaction currencies": [{ transactioncurrencyid: EURO, currencyname: "Euro" }],
  "list transaction currencies (Cost reads)": [{ transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR", statecode: 0 }],
  "list OPEX accounts": [
    { vsb_opexaccountid: OM_ACCOUNT, vsb_name: "Operation & Maintenance", vsb_order: 1 },
    { vsb_opexaccountid: OTHER_ACCOUNT, vsb_name: "Other OPEX Costs", vsb_order: 2 },
  ],
  "list OPEX subaccounts for a period save": [
    { vsb_opexsubaccountid: OM_SUB, vsb_name: "Operation & Maintenance", vsb_order: 1, _vsb_account_value: OM_ACCOUNT },
    { vsb_opexsubaccountid: OTHER_SUB, vsb_name: "Insurance", vsb_order: 1, _vsb_account_value: OTHER_ACCOUNT },
  ],
});

const PERIOD: CostPeriod = {
  id: HEAD, group: "WTG-1630", deviceId: DEVICE, mode: "om", description: "Initialized O&M Contract",
  startDate: "2023-03-24", years: 5, months: 0, currency: "Euro", fixed: 12_000, revenue: 0, perMwh: 4.1, perMw: 0, perWtg: 67_500,
  aggregation: "SUM", frequency: 1, inflation: true, countryInflation: false, inflationYear: 2024, inflationPercent: 2,
  inflationCountryArea: "", threshold: false, align: true, external: false, standard: false, isStartDateStandard: false,
} as CostPeriod;

const childRows = (n: number) => Array.from({ length: n }, (_, i) => ({ vsb_opexprojectcostid: CHILD(i + 1), vsb_name: `name - ${i + 2}` }));

/** Runs `work`, releasing everything that waits at once as one wave. */
/** Releases each wave in reverse order, so a request later in the list answers BEFORE an earlier one (completion order != input order). */
let releaseReversed = false;

async function inWaves<T>(work: () => Promise<T>): Promise<{ result: PromiseSettledResult<T>; waves: number; requests: number }> {
  let done = false;
  let result!: PromiseSettledResult<T>;
  const running = work().then(
    (value) => { result = { status: "fulfilled", value }; },
    (reason: unknown) => { result = { status: "rejected", reason }; },
  ).finally(() => { done = true; });
  let waves = 0;
  while (!done) {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
    const batch = fake.state.held.splice(0);
    if (batch.length > 0) {
      waves += 1;
      fake.state.wave = waves;
      for (const release of (releaseReversed ? batch.reverse() : batch)) release();
    } else if (!done) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await running;
  return { result, waves, requests: fake.state.calls.length };
}

const calls = (): Call[] => fake.state.calls as Call[];
const writesOf = (kind: Call["kind"]): Call[] => calls().filter((c) => c.kind === kind);
const readLabels = (): string[] => writesOf("read").map((c) => c.label);

beforeEach(() => {
  invalidateCurrencies();
  releaseReversed = false;
  const s = fake.state;
  s.calls = []; s.wave = 0; s.seq = 0; s.held = []; s.inFlight = 0; s.peak = 0; s.failing = new Set(); s.newIds = []; s.children = {};
  s.rows = referenceRows();
});

/* ══════════════════════════════════════════════════════════════════ the actions ══ */

describe("OPT-11 OPEX save — requests and waves", () => {
  it("UT-PWOPEX-001 saving a head with 6 children: reads, the row, the child query, then the cascade", async () => {
    fake.state.children[HEAD] = childRows(6);
    const { result, waves } = await inWaves(() => writes.savePeriod(CTX, PERIOD, false));
    expect(outcome(result)).toBe("ok");
    const updates = writesOf("update");
    expect(updates.map((u) => u.id)).toEqual([HEAD, ...Array.from({ length: 6 }, (_, i) => CHILD(i + 1))]);
    // RECORDED on the unmodified module: 3 reference reads together, the head, the child query, then 6 cascade PATCHes one by one
    // = 9 waves, 11 requests. After OPT-11 (no catalogue given): the cascade is one wave = 4 waves, 11 requests.
    expect(waves).toBe(4);
    expect(calls().length).toBe(11);
    expect(writesOf("update").slice(1).every((u) => u.wave === writesOf("update")[1]!.wave)).toBe(true);
  });

  it("UT-PWOPEX-006 with the screen's OPEX catalogue and a warm currency table a head save sends NO reference read: 3 waves, 8 requests", async () => {
    fake.state.children[HEAD] = childRows(6);
    // Warm the shared currency read with one earlier save.
    await inWaves(() => writes.savePeriod(CTX, { ...PERIOD, id: CHILD(1), parentId: HEAD } as CostPeriod, false));
    fake.state.calls = []; fake.state.wave = 0;
    const catalog = {
      accounts: [
        { id: OM_ACCOUNT, name: "Operation & Maintenance", order: 1 }, { id: OTHER_ACCOUNT, name: "Other OPEX Costs", order: 2 },
      ],
      subaccounts: [
        { id: OM_SUB, name: "Operation & Maintenance", order: 1, accountId: OM_ACCOUNT, accountName: "Operation & Maintenance" },
        { id: OTHER_SUB, name: "Insurance", order: 1, accountId: OTHER_ACCOUNT, accountName: "Other OPEX Costs" },
      ],
    };
    const { result, waves } = await inWaves(() => writes.savePeriod({ ...CTX, opexCatalog: catalog }, PERIOD, false));
    expect(outcome(result)).toBe("ok");
    expect(readLabels()).toEqual(["list OPEX chain children"]);
    expect(waves).toBe(3);
    expect(calls().length).toBe(8);
    const head = writesOf("update")[0]!;
    expect(head.fields!["vsb_Subaccount@odata.bind"]).toBe(`/vsb_opexsubaccounts(${OM_SUB})`);
    expect(head.fields!["vsb_Currency@odata.bind"]).toBe(`/transactioncurrencies(${EURO})`);
  });

  it("UT-PWOPEX-007 the save-time currency lookup stays ACTIVE-only: a deactivated currency of that name is not bound", async () => {
    fake.state.rows["list transaction currencies (Cost reads)"] = [
      { transactioncurrencyid: "dead", currencyname: "Euro", isocurrencycode: "EUR", statecode: 1 },
      { transactioncurrencyid: EURO, currencyname: "Euro", isocurrencycode: "EUR", statecode: 0 },
    ];
    await inWaves(() => writes.savePeriod(CTX, { ...PERIOD, id: CHILD(1), parentId: HEAD } as CostPeriod, false));
    expect(writesOf("update")[0]!.fields!["vsb_Currency@odata.bind"]).toBe(`/transactioncurrencies(${EURO})`);
    fake.state.rows["list transaction currencies (Cost reads)"] = [
      { transactioncurrencyid: "dead", currencyname: "Euro", isocurrencycode: "EUR", statecode: 1 },
    ];
    invalidateCurrencies();
    fake.state.calls = [];
    await inWaves(() => writes.savePeriod(CTX, { ...PERIOD, id: CHILD(1), parentId: HEAD } as CostPeriod, false));
    expect(writesOf("update")[0]!.fields).not.toHaveProperty("vsb_Currency@odata.bind");
  });

  it("UT-PWOPEX-002 editing a CHILD period never asks for its (always empty) children", async () => {
    const child = { ...PERIOD, id: CHILD(2), parentId: HEAD, contractId: HEAD, periodIndex: 3 } as CostPeriod;
    fake.state.children[HEAD] = childRows(3);
    const { result, waves } = await inWaves(() => writes.savePeriod(CTX, child, false));
    expect(outcome(result)).toBe("ok");
    // RECORDED before: 4 waves, 6 requests, TWO chain-children reads (the child's own, always empty, and its siblings for the slot).
    // After: the child's own query is gone; the sibling read (period index) stays = 3 waves, 5 requests.
    expect(readLabels().filter((l) => l === "list OPEX chain children")).toHaveLength(1);
    expect(waves).toBe(3);
    expect(calls().length).toBe(5);
  });

  it("UT-PWOPEX-003 a child edit that moves 4 followers: re-chain PATCHes together, the period index read beside them", async () => {
    const book: CostPeriod[] = [
      { ...PERIOD, id: HEAD, startDate: "2023-01-01", years: 1, months: 0 },
      ...[2, 3, 4, 5, 6].map((n) => ({
        ...PERIOD, id: CHILD(n - 1), parentId: HEAD, contractId: HEAD, startDate: `${2022 + n}-01-01`, years: 1, months: 0, periodIndex: n,
      })),
    ] as CostPeriod[];
    const before = book[1]!;
    const edited = { ...before, years: 2 } as CostPeriod;
    fake.state.children[HEAD] = childRows(5);
    const warnings: string[] = [];
    const { result, waves } = await inWaves(() => writes.savePeriod(CTX, edited, false, { before, bookPeriods: book, warnings }));
    expect(outcome(result)).toBe("ok");
    expect(warnings).toEqual([]);
    const rechains = writesOf("update").filter((u) => u.fields && "vsb_startdate" in u.fields && Object.keys(u.fields).length === 1);
    expect(rechains.map((u) => u.id)).toEqual([CHILD(2), CHILD(3), CHILD(4), CHILD(5)]);
    // RECORDED before: 8 waves, 10 requests (reads, row, own children, 4 re-chain PATCHes one by one, the sibling read).
    // After: reads, row, then the 4 re-chain PATCHes and the sibling read together = 3 waves, 9 requests.
    expect(waves).toBe(3);
    expect(calls().length).toBe(9);
    const sibling = writesOf("read").find((r) => r.label === "list OPEX chain children")!;
    expect(sibling.wave).toBe(rechains[0]!.wave);
  });

  it("UT-PWOPEX-004 deleting a head with 6 children: children first, then the head", async () => {
    fake.state.children[HEAD] = childRows(6);
    const { result, waves } = await inWaves(() => writes.deletePeriod({ ...PERIOD, id: HEAD, contractId: HEAD, periodIndex: 1 } as CostPeriod));
    expect(outcome(result)).toBe("ok");
    const deletes = writesOf("delete");
    expect(deletes.map((d) => d.id)).toEqual([...Array.from({ length: 6 }, (_, i) => CHILD(i + 1)), HEAD]);
    // The head is deleted only after every child delete has landed.
    expect(deletes[6]!.wave).toBeGreaterThan(Math.max(...deletes.slice(0, 6).map((d) => d.wave)));
    // RECORDED before: 8 waves (the child query, 6 deletes one by one, the head). After: 3 waves.
    expect(waves).toBe(3);
  });
});

describe("OPT-11 OPEX standard import — requests and waves", () => {
  const assumption = (n: number, description: string) => ({
    vsb_description: description, vsb_period: 952850000 + (n - 1),
    vsb_durationinyears: 2, vsb_durationinmonths: 0, vsb_aggregation: 952850000, vsb_distributionfrequency: 1,
    vsb_useinflationprofile: false, vsb_usecountryinflationprofile: false, _vsb_currency_value: EURO,
  });
  const ARGS = { mode: "om" as const, group: "WTG-1630", deviceId: DEVICE, codDate: "2024-01-01" };

  it("UT-PWOPEX-005 importing a head and 5 later periods: the head first, the tail after it", async () => {
    fake.state.rows["list OPEX / Land Lease standard assumptions"] = [
      assumption(1, "Standard O&M"), ...[2, 3, 4, 5, 6].map((n) => assumption(n, `Standard O&M - ${n}`)),
    ];
    fake.state.newIds = ["head-new", ...Array.from({ length: 5 }, (_, i) => `tail-new-${i + 2}`)];
    const { result, waves } = await inWaves(() => writes.addStandardContract(CTX, ARGS));
    expect(outcome(result)).toBe("ok");
    const creates = writesOf("create");
    expect(creates).toHaveLength(6);
    expect(creates[0]!.fields!["vsb_description"]).toBe("Standard O&M");
    // Every later period is parented on the head's id and the head is created first.
    for (const c of creates.slice(1)) expect(c.fields!["vsb_ParentCost@odata.bind"]).toBe("/vsb_opexprojectcosts(head-new)");
    expect(creates[0]!.wave).toBeLessThan(Math.min(...creates.slice(1).map((c) => c.wave)));
    // The reproduced O-10 date chain (FT-BR-OPEX-089/091): period n starts when the period before it ends.
    expect(creates.map((c) => c.fields!["vsb_startdate"])).toEqual(["2024-01-01", "2026-01-01", "2028-01-01", "2030-01-01", "2032-01-01", "2034-01-01"]);
    // RECORDED before: 9 waves (target reads, existing check, assumptions, then 6 creates one by one). After: 5 (the 5 tail rows together).
    expect(waves).toBe(5);
  });
});

/* ═════════════════════════════════════════════════════ failure semantics under parallel writes ══ */

describe("OPT-11 failure semantics", () => {
  it("UT-PWOPEX-010 a failing cascade tries EVERY child and the warning names the first failure IN ORDER, though a later one answered first", async () => {
    fake.state.children[HEAD] = childRows(6);
    fake.state.failing = new Set([CHILD(2), CHILD(5)]);
    releaseReversed = true;
    const warnings: string[] = [];
    const { result } = await inWaves(() => writes.savePeriod(CTX, PERIOD, false, { before: null, bookPeriods: [], warnings }));
    expect(outcome(result)).toBe("ok");
    expect(writesOf("update").map((u) => u.id)).toHaveLength(7); // the head and all 6 children were tried
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(`refused ${CHILD(2)}`);
    expect(warnings[0]).not.toContain(CHILD(5));
    // Without a sink it still throws, with the same first failure.
    fake.state.calls = [];
    const thrown = await inWaves(() => writes.savePeriod(CTX, PERIOD, false));
    expect(thrown.result.status).toBe("rejected");
    expect(outcome(thrown.result)).toContain(`refused ${CHILD(2)}`);
  });

  it("UT-PWOPEX-011 a failing re-chain PATCH is reported (first in order) and does not stop the other followers or the save", async () => {
    const book: CostPeriod[] = [
      { ...PERIOD, id: HEAD, startDate: "2023-01-01", years: 1, months: 0 },
      ...[2, 3, 4, 5].map((n) => ({ ...PERIOD, id: CHILD(n - 1), parentId: HEAD, contractId: HEAD, startDate: `${2022 + n}-01-01`, years: 1, months: 0, periodIndex: n })),
    ] as CostPeriod[];
    const edited = { ...book[0]!, years: 2 } as CostPeriod;
    fake.state.children[HEAD] = childRows(4);
    fake.state.failing = new Set([CHILD(2), CHILD(3)]);
    releaseReversed = true;
    const warnings: string[] = [];
    const { result } = await inWaves(() => writes.savePeriod(CTX, edited, false, { before: book[0]!, bookPeriods: book, warnings }));
    expect(outcome(result)).toBe("ok");
    const rechained = writesOf("update").filter((u) => u.fields && Object.keys(u.fields).length === 1 && "vsb_startdate" in u.fields);
    expect(rechained).toHaveLength(4);
    // The warning list holds the cascade's failure first (children 2 and 3 fail on the cascade too) and the re-chain's after it.
    expect(warnings.some((w) => w.includes(`refused ${CHILD(2)}`) && w.startsWith("Error: the start dates"))).toBe(true);
  });

  it("UT-PWOPEX-012 deleting a head: a failing child stops further child deletes, the head is NOT deleted, the error is the first in order", async () => {
    fake.state.children[HEAD] = childRows(12);
    fake.state.failing = new Set([CHILD(2), CHILD(4)]);
    releaseReversed = true;
    const { result } = await inWaves(() => writes.deletePeriod({ ...PERIOD, id: HEAD, contractId: HEAD, periodIndex: 1 } as CostPeriod));
    expect(result.status).toBe("rejected");
    expect(outcome(result)).toContain(`refused ${CHILD(2)}`);
    const deletes = writesOf("delete").map((d) => d.id);
    expect(deletes).not.toContain(HEAD);
    // 12 children, 8 at a time: the 4 after the first wave never started.
    expect(deletes).toHaveLength(8);
  });

  it("UT-PWOPEX-013 an import whose head fails creates nothing else; a failing tail row reports the first failure in order", async () => {
    const assumption = (n: number) => ({
      vsb_description: `Standard O&M${n === 1 ? "" : ` - ${n}`}`, vsb_period: 952850000 + (n - 1), vsb_durationinyears: 1, vsb_durationinmonths: 0,
      vsb_aggregation: 952850000, vsb_distributionfrequency: 1, _vsb_currency_value: EURO,
    });
    const ARGS = { mode: "om" as const, group: "WTG-1630", deviceId: DEVICE, codDate: "2024-01-01" };
    fake.state.rows["list OPEX / Land Lease standard assumptions"] = [1, 2, 3, 4, 5].map(assumption);
    fake.state.failing = new Set(["create:Standard O&M"]);
    const headFail = await inWaves(() => writes.addStandardContract(CTX, ARGS));
    expect(headFail.result.status).toBe("rejected");
    expect(writesOf("create")).toHaveLength(1);

    fake.state.calls = [];
    fake.state.failing = new Set(["create:Standard O&M - 3", "create:Standard O&M - 5"]);
    releaseReversed = true;
    const tailFail = await inWaves(() => writes.addStandardContract(CTX, ARGS));
    expect(tailFail.result.status).toBe("rejected");
    expect(writesOf("create")).toHaveLength(5); // head + the 4 tail rows (all fit in one wave of 8)
  });

  it("UT-PWOPEX-014 over 150 random imports every tail row binds the head's id, dates chain as the canvas' loop, rows come out in assumption order", async () => {
    const mulberry = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    for (let seed = 1; seed <= 150; seed += 1) {
      const rand = mulberry(seed);
      const tail = 1 + Math.floor(rand() * 8);
      const years = (n: number) => 1 + ((n * 7 + seed) % 4);
      const rows = [1, ...Array.from({ length: tail }, (_, i) => i + 2)].map((n) => ({
        vsb_description: `Std ${String(n).padStart(2, "0")}`, vsb_period: 952850000 + (n - 1), vsb_durationinyears: years(n), vsb_durationinmonths: 0,
        vsb_aggregation: 952850000, vsb_distributionfrequency: 1, _vsb_currency_value: EURO,
      }));
      fake.state.calls = []; fake.state.held = []; fake.state.wave = 0; fake.state.failing = new Set();
      fake.state.rows["list OPEX / Land Lease standard assumptions"] = rows;
      fake.state.newIds = rows.map((_, i) => G(500 + i));
      releaseReversed = rand() < 0.5;
      const { result, waves } = await inWaves(() => writes.addStandardContract(CTX, { mode: "om", group: "WTG-1630", deviceId: DEVICE, codDate: "2024-01-01" }));
      expect(outcome(result), `seed ${seed}`).toBe("ok");
      const out = (result as PromiseFulfilledResult<CostPeriod[]>).value;
      expect(out.map((p) => p.description), `seed ${seed}: order`).toEqual(rows.map((r) => r.vsb_description));
      expect(out.map((p) => p.periodIndex), `seed ${seed}: slots`).toEqual(rows.map((_, i) => i + 1));
      const head = out[0]!;
      expect(out.slice(1).every((p) => p.parentId === head.id && p.contractId === head.id), `seed ${seed}: parent`).toBe(true);
      // Date chain: period 2 starts when the head ends, each later one when the one before it (by Description) ends.
      let start = "2024-01-01";
      const expected: string[] = [];
      let yearsSoFar = 0;
      rows.forEach((r, i) => { if (i > 0) start = `${2024 + yearsSoFar}-01-01`; expected.push(start); yearsSoFar += r.vsb_durationinyears; });
      expect(out.map((p) => p.startDate), `seed ${seed}: dates`).toEqual(expected);
      const creates = writesOf("create");
      expect(creates, `seed ${seed}: count`).toHaveLength(rows.length);
      expect(creates[0]!.wave, `seed ${seed}: head first`).toBeLessThan(Math.min(...creates.slice(1).map((c) => c.wave)));
      expect(waves, `seed ${seed}: waves`).toBe(5);
    }
  });
});

function outcome(result: PromiseSettledResult<unknown>): string {
  return result.status === "fulfilled" ? "ok" : String((result.reason as Error)?.stack ?? result.reason);
}
