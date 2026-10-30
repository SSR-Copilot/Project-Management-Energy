/**
 * `saveAddCostSheetBulk` — the Save wired to the bulk path (D51 §11), and the `BULK_SAVE`
 * dispatch in front of it. The four operations run as the orchestrator's concurrent graph; each
 * upsert goes out as `CreateMultiple` (new rows) and `UpdateMultiple` (existing rows) in
 * parallel; `UpsertMultiple` is not used.
 *
 * Only the SDK edge is faked: `CreateMultipleService.CreateMultiple` and
 * `UpdateMultipleService.UpdateMultiple` (the transports), and `client.deleteRecord` /
 * `client.fetchAll`. The planner (`buildSavePlan`), the executor (`bulkWrites.ts`) and the
 * orchestrator (`executeSavePlan`) all run for real, so these pin the wiring between them, not
 * each piece on its own (those have their own suites). `executeSavePlan` and `upsertMultiple` are
 * wrapped in spies (calling through) only so the deps and options the wiring passes can be read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Action = "create" | "update";
interface UpsertCall { action: Action; entitySetName: string; targets: Record<string, unknown>[] }
interface DeleteCall { operation: string; tableName: string; id: string }

/** Every `CreateMultiple` / `UpdateMultiple` call, in the order they were SENT. */
let upsertCalls: UpsertCall[] = [];
let deleteCalls: DeleteCall[] = [];
let commentDeletes: string[] = [];
/** Every `fetchAll` label, in call order. */
let reads: { label: string; options: unknown }[] = [];
/** Ids whose delete Dataverse refuses; `deleteRecord` throws for them, as the real one does. */
let refused = new Set<string>();
/** When set, every bulk call (both actions) answers `{ success: false }`. */
let upsertRefused = false;
/** Actions whose bulk calls answer `{ success: false }` (not 501). */
let refusedActions = new Set<Action>();
/**
 * `<action>:<entity set>` keys refused ONCE (`{ success: false }`), then forgotten. Replaces the
 * call-number refusal of the UpsertMultiple era: the orchestrator now overlaps operations, so a
 * call's number no longer names one operation.
 */
let refuseOnce = new Set<string>();
/** When set, the reconcile's cost read fails. */
let costReadFails = false;
/** Ids the phase-0 existence read does NOT find (deleted by someone else). Lower case. */
let goneIds = new Set<string>();
/**
 * Ids that exist in the fake Dataverse, lower case: the fixtures' stored rows, plus every id a
 * successful write sent. The phase-0 read answers only these, so a client-generated id is
 * "new" until a write lands it — what the orchestrator's new-id check sees on a real retry.
 */
let stored = new Set<string>();
/**
 * The legacy path's contract `update`; null = forbidden (the bulk path must never reach it).
 * While set, the cost `update` is allowed too.
 */
let contractUpdate: ((id: string, fields: unknown) => unknown) | null = null;
/** Actions that answer HTTP 501 Not Implemented, as `UpsertMultiple` did against VSBCloud_Dev. */
let notImplemented = new Set<Action>();
/** When set, the per-row upsert fallback (generated `update`) is allowed and recorded here. */
let rowUpsertAllowed = false;
let rowUpserts: string[] = [];
/** While set, `CreateMultiple` waits for it before answering (the deferred fake of UT-028). */
let createGate: Promise<void> | null = null;
/** Bulk calls that have ANSWERED, in completion order (`<action>:<entity set>`). */
let answered: string[] = [];
/** Ids whose delete answers `DataError` 404 because the row is already gone (it leaves `stored`). */
let deleteNotFound = new Set<string>();
/** Ids whose delete answers 404 from the host or route: the row STAYS in `stored` (F-C). */
let deleteRoute404 = new Set<string>();
/** Raw rows the server answers for a `fetchAll` label (the refresh reads); default none. */
let listRows = new Map<string, Record<string, unknown>[]>();
/** While set, the two refresh reads wait for it before answering. */
let readGate: Promise<void> | null = null;
/** When set, the 404 read-back (`check existing` after a delete) fails. */
let readBackFails = false;
/** Ids whose delete answers `DataError` with this status (a refusal that is not 404). */
let deleteStatus = new Map<string, number>();
/** Called as each bulk call is SENT, before it answers: lets a test act "mid-save". */
let onBulk: ((action: Action, entitySetName: string) => void) | null = null;
/** Existence reads and per-row upserts in one ordered stream: `check:<set>` / `row:<set>:<id>`. */
let events: string[] = [];
/** While set, every CONTRACT delete waits for it before answering (a slow server cascade). */
let contractDeleteGate: Promise<void> | null = null;
/** Contract deletes that have ANSWERED (resolved or thrown). */
let contractDeletesAnswered = 0;
/** While set, every COST delete waits for it before answering (a loaded server). */
let costDeleteHold: Promise<void> | null = null;
/** Cost deletes that have ANSWERED (resolved or thrown), and the most ever in flight at once. */
let costDeletesAnswered = 0;
let costDeletesInFlight = 0;
let costDeletesPeak = 0;
/** Per `deleteRecord` call, in call order: how many bulk calls had ANSWERED when it was sent. */
let deleteStartAnswered: number[] = [];
/** Per reconcile cost read, in call order: how many deletes (both tables) had answered by then. */
let deletesAnsweredAtCostRead: number[] = [];
/** When set, `CreateMultiple` refuses a request naming an id that already exists, as Dataverse does. */
let createRefusesExisting = false;

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

vi.mock("./client", () => ({
  fetchAll: async (label: string, _page: unknown, options: unknown) => {
    reads.push({ label, options });
    if (label === "list Add Cost from Table costs") {
      deletesAnsweredAtCostRead.push(contractDeletesAnswered + costDeletesAnswered);
    }
    if (label === "list Add Cost from Table costs" && costReadFails) throw new Error("read failed");
    if (label.startsWith("check existing ")) {
      events.push(`check:${label.slice("check existing ".length)}`);
      if (readBackFails && deleteCalls.length > 0) throw new Error("read-back failed");
      // Answers every stored id in the filter that is not in `goneIds`, keyed by the selected column.
      const { select, filter } = options as { select: string[]; filter: string };
      return (filter.match(GUID) ?? [])
        .filter((id) => stored.has(id.toLowerCase()) && !goneIds.has(id.toLowerCase()))
        .map((id) => ({ [select[0] as string]: id.toUpperCase() })); // case-insensitive match
    }
    const rows = listRows.get(label);
    if (rows) {
      if (readGate) await readGate;
      // Only the rows the filter names (by any GUID in it: their own id or their contract's).
      const named = new Set(((options as { filter?: string }).filter?.match(GUID) ?? []).map((g) => g.toLowerCase()));
      return rows.filter((r) => Object.values(r).some((v) => typeof v === "string" && named.has(v.toLowerCase())));
    }
    return [];
  },
  deleteRecord: async (operation: string, tableName: string, id: string) => {
    deleteCalls.push({ operation, tableName, id });
    deleteStartAnswered.push(answered.length);
    if (tableName === "vsb_capexprojectcontracts") {
      if (contractDeleteGate) await contractDeleteGate;
      contractDeletesAnswered += 1;
    }
    if (tableName === "vsb_capexcosts") {
      costDeletesInFlight += 1;
      costDeletesPeak = Math.max(costDeletesPeak, costDeletesInFlight);
      try {
        if (costDeleteHold) await costDeleteHold;
      } finally {
        costDeletesInFlight -= 1;
        costDeletesAnswered += 1;
      }
    }
    if (refused.has(id)) throw new Error(`${operation}: 403 refused`);
    // As the real one: `unwrap` turns `{ success: false }` into a `DataError` with the HTTP status.
    const { DataError: Err } = await import("@/platform/errors");
    if (deleteNotFound.has(id) || goneIds.has(id.toLowerCase())) {
      stored.delete(id.toLowerCase()); // really gone: the 404 read-back will not find it
      throw new Err(operation, { message: "Does Not Exist", status: 404 }, 404);
    }
    if (deleteRoute404.has(id)) throw new Err(operation, { message: "Resource not found", status: 404 }, 404);
    const status = deleteStatus.get(id);
    if (status !== undefined) throw new Err(operation, { message: "refused", status }, status);
  },
}));

/** The real executor, its `upsertMultiple` wrapped so a test can read the options it was given. */
vi.mock("./bulkWrites", async (importOriginal) => {
  const real = await importOriginal<typeof import("./bulkWrites")>();
  return { ...real, upsertMultiple: vi.fn(real.upsertMultiple) };
});

/** The real orchestrator, wrapped so a test can read the deps it was given. */
vi.mock("./addCostSheetBulk", async (importOriginal) => {
  const real = await importOriginal<typeof import("./addCostSheetBulk")>();
  return { ...real, executeSavePlan: vi.fn(real.executeSavePlan) };
});

const PRIMARY_KEY: Record<string, string> = {
  vsb_capexprojectcontracts: "vsb_capexprojectcontractid",
  vsb_capexcosts: "vsb_capexcostid",
};

/** The fake for both bulk actions: records the call, then answers per the flags above. */
const bulk = (action: Action) => async (entitySetName: string, targets: Record<string, unknown>[]) => {
  upsertCalls.push({ action, entitySetName, targets });
  onBulk?.(action, entitySetName);
  if (action === "create" && createGate) await createGate;
  const key = `${action}:${entitySetName}`;
  answered.push(key);
  if (notImplemented.has(action)) {
    return { success: false, error: { message: "The server returned an HTTP error with code 501.", status: 501 } };
  }
  const once = refuseOnce.delete(key);
  if (upsertRefused || refusedActions.has(action) || once) {
    return { success: false, error: { message: `${action} bulk write refused`, status: 400 } };
  }
  // As Dataverse: `CreateMultiple` refuses the whole request when a target id already exists
  // (duplicate key). Opt-in, so the older tests keep their permissive fake (F7, UT-068).
  if (action === "create" && createRefusesExisting) {
    const pk = PRIMARY_KEY[entitySetName] as string;
    if (targets.some((t) => stored.has(String(t[pk]).toLowerCase()))) {
      return { success: false, error: { message: "Cannot insert duplicate key.", status: 412 } };
    }
  }
  // As Dataverse: `UpdateMultiple` refuses the whole request when a target row does not exist
  // (it never re-creates one). This is what makes skipping the upsert verify safe.
  if (action === "update") {
    const pk = PRIMARY_KEY[entitySetName] as string;
    const missing = targets.some((t) => {
      const id = String(t[pk]).toLowerCase();
      return !stored.has(id) || goneIds.has(id);
    });
    if (missing) return { success: false, error: { message: "Does Not Exist", status: 404 } };
  }
  for (const t of targets) stored.add(String(t[PRIMARY_KEY[entitySetName] as string]).toLowerCase());
  return { success: true, data: {} };
};

vi.mock("@/generated/services/CreateMultipleService", () => ({
  CreateMultipleService: { CreateMultiple: bulk("create") },
}));
vi.mock("@/generated/services/UpdateMultipleService", () => ({
  UpdateMultipleService: { UpdateMultiple: bulk("update") },
}));
/** Retired: reaching it at all is a failure. */
vi.mock("@/generated/services/UpsertMultipleService", () => ({
  UpsertMultipleService: {
    UpsertMultiple: async () => {
      throw new Error("UpsertMultiple must no longer be called");
    },
  },
}));

/** The bulk path must reach none of the per-row generated writes. */
const forbidden = (what: string) => async () => {
  throw new Error(`${what} called on the bulk path`);
};
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({
  Vsb_capexprojectcontractsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: forbidden("contract create"),
    update: async (id: string, fields: unknown) => {
      if (rowUpsertAllowed) {
        rowUpserts.push(`vsb_capexprojectcontracts:${id}`);
        events.push(`row:vsb_capexprojectcontracts:${id}`);
        stored.add(id.toLowerCase());
        return { success: true, data: {} };
      }
      if (contractUpdate === null) throw new Error("contract update called on the bulk path");
      return contractUpdate(id, fields);
    },
    delete: forbidden("raw contract delete"),
  },
}));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({
  Vsb_capexcostsService: {
    getAll: async () => ({ success: true, data: [] }),
    create: async () => ({ success: true, data: { vsb_capexcostid: "c0570000-0000-0000-0000-000000000001" } }),
    // Allowed only while a legacy test has set `contractUpdate`.
    update: async (id: string) => {
      if (rowUpsertAllowed) {
        rowUpserts.push(`vsb_capexcosts:${id}`);
        events.push(`row:vsb_capexcosts:${id}`);
        stored.add(id.toLowerCase());
        return { success: true, data: {} };
      }
      if (contractUpdate === null) throw new Error("cost update called on the bulk path");
      return { success: true, data: {} };
    },
    delete: forbidden("raw cost delete"),
  },
}));
vi.mock("@/generated/services/Vsb_capexcommentsesService", () => ({
  Vsb_capexcommentsesService: {
    getAll: async () => ({ success: true, data: [] }),
    delete: async (id: string) => {
      commentDeletes.push(id);
      return { success: true, data: {} };
    },
  },
}));

// Pulled in transitively through `costBook.ts`; each generated service calls `getClient(...)`
// at class-static init, so every one in this module's import graph is stubbed.
for (const name of [
  "Vsb_capexaccountlistsService", "Vsb_spvdevcomappingcapexdevexesService",
  "Vsb_landleaseprojectcostsService", "Vsb_landleaseperiodsService",
  "Vsb_landleasesubaccountsService", "Vsb_opexsubaccountsService", "Vsb_opexprojectcostsService",
  "Vsb_devicetypesinprojectsService", "Vsb_projectstatesService",
  "Vsb_milestonesstandardassumptionsesService",
]) {
  vi.doMock(`@/generated/services/${name}`, () => ({
    [name]: { getAll: async () => ({ success: true, data: [] }) },
  }));
}

const {
  BULK_SAVE, saveAddCostSheet, saveAddCostSheetBulk, saveAddCostSheetLegacy, toSaveFailure,
  DEFER_CONTRACT_DELETES, BACKGROUND_DELETE_FAILED, backgroundDeleteFailureTexts,
  DEFER_COST_DELETES, COST_DELETE_FAILED_RECONCILED,
  COST_DELETE_FAILED_NOT_RECONCILED, backgroundDeleteLogLine,
} = await import("./addCostSheet");
// The shared bulk sender (`./bulkSend.ts`): the same module instance `./addCostSheet` uses.
const {
  resetBulkWriteAvailability, BULK_PARALLEL_CHUNKS, CONTRACT_DELETE_LIMIT, COST_DELETE_LIMIT,
  formatRequestDuration,
} = await import("./bulkSend");
const { DataError, RecordGoneError, isRecordGone } = await import("@/platform/errors");
const { BulkDeleteError, BulkWriteError, upsertMultiple } = await import("./bulkWrites");
const { RowsGoneError, SavePlanError, executeSavePlan } = await import("./addCostSheetBulk");
type SavePlanDeps = import("./addCostSheetBulk").SavePlanDeps;
const { pendingDeletes } = await import("./pendingDeletes");
/** The `verifyUpserts` dep of every `executeSavePlan` call so far. */
const verifyFlags = () =>
  vi.mocked(executeSavePlan).mock.calls.map((c) => (c[1] as { verifyUpserts?: boolean }).verifyUpserts);
const { SheetConflictError } = await import("@/features/cost/add-costs-from-table/savePlan");
const { ADDCOST_MSG, CHOICE, saveFailureText } = await import("@/features/cost/add-costs-from-table/rules");
type Args = Parameters<typeof saveAddCostSheetBulk>[0];

/* ─────────────────────────────────────────────────────────────── fixtures ── */

/** `idIn`/`guid` reject anything that is not a real GUID, so every stored fixture id is one. */
const PROJECT_ID = "9f5aade5-2b7c-ef11-ac20-000d3a466ab7";
const BU = "0b0b0b0b-1111-2222-3333-444444444444";
const SUB = "33333333-7777-8888-9999-aaaaaaaaaaaa";
const C1 = "c1c1c1c1-7777-8888-9999-aaaaaaaaaaaa";
const DOOMED = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const COST_JAN = "a0000001-0000-4000-8000-000000000001";
const COST_FEB = "a0000002-0000-4000-8000-000000000002";
const COST_DOOMED = "a0000009-0000-4000-8000-000000000009";
const ES_CONTRACTS = "vsb_capexprojectcontracts";
const ES_COSTS = "vsb_capexcosts";

const months = (...head: (number | null)[]) =>
  [...head, ...new Array<number | null>(12 - head.length).fill(null)];

const row = (description: string, projectContractId: string | null, m: (number | null)[], year = 2026) => ({
  rowId: "1", accountNumber: "100", accountName: "Account", description, year,
  costPaidBy: "DevCo", depreciation: "Yes", applyVat: "Yes", months: m,
  subAccountId: SUB, projectContractId,
});

const contract = (id: string, name: string) => ({
  id, name, subaccountId: SUB, isStandardContract: false, initialContractSource: null,
  distribution: null, distributionScheme: null, isEditedFromPcf: false,
  costType: null, depreciation: null, applyVat: null,
});

/**
 * A typical save: C1's January changes (100 → 200) and February is blanked; a brand-new
 * contract "New" gets a January cost; DOOMED (with one cost row) is removed from the sheet.
 */
const typical = (): Args => ({
  projectId: PROJECT_ID,
  owningBusinessUnitId: BU,
  changedRows: [row("C1", C1, months(200, null)), row("New", null, months(10))],
  existingContracts: [contract(C1, "C1"), contract(DOOMED, "Doomed")],
  existingCosts: [
    { id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 },
    { id: COST_FEB, contractId: C1, year: 2026, month: 2, cost: 50 },
    { id: COST_DOOMED, contractId: DOOMED, year: 2026, month: 1, cost: 70 },
  ],
  contractDeleteIds: [DOOMED],
});

const targetsOf = (entitySetName: string, action?: Action) =>
  upsertCalls
    .filter((c) => c.entitySetName === entitySetName && (action === undefined || c.action === action))
    .flatMap((c) => c.targets);

/** `<action>:<entity set>` per bulk call, in send order. */
const callShape = () => upsertCalls.map((c) => `${c.action}:${c.entitySetName}`);

/**
 * The same, sorted. The orchestrator decides which operations overlap (D51 §2), so tests of the
 * ADAPTER compare which calls were made, not their interleaving across operations.
 */
const callSet = () => callShape().sort();

/** The four bulk calls of `typical()`: one per action per table (sorted, as `callSet` is). */
const TYPICAL_CALLS = [
  `create:${ES_CONTRACTS}`, `create:${ES_COSTS}`, `update:${ES_CONTRACTS}`, `update:${ES_COSTS}`,
].sort();

/**
 * Every `<label> (...)` entry of the save's log line for one label, joined. A cost stage's log name
 * (`upsert costs (existing contracts)` / `(new contracts)`, D59) counts as its label; the ms carry
 * a thousands separator.
 */
const logEntries = (line: string, label: string) =>
  [...line.matchAll(new RegExp(`${label}(?: \\((?:existing|new) contracts\\))? \\(([^)]*)\\) [\\d,]+ ms`, "g"))]
    .map((m) => m[1]).join(", ");

const verifyReads = () => reads.filter((r) => r.label.startsWith("check existing "));

type InfoSpy = { mock: { calls: unknown[][] } };
/** Every `console.info` line, without the `[VSB] ACTION ` prefix the request log adds (`platform/requestLog.ts`). */
const infoLines = (info: InfoSpy) => info.mock.calls.map((c) => String(c[0]).replace(/^\[VSB\] ACTION /, ""));
/** The save's own `console.info` lines (success or failure), without the background-delete line. */
const saveLines = (info: InfoSpy) =>
  infoLines(info).filter((l) => l.startsWith("Add Cost from Table save"));
/** The first save line. */
const saveLine = (info: InfoSpy) => saveLines(info)[0] ?? "";
/**
 * The deferred deletes' line (costs and contracts), once they settled. The colon keeps out the
 * `background deletes started: …` lines logged when they are sent (`startLines`).
 */
const backgroundLines = (info: InfoSpy) =>
  infoLines(info)
    .filter((l) => l.startsWith("Add Cost from Table background deletes:"));
/** The `background deletes started: …` lines, one per deferred delete batch sent. */
const startLines = (info: InfoSpy) =>
  infoLines(info)
    .filter((l) => l.startsWith("Add Cost from Table background deletes started:"));

/**
 * An id cache as a retry leaves it: not empty, so the save is not a first attempt and the
 * upsert verify runs. The key is no identity key the planner knows (it ignores it).
 */
const retryCache = () => new Map([["earlier attempt", "e0000000-0000-4000-8000-00000000000e"]]);

/** The rows the fixtures say are already in Dataverse. */
const FIXTURE_ROWS = (): Set<string> => new Set([C1, DOOMED, COST_JAN, COST_FEB, COST_DOOMED]);

beforeEach(() => {
  upsertCalls = [];
  deleteCalls = [];
  commentDeletes = [];
  reads = [];
  refused = new Set();
  upsertRefused = false;
  refusedActions = new Set();
  refuseOnce = new Set();
  costReadFails = false;
  goneIds = new Set();
  stored = FIXTURE_ROWS();
  contractUpdate = null;
  notImplemented = new Set();
  rowUpsertAllowed = false;
  rowUpserts = [];
  createGate = null;
  answered = [];
  deleteNotFound = new Set();
  deleteRoute404 = new Set();
  listRows = new Map();
  readGate = null;
  readBackFails = false;
  deleteStatus = new Map();
  onBulk = null;
  events = [];
  contractDeleteGate = null;
  contractDeletesAnswered = 0;
  costDeleteHold = null;
  costDeletesAnswered = 0;
  costDeletesInFlight = 0;
  costDeletesPeak = 0;
  deleteStartAnswered = [];
  deletesAnsweredAtCostRead = [];
  createRefusesExisting = false;
  vi.mocked(executeSavePlan).mockClear();
  vi.mocked(upsertMultiple).mockClear();
  resetBulkWriteAvailability();
  // The save logs' collapsed groups (D59): kept out of the test output. A test that reads them
  // spies on these itself.
  vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
  vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);
  vi.spyOn(console, "table").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ─────────────────────────────────────────────────────────────────── tests ── */

describe("saveAddCostSheetBulk — the wiring", () => {
  // Was "exactly 2 UpsertMultiple calls: contracts, then costs". Each table now holds one new and
  // one existing row, so it is one CreateMultiple + one UpdateMultiple per table. Which
  // operations overlap is the orchestrator's (D51 §2); the one order that must hold is that a new
  // cost row is created only after the new contract it binds to.
  it("UT-ACSHEET-BULK-001 a typical save makes one CreateMultiple + one UpdateMultiple per table; new costs after new contracts", async () => {
    await saveAddCostSheetBulk(typical());
    expect(callSet()).toEqual(TYPICAL_CALLS);
    expect(callShape().indexOf(`create:${ES_COSTS}`))
      .toBeGreaterThan(callShape().indexOf(`create:${ES_CONTRACTS}`));
  });

  it("UT-ACSHEET-BULK-002 a blanked month of a surviving contract is deleted through deleteRecord", async () => {
    await saveAddCostSheetBulk(typical());
    expect(deleteCalls.filter((d) => d.tableName === ES_COSTS).map((d) => d.id)).toEqual([COST_FEB]);
  });

  it("UT-ACSHEET-BULK-003 a removed contract is deleted through deleteRecord, started before the cost deletes", async () => {
    // The orchestrator runs both deletes in stage A and starts the (cascading, slowest) contract
    // delete first; they touch disjoint rows, so the old cost-then-contract order bought nothing.
    await saveAddCostSheetBulk(typical());
    expect(deleteCalls.map((d) => `${d.tableName}:${d.id}`)).toEqual([
      `${ES_CONTRACTS}:${DOOMED}`, `${ES_COSTS}:${COST_FEB}`,
    ]);
  });

  it("UT-ACSHEET-BULK-004 reads no comments and deletes no comment or cost row of a removed contract (cascade)", async () => {
    await saveAddCostSheetBulk(typical());
    expect(reads.filter((r) => r.label === "list CAPEX comments")).toEqual([]);
    expect(commentDeletes).toEqual([]);
    expect(deleteCalls.map((d) => d.id)).not.toContain(COST_DOOMED);
    // Nor is the doomed contract upserted, or a cost row written under it.
    expect(targetsOf(ES_CONTRACTS).map((t) => t.vsb_capexprojectcontractid)).not.toContain(DOOMED);
  });

  it("UT-ACSHEET-BULK-005 every target carries @odata.type and its primary key", async () => {
    await saveAddCostSheetBulk(typical());
    const contracts = targetsOf(ES_CONTRACTS);
    const costs = targetsOf(ES_COSTS);
    expect(contracts).toHaveLength(2);
    expect(costs).toHaveLength(2);
    for (const t of contracts) {
      expect(t["@odata.type"]).toBe("Microsoft.Dynamics.CRM.vsb_capexprojectcontract");
      expect(typeof t.vsb_capexprojectcontractid).toBe("string");
    }
    for (const t of costs) {
      expect(t["@odata.type"]).toBe("Microsoft.Dynamics.CRM.vsb_capexcost");
      expect(typeof t.vsb_capexcostid).toBe("string");
    }
    expect(contracts.map((t) => t.vsb_capexprojectcontractid)).toContain(C1);
    expect(costs.map((t) => t.vsb_capexcostid)).toContain(COST_JAN);
  });

  it("UT-ACSHEET-BULK-006 new rows carry the owning-BU bind; existing rows do not", async () => {
    await saveAddCostSheetBulk(typical());
    const bu = "owningbusinessunit@odata.bind";
    const [existingContract, newContract] = [
      targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid === C1),
      targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid !== C1),
    ];
    expect(existingContract).not.toHaveProperty(bu);
    expect(String(newContract?.[bu])).toContain(BU);

    const existingCost = targetsOf(ES_COSTS).find((t) => t.vsb_capexcostid === COST_JAN);
    const newCost = targetsOf(ES_COSTS).find((t) => t.vsb_capexcostid !== COST_JAN);
    expect(existingCost).not.toHaveProperty(bu);
    expect(String(newCost?.[bu])).toContain(BU);
    // The new cost binds to the new contract's client-generated id, in the same save.
    expect(String(newCost?.["vsb_Contract@odata.bind"]))
      .toContain(String(newContract?.vsb_capexprojectcontractid));
  });

  it("UT-ACSHEET-BULK-007 BULK_SAVE is on, and saveAddCostSheet dispatches to the bulk path", async () => {
    expect(BULK_SAVE).toBe(true);
    // The per-row services throw here, so reaching them would reject.
    await saveAddCostSheet(typical());
    // Was [contracts, costs] of UpsertMultiple; now both actions per table (see UT-001).
    expect(callSet()).toEqual(TYPICAL_CALLS);
  });

  it("UT-ACSHEET-BULK-008 a refused delete rejects with SavePlanError instead of resolving (rule 14)", async () => {
    refused = new Set([COST_FEB]);
    // Changed (late start of deferred deletes): with DEFER_COST_DELETES the cost delete now starts
    // only after the writes, so it can no longer fail before the Save returns; a refusal is a
    // background failure (UT-ACSHEET-BULK-055). The waiting half pins rule 14 here.
    const failure = await saveAddCostSheetBulk({ ...typical(), deferCostDeletes: false })
      .then(() => null, (e: unknown) => e);
    expect(failure).toBeInstanceOf(SavePlanError);
    expect((failure as InstanceType<typeof SavePlanError>).phase).toBe(3);
    // Phase 4 still runs (deferred, it starts after the writes and the failure path waits for
    // it), so the removed contract is still deleted, and the saved phases make the retry hint appear.
    expect(deleteCalls.map((d) => d.id)).toContain(DOOMED);
    expect((failure as InstanceType<typeof SavePlanError>).committedBefore).toBe(true);
  });

  // With `deferContractDeletes: false` (the rollback half of DEFER_CONTRACT_DELETES). The default,
  // deferred, half: UT-ACSHEET-BULK-050.
  it("UT-ACSHEET-BULK-009 a refused contract delete rejects with SavePlanError phase 4", async () => {
    refused = new Set([DOOMED]);
    await expect(saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false }))
      .rejects.toMatchObject({ name: "SavePlanError", phase: 4 });
  });

  // Was one refused UpsertMultiple and no cost call at all. Both contract groups are now sent in
  // parallel and both are refused; the new contract's cost row is never sent. (Since D51 §2 the
  // orchestrator may overlap the update of an EXISTING contract's cost with phase 1, so "no cost
  // call" narrows to "no cost create".)
  it("UT-ACSHEET-BULK-010 a refused bulk write rejects with SavePlanError phase 1 and sends no new costs", async () => {
    upsertRefused = true;
    await expect(saveAddCostSheetBulk(typical())).rejects.toMatchObject({ name: "SavePlanError", phase: 1 });
    expect(callShape()).toContain(`create:${ES_CONTRACTS}`);
    expect(callShape()).toContain(`update:${ES_CONTRACTS}`);
    expect(callShape()).not.toContain(`create:${ES_COSTS}`);
  });

  it("UT-ACSHEET-BULK-011 the reconcile re-reads costs through the screen's own cost read", async () => {
    refused = new Set([COST_FEB]);
    // Changed (late start): waiting half, as UT-008 — deferred, the reconcile runs in the background.
    await saveAddCostSheetBulk({ ...typical(), deferCostDeletes: false }).catch(() => undefined);
    const costReads = reads.filter((r) => r.label === "list Add Cost from Table costs");
    expect(costReads).toHaveLength(1);
    const options = costReads[0]?.options as { filter: string } | undefined;
    expect(options?.filter).toContain(C1);
  });
});

describe("toSaveFailure + saveFailureText — how a failed Save reads", () => {
  it("UT-ACSHEET-BULK-012 names the failed phase after the canvas wording", async () => {
    refused = new Set([DOOMED]);
    // The waiting path: deferred, a refused contract delete never reaches the Save (UT-050).
    const e = await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false })
      .catch((err: unknown) => err);
    expect(toSaveFailure(e)).toEqual({ kind: "phase", phase: 4, reconciled: true, committedBefore: true });
    const text = saveFailureText(toSaveFailure(e));
    expect(text.startsWith(ADDCOST_MSG.saveFailed)).toBe(true);
    expect(text).toContain("step 4 of 4 (deleting contracts)");
  });

  it("UT-ACSHEET-BULK-013 says the totals may need a reload when the reconcile could not run", async () => {
    refused = new Set([COST_FEB]);
    costReadFails = true;
    // Changed (late start): waiting half, as UT-008 (deferred: UT-ACSHEET-BULK-056).
    const e = await saveAddCostSheetBulk({ ...typical(), deferCostDeletes: false })
      .catch((err: unknown) => err);
    expect((e as InstanceType<typeof SavePlanError>).reconciled).toBe(false);
    const text = saveFailureText(toSaveFailure(e));
    expect(text).toContain("step 3 of 4 (deleting costs)");
    expect(text).toContain("reload the screen before saving again");
  });

  it("UT-ACSHEET-BULK-014 keeps the plain canvas wording for any other failure", () => {
    expect(toSaveFailure(new Error("boom"))).toEqual({ kind: "other" });
    expect(saveFailureText(toSaveFailure(new Error("boom")))).toBe(ADDCOST_MSG.saveFailed);
  });
});

describe("saveAddCostSheetBulk — stable ids across a retry (finding 1)", () => {
  it("UT-ACSHEET-BULK-015 a retry after a phase-2 failure sends the SAME new ids and completes", async () => {
    const idCache = new Map<string, string>();
    // Was "call 2" (the cost UpsertMultiple). Now the cost CreateMultiple is refused once; the
    // contracts and the existing cost's UpdateMultiple land, so phase 2 fails part-way, exactly
    // the retry case.
    refuseOnce = new Set([`create:${ES_COSTS}`]);
    const first = await saveAddCostSheetBulk({ ...typical(), idCache }).then(() => null, (e: unknown) => e);
    expect(first).toBeInstanceOf(SavePlanError);
    expect((first as InstanceType<typeof SavePlanError>).phase).toBe(2);
    expect((first as InstanceType<typeof SavePlanError>).committedBefore).toBe(true);

    // Sorted and de-duplicated: on the retry a landed "new" id may travel as an update, so the
    // send order of the groups can differ, and the reconcile re-sends contract totals; the SET
    // of ids may not differ.
    const ids = (es: string, key: string) =>
      [...new Set(targetsOf(es).map((t) => String(t[key])))].sort();
    const firstContracts = ids(ES_CONTRACTS, "vsb_capexprojectcontractid");
    const firstCosts = ids(ES_COSTS, "vsb_capexcostid");
    expect(idCache.size).toBe(2); // one new contract, one new cost

    upsertCalls = [];
    await saveAddCostSheetBulk({ ...typical(), idCache });

    const retryContracts = ids(ES_CONTRACTS, "vsb_capexprojectcontractid");
    const retryCosts = ids(ES_COSTS, "vsb_capexcostid");
    expect(retryContracts).toEqual(firstContracts);
    expect(retryCosts).toEqual(firstCosts);
    expect(idCache.size).toBe(2); // no new GUID was issued
    expect(deleteCalls.map((d) => d.id)).toContain(DOOMED); // the retry ran to the end
  });

  it("UT-ACSHEET-BULK-016 without a shared cache each attempt issues fresh ids (the bug the cache fixes)", async () => {
    refuseOnce = new Set([`create:${ES_COSTS}`]); // was "call 2": as in UT-015
    await saveAddCostSheetBulk(typical()).catch(() => undefined);
    const firstNew = targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid !== C1);
    upsertCalls = [];
    await saveAddCostSheetBulk(typical());
    const retryNew = targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid !== C1);
    expect(retryNew?.vsb_capexprojectcontractid).not.toBe(firstNew?.vsb_capexprojectcontractid);
  });
});

describe("saveAddCostSheetBulk — the phase-0 existence read (finding 2)", () => {
  it("UT-ACSHEET-BULK-017 selects the primary key only, filters ids on the server, in chunks of 40", async () => {
    // 4 years × 12 stored months, all changed: 48 existing cost targets + 1 delete-free sheet.
    const years = [2026, 2027, 2028, 2029];
    const id = (y: number, m: number) => `b${y}${String(m).padStart(3, "0")}-0000-4000-8000-000000000000`;
    const existingCosts = years.flatMap((y) =>
      Array.from({ length: 12 }, (_, i) => ({ id: id(y, i + 1), contractId: C1, year: y, month: i + 1, cost: 1 })));
    for (const c of existingCosts) stored.add(c.id.toLowerCase());
    // A retry: a first attempt skips the upsert verify (UT-037), and this pins the read's shape.
    await saveAddCostSheetBulk({
      idCache: retryCache(),
      projectId: PROJECT_ID,
      changedRows: years.map((y) => row("C1", C1, new Array<number>(12).fill(2), y)),
      existingContracts: [contract(C1, "C1")],
      existingCosts,
      contractDeleteIds: [],
    });

    const costChecks = verifyReads().filter((r) => r.label === `check existing ${ES_COSTS}`);
    const contractChecks = verifyReads().filter((r) => r.label === `check existing ${ES_CONTRACTS}`);
    expect(costChecks).toHaveLength(2); // 48 ids → 40 + 8
    expect(contractChecks).toHaveLength(1);
    const sizes = costChecks.map((r) => ((r.options as { filter: string }).filter.match(GUID) ?? []).length);
    expect(sizes.sort((a, b) => b - a)).toEqual([40, 8]);
    for (const r of [...costChecks, ...contractChecks]) {
      const { select, filter } = r.options as { select: string[]; filter: string };
      expect(select).toHaveLength(1);
      expect(filter).not.toContain("statecode");
      expect(filter).toMatch(/^(\(?vsb_capex(cost|projectcontract)id eq [0-9a-f-]{36}\)?( or )?)+$/);
    }
    const selectOf = (r: { options: unknown } | undefined) => (r?.options as { select?: string[] } | undefined)?.select;
    expect(selectOf(costChecks[0])).toEqual(["vsb_capexcostid"]);
    expect(selectOf(contractChecks[0])).toEqual(["vsb_capexprojectcontractid"]);
    // The phase-0 read is the first read of the save (phase order itself: UT-ACBULK-018).
    expect(reads.findIndex((r) => r.label.startsWith("check existing "))).toBe(0);
    // Every row exists, so it is one UpdateMultiple per table and no CreateMultiple at all.
    expect(callSet()).toEqual([`update:${ES_CONTRACTS}`, `update:${ES_COSTS}`].sort());
  });

  it("UT-ACSHEET-BULK-018 an existing cost deleted by someone else stops the save before any upsert", async () => {
    goneIds = new Set([COST_JAN]);
    // A retry, so the upsert verify runs (a first attempt relies on UpdateMultiple instead: UT-037).
    const e = await saveAddCostSheetBulk({ ...typical(), idCache: retryCache() })
      .then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(RowsGoneError);
    // Was "no write at all". The deletes now start at t = 0, beside the verify (D51 §11.11), so
    // they may have run, and when a cost delete landed the orchestrator rewrites the totals it
    // feeds. None of the plan's own upserts is sent: every bulk call is a total-only update.
    expect(callShape().filter((c) => c.startsWith("create:"))).toEqual([]);
    for (const t of upsertCalls.flatMap((c) => c.targets)) {
      expect(Object.keys(t).sort()).toEqual(["@odata.type", "vsb_capexprojectcontractid", "vsb_totalcost"]);
    }
    // February's delete landed beside the verify, so "Nothing was saved" would be false (F-B).
    expect(toSaveFailure(e)).toEqual({ kind: "gone", contracts: 0, costs: 1, committedBefore: true });
  });

  it("UT-ACSHEET-BULK-019 a removed row that is already gone is not refused", async () => {
    goneIds = new Set([COST_FEB, DOOMED]);
    await saveAddCostSheetBulk(typical());
    // Was "dropped by the verify, never sent". The deletes are no longer verified: each is sent
    // and its 404 counts as done (UT-035).
    for (const d of deleteCalls) expect([COST_FEB, DOOMED]).toContain(d.id);
    // Was [contracts, costs]; both actions per table now (see UT-001).
    expect(callSet()).toEqual(TYPICAL_CALLS);
  });
});

describe("toSaveFailure — every kind", () => {
  it("UT-ACSHEET-BULK-020 maps conflict, gone, phase and other", () => {
    expect(toSaveFailure(new SheetConflictError("Two rows.", "tech"))).toEqual({ kind: "conflict", detail: "Two rows." });
    const requests = { verify: 1, contracts: 0, costs: 0, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 1 };
    expect(toSaveFailure(new RowsGoneError({ contracts: 2, costs: 3 }, requests)))
      .toEqual({ kind: "gone", contracts: 2, costs: 3, committedBefore: false });
    const phase = new SavePlanError({
      phase: 2, cause: new Error("x"), reconciled: false, committedBefore: true, requests,
    });
    expect(toSaveFailure(phase)).toEqual({ kind: "phase", phase: 2, reconciled: false, committedBefore: true });
    expect(toSaveFailure("refused")).toEqual({ kind: "other" });
    expect(toSaveFailure(undefined)).toEqual({ kind: "other" });
  });

  it("UT-ACSHEET-BULK-021 an ambiguous sheet surfaces the planner's conflict detail, with nothing sent", async () => {
    // Two different rows point C1 at the same 2026 January cell.
    const args: Args = {
      ...typical(),
      changedRows: [row("C1", C1, months(200)), { ...row("C1", C1, months(300)), rowId: "2" }],
    };
    const e = await saveAddCostSheetBulk(args).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SheetConflictError);
    const failure = toSaveFailure(e);
    expect(failure.kind).toBe("conflict");
    expect(saveFailureText(failure)).toContain("Nothing was saved");
    expect(upsertCalls).toEqual([]);
    expect(verifyReads()).toEqual([]);
  });
});

describe("saveAddCostSheetLegacy — the total update is unwrapped (rule 3, finding 6)", () => {
  it("UT-ACSHEET-BULK-022 a refused contract-total update rejects the legacy save", async () => {
    contractUpdate = (_id, fields) => ("vsb_totalcost" in (fields as object)
      ? { success: false, error: new Error("403 total refused") }
      : { success: true, data: {} });
    await expect(saveAddCostSheetLegacy({
      projectId: PROJECT_ID,
      changedRows: [row("C1", C1, months(100))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    })).rejects.toThrow();
  });

  it("UT-ACSHEET-BULK-023 an accepted contract-total update lets the legacy save resolve", async () => {
    const totals: unknown[] = [];
    contractUpdate = (_id, fields) => {
      if ("vsb_totalcost" in (fields as object)) totals.push((fields as { vsb_totalcost: unknown }).vsb_totalcost);
      return { success: true, data: {} };
    };
    await saveAddCostSheetLegacy({
      projectId: PROJECT_ID,
      changedRows: [row("C1", C1, months(100))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    });
    expect(totals).toEqual([100]);
  });
});

describe("saveAddCostSheetBulk — a bulk action answers 501 Not Implemented (as UpsertMultiple did on VSBCloud_Dev, 27 Oct)", () => {
  it("UT-ACSHEET-BULK-024 both actions 501: each falls back to one per-row upsert per planned target and completes", async () => {
    notImplemented = new Set(["create", "update"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(typical());
    // Was ONE refused UpsertMultiple, then none. Now each action is refused on its first
    // attempt. Operations the orchestrator overlaps with the contract upsert (D51 §2) may have
    // their own request in flight before the first 501 lands — at most one per table here — but
    // the new cost, sent after the contracts, never tries bulk again. Every contract and cost
    // target of the plan then goes per row exactly once.
    expect(callShape().filter((c) => c === `create:${ES_CONTRACTS}`)).toHaveLength(1);
    expect(callShape()).not.toContain(`create:${ES_COSTS}`);
    expect(callShape().filter((c) => c.startsWith("update:")).length).toBeLessThanOrEqual(2);
    const contracts = rowUpserts.filter((r) => r.startsWith(`${ES_CONTRACTS}:`));
    const costs = rowUpserts.filter((r) => r.startsWith(`${ES_COSTS}:`));
    expect(contracts).toHaveLength(2); // C1 (fields + total) and the new contract
    expect(costs).toHaveLength(2); // C1's January and the new contract's January
    expect(contracts).toContain(`${ES_CONTRACTS}:${C1}`);
    expect(costs).toContain(`${ES_COSTS}:${COST_JAN}`);
    // Deletes are unchanged: the blanked February and the removed contract (order: orchestrator's).
    expect(deleteCalls.map((d) => `${d.tableName}:${d.id}`).sort()).toEqual([
      `${ES_COSTS}:${COST_FEB}`, `${ES_CONTRACTS}:${DOOMED}`,
    ].sort());
  });

  it("UT-ACSHEET-BULK-025 a refusal that is not 501, on either action, does NOT fall back and still fails phase 1", async () => {
    upsertRefused = true;
    rowUpsertAllowed = true;
    await expect(saveAddCostSheetBulk(typical())).rejects.toMatchObject({ name: "SavePlanError", phase: 1 });
    expect(rowUpserts).toEqual([]);
    // Unchanged intent; now pinned per action: a 400 sets neither action's 501 flag.
    upsertCalls = [];
    upsertRefused = false;
    await saveAddCostSheetBulk(typical());
    expect(callShape()).toContain(`create:${ES_CONTRACTS}`);
    expect(callShape()).toContain(`update:${ES_CONTRACTS}`);
  });

  it("UT-ACSHEET-BULK-026 after a 501 on both actions the rest of the session skips both bulk actions", async () => {
    notImplemented = new Set(["create", "update"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(typical());
    upsertCalls = [];
    notImplemented = new Set(); // even if the route came back, the session flag holds
    await saveAddCostSheetBulk(typical());
    expect(upsertCalls).toEqual([]);
  });
});

describe("saveAddCostSheetBulk — CreateMultiple + UpdateMultiple, split by isNew", () => {
  it("UT-ACSHEET-BULK-027 new rows go only to CreateMultiple and existing rows only to UpdateMultiple", async () => {
    await saveAddCostSheetBulk(typical());
    const ids = (es: string, action: Action, key: string) => targetsOf(es, action).map((t) => t[key]);
    expect(ids(ES_CONTRACTS, "update", "vsb_capexprojectcontractid")).toEqual([C1]);
    const newContract = ids(ES_CONTRACTS, "create", "vsb_capexprojectcontractid");
    expect(newContract).toHaveLength(1);
    expect(newContract).not.toContain(C1);
    expect(ids(ES_COSTS, "update", "vsb_capexcostid")).toEqual([COST_JAN]);
    const newCost = ids(ES_COSTS, "create", "vsb_capexcostid");
    expect(newCost).toHaveLength(1);
    expect(newCost).not.toContain(COST_JAN);
    // The new rows carry the owning-BU bind, the updates do not (rule 4).
    for (const t of targetsOf(ES_CONTRACTS, "create")) expect(t).toHaveProperty("owningbusinessunit@odata.bind");
    for (const t of targetsOf(ES_COSTS, "update")) expect(t).not.toHaveProperty("owningbusinessunit@odata.bind");
  });

  it("UT-ACSHEET-BULK-028 the two groups of a phase are sent in parallel, and the phase waits for both", async () => {
    let release: () => void = () => undefined;
    createGate = new Promise<void>((resolve) => { release = resolve; });
    const save = saveAddCostSheetBulk(typical());
    // The update group is SENT and ANSWERED while the create group is still unanswered.
    await vi.waitFor(() => expect(answered).toContain(`update:${ES_CONTRACTS}`));
    expect(callShape()).toContain(`create:${ES_CONTRACTS}`);
    expect(answered).not.toContain(`create:${ES_CONTRACTS}`);
    // The contract upsert has not resolved: the new contract's cost row (which waits for it)
    // is not sent while the create group is still out.
    await new Promise((r) => setTimeout(r, 10));
    expect(callShape()).not.toContain(`create:${ES_COSTS}`);
    createGate = null;
    release();
    await save;
    expect(answered.filter((a) => a.startsWith("create:"))).toHaveLength(2);
  });

  it("UT-ACSHEET-BULK-029 a 501 on CreateMultiple only sends the creates per row; updates stay bulk", async () => {
    notImplemented = new Set(["create"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(typical());
    // One refused CreateMultiple (contracts), none for the new cost; UpdateMultiple for both tables.
    expect(callSet()).toEqual([`create:${ES_CONTRACTS}`, `update:${ES_CONTRACTS}`, `update:${ES_COSTS}`].sort());
    // Exactly the two NEW rows went per row; C1 and COST_JAN did not.
    expect(rowUpserts).toHaveLength(2);
    expect(rowUpserts.some((r) => r.startsWith(`${ES_CONTRACTS}:`))).toBe(true);
    expect(rowUpserts.some((r) => r.startsWith(`${ES_COSTS}:`))).toBe(true);
    expect(rowUpserts).not.toContain(`${ES_CONTRACTS}:${C1}`);
    expect(rowUpserts).not.toContain(`${ES_COSTS}:${COST_JAN}`);
  });

  it("UT-ACSHEET-BULK-030 the 501 session flags are per action, in sessionStorage, and the reset clears both", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    });
    notImplemented = new Set(["create"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(typical());
    expect(storage.get("vsb.addCostSheet.createMultiple501")).toBe("1");
    expect(storage.has("vsb.addCostSheet.updateMultiple501")).toBe(false);

    // Next save: create still skipped, update still bulk.
    upsertCalls = [];
    notImplemented = new Set();
    await saveAddCostSheetBulk(typical());
    expect(callSet()).toEqual([`update:${ES_CONTRACTS}`, `update:${ES_COSTS}`].sort());

    resetBulkWriteAvailability();
    expect(storage.size).toBe(0);
    upsertCalls = [];
    await saveAddCostSheetBulk(typical());
    expect(callShape().filter((c) => c.startsWith("create:"))).toHaveLength(2);
  });

  it("UT-ACSHEET-BULK-031 a non-501 refusal of ONE group rejects after both settle, with nothing hidden", async () => {
    refusedActions = new Set(["update"]);
    rowUpsertAllowed = true;
    const e = await saveAddCostSheetBulk(typical()).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SavePlanError);
    const plan = e as InstanceType<typeof SavePlanError>;
    expect(plan.phase).toBe(1);
    // Both contract groups were sent and answered; the create landed, nothing fell back to per row.
    expect(answered).toContain(`create:${ES_CONTRACTS}`);
    expect(answered).toContain(`update:${ES_CONTRACTS}`);
    const newContract = targetsOf(ES_CONTRACTS, "create")[0]?.vsb_capexprojectcontractid;
    expect(stored.has(String(newContract).toLowerCase())).toBe(true);
    expect(rowUpserts).toEqual([]);
    // The cause is a plain DataError: the Dataverse status and detail survive, but no commit
    // count does, because neither group is a prefix of the phase's rows.
    const cause = plan.cause;
    expect(cause).toBeInstanceOf(DataError);
    expect(cause).not.toBeInstanceOf(BulkWriteError);
    expect((cause as InstanceType<typeof DataError>).status).toBe(400);
    expect(cause).not.toHaveProperty("rowsCommitted");
    expect(cause).not.toHaveProperty("chunksCommitted");
    expect(String((cause as Error).message)).toContain("update bulk write refused");
    expect(String((cause as Error).message)).toContain("the update group failed while the create group");
    // Counts unknown → the orchestrator reconciles cautiously (a cost re-read).
    expect(reads.filter((r) => r.label === "list Add Cost from Table costs").length).toBeGreaterThan(0);
  });

  it("UT-ACSHEET-BULK-032 when only one group has rows its BulkWriteError is rethrown with its exact counts", async () => {
    refusedActions = new Set(["update"]);
    const e = await saveAddCostSheetBulk({
      projectId: PROJECT_ID,
      changedRows: [row("C1", C1, months(200))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    }).then(() => null, (err: unknown) => err);
    const cause = (e as InstanceType<typeof SavePlanError>).cause;
    expect(cause).toBeInstanceOf(BulkWriteError);
    expect(cause).toMatchObject({ rowsCommitted: 0, chunksCommitted: 0 });
    expect(callShape().filter((c) => c.endsWith(`:${ES_CONTRACTS}`))).toEqual([`update:${ES_CONTRACTS}`]);
  });

  it("UT-ACSHEET-BULK-033 the single save log names each upsert/delete with its request counts and path", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // Waiting, so both deletes' own entries are in the line (deferred: UT-ACSHEET-BULK-049, 054).
    await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    // One SAVE line; the deferred contract deletes log their own line when they settle.
    expect(saveLines(info)).toHaveLength(1);
    const line = saveLine(info);
    // One deps.upsert call for the contracts carries both groups. Changed (per-request timing):
    // each bulk group now names its request's own duration in brackets.
    expect(line).toMatch(/upsert contracts \(create 1 req bulk \[\d+ ms\], update 1 req bulk \[\d+ ms\]\) \d+ ms/);
    // The orchestrator may split the costs into more than one call (D51 §2); together they hold
    // one bulk request per action.
    const costs = logEntries(line, "upsert costs");
    expect(costs).toMatch(/create 1 req bulk \[\d+ ms\]/);
    expect(costs).toMatch(/update 1 req bulk \[\d+ ms\]/);
    expect(line).toMatch(/delete costs 1 req \d+ ms/);
    expect(line).toMatch(/delete contracts 1 req \d+ ms/);
    expect(line).toMatch(/^Add Cost from Table save: \d+ ms, \d+ requests \(/);
  });

  it("UT-ACSHEET-BULK-034 the log says when an action went per row after a 501, and when it skipped bulk", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    notImplemented = new Set(["create"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(typical());
    const line = saveLine(info);
    // Contracts: the refused CreateMultiple + 1 row = 2 requests. The new cost: 1 row, bulk
    // skipped because the session already saw the 501.
    // Changed (per-request timing): only the bulk path carries the bracketed durations.
    expect(line).toMatch(/upsert contracts \(create 2 req per-row after 501, update 1 req bulk \[\d+ ms\]\)/);
    const costs = logEntries(line, "upsert costs");
    expect(costs).toContain("create 1 req per-row since an earlier 501");
    expect(costs).toMatch(/update 1 req bulk \[\d+ ms\]/);
  });
});

describe("saveAddCostSheetBulk — performance follow-ups (D51 §11.11)", () => {
  /** The save's single log line (success or failure). */
  const logLine = saveLine;

  it("UT-ACSHEET-BULK-035 a delete answering 404 resolves, and is counted as already gone", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // Both rows exist when the save starts (any verify sees them); the deletes then find them gone.
    deleteNotFound = new Set([COST_FEB, DOOMED]);
    // Waiting, so the contract delete's 404 is in the save line (deferred, it is in neither for sure).
    // Changed (late start): the cost delete waits too — deferred, it now starts after the writes
    // and cannot have answered by the time the save line is written.
    await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    expect(deleteCalls.map((d) => d.id).sort()).toEqual([COST_FEB, DOOMED].sort());
    expect(logLine(info)).toContain("2 already gone");
  });

  it("UT-ACSHEET-BULK-036 a delete refused with 403 (a DataError, not 404) still rejects (rule 14)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    deleteStatus = new Map([[COST_FEB, 403]]);
    // Waiting (the rollback half of DEFER_COST_DELETES); deferred, the same refusal is a background
    // failure (UT-ACSHEET-BULK-055).
    const e = await saveAddCostSheetBulk({ ...typical(), deferCostDeletes: false })
      .then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SavePlanError);
    expect((e as InstanceType<typeof SavePlanError>).phase).toBe(3);
    expect(logLine(info)).toMatch(/^Add Cost from Table save failed after \d+ ms/);
    expect(logLine(info)).toContain("0 already gone");
  });

  it("UT-ACSHEET-BULK-037 a first attempt skips the upsert verify; a gone stored row is refused by UpdateMultiple, not re-created", async () => {
    await saveAddCostSheetBulk(typical());
    expect(verifyFlags()).toEqual([false]);
    // No phase-0 read of the upsert targets (G1's orchestrator honours the flag).
    expect(verifyReads()).toEqual([]);
    expect(callSet()).toEqual(TYPICAL_CALLS);

    // The safety argument, observed: the row is gone, UpdateMultiple refuses, nothing re-creates it.
    upsertCalls = [];
    goneIds = new Set([COST_JAN]);
    const e = await saveAddCostSheetBulk(typical()).then(() => null, (err: unknown) => err);
    expect(verifyFlags()).toEqual([false, false]);
    expect(e).toBeInstanceOf(SavePlanError);
    expect((e as InstanceType<typeof SavePlanError>).phase).toBe(2);
    expect(rowUpserts).toEqual([]);
    expect(targetsOf(ES_COSTS, "create").map((t) => t.vsb_capexcostid)).not.toContain(COST_JAN);
  });

  it("UT-ACSHEET-BULK-038 a retry, or a per-row flag for either action, keeps the verify on", async () => {
    // A retry: the id cache already held ids before planning.
    await saveAddCostSheetBulk({ ...typical(), idCache: retryCache() });
    expect(verifyFlags()).toEqual([true]);
    expect(verifyReads().length).toBeGreaterThan(0);

    // UpdateMultiple flagged per-row for the session: an update would be a PATCH upsert.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rowUpsertAllowed = true;
    notImplemented = new Set(["update"]);
    await saveAddCostSheetBulk(typical()); // first save: skipped, then the 501 sets the flag
    await saveAddCostSheetBulk(typical());
    expect(verifyFlags()).toEqual([true, false, true]);

    // CreateMultiple flagged per-row (the update flag cleared).
    resetBulkWriteAvailability();
    notImplemented = new Set(["create"]);
    await saveAddCostSheetBulk(typical());
    await saveAddCostSheetBulk(typical());
    expect(verifyFlags()).toEqual([true, false, true, false, true]);
  });

  it("UT-ACSHEET-BULK-039 an UpdateMultiple 501 mid-save, verify skipped: ids are re-checked before the per-row sends, and a gone one is not sent", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    notImplemented = new Set(["update"]);
    rowUpsertAllowed = true;
    // COST_JAN is deleted by someone else once the save is already writing (after any verify).
    onBulk = (action) => { if (action === "update") goneIds.add(COST_JAN.toLowerCase()); };
    const e = await saveAddCostSheetBulk(typical()).then(() => null, (err: unknown) => err);
    expect(verifyFlags()).toEqual([false]);

    // The gone cost row was NOT re-created by a PATCH; the existing contract was sent, after its check.
    expect(rowUpserts).not.toContain(`${ES_COSTS}:${COST_JAN}`);
    expect(rowUpserts).toContain(`${ES_CONTRACTS}:${C1}`);
    // Verify was skipped, so phase 0 read no contract: the first contract check is the guard's.
    const firstCheck = events.indexOf(`check:${ES_CONTRACTS}`);
    expect(firstCheck).toBeGreaterThanOrEqual(0);
    expect(firstCheck).toBeLessThan(events.indexOf(`row:${ES_CONTRACTS}:${C1}`));
    const costCheck = reads.filter((r) => r.label === `check existing ${ES_COSTS}`).at(-1);
    expect((costCheck?.options as { filter: string } | undefined)?.filter).toContain(COST_JAN);

    // The save reports it: phase 2 failed, the cause a "gone" error with nothing of that group sent.
    expect(e).toBeInstanceOf(SavePlanError);
    const plan = e as InstanceType<typeof SavePlanError>;
    expect(plan.phase).toBe(2);
    expect(isRecordGone(plan.cause)).toBe(true);
    expect(plan.cause).toMatchObject({ rowsCommitted: 0, chunksCommitted: 0 });
    expect(logLine(info)).toContain("verify skipped");
  });

  it("UT-ACSHEET-BULK-040 the log line carries the gate peak, the request duration stats and the verify state", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // CreateMultiple takes ~40 ms, so the max request duration is measurable.
    createGate = new Promise<void>((resolve) => { setTimeout(resolve, 40); });
    await saveAddCostSheetBulk(typical());
    const line = logLine(info);
    const m = /; gate peak (\d+)\/16, req avg (\d+) ms max (\d+) ms, verify (skipped|ran), (\d+) already gone$/.exec(line);
    expect(m, line).not.toBeNull();
    const [, peak, avg, max, verify, gone] = m as RegExpExecArray;
    // Contract delete, cost delete and both contract groups start together.
    expect(Number(peak)).toBeGreaterThanOrEqual(2);
    expect(Number(peak)).toBeLessThanOrEqual(16);
    expect(Number(max)).toBeGreaterThanOrEqual(30);
    expect(Number(avg)).toBeLessThanOrEqual(Number(max));
    expect(verify).toBe("skipped");
    expect(gone).toBe("0");

    // Reset per save: a second, fast save does not inherit the first one's maximum.
    info.mockClear();
    createGate = null;
    await saveAddCostSheetBulk({ ...typical(), idCache: retryCache() });
    const second = /req avg \d+ ms max (\d+) ms, verify (\w+)/.exec(logLine(info));
    expect(Number(second?.[1])).toBeLessThan(30);
    expect(second?.[2]).toBe("ran");
  });
});

describe("saveAddCostSheetBulk — the evaluator's findings F-A, F-B, F-C (D51 §11.12)", () => {
  const REFRESH_CONTRACTS = "refresh Add Cost from Table contracts";
  const COSTS_READ = "list Add Cost from Table costs";
  const logLine = saveLine;

  /** C1 with the columns the sheet's rows plan (DevCo, Yes, Yes), so only the total and costs can differ. */
  const pcfContract = (totalCost: number) => ({
    ...contract(C1, "C1"),
    initialContractSource: CHOICE.initialContractSource.pcf,
    distribution: CHOICE.distributionType.individual,
    distributionScheme: CHOICE.distributionScheme.absoluteValues,
    isEditedFromPcf: true, costType: CHOICE.costPaidType.devCo, depreciation: true, applyVat: true,
    totalCost,
  });
  /** The same contract as Dataverse answers it (raw columns, `CONTRACT_SELECT`). */
  const rawContract = (id: string, totalCost: number) => ({
    vsb_capexprojectcontractid: id, _vsb_account_value: SUB, vsb_name: "C1",
    vsb_costtype: CHOICE.costPaidType.devCo, vsb_depreciation: true, vsb_applyvat: true,
    vsb_isstandardcontract: false, vsb_distribution: CHOICE.distributionType.individual,
    vsb_distributionscheme: CHOICE.distributionScheme.absoluteValues,
    vsb_initialcontractsource: CHOICE.initialContractSource.pcf, vsb_iseditedfrompcf: true,
    vsb_totalcost: totalCost,
  });
  const rawCost = (id: string, month: number, cost: number) => ({
    vsb_capexcostid: id, _vsb_contract_value: C1, vsb_year: 2026, vsb_month: month, vsb_cost: cost,
  });

  /**
   * The evaluator's stale-snapshot scenario (eval5-stale), as the screen sends the retry: attempt 1
   * wrote January = 200 and the total 250, then failed. The screen's snapshot still says January
   * 100, total 150. The user types January back to 100; K1 sends ALL rows.
   */
  const staleRetry = (): Args => ({
    projectId: PROJECT_ID,
    changedRows: [row("C1", C1, months(100, 50))],
    existingContracts: [pcfContract(150)],
    existingCosts: [
      { id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 },
      { id: COST_FEB, contractId: C1, year: 2026, month: 2, cost: 50 },
    ],
    contractDeleteIds: [],
    idCache: retryCache(),
  });
  const serverAfterAttempt1 = () => {
    listRows.set(REFRESH_CONTRACTS, [rawContract(C1, 250)]);
    listRows.set(COSTS_READ, [rawCost(COST_JAN, 1, 200), rawCost(COST_FEB, 2, 50)]);
  };

  it("UT-ACSHEET-BULK-041 refreshBeforePlan re-reads contracts and costs, so a value set back to its old number IS written", async () => {
    serverAfterAttempt1();
    // The defect, pinned: planned against the stale snapshot, the reverted January is a no-op.
    await saveAddCostSheetBulk(staleRetry());
    expect(reads.filter((r) => r.label === REFRESH_CONTRACTS)).toEqual([]);
    expect(targetsOf(ES_COSTS).map((t) => t.vsb_capexcostid)).not.toContain(COST_JAN);
    expect(targetsOf(ES_CONTRACTS)).toEqual([]);

    // The fix: planned against what Dataverse holds now.
    upsertCalls = [];
    reads = [];
    await saveAddCostSheetBulk({ ...staleRetry(), refreshBeforePlan: true });
    const jan = targetsOf(ES_COSTS).find((t) => t.vsb_capexcostid === COST_JAN);
    expect(jan?.vsb_cost).toBe(100);
    // February is unchanged on the server too, so it is still a no-op.
    expect(targetsOf(ES_COSTS).map((t) => t.vsb_capexcostid)).not.toContain(COST_FEB);
    // The stored total (250) differs from the planned 150, so the total is written.
    const c1 = targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid === C1);
    expect(c1?.vsb_totalcost).toBe(150);
    // The refresh reads use the sheet load's columns, by id, active only.
    const refresh = reads.find((r) => r.label === REFRESH_CONTRACTS)?.options as { select: string[]; filter: string };
    expect(refresh.select).toContain("vsb_totalcost");
    expect(refresh.select).toContain("vsb_iseditedfrompcf");
    expect(refresh.filter).toContain(`vsb_capexprojectcontractid eq ${C1}`);
    expect(refresh.filter).toContain("statecode eq 0");
  });

  it("UT-ACSHEET-BULK-042 the refresh reads run in parallel before planning, chunked at 40, and are counted in the log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    serverAfterAttempt1();
    // 41 contracts: 2 contract reads + 2 cost reads.
    const others = Array.from({ length: 40 }, (_, i) =>
      ({ ...contract(`0000000${i % 10}-0000-4000-8000-${String(i).padStart(12, "0")}`, `X${i}`) }));
    let release: () => void = () => undefined;
    readGate = new Promise<void>((resolve) => { release = resolve; });
    const save = saveAddCostSheetBulk({
      ...staleRetry(), existingContracts: [pcfContract(150), ...others], refreshBeforePlan: true,
    });
    // All four reads are out while none has answered: both reads (and their chunks) run together.
    await vi.waitFor(() => {
      expect(reads.filter((r) => r.label === REFRESH_CONTRACTS)).toHaveLength(2);
      expect(reads.filter((r) => r.label === COSTS_READ)).toHaveLength(2);
    });
    // Nothing is planned or sent before the refresh answered.
    expect(verifyReads()).toEqual([]);
    expect(upsertCalls).toEqual([]);
    readGate = null;
    release();
    await save;
    expect(logLine(info)).toMatch(/\(refresh 4 req \d+ ms, plan \d+ ms, /);
    // The contracts the server no longer answers stay gone: nothing is written for them.
    expect(targetsOf(ES_CONTRACTS).map((t) => t.vsb_capexprojectcontractid)).toEqual([C1]);
  });

  it("UT-ACSHEET-BULK-043 a failed refresh read rejects with nothing sent, and logs the failure", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    costReadFails = true;
    await expect(saveAddCostSheetBulk({ ...staleRetry(), refreshBeforePlan: true })).rejects.toThrow("read failed");
    expect(upsertCalls).toEqual([]);
    expect(deleteCalls).toEqual([]);
    // Changed (D59): the request count, "nothing was written" and the error follow.
    expect(logLine(info)).toMatch(
      /^Add Cost from Table save failed after [\d,]+ ms, refresh read failed \(refresh failed [\d,]+ ms\); .*; nothing was written; error: .*read failed/,
    );
  });

  it("UT-ACSHEET-BULK-044 gone keeps committedBefore: true when a delete landed beside phase 0, false when nothing did", async () => {
    goneIds = new Set([COST_JAN]);
    // A landed delete (February, DOOMED) beside the verify.
    const landed = await saveAddCostSheetBulk({ ...typical(), idCache: retryCache() }).catch((e: unknown) => e);
    expect(landed).toBeInstanceOf(RowsGoneError);
    const withCommit = toSaveFailure(landed);
    expect(withCommit).toEqual({ kind: "gone", contracts: 0, costs: 1, committedBefore: true });
    expect(saveFailureText(withCommit)).not.toContain("Nothing was saved");
    expect(saveFailureText(withCommit)).toContain("Some of your changes were already saved");

    // No delete in the plan: nothing landed.
    const none = await saveAddCostSheetBulk({
      projectId: PROJECT_ID,
      changedRows: [row("C1", C1, months(200, 50))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [
        { id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 },
        { id: COST_FEB, contractId: C1, year: 2026, month: 2, cost: 50 },
      ],
      contractDeleteIds: [],
      idCache: retryCache(),
    }).catch((e: unknown) => e);
    expect(none).toBeInstanceOf(RowsGoneError);
    const without = toSaveFailure(none);
    expect(without).toEqual({ kind: "gone", contracts: 0, costs: 1, committedBefore: false });
    expect(saveFailureText(without)).toContain("Nothing was saved");
  });

  it("UT-ACSHEET-BULK-045 a SavePlanError caused by a RecordGoneError maps to gone with unknown counts", async () => {
    const requests = { verify: 0, contracts: 1, costs: 0, costDeletes: 0, contractDeletes: 0, reconcile: 0, total: 1 };
    const cause = new BulkWriteError("upsert costs (update)", ES_COSTS, 0, 0, 0,
      new RecordGoneError("upsert costs (update)", ES_COSTS, COST_JAN));
    for (const committedBefore of [true, false]) {
      const e = new SavePlanError({ phase: 2, cause, reconciled: true, committedBefore, requests });
      expect(toSaveFailure(e)).toEqual({ kind: "gone", contracts: 0, costs: 0, committedBefore });
    }
    // Any other cause stays a phase failure.
    const plain = new SavePlanError({ phase: 2, cause: new Error("x"), reconciled: true, committedBefore: true, requests });
    expect(toSaveFailure(plain).kind).toBe("phase");

    // End to end: UT-039's mid-save 501 whose guard found a row gone.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    notImplemented = new Set(["update"]);
    rowUpsertAllowed = true;
    onBulk = (action) => { if (action === "update") goneIds.add(COST_JAN.toLowerCase()); };
    const real = await saveAddCostSheetBulk(typical()).catch((err: unknown) => err);
    const failure = toSaveFailure(real);
    expect(failure).toMatchObject({ kind: "gone", contracts: 0, costs: 0 });
    expect(saveFailureText(failure)).toContain("Some rows were deleted by someone else");
  });

  it("UT-ACSHEET-BULK-046 a delete answering 404 whose row still exists fails its phase (a host or route 404)", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    deleteRoute404 = new Set([COST_FEB]);
    // Waiting for the cost deletes, so their phase failure is the Save's (deferred: UT-055).
    const waiting = (): Args => ({ ...typical(), deferCostDeletes: false });
    const e = await saveAddCostSheetBulk(waiting()).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(SavePlanError);
    const plan = e as InstanceType<typeof SavePlanError>;
    expect(plan.phase).toBe(3);
    expect(plan.cause).toBeInstanceOf(BulkDeleteError);
    const cause = plan.cause as InstanceType<typeof BulkDeleteError>;
    expect(cause.failedIds).toEqual([COST_FEB]);
    expect(cause.deletedCount).toBe(0);
    expect(String((cause.causes[0] as Error).message)).toContain("still exists");
    expect(isRecordGone(plan.cause)).toBe(false);
    expect(toSaveFailure(e).kind).toBe("phase");
    // One read-back of the 404 ids; the row is not counted as already gone.
    const backs = verifyReads().filter((r) => r.label === `check existing ${ES_COSTS}`);
    expect(backs).toHaveLength(1);
    expect((backs[0]?.options as { filter?: string } | undefined)?.filter).toContain(COST_FEB);
    expect(logLine(info)).toContain("0 already gone");

    // A failed read-back cannot confirm the 404 either.
    deleteRoute404 = new Set();
    deleteNotFound = new Set([COST_FEB]);
    stored = FIXTURE_ROWS();
    readBackFails = true;
    info.mockClear();
    const unread = await saveAddCostSheetBulk(waiting()).catch((err: unknown) => err);
    expect(unread).toMatchObject({ name: "SavePlanError", phase: 3 });
    const unreadCause = (unread as InstanceType<typeof SavePlanError>).cause as InstanceType<typeof BulkDeleteError>;
    expect(unreadCause.failedIds).toEqual([COST_FEB]);
    expect(String((unreadCause.causes[0] as Error).message)).toContain("could not be read back");
    expect(logLine(info)).toContain("0 already gone");
  });

  it("UT-ACSHEET-BULK-047 real 404s pass after ONE read-back per 40 ids, counted in the delete's requests", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    // 48 stored months of C1, all blanked: 48 cost deletes, every one already gone.
    const years = [2026, 2027, 2028, 2029];
    const id = (y: number, m: number) => `d${y}${String(m).padStart(3, "0")}-0000-4000-8000-000000000000`;
    const existingCosts = years.flatMap((y) =>
      Array.from({ length: 12 }, (_, i) => ({ id: id(y, i + 1), contractId: C1, year: y, month: i + 1, cost: 1 })));
    for (const c of existingCosts) stored.add(c.id.toLowerCase());
    deleteNotFound = new Set([...existingCosts.map((c) => c.id), DOOMED]);
    await saveAddCostSheetBulk({
      projectId: PROJECT_ID,
      changedRows: years.map((y) => row("C1", C1, new Array<number | null>(12).fill(null), y)),
      existingContracts: [contract(C1, "C1"), contract(DOOMED, "Doomed")],
      existingCosts,
      contractDeleteIds: [DOOMED],
      // Waiting, so both deletes' entries and their 404s are in the save line.
      deferContractDeletes: false,
      deferCostDeletes: false,
    });
    const costBacks = verifyReads().filter((r) => r.label === `check existing ${ES_COSTS}`);
    const contractBacks = verifyReads().filter((r) => r.label === `check existing ${ES_CONTRACTS}`);
    expect(costBacks).toHaveLength(2); // 48 ids → 40 + 8
    expect(contractBacks).toHaveLength(1);
    const line = logLine(info);
    expect(line).toMatch(/delete costs 50 req \(2 404 read-back\) \d+ ms/);
    expect(line).toMatch(/delete contracts 2 req \(1 404 read-back\) \d+ ms/);
    expect(line).toMatch(/49 already gone$/);
  });
});

describe("saveAddCostSheetBulk — parallel chunks and deferred contract deletes (D51 option A)", () => {
  /**
   * C1 (stored, no costs yet) gets every month of 10 years: 120 NEW cost rows under an EXISTING
   * contract, so they go out as (2a) at t = 0, beside the C1 update; no contract is created.
   */
  const bigSheet = (): Args => ({
    projectId: PROJECT_ID,
    owningBusinessUnitId: BU,
    changedRows: Array.from({ length: 10 }, (_, i) => row("C1", C1, new Array<number>(12).fill(5), 2026 + i)),
    existingContracts: [contract(C1, "C1")],
    existingCosts: [],
    contractDeleteIds: [],
  });
  const settledFlag = <T>(p: Promise<T>) => {
    const state = { settled: false };
    void p.then(() => { state.settled = true; }, () => { state.settled = true; });
    return state;
  };

  it("UT-ACSHEET-BULK-048 passes parallel 4, and 120 new cost rows go out as 4 concurrent CreateMultiple calls", async () => {
    expect(BULK_PARALLEL_CHUNKS).toBe(4);
    let release: () => void = () => undefined;
    createGate = new Promise<void>((resolve) => { release = resolve; });
    const save = saveAddCostSheetBulk(bigSheet());
    // All four are SENT while none has answered: they are in flight together.
    await vi.waitFor(() => expect(callShape().filter((c) => c === `create:${ES_COSTS}`)).toHaveLength(4));
    expect(answered.filter((a) => a === `create:${ES_COSTS}`)).toEqual([]);
    createGate = null;
    release();
    await save;
    const creates = upsertCalls.filter((c) => c.action === "create" && c.entitySetName === ES_COSTS);
    expect(creates.map((c) => c.targets.length)).toEqual([30, 30, 30, 30]);
    // Every bulk group is sent with the option (the 120-row one is the one that splits).
    const options = vi.mocked(upsertMultiple).mock.calls.map((c) => c[3]);
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o).toMatchObject({ parallel: 4 });
  });

  it("UT-ACSHEET-BULK-049 the save resolves before a slow contract delete finishes; background resolves afterwards", async () => {
    expect(DEFER_CONTRACT_DELETES).toBe(true);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let release: () => void = () => undefined;
    contractDeleteGate = new Promise<void>((resolve) => { release = resolve; });
    // Fails fast (instead of timing out) if the Save waits for the held delete.
    const raced = await Promise.race([
      saveAddCostSheetBulk(typical()),
      new Promise<"still waiting">((r) => setTimeout(() => r("still waiting"), 1000)),
    ]);
    if (raced === "still waiting") {
      release();
      throw new Error("the Save waited for the contract delete");
    }
    const result = raced;
    // The delete was SENT (since the late start: right after the writes settled, no longer at
    // t = 0) but has not answered, and the save is already done.
    expect(deleteCalls.map((d) => d.id)).toContain(DOOMED);
    expect(contractDeletesAnswered).toBe(0);
    expect(result.background).toBeInstanceOf(Promise);
    expect(result.deferredContracts).toBe(1);
    const state = settledFlag(result.background as Promise<unknown>);
    await new Promise((r) => setTimeout(r, 10));
    expect(state.settled).toBe(false);
    expect(saveLine(info)).toContain("delete contracts deferred");
    expect(saveLine(info)).not.toMatch(/delete contracts \d+ req/);
    expect(backgroundLines(info)).toEqual([]);

    contractDeleteGate = null;
    release();
    const outcome = await result.background;
    // One background promise for both kinds (DEFER_COST_DELETES): the contract delete and the
    // cleared cell (COST_FEB). The cost delete is deferred, so shown as such, even though it
    // answered before the Save returned.
    expect(outcome).toEqual({ requests: 2 });
    expect(result.deferredCosts).toBe(1);
    expect(saveLine(info)).toContain("delete costs deferred");
    expect(saveLine(info)).not.toMatch(/delete costs \d+ req/);
    expect(backgroundLines(info)).toHaveLength(1);
    expect(backgroundLines(info)[0])
      .toMatch(/^Add Cost from Table background deletes: costs 1 req, contracts 1 req, \d+ ms$/);
    expect(backgroundDeleteFailureTexts(outcome as NonNullable<typeof outcome>, { deferredContracts: 1 })).toEqual([]);
    // Nothing to defer: no background at all (only `applied`, D51 §11.19).
    expect(Object.keys(await saveAddCostSheetBulk({ ...typical(), contractDeleteIds: [], deferCostDeletes: false })))
      .toEqual(["applied"]);
  });

  it("UT-ACSHEET-BULK-052 contract deletes run at most CONTRACT_DELETE_LIMIT at once, outside the write gate (E5 finding 4)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    let release: () => void = () => undefined;
    contractDeleteGate = new Promise<void>((resolve) => { release = resolve; });
    const doomed = [DOOMED, ...Array.from({ length: 19 }, (_, i) =>
      `d0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`)];
    // 20 held cascades must neither stall the upserts nor take more than 4 slots.
    const result = await saveAddCostSheetBulk({ ...typical(), contractDeleteIds: doomed });
    expect(CONTRACT_DELETE_LIMIT).toBe(4);
    expect(deleteCalls.filter((d) => d.tableName === ES_CONTRACTS)).toHaveLength(CONTRACT_DELETE_LIMIT);
    expect(callSet()).toEqual(TYPICAL_CALLS); // every write went out while the cascades were held
    contractDeleteGate = null;
    release();
    // 20 contract deletes + typical()'s one cleared cell, deferred with them.
    expect(await result.background).toEqual({ requests: 21 });
    expect(deleteCalls.filter((d) => d.tableName === ES_CONTRACTS)).toHaveLength(20);
  });

  it("UT-ACSHEET-BULK-050 a failed background delete is reported through background, not the save", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    refused = new Set([DOOMED]);
    // Resolves: with the deletes deferred, a refused contract delete is not a Save failure (UT-009
    // pins the waiting half: SavePlanError phase 4).
    const result = await saveAddCostSheetBulk(typical());
    expect(result.background).toBeInstanceOf(Promise);
    const outcome = await (result.background as NonNullable<typeof result.background>);
    // Only the cleared cell's delete, which succeeded; a failed group's requests are not known.
    expect(outcome.requests).toBe(1);
    expect(outcome.error).toBeInstanceOf(BulkDeleteError);
    expect(outcome.contractDeleteError).toBe(outcome.error);
    expect(outcome.costDeleteError).toBeUndefined();
    expect((outcome.error as InstanceType<typeof BulkDeleteError>).failedIds).toEqual([DOOMED]);
    // The refused delete was still SENT: the log counts it.
    // Changed (D59): the root error follows, ids replaced.
    expect(backgroundLines(info)[0]).toMatch(/: costs 1 req, contracts 1 req, [\d,]+ ms, failed; error: .*403 refused$/);
    expect(saveLine(info)).toMatch(/^Add Cost from Table save: /);
    // The toast text: the deleter's failed ids when it names them, else every deferred contract.
    expect(backgroundDeleteFailureTexts(outcome, { deferredContracts: 3 })).toEqual([BACKGROUND_DELETE_FAILED(1)]);
    expect(backgroundDeleteFailureTexts({ requests: 0, error: new Error("x") }, { deferredContracts: 3 }))
      .toEqual([BACKGROUND_DELETE_FAILED(3)]);
    expect(BACKGROUND_DELETE_FAILED(2)).toBe(
      "Removing 2 contract(s) did not finish. Open Add Costs from Table again and remove them once more.",
    );
  });

  it("UT-ACSHEET-BULK-051 a 501 on every parallel chunk still falls back to per-row writes", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    notImplemented = new Set(["create"]);
    rowUpsertAllowed = true;
    await saveAddCostSheetBulk(bigSheet());
    // Four parallel CreateMultiple requests, all 501, then every new cost row per row.
    expect(callShape().filter((c) => c === `create:${ES_COSTS}`)).toHaveLength(4);
    expect(rowUpserts.filter((r) => r.startsWith(`${ES_COSTS}:`))).toHaveLength(120);
    // The contract update stayed bulk; the refused requests are all counted.
    expect(rowUpserts.filter((r) => r.startsWith(`${ES_CONTRACTS}:`))).toEqual([]);
    expect(logEntries(saveLine(info), "upsert costs")).toContain("create 124 req per-row after 501");
  });
});

describe("saveAddCostSheetBulk — cost deletes: own gate, deferred (D51 §11.15)", () => {
  /** 16 stored cost rows of C1: 2026 Jan–Dec and 2027 Jan–Apr. */
  const CLEARED = Array.from({ length: 16 }, (_, i) => ({
    id: `a1000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    contractId: C1, year: 2026 + Math.floor(i / 12), month: (i % 12) + 1, cost: 10,
  }));
  /**
   * The measured save's shape: every one of C1's 16 cells cleared (16 per-row cost deletes), a
   * new contract with one cost, and C1's total updated. No contract delete.
   */
  const clearedSheet = (): Args => ({
    projectId: PROJECT_ID,
    owningBusinessUnitId: BU,
    changedRows: [
      row("C1", C1, months(), 2026), row("C1", C1, months(), 2027), row("New", null, months(10)),
    ],
    existingContracts: [contract(C1, "C1")],
    existingCosts: CLEARED,
    contractDeleteIds: [],
  });
  const WRITES = [`create:${ES_CONTRACTS}`, `create:${ES_COSTS}`, `update:${ES_CONTRACTS}`].sort();
  const hold = () => {
    let release: () => void = () => undefined;
    costDeleteHold = new Promise<void>((resolve) => { release = resolve; });
    return () => { costDeleteHold = null; release(); };
  };
  const costDeleteIds = () => deleteCalls.filter((d) => d.tableName === ES_COSTS).map((d) => d.id);
  /**
   * The Save, which must resolve while the cost deletes are held. Fails fast (and releases them,
   * so the module's cost gate is not left full for the next test) if it waits instead.
   */
  const savedEarly = async (args: Args, release: () => void) => {
    const raced = await Promise.race([
      saveAddCostSheetBulk(args),
      new Promise<"still waiting">((r) => setTimeout(() => r("still waiting"), 1000)),
    ]);
    if (raced === "still waiting") {
      release();
      throw new Error("the Save waited for the cost deletes");
    }
    return raced;
  };
  beforeEach(() => {
    for (const c of CLEARED) stored.add(c.id.toLowerCase());
  });

  it("UT-ACSHEET-BULK-053 with 16 held cost deletes every upsert goes out first, and at most COST_DELETE_LIMIT deletes are in flight", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(COST_DELETE_LIMIT).toBe(4);
    const release = hold();
    // Waiting (flag off), so this pins the gate on its own, not the deferral.
    const save = saveAddCostSheetBulk({ ...clearedSheet(), deferCostDeletes: false });
    // Every write was SENT and answered while no cost delete has answered.
    await vi.waitFor(() => expect(answered.slice().sort()).toEqual(WRITES));
    expect(costDeletesAnswered).toBe(0);
    expect(costDeleteIds()).toHaveLength(COST_DELETE_LIMIT);
    release();
    await save;
    expect(new Set(costDeleteIds())).toEqual(new Set(CLEARED.map((c) => c.id)));
    expect(costDeletesPeak).toBe(COST_DELETE_LIMIT);
  });

  it("UT-ACSHEET-BULK-054 with DEFER_COST_DELETES the save resolves while cost deletes are held; background resolves afterwards with its counts", async () => {
    expect(DEFER_COST_DELETES).toBe(true);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = hold();
    const raced = await savedEarly(clearedSheet(), release);
    expect(costDeletesAnswered).toBe(0);
    expect(vi.mocked(executeSavePlan).mock.calls.map((c) => c[1].deferCostDeletes)).toEqual([true]);
    expect(raced.background).toBeInstanceOf(Promise);
    expect(raced.deferredCosts).toBe(16);
    expect(raced.deferredContracts).toBe(0);
    expect(saveLine(info)).toContain("delete costs deferred");
    expect(saveLine(info)).not.toMatch(/delete costs \d+ req/);
    expect(saveLine(info)).not.toContain("delete contracts deferred");
    // The gate stats are the writes' only: 3 bulk calls, never the 16 deletes.
    expect(saveLine(info)).toMatch(/gate peak [1-3]\/16/);
    expect(backgroundLines(info)).toEqual([]);

    release();
    const outcome = await (raced.background as NonNullable<typeof raced.background>);
    expect(outcome.error).toBeUndefined();
    expect(outcome.costDeleteError).toBeUndefined();
    expect(backgroundLines(info)).toEqual([
      expect.stringMatching(/^Add Cost from Table background deletes: costs 16 req, contracts 0 req, \d+ ms$/),
    ]);
    expect(backgroundDeleteFailureTexts(outcome, raced)).toEqual([]);
  });

  it("UT-ACSHEET-BULK-055 a background cost-delete failure is reconciled, logged, and picks the reconciled text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = hold();
    const result = await savedEarly(clearedSheet(), release);
    refused = new Set([CLEARED[3]?.id as string]);
    release();
    const outcome = await (result.background as NonNullable<typeof result.background>);
    expect(outcome.costDeleteError).toBeDefined();
    expect(outcome.reconciled).toBe(true);
    expect(backgroundLines(info)[0]).toMatch(/: costs 16 req, contracts 0 req, [\d,]+ ms, failed, totals reconciled; error: .*403 refused$/);
    expect(backgroundDeleteFailureTexts(outcome, result)).toEqual([COST_DELETE_FAILED_RECONCILED]);
  });

  it("UT-ACSHEET-BULK-056 when the background reconcile fails too, the log and the text say totals may not match", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = hold();
    const result = await savedEarly(clearedSheet(), release);
    refused = new Set([CLEARED[0]?.id as string]);
    costReadFails = true;
    release();
    const outcome = await (result.background as NonNullable<typeof result.background>);
    expect(outcome.costDeleteError).toBeDefined();
    expect(outcome.reconciled === true && outcome.reconcileError === undefined).toBe(false);
    expect(backgroundLines(info)[0]).toMatch(/, failed, totals NOT reconciled; error: /);
    expect(backgroundDeleteFailureTexts(outcome, result)).toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
  });

  it("UT-ACSHEET-BULK-057 the toast texts for every failure combination", () => {
    const counts = { deferredContracts: 2, deferredCosts: 5 };
    const contractErr = new BulkDeleteError("delete contracts", ES_CONTRACTS, ["x"], 1, [new Error("x")]);
    const costErr = new Error("cost refused");
    expect(backgroundDeleteFailureTexts({ requests: 7 }, counts)).toEqual([]);
    // Cost only: reconciled, not reconciled, reconcile failed, reconcile outcome unknown.
    expect(backgroundDeleteFailureTexts({ requests: 0, error: costErr, costDeleteError: costErr, reconciled: true }, counts))
      .toEqual([COST_DELETE_FAILED_RECONCILED]);
    expect(backgroundDeleteFailureTexts({ requests: 0, error: costErr, costDeleteError: costErr, reconciled: false }, counts))
      .toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
    expect(backgroundDeleteFailureTexts({
      requests: 0, error: costErr, costDeleteError: costErr, reconciled: false, reconcileError: new Error("read"),
    }, counts)).toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
    expect(backgroundDeleteFailureTexts({ requests: 0, error: costErr, costDeleteError: costErr }, counts))
      .toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
    // Contract only: the existing text, counted from the deleter's failed ids.
    expect(backgroundDeleteFailureTexts({ requests: 0, error: contractErr, contractDeleteError: contractErr }, counts))
      .toEqual([BACKGROUND_DELETE_FAILED(1)]);
    // Both: two toasts, the cost one first.
    expect(backgroundDeleteFailureTexts({
      requests: 0, error: costErr, costDeleteError: costErr, contractDeleteError: contractErr, reconciled: true,
    }, counts)).toEqual([COST_DELETE_FAILED_RECONCILED, BACKGROUND_DELETE_FAILED(1)]);
    // Only the generic `error` (the safety net): blamed on every group with deferred rows.
    expect(backgroundDeleteFailureTexts({ requests: 0, error: new Error("?") }, counts))
      .toEqual([COST_DELETE_FAILED_NOT_RECONCILED, BACKGROUND_DELETE_FAILED(2)]);
    expect(backgroundDeleteFailureTexts({ requests: 0, error: new Error("?") }, { deferredCosts: 5 }))
      .toEqual([COST_DELETE_FAILED_NOT_RECONCILED]);
    // The verbatim new wording.
    expect(COST_DELETE_FAILED_RECONCILED).toBe(
      "Some cleared cells could not be removed. Totals were corrected; open Add Costs from Table again and clear them once more.",
    );
    expect(COST_DELETE_FAILED_NOT_RECONCILED).toBe(
      "Some cleared cells could not be removed. Open Add Costs from Table again and clear them once more. "
        + "Contract totals may not match: reload the CAPEX screen.",
    );
    // And the log line, for each ending.
    const n = { costs: 16, contracts: 2 };
    expect(backgroundDeleteLogLine({ requests: 18 }, n, 1234.4))
      .toBe("Add Cost from Table background deletes: costs 16 req, contracts 2 req, 1,234 ms");
    // Changed (D59): a failure names its root error, ids replaced.
    expect(backgroundDeleteLogLine({ requests: 0, error: contractErr, contractDeleteError: contractErr }, n, 5))
      .toMatch(/^Add Cost from Table background deletes: costs 16 req, contracts 2 req, 5 ms, failed; error: BulkDeleteError: /);
    expect(backgroundDeleteLogLine({ requests: 0, error: costErr, costDeleteError: costErr, reconciled: true }, n, 5))
      .toMatch(/, 5 ms, failed, totals reconciled; error: Error: cost refused$/);
    expect(backgroundDeleteLogLine({ requests: 0, error: costErr, costDeleteError: costErr, reconciled: false }, n, 5))
      .toMatch(/, 5 ms, failed, totals NOT reconciled; error: Error: cost refused$/);
  });

  it("UT-ACSHEET-BULK-058 deferCostDeletes: false in the args makes the Save wait for the cleared cells", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = hold();
    const save = saveAddCostSheetBulk({ ...clearedSheet(), deferCostDeletes: false });
    const raced = await Promise.race([save, new Promise<"still waiting">((r) => setTimeout(() => r("still waiting"), 300))]);
    expect(raced).toBe("still waiting");
    release();
    const result = await save;
    expect(Object.keys(result)).toEqual(["applied"]);
    expect(costDeletesAnswered).toBe(16);
    expect(saveLine(info)).toMatch(/delete costs 16 req \d+ ms/);
    expect(saveLine(info)).not.toContain("deferred");
    expect(vi.mocked(executeSavePlan).mock.calls.map((c) => c[1].deferCostDeletes)).toEqual([false]);
  });
});

describe("saveAddCostSheetBulk — deferred deletes start after the writes; per-request timing (DEV, 27 Oct)", () => {
  /** Holds every `CreateMultiple` until the returned release runs. */
  const holdCreates = () => {
    let release: () => void = () => undefined;
    createGate = new Promise<void>((resolve) => { release = resolve; });
    return () => { createGate = null; release(); };
  };
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

  it("UT-ACSHEET-BULK-059 with the default flags no delete is sent before every write answered; both are sent right after", async () => {
    expect(DEFER_CONTRACT_DELETES && DEFER_COST_DELETES).toBe(true);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = holdCreates();
    const save = saveAddCostSheetBulk(typical());
    await vi.waitFor(() => expect(callShape()).toContain(`create:${ES_CONTRACTS}`));
    await tick();
    // The contract create is held: no delete of either table has been sent.
    expect(deleteCalls).toEqual([]);
    release();
    const result = await save;
    expect(deleteCalls.map((d) => d.id).sort()).toEqual([COST_FEB, DOOMED].sort());
    // Each delete was sent only once all four bulk calls of `typical()` had answered.
    expect(deleteStartAnswered).toEqual([TYPICAL_CALLS.length, TYPICAL_CALLS.length]);
    expect(result.background).toBeInstanceOf(Promise);
    await expect(result.background).resolves.toEqual({ requests: 2 });
  });

  it("UT-ACSHEET-BULK-060 with the default flags a write failure sends the deletes after the writes, waits for them, then reconciles and throws", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    refuseOnce = new Set([`create:${ES_COSTS}`]); // stage B refused
    const e = await saveAddCostSheetBulk(typical()).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SavePlanError);
    expect((e as InstanceType<typeof SavePlanError>).phase).toBe(2);
    expect(deleteStartAnswered).toEqual([TYPICAL_CALLS.length, TYPICAL_CALLS.length]);
    // Awaited, and counted in the error as without the flags.
    expect(deleteCalls.map((d) => d.id).sort()).toEqual([COST_FEB, DOOMED].sort());
    expect((e as InstanceType<typeof SavePlanError>).requests).toMatchObject({ costDeletes: 1, contractDeletes: 1 });
    // The reconcile read came only after both deletes answered.
    expect(deletesAnsweredAtCostRead).toEqual([2]);
  });

  it("UT-ACSHEET-BULK-061 flags off: both deletes are sent while a write is still unanswered (t = 0, unchanged)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = holdCreates();
    const save = saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    await vi.waitFor(() => expect(deleteCalls).toHaveLength(2));
    expect(answered).not.toContain(`create:${ES_CONTRACTS}`);
    release();
    await save;
  });

  it("UT-ACSHEET-BULK-062 the save line names each bulk request's own duration, measured inside the gate", async () => {
    expect(formatRequestDuration(980)).toBe("980 ms");
    expect(formatRequestDuration(999.4)).toBe("999 ms");
    expect(formatRequestDuration(999.6)).toBe("1.0 s");
    expect(formatRequestDuration(10_740)).toBe("10.7 s");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const release = holdCreates();
    const save = saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    await vi.waitFor(() => expect(callShape()).toContain(`create:${ES_CONTRACTS}`));
    await tick(80);
    release();
    await save;
    const line = saveLine(info);
    const m = /upsert contracts \(create 1 req bulk \[(\d+) ms\], update 1 req bulk \[(\d+) ms\]\) \d+ ms/.exec(line);
    expect(m).not.toBeNull();
    // The held create's own time shows; the update beside it answered at once.
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(60);
    expect(Number(m?.[2])).toBeLessThan(60);
    // One bracketed entry per request: 120 new cost rows go out as 4 parallel CreateMultiple calls.
    info.mockClear();
    await saveAddCostSheetBulk({
      projectId: PROJECT_ID, owningBusinessUnitId: BU,
      changedRows: Array.from({ length: 10 }, (_, i) => row("C1", C1, new Array<number>(12).fill(5), 2026 + i)),
      existingContracts: [contract(C1, "C1")], existingCosts: [], contractDeleteIds: [],
    });
    // Changed (D59): the stage's log name; C1 already exists, so its costs are stage A.
    expect(saveLine(info)).toMatch(/upsert costs \(existing contracts\) \(create 4 req bulk \[\d+ ms, \d+ ms, \d+ ms, \d+ ms\]\)/);
    expect(saveLines(info)).toHaveLength(1);
  });
});

describe("saveAddCostSheetBulk — exact committedBefore (L2 / F5)", () => {
  type PlanError = InstanceType<typeof SavePlanError>;
  const failed = (p: Promise<unknown>) => p.then(() => null, (err: unknown) => err);

  it("UT-ACSHEET-BULK-063 every delete answering a confirmed 404 beside a refused write: committedBefore false; one real delete: true", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    // C1: January changes, February is cleared; DOOMED is removed. No new row, so each upsert is
    // ONE group, refused with 0 committed.
    const args = (): Args => ({ ...typical(), changedRows: [row("C1", C1, months(200, null))] });
    deleteNotFound = new Set([COST_FEB, DOOMED]);
    refusedActions = new Set(["update"]);
    const e = await failed(saveAddCostSheetBulk(args()));
    expect(e).toBeInstanceOf(SavePlanError);
    expect(deleteCalls.map((d) => d.id).sort()).toEqual([COST_FEB, DOOMED].sort());
    expect(verifyReads().length).toBeGreaterThan(0); // the 404s were read back and confirmed
    expect((e as PlanError).committedBefore).toBe(false);
    expect(toSaveFailure(e)).toMatchObject({ kind: "phase", phase: 1, committedBefore: false });

    // The same save where the cleared cell's delete really removes its row.
    deleteCalls = [];
    stored = FIXTURE_ROWS();
    deleteNotFound = new Set([DOOMED]);
    const e2 = await failed(saveAddCostSheetBulk(args()));
    expect((e2 as PlanError).committedBefore).toBe(true);
  });

  it("UT-ACSHEET-BULK-064 a refused delete batch whose only other row was a confirmed 404 removed nothing: removedCount 0, committedBefore false", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    // Both of C1's cells cleared: COST_JAN answers 404 (gone), COST_FEB is refused with 403.
    deleteNotFound = new Set([COST_JAN]);
    deleteStatus = new Map([[COST_FEB, 403]]);
    refusedActions = new Set(["update"]); // C1's total update
    const e = await failed(saveAddCostSheetBulk({ ...typical(), changedRows: [row("C1", C1, months(null, null))], contractDeleteIds: [] }));
    expect(e).toBeInstanceOf(SavePlanError);
    const plan = e as PlanError;
    const del = plan.failures.find((f) => f.phase === 3)?.cause;
    expect(del).toBeInstanceOf(BulkDeleteError);
    expect(del).toMatchObject({ failedIds: [COST_FEB], deletedCount: 1, removedCount: 0 });
    expect(plan.committedBefore).toBe(false);
    // Without the 404 (COST_JAN really deleted), the batch removed one row.
    deleteCalls = [];
    stored = FIXTURE_ROWS();
    deleteNotFound = new Set();
    const e2 = await failed(saveAddCostSheetBulk({ ...typical(), changedRows: [row("C1", C1, months(null, null))], contractDeleteIds: [] }));
    expect((e2 as PlanError).failures.find((f) => f.phase === 3)?.cause).toMatchObject({ deletedCount: 1, removedCount: 1 });
    expect((e2 as PlanError).committedBefore).toBe(true);
  });

  it("UT-ACSHEET-BULK-065 both upsert groups refused with 0 committed: a BulkWriteError with 0 rows, no reconcile, committedBefore false; a count-less group keeps the count-less error", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const args = (): Args => ({
      projectId: PROJECT_ID, owningBusinessUnitId: BU,
      changedRows: [row("C1", C1, months(200)), row("New", null, months(10))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    });
    refusedActions = new Set(["create", "update"]);
    const e = await failed(saveAddCostSheetBulk(args()));
    expect(e).toBeInstanceOf(SavePlanError);
    const plan = e as PlanError;
    expect(plan.phase).toBe(1);
    expect(plan.cause).toBeInstanceOf(BulkWriteError);
    expect(plan.cause).toMatchObject({ rowsCommitted: 0, chunksCommitted: 0 });
    // The detail of both refusals survives one level down, with the Dataverse status.
    const inner = (plan.cause as InstanceType<typeof BulkWriteError>).cause;
    expect(inner).toBeInstanceOf(DataError);
    expect((inner as InstanceType<typeof DataError>).status).toBe(400);
    expect(String((inner as Error).message)).toContain("both the create and the update group failed");
    expect(plan.committedBefore).toBe(false);
    expect(toSaveFailure(e)).toMatchObject({ kind: "phase", committedBefore: false });
    // Nothing landed, so nothing to reconcile.
    expect(reads.filter((r) => r.label === "list Add Cost from Table costs")).toEqual([]);
    expect(plan.reconciled).toBe(true);

    // The create group goes per row after a 501 and fails there (no counts): still count-less.
    upsertCalls = [];
    reads = [];
    refusedActions = new Set(["update"]);
    notImplemented = new Set(["create"]);
    const e2 = await failed(saveAddCostSheetBulk(args()));
    const cause2 = (e2 as PlanError).cause;
    expect(cause2).toBeInstanceOf(DataError);
    expect(cause2).not.toBeInstanceOf(BulkWriteError);
    expect(cause2).not.toHaveProperty("rowsCommitted");
    expect((e2 as PlanError).committedBefore).toBe(true);
  });
});

describe("saveAddCostSheetBulk — the background deletes' log lines (item 1)", () => {
  // Changed (D59): "1 row" in the singular, ms with a thousands separator.
  const STARTED = /^Add Cost from Table background deletes started: (costs|contracts) 1 row at [\d,]+ ms, delete gate (\d)\/4 busy$/;

  it("UT-ACSHEET-BULK-066 the hook's call path: the background line is written although nothing ever attaches to background", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let releaseContracts: () => void = () => undefined;
    let releaseCosts: () => void = () => undefined;
    contractDeleteGate = new Promise<void>((r) => { releaseContracts = r; });
    costDeleteHold = new Promise<void>((r) => { releaseCosts = r; });
    // What `useSaveAddCostSheet` calls (the repository's `saveAddCostSheet`, BULK_SAVE on).
    expect(BULK_SAVE).toBe(true);
    const result = await saveAddCostSheet(typical());
    expect(result.background).toBeInstanceOf(Promise);
    // Both deferred kinds were SENT (after the writes), logged before the save line.
    const lines = infoLines(info);
    expect(startLines(info)).toHaveLength(2);
    for (const l of startLines(info)) expect(l).toMatch(STARTED);
    const firstStart = lines.findIndex((l) => STARTED.test(l));
    expect(firstStart).toBeLessThan(lines.findIndex((l) => l.startsWith("Add Cost from Table save:")));
    expect(backgroundLines(info)).toEqual([]);
    // Like an unmounted screen: nobody awaits or chains `result.background`. The deletes answer.
    contractDeleteGate = null;
    costDeleteHold = null;
    releaseContracts();
    releaseCosts();
    await vi.waitFor(() => expect(backgroundLines(info)).toHaveLength(1));
    expect(backgroundLines(info)[0]).toMatch(/^Add Cost from Table background deletes: costs 1 req, contracts 1 req, [\d,]+ ms$/);
  });

  it("UT-ACSHEET-BULK-067 a deferred delete that never answers: started lines only, and the next save reports the held gate slot", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let release: () => void = () => undefined;
    contractDeleteGate = new Promise<void>((r) => { release = r; });
    try {
      const first = await saveAddCostSheetBulk(typical());
      const second = await saveAddCostSheetBulk(typical());
      await new Promise((r) => setTimeout(r, 20));
      const contractStarts = startLines(info).filter((l) => l.includes(": contracts "));
      expect(contractStarts.map((l) => STARTED.exec(l)?.[2])).toEqual(["0", "1"]);
      // The first save's contract delete holds its slot; neither background has settled.
      expect(backgroundLines(info)).toEqual([]);
      contractDeleteGate = null;
      release();
      await Promise.all([first.background, second.background]);
      expect(backgroundLines(info)).toHaveLength(2);
    } finally {
      contractDeleteGate = null;
      release();
    }
  });

  it("UT-ACSHEET-BULK-068 F7: a retry after a partly-landed save flips the landed new ids to UpdateMultiple; CreateMultiple (which refuses existing ids) never gets them", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    createRefusesExisting = true;
    const args = (): Args => ({
      projectId: PROJECT_ID, owningBusinessUnitId: BU,
      changedRows: [row("C1", C1, months(200)), row("New", null, months(10))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
    });
    const idCache = new Map<string, string>();
    // Attempt 1: the new contract lands, its cost row (stage B) is refused.
    refuseOnce = new Set([`create:${ES_COSTS}`]);
    const first = await saveAddCostSheetBulk({ ...args(), idCache }).then(() => null, (err: unknown) => err);
    expect(first).toBeInstanceOf(SavePlanError);
    const newContract = String(targetsOf(ES_CONTRACTS, "create")[0]?.vsb_capexprojectcontractid);
    expect(stored.has(newContract.toLowerCase())).toBe(true);
    expect([...idCache.values()]).toContain(newContract);

    // Attempt 2, the same sheet with the cached ids (the screen's retry).
    upsertCalls = [];
    const retry = await saveAddCostSheetBulk({ ...args(), idCache });
    expect(Object.keys(retry)).toEqual(["applied"]);
    expect(verifyFlags()).toEqual([false, true]); // the retry verifies, which is what flips
    const created = upsertCalls.filter((c) => c.action === "create")
      .flatMap((c) => c.targets.map((t) => String(t[PRIMARY_KEY[c.entitySetName] as string]).toLowerCase()));
    expect(created).not.toContain(newContract.toLowerCase());
    const asUpdate = targetsOf(ES_CONTRACTS, "update").find((t) => t.vsb_capexprojectcontractid === newContract);
    expect(asUpdate).toBeDefined();
    expect(asUpdate).not.toHaveProperty("owningbusinessunit@odata.bind"); // an update never moves its BU
    // The cost row that never landed is still a create, now in stage A beside its contract.
    expect(targetsOf(ES_COSTS, "create")).toHaveLength(1);
  });
});

describe("saveAddCostSheetBulk — what the Save applied, for the DEVEX/CAPEX patch (D51 §11.19, CA-13)", () => {
  it("UT-ACSHEET-BULK-069 a deferred save returns the deferred ids beside the counts", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await saveAddCostSheetBulk(typical());
    expect(result.background).toBeInstanceOf(Promise);
    expect(result.deferredContractIds).toEqual([DOOMED]);
    expect(result.deferredCostIds).toEqual([COST_FEB]);
    expect(result.deferredContracts).toBe(result.deferredContractIds?.length);
    expect(result.deferredCosts).toBe(result.deferredCostIds?.length);
    await result.background;
  });

  it("UT-ACSHEET-BULK-070 applied describes the saved state in domain terms, with the ids that were sent", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await saveAddCostSheetBulk(typical());
    const newContract = String(targetsOf(ES_CONTRACTS, "create")[0]?.vsb_capexprojectcontractid);
    const newCost = String(targetsOf(ES_COSTS, "create")[0]?.vsb_capexcostid);
    expect(result.applied).toEqual({
      contracts: [
        {
          id: C1, isNew: false, totalCost: 200,
          columns: {
            subaccountId: SUB, name: "C1", payer: "DevCo", depreciation: true, vat: true,
            distribution: "individual", distributionScheme: "absolute",
          },
        },
        {
          id: newContract, isNew: true, totalCost: 10,
          columns: {
            subaccountId: SUB, name: "New", payer: "DevCo", depreciation: true, vat: true,
            distribution: "individual", distributionScheme: "absolute",
          },
        },
      ],
      costs: [
        { id: COST_JAN, contractId: C1, year: 2026, month: 1, amount: 200, isNew: false },
        { id: newCost, contractId: newContract, year: 2026, month: 1, amount: 10, isNew: true },
      ],
      deletedContractIds: [DOOMED],
      deletedCostIds: [COST_FEB],
    });
    // No Dataverse field bag reaches the caller.
    expect(JSON.stringify(result.applied)).not.toMatch(/vsb_|@odata/);
    await result.background;
  });

  it("UT-ACSHEET-BULK-071 with the deletes awaited (flags off) there are no deferred ids, but applied still lists the deletes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    expect(Object.keys(result)).toEqual(["applied"]);
    expect(result.applied?.deletedContractIds).toEqual([DOOMED]);
    expect(result.applied?.deletedCostIds).toEqual([COST_FEB]);
  });

  it("UT-ACSHEET-BULK-075 deferredCostIds include the retry-only costDeletesIfExist ids, not only the cleared cells", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    // A failed attempt created a row for March, which is blank now: on this retry it is a
    // `costDeletesIfExist` id, and the verify finds it.
    const LEFT_BEHIND = "a0000007-0000-4000-8000-000000000007";
    stored.add(LEFT_BEHIND);
    const result = await saveAddCostSheetBulk({
      ...typical(), idCache: new Map([[`cost:${C1}|2026|3`, LEFT_BEHIND]]),
    });
    expect(result.background).toBeInstanceOf(Promise);
    expect(result.deferredCostIds).toEqual([COST_FEB, LEFT_BEHIND]);
    expect(result.applied?.deletedCostIds).toEqual([COST_FEB, LEFT_BEHIND]);
    await result.background;
  });

  it("UT-ACSHEET-BULK-072 a failed save resolves nothing: no applied state can reach the cache", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    upsertRefused = true;
    await expect(saveAddCostSheetBulk(typical())).rejects.toThrow();
  });
});

describe("saveAddCostSheetBulk — reads during an earlier Save's background deletes (D51 §11.19, review finding 1)", () => {
  const COSTS_READ = "list Add Cost from Table costs";
  const REFRESH_CONTRACTS = "refresh Add Cost from Table contracts";
  /** A cost row of ANOTHER contract-year cell, deleted in the background by an earlier Save. */
  const OTHER_PENDING = "a0000003-0000-4000-8000-000000000003";
  const rawCost = (id: string, month: number, cost: number) => ({
    vsb_capexcostid: id, _vsb_contract_value: C1, vsb_year: 2026, vsb_month: month, vsb_cost: cost,
  });
  const rawC1 = () => ({
    vsb_capexprojectcontractid: C1, _vsb_account_value: SUB, vsb_name: "C1",
    vsb_costtype: CHOICE.costPaidType.devCo, vsb_depreciation: true, vsb_applyvat: true,
    vsb_isstandardcontract: false, vsb_distribution: CHOICE.distributionType.individual,
    vsb_distributionscheme: CHOICE.distributionScheme.absoluteValues,
    vsb_initialcontractsource: CHOICE.initialContractSource.pcf, vsb_iseditedfrompcf: true,
    vsb_totalcost: 150,
  });
  let release: () => void = () => undefined;
  afterEach(() => { release(); release = () => undefined; });

  it("UT-ACSHEET-BULK-073 the retry re-read leaves out a cell an earlier Save is deleting: a value typed there is a CREATE, never an UPDATE of the doomed row", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    // Save 1 cleared February (COST_FEB); its delete is still running.
    release = pendingDeletes.add({ costIds: [COST_FEB] });
    listRows.set(REFRESH_CONTRACTS, [rawC1()]);
    listRows.set(COSTS_READ, [rawCost(COST_JAN, 1, 100), rawCost(COST_FEB, 2, 50)]);
    // Save 2's retry: the reopened sheet (Feb hidden) has February typed as 75.
    await saveAddCostSheetBulk({
      projectId: PROJECT_ID,
      changedRows: [row("C1", C1, months(100, 75))],
      existingContracts: [contract(C1, "C1")],
      existingCosts: [{ id: COST_JAN, contractId: C1, year: 2026, month: 1, cost: 100 }],
      contractDeleteIds: [],
      idCache: retryCache(),
      refreshBeforePlan: true,
    });
    const written = upsertCalls.filter((c) => c.entitySetName === ES_COSTS)
      .flatMap((c) => c.targets.map((t) => ({ action: c.action, id: String(t.vsb_capexcostid), month: t.vsb_month, cost: t.vsb_cost })));
    expect(written.map((w) => w.id)).not.toContain(COST_FEB);
    expect(written).toEqual([expect.objectContaining({ action: "create", month: 2, cost: 75 })]);
    // The new row's total counts February once, from the new row.
    expect(targetsOf(ES_CONTRACTS).find((t) => t.vsb_capexprojectcontractid === C1)?.vsb_totalcost).toBe(175);
  });

  it("UT-ACSHEET-BULK-074 the reconcile read leaves out an earlier Save's pending rows but keeps this Save's own (a failed own delete still exists)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    // OTHER_PENDING belongs to an earlier Save; COST_FEB is this Save's own deferred delete, which
    // the hook has registered by the time its background reconcile runs.
    release = pendingDeletes.add({ costIds: [OTHER_PENDING, COST_FEB] });
    listRows.set(COSTS_READ, [rawCost(COST_JAN, 1, 200), rawCost(COST_FEB, 2, 50), rawCost(OTHER_PENDING, 3, 9)]);
    const result = await saveAddCostSheetBulk(typical());
    await result.background;
    const deps = vi.mocked(executeSavePlan).mock.calls[0]?.[1] as SavePlanDeps;
    const read = await deps.loadCosts([C1]);
    expect(read.map((c) => c.id)).toEqual([COST_JAN, COST_FEB]);
  });
});

describe("saveAddCostSheetBulk — the readable save log (D59)", () => {
  /** Every console line in order: info as is, a group title as `## title`, a table row as `| a | b`. */
  const captureLog = () => {
    const out: string[] = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { out.push(String(t)); });
    vi.spyOn(console, "groupCollapsed").mockImplementation((t: unknown) => { out.push(`## ${String(t)}`); });
    vi.spyOn(console, "table").mockImplementation((rows: unknown) => {
      for (const r of rows as Record<string, unknown>[]) out.push(`| ${Object.values(r).join(" | ")}`);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    return out;
  };
  /** The lines of one collapsed group (up to the next group or the next summary line). */
  const group = (out: readonly string[], title: string, after = 0) => {
    const start = out.findIndex((l, i) => i >= after && l === `## ${title}`);
    if (start < 0) return [];
    const rest = out.slice(start + 1);
    const end = rest.findIndex((l) => l.startsWith("## ") || l.startsWith("Add Cost from Table "));
    return end < 0 ? rest : rest.slice(0, end);
  };
  const holdCreates = () => {
    let release: () => void = () => undefined;
    createGate = new Promise<void>((resolve) => { release = resolve; });
    return () => { createGate = null; release(); };
  };
  const entriesOf = (line: string) => /\((.*)\); gate peak/.exec(line)?.[1] ?? "";

  it("UT-ACSHEET-LOG-001 the line lists steps in START order (a held create finishes last but is listed first)", async () => {
    const out = captureLog();
    const release = holdCreates();
    const save = saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    await vi.waitFor(() => expect(callShape()).toContain(`create:${ES_CONTRACTS}`));
    await new Promise((r) => setTimeout(r, 30));
    release();
    await save;
    const line = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
    const entries = entriesOf(line);
    const at = (s: string) => entries.indexOf(s);
    // Deletes start at t = 0 (flags off), contracts before the existing contracts' costs, the new
    // contracts' costs once the held contract create answered.
    expect(at("plan ")).toBe(0);
    expect(at("delete contracts ")).toBeGreaterThan(0);
    expect(at("delete contracts ")).toBeLessThan(at("delete costs "));
    expect(at("upsert contracts (")).toBeLessThan(at("upsert costs (existing contracts) ("));
    expect(at("upsert costs (existing contracts) (")).toBeLessThan(at("upsert costs (new contracts) ("));
    // The steps table follows the same order.
    const steps = group(out, "Steps (start order)").map((l) => l.split(" | ")[0]?.slice(2));
    expect(steps.indexOf("upsert contracts")).toBeLessThan(steps.indexOf("upsert costs (existing contracts)"));
    expect(steps.indexOf("upsert costs (existing contracts)")).toBeLessThan(steps.indexOf("upsert costs (new contracts)"));
  });

  it("UT-ACSHEET-LOG-002 the stage names are log-only: a refused stage-B write keeps \"upsert costs\" in the error", async () => {
    const out = captureLog();
    refuseOnce = new Set([`create:${ES_COSTS}`]);
    const e = await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false })
      .then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SavePlanError);
    expect((e as Error).message).toMatch(/^Save failed in phase 2 \(upsert costs\); /);
    expect(String(((e as Error).cause as Error).message)).toMatch(/^upsert costs \(create\)/);
    const line = out.find((l) => l.startsWith("Add Cost from Table save failed after")) ?? "";
    expect(line).toMatch(/upsert costs \(new contracts\) \(create failed bulk/);
  });

  it("UT-ACSHEET-LOG-003 every ms in the line has a thousands separator, brackets included", async () => {
    const out = captureLog();
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (t += 700));
    await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    const line = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
    expect(line).toMatch(/^Add Cost from Table save: \d{1,3}(,\d{3})+ ms, \d+ requests \(/);
    expect(line).toMatch(/\[\d{1,3}(,\d{3})+ ms\]/);
    expect(line).toMatch(/req avg \d{1,3}(,\d{3})+ ms max \d{1,3}(,\d{3})+ ms/);
    // No bare 4+ digit ms anywhere.
    expect(line).not.toMatch(/\b\d{4,} ms/);
  });

  it("UT-ACSHEET-LOG-004 a failure line counts every request sent (refused ones included), names its root error, and has a Failure group", async () => {
    const out = captureLog();
    refusedActions = new Set(["update"]);
    const e = await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false })
      .then(() => null, (err: unknown) => err) as InstanceType<typeof SavePlanError>;
    expect(e).toBeInstanceOf(SavePlanError);
    const line = out.find((l) => l.startsWith("Add Cost from Table save failed after")) ?? "";
    // Every request SENT, the refused ones included (the error's own total counts only the
    // operations that succeeded): here every bulk call plus every delete (no verify, first attempt).
    const sent = upsertCalls.length + deleteCalls.length;
    expect(sent).toBeGreaterThan(e.requests.total);
    expect(line).toMatch(new RegExp(`^Add Cost from Table save failed after [\\d,]+ ms, ${sent} requests \\(`));
    expect(group(out, "Requests")).toContain(`Requests of the operations that succeeded (the error's own count): ${e.requests.total}`);
    expect(line).toMatch(/; error: .*update bulk write refused/);
    const failure = group(out, "Failure");
    expect(failure).toContain("Phase: 1");
    expect(failure.some((l) => l.startsWith("Steps failed: ") && l.includes("upsert contracts"))).toBe(true);
    expect(failure.some((l) => l.startsWith("Error: SavePlanError: Save failed in phase 1"))).toBe(true);
  });

  it("UT-ACSHEET-LOG-005 a refused plan (SheetConflictError) logs a failure line saying nothing was written, then rethrows it", async () => {
    const out = captureLog();
    const args: Args = { ...typical(), changedRows: [row("C1", C1, months(200)), { ...row("C1", C1, months(300)), rowId: "2" }] };
    const e = await saveAddCostSheetBulk(args).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SheetConflictError);
    const line = out.find((l) => l.startsWith("Add Cost from Table save failed after")) ?? "";
    expect(line).toMatch(/^Add Cost from Table save failed after [\d,]+ ms, 0 requests \(plan failed [\d,]+ ms\); gate peak 0\/16, .*; nothing was written; error: SheetConflictError: refused while planning \(conflict between sheet rows\); the rows' detail is in the raw error group$/);
    expect(group(out, "Failure")).toContain("Refused while planning: nothing was sent");
    expect(upsertCalls).toEqual([]);
  });

  it("UT-ACSHEET-LOG-006 the deferred batches: per-batch timing, requests, 404 read-backs and already-gone rows", async () => {
    const out = captureLog();
    deleteNotFound = new Set([COST_FEB]);
    const result = await saveAddCostSheetBulk(typical());
    await result.background;
    const bg = out.find((l) => l.startsWith("Add Cost from Table background deletes:")) ?? "";
    expect(bg).toMatch(/^Add Cost from Table background deletes: costs 2 req, contracts 1 req, [\d,]+ ms$/);
    const rows = group(out, "Background deletes", out.indexOf(bg));
    // Batch | Started | Took | Requests | 404 read-backs | Already gone | Result
    expect(rows.find((l) => l.startsWith("| delete costs |"))).toMatch(/^\| delete costs \| \d+ ms \| \d+ ms \| 2 \| 1 \| 1 \| ok$/);
    expect(rows.find((l) => l.startsWith("| delete contracts |"))).toMatch(/^\| delete contracts \| \d+ ms \| \d+ ms \| 1 \| 0 \| 0 \| ok$/);
  });

  it("UT-ACSHEET-LOG-007 the background reconcile's read and write are timed in the background group, on their own meter", async () => {
    const out = captureLog();
    // C1's cleared February delete is refused in the background: the reconcile re-reads and rewrites.
    refused = new Set([COST_FEB]);
    const result = await saveAddCostSheetBulk(typical());
    const saveLine = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
    const saveCount = group(out, "Requests").find((l) => l.startsWith("Write requests of this save: "));
    await result.background;
    const bg = out.find((l) => l.startsWith("Add Cost from Table background deletes:")) ?? "";
    expect(bg).toMatch(/, failed, totals reconciled; error: .*403 refused$/);
    const rec = group(out, "Background reconcile", out.indexOf(bg));
    expect(rec).toContain("Contract totals: reconciled (they match what landed)");
    expect(rec).toContain("Write requests of the background reconcile: 1; at most 1 of 16 in flight at once");
    expect(rec.some((l) => /^\| reconcile read \| [\d.]+ m?s \| \d+ ms \| – \| – \| ok$/.test(l))).toBe(true);
    expect(rec.some((l) => /^\| reconcile totals \| [\d.]+ m?s \| \d+ ms \| 1 \| update \d+ rows?: 1 request, bulk \[\d+ ms\] \| ok$/.test(l))).toBe(true);
    // The reconcile write is not in the save line, nor in its request count.
    expect(saveLine).not.toContain("reconcile");
    expect(saveCount).toMatch(/^Write requests of this save: 4; at most [1-4] of 16 in flight at once$/);
    expect(group(out, "Errors", out.indexOf(bg)).some((l) => l.startsWith("Cost delete: BulkDeleteError: "))).toBe(true);
  });

  it("UT-ACSHEET-LOG-008 the meter counts this save only: a concurrent write of other work raises only the shared peak", async () => {
    const out = captureLog();
    const { gatedWrite } = await import("./bulkSend");
    let releaseOther: () => void = () => undefined;
    const other = gatedWrite(() => new Promise<void>((r) => { releaseOther = r; }));
    try {
      await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    } finally {
      releaseOther();
      await other;
    }
    const line = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
    const peak = Number(/gate peak (\d+)\/16/.exec(line)?.[1]);
    const shared = Number(/shared gate peak (\d+)\/16/.exec(line)?.[1]);
    expect(shared).toBeGreaterThan(peak);
    expect(group(out, "Requests")[0]).toBe(`Write requests of this save: 4; at most ${peak} of 16 in flight at once`);
    expect(group(out, "Requests")).toContain(`Shared write gate: up to ${shared} of 16 in flight, other work included`);
  });

  it("UT-ACSHEET-LOG-009 the success groups: plan counts, deferred deletes and the verify state", async () => {
    const out = captureLog();
    const result = await saveAddCostSheetBulk(typical());
    await result.background;
    const line = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
    expect(line).toMatch(/, delete costs deferred, delete contracts deferred\); gate peak \d+\/16, req avg [\d,]+ ms max [\d,]+ ms, verify skipped, 0 already gone$/);
    expect(group(out, "Plan")).toEqual([
      "Contracts: 1 created, 1 updated, 1 deleted",
      "Cost rows: 1 created, 1 updated, 1 deleted",
      "Changed cells equal to the stored value (nothing written): 0",
      "Cost deletes planned: 1; only if they still exist (left by a failed attempt): 0",
      "Contract deletes planned: 1 (their cost rows and comments go by the Dataverse cascade)",
      "Contract totals planned: 2",
    ]);
    expect(group(out, "Deferred deletes")[0]).toBe("Cost rows deleted in the background: 1");
    expect(group(out, "Requests")).toContain("Existence check before writing: skipped (first attempt)");
    // No GUID anywhere in the readable output.
    expect(out.join("\n")).not.toMatch(GUID);
  });

  it("UT-ACSHEET-LOG-010 prepareLogReport: one decimal, singular row, the prepare group", async () => {
    const { prepareLogReport } = await import("./addCostSheet");
    const t = { total: 4.24, roundTripCheck: 0.31, align: 0.4, diff: 1234.56, deletions: 0.6, orphans: 1 };
    const r = prepareLogReport(t, 6.1, 2.44, 1);
    expect(r.summary).toBe(
      "Add Cost from Table prepare: 4.2 ms (round-trip check 0.3 ms, align 0.4 ms, diff 1,234.6 ms, deletions 0.6 ms, "
      + "orphans 1.0 ms; last edit's grid read-back 6.1 ms, validation 2.4 ms; 1 row)",
    );
    expect(r.sections.map((s) => s.title)).toEqual(["Prepare (client side)"]);
    expect(prepareLogReport(t, 0, 0, 1200).summary).toMatch(/; 1,200 rows\)$/);
  });

  it("UT-ACSHEET-LOG-011 screenSaveFailureReport: the classified kind, the user's text, the readable chain and the raw error", async () => {
    const { screenSaveFailureReport } = await import("./addCostSheet");
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const error = new SavePlanError({
      phase: 4, cause: new DataError(`delete contracts row ${id}`, undefined, 403), reconciled: true, committedBefore: false,
      requests: { verify: 0, contracts: 0, costs: 0, costDeletes: 0, contractDeletes: 1, reconcile: 0, total: 1 },
    });
    const r = screenSaveFailureReport(error, "phase", `Could not save ${id}`);
    expect(r.summary).toBe("Add Cost from Table save failed: phase; the screen shows: \"Could not save <id>\"");
    expect(r.sections.map((s) => s.title)).toEqual(["Failure", "Raw error (for support)"]);
    expect(r.sections[1]?.raw).toBe(error);
    expect(r.sections[0]?.lines).toContain("Phase: 4");
    expect(r.sections[0]?.lines.join("\n")).not.toContain(id);
    expect(r.sections[0]?.lines.some((l) => /caused by DataError \(HTTP 403\): delete contracts row <id>/.test(l))).toBe(true);
  });

  it("UT-ACSHEET-LOG-012 bookPatchFailureReport: the save stands; the root error, ids replaced, then the raw error", async () => {
    const { bookPatchFailureReport } = await import("./addCostSheet");
    const error = new TypeError("book.lines is not iterable 3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    const r = bookPatchFailureReport(error);
    expect(r.summary).toBe(
      "Add Cost from Table: patching the DEVEX/CAPEX book failed; the save itself succeeded and the refetch brings "
      + "the saved state: TypeError: book.lines is not iterable <id>",
    );
    expect(r.sections[1]?.raw).toBe(error);
  });
});
describe("saveAddCostSheetBulk — the readable save log, review fixes (D59)", () => {
  const captureLog = () => {
    const out: string[] = [];
    const raw: unknown[] = [];
    vi.spyOn(console, "info").mockImplementation((t: unknown) => { out.push(String(t)); });
    vi.spyOn(console, "groupCollapsed").mockImplementation((t: unknown) => { out.push(`## ${String(t)}`); });
    vi.spyOn(console, "table").mockImplementation((rows: unknown) => {
      for (const r of rows as Record<string, unknown>[]) out.push(`| ${Object.values(r).join(" | ")}`);
    });
    vi.spyOn(console, "error").mockImplementation((e: unknown) => { raw.push(e); });
    return { out, raw };
  };
  /** Two rows writing the same cell of one contract, named so a leak is easy to see. */
  const conflicting = (): Args => ({
    ...typical(),
    changedRows: [
      { ...row("Wirmighausen Turbine", C1, months(200)), accountName: "Zebra Ledger" },
      { ...row("Wirmighausen Turbine", C1, months(300)), accountName: "Zebra Ledger", rowId: "2" },
    ],
    existingContracts: [contract(C1, "Wirmighausen Turbine"), contract(DOOMED, "Doomed")],
  });

  it("UT-ACSHEET-LOG-013 a conflict's contract and account names never reach a readable line; the raw group keeps them", async () => {
    const { out, raw } = captureLog();
    const e = await saveAddCostSheetBulk(conflicting()).then(() => null, (err: unknown) => err);
    expect(e).toBeInstanceOf(SheetConflictError);
    // The error itself does carry the names (that is why they are kept out).
    expect(`${(e as Error).message} ${(e as InstanceType<typeof SheetConflictError>).detail}`).toMatch(/Wirmighausen|Zebra/);
    expect(out.join("\n")).not.toMatch(/Wirmighausen|Zebra/);
    expect(out).toContain("## Raw error (for support)");
    expect(raw).toEqual([e]);
    // The screen's report: the conflict's user text names the rows too, so it is left out.
    const { screenSaveFailureReport } = await import("./addCostSheet");
    const failure = toSaveFailure(e);
    const userText = saveFailureText(failure);
    expect(userText).toMatch(/Wirmighausen|Zebra/);
    const r = screenSaveFailureReport(e, failure.kind, userText);
    expect(r.summary).toBe(
      "Add Cost from Table save failed: conflict; the screen shows the conflict message (it names the rows, so it is left out; see the raw error)",
    );
    expect([r.summary, ...r.sections.flatMap((s) => s.lines)].join("\n")).not.toMatch(/Wirmighausen|Zebra/);
    expect(r.sections[1]?.raw).toBe(e);
  });

  for (const defer of [false, true]) {
    it(`UT-ACSHEET-LOG-01${defer ? "5" : "4"} overlapping cost-delete batches are counted per call (deferred ${defer ? "on" : "off"}), the retry batch named in the log only`, async () => {
      const { out } = captureLog();
      // A failed attempt created a March row, blank now: on this retry it is `costDeletesIfExist`.
      const LEFT_BEHIND = "a0000007-0000-4000-8000-000000000007";
      stored.add(LEFT_BEHIND);
      // Hold every cost delete so both batches are in flight together.
      let release: () => void = () => undefined;
      costDeleteHold = new Promise<void>((r) => { release = r; });
      const save = saveAddCostSheetBulk({
        ...typical(), idCache: new Map([[`cost:${C1}|2026|3`, LEFT_BEHIND]]),
        deferContractDeletes: defer, deferCostDeletes: defer,
      });
      await vi.waitFor(() => expect(costDeletesInFlight).toBe(2));
      costDeleteHold = null;
      release();
      const result = await save;
      await result.background;
      // Deferred: the batches table under the background line (the save's steps table only has the
      // deferred placeholder); waited: the save's steps table.
      const from = defer ? out.indexOf("## Background deletes") : 0;
      const rows = out.slice(Math.max(0, from)).filter((l) => l.startsWith("| delete costs"));
      // Batch tables (background) or steps tables (waited): one row per batch, 1 request each.
      const batch = (name: string) => rows.find((l) => l.startsWith(`| ${name} |`)) ?? "";
      expect(batch("delete costs")).toMatch(/^\| delete costs \| [^|]+ \| [^|]+ \| 1 \|/);
      expect(batch("delete costs (left by a failed attempt)")).toMatch(/^\| delete costs \(left by a failed attempt\) \| [^|]+ \| [^|]+ \| 1 \|/);
      if (!defer) {
        const line = out.find((l) => l.startsWith("Add Cost from Table save:")) ?? "";
        expect(line).toMatch(/delete costs 1 req [\d,]+ ms/);
        expect(line).toMatch(/delete costs \(left by a failed attempt\) 1 req [\d,]+ ms/);
      }
    });
  }

  it("UT-ACSHEET-LOG-016 the Requests group says what its counts leave out", async () => {
    const { out } = captureLog();
    await saveAddCostSheetBulk({ ...typical(), deferContractDeletes: false, deferCostDeletes: false });
    const start = out.indexOf("## Requests");
    expect(out.slice(start)).toContain("Not counted as requests: the reconcile's cost reads and the per-row fallback's existence check");
  });
});