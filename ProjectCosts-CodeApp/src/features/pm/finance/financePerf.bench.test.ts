// @vitest-environment jsdom
/**
 * Finance screen: the network before / after (D137).
 *
 * Only the SDK edge is faked: every generated service the Finance screen reads answers after a fixed latency, a fake
 * `PlanClient` answers the single writes and a fake bulk backend answers `createMany` / `updateMany` the way the real
 * one costs (a create = one request per 500 rows; an update = one guard read per 40 ids + the request). The real hooks,
 * the real `data/finance.ts` reads, the real rules, `perf.ts` and the real `executePlan` run.
 *
 * Each scenario is a WHOLE flow as the user sees it, reload included, run three ways:
 *  - BEFORE: every switch off (`FINANCE_PERF_ALL_OFF`), today's requests exactly;
 *  - AFTER: the defaults (everything on except the bulk switch);
 *  - AFTER + BULK: the defaults and `bulkSchedules` (the tranche Save only; it is the only flow that has schedules).
 *
 * Reported per scenario:
 *  - `requests`: calls sent;
 *  - `peak`: most calls in flight at once;
 *  - `rounds`: (last call's end - first call's start) / one call's latency, i.e. the serial depth in round trips.
 *
 * These are MODELLED numbers (a fixed fake latency, no network, no server time). They say how many requests the screen
 * sends and how many of them wait for another one; they are NOT timings of the DEV environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const LAT = 25;

const net = vi.hoisted(() => {
  const calls: { name: string; t0: number; t1: number }[] = [];
  const state = { inflight: 0, peak: 0, latency: 25 };
  const rows: Record<string, Record<string, unknown>[]> = {};
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const hit = async (name: string) => {
    const t0 = performance.now();
    state.inflight += 1;
    state.peak = Math.max(state.peak, state.inflight);
    await sleep(state.latency);
    state.inflight -= 1;
    calls.push({ name, t0, t1: performance.now() });
  };
  const svc = (name: string) => ({
    getAll: async (_o?: unknown) => {
      await hit(`read:${name}`);
      return { success: true, data: rows[name] ?? [], skipToken: undefined };
    },
  });
  return { calls, state, rows, hit, svc };
});

vi.mock("@/generated/services/Vsb_projectsService", () => ({ Vsb_projectsService: net.svc("projects") }));
vi.mock("@/generated/services/Vsb_projectstatesService", () => ({ Vsb_projectstatesService: net.svc("states") }));
vi.mock("@/generated/services/Vsb_financingcategoriesService", () => ({ Vsb_financingcategoriesService: net.svc("categories") }));
vi.mock("@/generated/services/Vsb_financinginputsService", () => ({ Vsb_financinginputsService: net.svc("inputs") }));
vi.mock("@/generated/services/Vsb_financinginputsrepaymentamountsService", () => ({ Vsb_financinginputsrepaymentamountsService: net.svc("repayments") }));
vi.mock("@/generated/services/Vsb_financinginputstepupmarginsesService", () => ({ Vsb_financinginputstepupmarginsesService: net.svc("stepups") }));
vi.mock("@/generated/services/Vsb_capexprojectcontractsService", () => ({ Vsb_capexprojectcontractsService: net.svc("contracts") }));
vi.mock("@/generated/services/Vsb_capexcostsService", () => ({ Vsb_capexcostsService: net.svc("costs") }));
vi.mock("@/generated/services/Vsb_generatortypeinprojectsService", () => ({ Vsb_generatortypeinprojectsService: net.svc("types") }));
vi.mock("@/generated/services/Vsb_generatorinprojectsService", () => ({ Vsb_generatorinprojectsService: net.svc("turbines") }));
vi.mock("@/generated/services/AssumptionsDebtService", () => ({ AssumptionsDebtService: net.svc("debt") }));
vi.mock("@/generated/services/AssumptionsBanksService", () => ({ AssumptionsBanksService: net.svc("banks") }));
vi.mock("@/generated/services/AssumptionsKfWTrancheService", () => ({ AssumptionsKfWTrancheService: net.svc("kfw") }));

import { CHOICE_FINANCE } from "@/data/dataverseNames";
import { FINANCE_PERF_ALL_OFF, financePerf, setFinancePerfFlags, type FinancePerfFlags } from "@/data/financeFlags";
import { qk } from "@/data/keys";
import { loadTotalDevexCapex } from "@/data/finance";
import { executePlan, type PlanClient } from "@/data/executePlan";
import { setBulkBackend, type BulkBackend } from "@/data/bulkBackend";
import type { WritePlan } from "@/data/writePlan";
import {
  useActiveTurbineCount, useBanks, useDebtAssumptions, useFinanceProject, useFinancingCategories,
  useFinancingInputs, useKfwTranches, useRepaymentAmounts, useStepUpMargins, useTotalDevexCapex,
} from "./hooks";
import {
  FINANCE_WRITE_ACTION, optimizeFinancingOptionPlan, optimizeTrancheDeletePlan, optimizeTrancheSavePlan, reloadKeys,
  seedGroupJob, type ReloadKind,
} from "./perf";
import {
  buildCategoryMap, buildDecommissioningStandard, buildDsraStandard, buildSeniorDebtStandard, planFinancingOption,
  planFinancingOptionOnVisit, planSeeds, planTrancheDelete, planTrancheSave, seedJobs, seedsAllowed, toDebtTech,
  type FinanceProject, type FinancingInputRow, type SeniorDebtFormState, type StepUpRow, type RepaymentRow,
} from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);
/** `guid()` in the OData helpers refuses a non-GUID id, so the read fixtures use GUID-shaped ids. */
const g = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PID = g(1);

const project: FinanceProject = {
  id: PID, projectIdText: "DE-0001", projectName: "Windpark Nord", countryName: "Germany", countryCode: "c-de",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: d("2026-06-30"), construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", clusterStateOrder: 4,
  financingOptions: null,
};

const CATEGORY_ROWS = [1, 2, 3, 4, 5, 6].map((order) => ({
  vsb_financingcategoryid: `c${order}`, vsb_name: `cat${order}`, vsb_order: order,
}));
const CATEGORIES = CATEGORY_ROWS.map((r) => ({ id: r.vsb_financingcategoryid, name: r.vsb_name, order: r.vsb_order }));

/** The rows the fake Dataverse answers a visit with: 85 CAPEX contracts (3 chunks of 40), 3 generator types. */
function seedRows(): void {
  const input = (id: string, order: number) => ({
    vsb_financinginputid: id, vsb_name: id, _vsb_financingcategory_value: `c${order}`, statecode: 0, createdon: "2026-01-01",
  });
  net.rows.projects = [{
    vsb_projectid: PID, vsb_name: "DE-0001", vsb_projectname: "Windpark Nord",
    _vsb_country_value: "c-de", "_vsb_country_value@OData.Community.Display.V1.FormattedValue": "Germany",
    vsb_technology: 0, vsb_financingoptions: 1,
  }];
  net.rows.states = [{ vsb_projectstateid: "s1", vsb_name: "Cluster 4", vsb_order: 4 }];
  net.rows.categories = CATEGORY_ROWS;
  net.rows.inputs = [input("eq", 1), input("vat", 2), input("t1", 3), input("t2", 3), input("dsra", 4), input("dec", 5)];
  net.rows.repayments = [];
  net.rows.stepups = [];
  net.rows.contracts = Array.from({ length: 85 }, (_, i) => ({ vsb_capexprojectcontractid: g(1000 + i) }));
  net.rows.costs = [{ vsb_capexcostid: "x1", _vsb_contract_value: g(1001), vsb_cost: 100 }];
  net.rows.types = [1, 2, 3].map((n) => ({ vsb_generatortypeinprojectid: g(2000 + n) }));
  net.rows.turbines = [{ vsb_generatorinprojectid: "w1", statecode: 0 }];
  net.rows.debt = [{ country: "Germany", debttype: "debt facility", category: "", pv: 1, wind: 1 }];
  net.rows.banks = [{ id: "B1", bankname: "NordLB" }];
  net.rows.kfw = [{ loantenor_repayfreeperiod_ratefixing: "10-2-10" }];
}

/* ═════════════════════════════════════════════════════════════ write harness ══ */

const PKS: Record<string, string> = {
  vsb_financinginputs: "vsb_financinginputid",
  vsb_financinginputsrepaymentamounts: "vsb_financinginputsrepaymentamountid",
  vsb_financinginputstepupmarginses: "vsb_financinginputstepupmarginsid",
  vsb_projects: "vsb_projectid",
};
let nextId = 0;
interface WriteLog { op: string; entitySet: string; id?: string }
const writeLog: WriteLog[] = [];

const fakeClient = (): PlanClient => ({
  createRecordAsync: async (es: string, data: unknown) => {
    await net.hit(`create:${es}`);
    nextId += 1;
    const id = `new-${nextId}`;
    writeLog.push({ op: "create", entitySet: es, id });
    return { success: true, data: { ...(data as object), [PKS[es] ?? "id"]: id } };
  },
  updateRecordAsync: async (es: string, id: string) => {
    await net.hit(`update:${es}`);
    writeLog.push({ op: "update", entitySet: es, id });
    return { success: true, data: {} };
  },
  deleteRecordAsync: async (es: string, id: string) => {
    await net.hit(`delete:${es}`);
    writeLog.push({ op: "delete", entitySet: es, id });
    return { success: true };
  },
}) as unknown as PlanClient;

/** Costs a bulk call as the real backend does: creates one request per 500 rows, updates one guard read per 40 ids + the request. */
const countingBulk = (): BulkBackend => ({
  async createMany(es, rows) {
    for (let i = 0; i < rows.length; i += 500) await net.hit(`bulk-create:${es}`);
    for (const r of rows) writeLog.push({ op: "create", entitySet: es, id: r.id });
    return { ids: rows.map((r) => r.id), requests: Math.ceil(rows.length / 500) };
  },
  async updateMany(es, rows) {
    for (let i = 0; i < rows.length; i += 40) await net.hit(`read:guard:${es}`);
    for (let i = 0; i < rows.length; i += 500) await net.hit(`bulk-update:${es}`);
    for (const r of rows) writeLog.push({ op: "update", entitySet: es, id: r.id });
    return { requests: 1 };
  },
});

interface Metrics { requests: number; peak: number; rounds: number }
const reset = () => { net.calls.length = 0; net.state.inflight = 0; net.state.peak = 0; writeLog.length = 0; nextId = 0; };
/** `rounds` = (last call's end - first call's start) / one call's latency: the serial depth, from the call timestamps. */
const metrics = (): Metrics => ({
  requests: net.calls.length, peak: net.state.peak,
  rounds: net.calls.length === 0 ? 0
    : Math.round((Math.max(...net.calls.map((c) => c.t1)) - Math.min(...net.calls.map((c) => c.t0))) / LAT),
});

/* ════════════════════════════════════════════════════════════ plan fixtures ══ */

const seniorForm = (over: Partial<SeniorDebtFormState> = {}): SeniorDebtFormState => ({
  formDirty: true, isSaving: false, trancheId: null,
  trancheStatus: CHOICE_FINANCE.trancheStatus.termSheet,
  bankId: "B7", bankName: "NordLB", otherBankName: "", kfwEnabled: false, kfwValue: null,
  financialClose: d("2026-12-01"), tenorYears: 25, tenorMonths: 0,
  drawdown: CHOICE_FINANCE.drawdown.proRata, gearing: CHOICE_FINANCE.gearing.debtSizing,
  fixedAmountOption: CHOICE_FINANCE.fixedAmount.percentOfCapex, fixedAmountValue: "",
  repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual,
  startRepaymentYears: 1, startRepaymentMonths: 0, frequencyOfRepayment: 2,
  hedging: "85.0", upfrontFeeOption: CHOICE_FINANCE.upfrontFee.percentageOfDebt, upfrontFeeValue: "1.25",
  commitmentFeeOption: CHOICE_FINANCE.commitmentFee.percentageOfMargin,
  commitmentFeeValue: "0.35", commitmentFeePeriodYears: 1, commitmentFeePeriodMonths: 0,
  swapMargin: "", bankMarginConstruction: "1.85", bankMarginOperational: "1.65",
  fixedInterestRateYears: 10, fixedInterestRateMonths: 0, swapAfterFixedPeriod: false, bankRate: "",
  baseRate: CHOICE_FINANCE.baseRate.euribor3M, swapRate: "2.70", dscrContracted: "1.15x", dscrUncontracted: "1.35x",
  stepUpEnabled: true, stepUpRows: [], repaymentRows: [], country: "Germany", otherTranches: [], projectId: PID,
  ...over,
});

const YEARS = Array.from({ length: 25 }, (_, i) => 2029 + i);
const repaymentRows = (stored: boolean): RepaymentRow[] =>
  YEARS.map((year) => ({ year, value: "1000", valid: true, dirty: true, repaymentAmountRecordId: stored ? `r${year}` : null }));
const stepUpRows: StepUpRow[] = [
  { id: 1, durationYY: 3, margin: "1.00", valid: true }, { id: 2, durationYY: 6, margin: "1.25", valid: true },
  { id: 3, durationYY: 8, margin: "1.50", valid: true }, { id: 4, durationYY: 10, margin: "1.75", valid: true },
];
const storedRepayments = YEARS.map((year) => ({ id: `r${year}`, year, financingInputId: "t1" }));
const storedStepUps = [1, 2, 3, 4].map((order) => ({ id: `s${order}`, order, startYear: 1, duration: 1, margin: 1, financingInputId: "t1" }));

const savePlan = (edit: boolean): WritePlan => planTrancheSave({
  form: seniorForm({ trancheId: edit ? "t1" : null, repaymentRows: repaymentRows(edit), stepUpRows }),
  project, seniorDebtCategoryId: "c3", duplicateIds: edit ? ["t1"] : [],
  storedRepayments: edit ? storedRepayments : [], storedStepUps: edit ? storedStepUps : [],
});

/* ═════════════════════════════════════════════════════════════ read harness ══ */

const wrapperFor = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

/** The visit's reads, exactly as the Screen calls them: the CAPEX total and the turbines only once wanted (`lazyReads`). */
function useVisitReads(projectId: string) {
  const lazy = financePerf().lazyReads;
  const projectQ = useFinanceProject(projectId);
  const categoriesQ = useFinancingCategories();
  const slicesQ = useDebtAssumptions(projectQ.data?.countryName ?? null);
  const inputsQ = useFinancingInputs(projectId, categoriesQ.data);
  const repaymentsQ = useRepaymentAmounts(projectId);
  const stepUpsQ = useStepUpMargins(projectId);
  const banksQ = useBanks();
  const kfwQ = useKfwTranches();
  const capexQ = useTotalDevexCapex(projectId, !lazy);
  const turbinesQ = useActiveTurbineCount(projectId, !lazy);
  return { projectQ, categoriesQ, slicesQ, inputsQ, repaymentsQ, stepUpsQ, banksQ, kfwQ, capexQ, turbinesQ };
}

const ALL_READS = ["projects", "states", "categories", "inputs", "repayments", "stepups", "contracts", "costs", "types", "turbines", "debt", "banks", "kfw"];
const LAZY_READS = ["contracts", "costs", "types", "turbines"];
const seen = (name: string) => net.calls.some((c) => c.name === `read:${name}`);

/** Mounts the screen's reads under `flags` and waits until they have all landed. The visit itself is measured too. */
async function visit(flags: Partial<FinancePerfFlags>): Promise<{ m: Metrics; client: QueryClient }> {
  setFinancePerfFlags(flags);
  reset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  renderHook(() => useVisitReads(PID), { wrapper: wrapperFor(client) });
  const expected = financePerf().lazyReads ? ALL_READS.filter((n) => !LAZY_READS.includes(n)) : ALL_READS;
  await waitFor(() => {
    expect(expected.filter((n) => !seen(n))).toEqual([]);
    expect(client.isFetching()).toBe(0);
  }, { timeout: 5000 });
  return { m: metrics(), client };
}

/** What `usePlanWrite` does after a job: awaits the reload of the job's own keys, or of the whole screen. */
async function reloadAfter(client: QueryClient, kind: ReloadKind): Promise<void> {
  const keys = reloadKeys(PID, kind);
  if (!keys) { await client.invalidateQueries({ queryKey: qk.financeAll(PID) }); return; }
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/* ═══════════════════════════════════════════════════════════════ scenarios ══ */

type Mode = "before" | "after" | "afterBulk" | "afterNarrow";
const MODES: Record<Mode, Partial<FinancePerfFlags>> = {
  before: FINANCE_PERF_ALL_OFF,
  after: {},
  afterBulk: { bulkSchedules: true },
  /** D149: the defaults with the tranche group back at 8 wide (`wideGroups` off): the state before D149. */
  afterNarrow: { wideGroups: false },
};

interface Row { scenario: string; before: Metrics; after: Metrics; afterBulk?: Metrics }
const table: Row[] = [];
const newBulkId = (() => { let i = 0; return () => `bulk-${(i += 1)}`; })();

/** Runs `flow` once per mode on a mounted screen and returns each mode's metrics. */
async function compare(flow: (client: QueryClient) => Promise<void>, modes: Mode[] = ["before", "after"]): Promise<Record<Mode, Metrics>> {
  const out = {} as Record<Mode, Metrics>;
  for (const mode of modes) {
    setBulkBackend(countingBulk());
    const { client } = await visit(MODES[mode]);
    reset();
    await flow(client);
    out[mode] = metrics();
  }
  return out;
}

const saveFlow = (edit: boolean) => async (client: QueryClient) => {
  await net.hit("read:duplicate");
  await executePlan(optimizeTrancheSavePlan(savePlan(edit), financePerf(), { newId: newBulkId }), "bench", fakeClient());
  await reloadAfter(client, "schedules");
};

beforeEach(() => { net.state.latency = LAT; seedRows(); });
afterEach(() => { setFinancePerfFlags(null); setBulkBackend(null); net.calls.length = 0; });

describe("UT-FINPERF before / after (modelled round trips, see the file header)", () => {
  it("UT-FINPERF-001 a visit: the reads the screen sends", async () => {
    const before = (await visit(MODES.before)).m;
    const after = (await visit(MODES.after)).m;
    table.push({ scenario: "visit reads (13 services before, 9 after: the CAPEX total and turbines wait for their card)", before, after });
    expect(after.requests).toBeLessThan(before.requests);
    expect(after.rounds).toBeLessThan(before.rounds);
    expect(LAZY_READS.some(seen)).toBe(false);
  });

  it("UT-FINPERF-002 tranche SAVE, edit: 1 tranche + 25 repayments + 4 step-ups, reload included", async () => {
    const r = await compare(saveFlow(true), ["before", "after", "afterBulk", "afterNarrow"]);
    table.push({ scenario: "tranche save, EDIT (duplicate read + 30 writes + reload)", before: r.before, after: r.after, afterBulk: r.afterBulk });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
    expect(r.afterBulk.requests).toBeLessThan(r.after.requests);
    // D149: the bulk path still beats the per-row path of D137 (8 wide) on rounds; the 16-wide per-row path (`after`) is now as
    // fast or faster than the bulk one, which is why `bulkSchedules` stays off until the DEV probe shows a reason.
    expect(r.afterBulk.rounds).toBeLessThanOrEqual(r.afterNarrow.rounds);
    expect(r.after.requests).toBe(r.afterNarrow.requests); // `wideGroups` changes how the group is sent, not what is sent
    expect(r.after.rounds).toBeLessThan(r.afterNarrow.rounds);
    console.info(`[FINPERF] D149 tranche save EDIT: ${r.afterNarrow.requests} requests, ${r.afterNarrow.rounds} rounds (8 wide) -> ${r.after.rounds} rounds (16 wide); bulk path ${r.afterBulk.requests} requests, ${r.afterBulk.rounds} rounds`);
  });

  it("UT-FINPERF-003 tranche SAVE, new: 1 tranche + 25 repayments + 4 step-ups, reload included", async () => {
    const r = await compare(saveFlow(false), ["before", "after", "afterBulk"]);
    table.push({ scenario: "tranche save, NEW (duplicate read + 30 writes + reload)", before: r.before, after: r.after, afterBulk: r.afterBulk });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
    expect(r.afterBulk.requests).toBeLessThan(r.after.requests);
  });

  it("UT-FINPERF-004 tranche DELETE: 4 step-ups + 25 repayments + the tranche, reload included", async () => {
    const r = await compare(async (client) => {
      await executePlan(optimizeTrancheDeletePlan(planTrancheDelete("t1", storedStepUps, storedRepayments), financePerf()), "bench", fakeClient());
      await reloadAfter(client, "schedules");
    });
    table.push({ scenario: "tranche delete (30 deletes + reload)", before: r.before, after: r.after });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
    expect(writeLog.at(-1)).toMatchObject({ op: "delete", entitySet: "vsb_financinginputs" });
  });

  it("UT-FINPERF-005 financing option switch to All Equity: project + VAT + 3 tranches + DSRA, reload included", async () => {
    const inputs: FinancingInputRow[] = ["vat:2", "t1:3", "t2:3", "t3:3", "dsra:4"].map((s) => {
      const [id, order] = s.split(":");
      return { id: id!, name: id!, categoryId: `c${order}`, categoryOrder: Number(order), uniqueKeyString: null, status: 0, raw: {}, canEdit: true, canDelete: true };
    });
    const r = await compare(async (client) => {
      await executePlan(optimizeFinancingOptionPlan(planFinancingOption(project, CHOICE_FINANCE.financingOptions.allEquity, inputs), financePerf()), "bench", fakeClient());
      await reloadAfter(client, "option");
    });
    table.push({ scenario: "financing option switch (6 writes + reload)", before: r.before, after: r.after });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
  });

  it("UT-FINPERF-006 first visit of a new project: the option patch + 5 seeds, reload included", async () => {
    const tech = toDebtTech(project.technology);
    const seeds = seedsAllowed(planSeeds(
      project, buildCategoryMap(CATEGORIES), [],
      buildSeniorDebtStandard([], tech, project), buildDsraStandard([], tech), buildDecommissioningStandard([], tech, project),
    ), true);
    expect(seeds).toHaveLength(5);
    const optionPlan = planFinancingOptionOnVisit({ id: PID, financingOptions: null })!;
    const r = await compare(async (client) => {
      if (financePerf().concurrentWrites) {
        const job = seedGroupJob({ seeds, project, optionPlan, action: FINANCE_WRITE_ACTION })!;
        await executePlan(job.plan as WritePlan, "bench", fakeClient());
        await reloadAfter(client, "option");
        return;
      }
      // Today: the option patch is a job, then one job per seed, each followed by the reload of the whole screen.
      await executePlan(optionPlan, "bench", fakeClient());
      await reloadAfter(client, "option");
      for (const job of seedJobs(seeds, project)) {
        await executePlan(job.plan as WritePlan, "bench", fakeClient());
        await reloadAfter(client, "option");
      }
    });
    table.push({ scenario: "visit seeds on a new project (6 writes: 6 jobs, 6 reloads before; 1 job, 1 reload after)", before: r.before, after: r.after });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
    expect(writeLog.filter((w) => w.op === "create")).toHaveLength(5);
  });

  it("UT-FINPERF-007 a status toggle or a panel save: 1 write + the reload", async () => {
    const r = await compare(async (client) => {
      await executePlan({ writes: [{ op: "update", entitySet: "vsb_financinginputs", id: "eq", data: { statecode: 1 }, reason: "change the financing input's status" }], log: [] }, "bench", fakeClient());
      await reloadAfter(client, "inputs");
    });
    table.push({ scenario: "one toggle / panel save (1 write + reload)", before: r.before, after: r.after });
    expect(r.after.requests).toBeLessThan(r.before.requests);
    expect(r.after.rounds).toBeLessThan(r.before.rounds);
  });

  it("UT-FINPERF-008 the CAPEX total is the same sum read in order or together, and never more than 8 chunk reads at once", async () => {
    net.rows.contracts = Array.from({ length: 400 }, (_, i) => ({ vsb_capexprojectcontractid: g(5000 + i) }));
    net.rows.costs = [{ vsb_capexcostid: "x1", _vsb_contract_value: g(5001), vsb_cost: 100 }];
    reset();
    const ordered = await loadTotalDevexCapex(PID, false);
    const orderedCalls = net.calls.length;
    const orderedRounds = metrics().rounds;
    reset();
    const together = await loadTotalDevexCapex(PID, true);
    // 400 contracts = 10 chunks of 40, each answered with the same cost row: the sum is the same either way.
    expect(together).toBe(ordered);
    expect(together).toBe(1000);
    expect(net.calls.length).toBe(orderedCalls);
    expect(net.calls.length).toBe(1 + 10);
    expect(net.state.peak).toBeLessThanOrEqual(8);
    expect(metrics().rounds).toBeLessThan(orderedRounds);
  });

  it("UT-FINPERF-099 prints the table", () => {
    const cell = (m?: Metrics) => (m ? `${String(m.requests).padStart(3)} req / ${String(m.rounds).padStart(2)} rounds` : "-".padStart(19));
    const lines = table.map((r) => `${r.scenario.padEnd(100)} | ${cell(r.before)} | ${cell(r.after)} | ${cell(r.afterBulk)}`);
    // eslint-disable-next-line no-console
    console.log(`\nFINANCE PERF, BEFORE / AFTER (modelled: ${LAT} ms per call; bulk = bulkSchedules on)\n${"scenario".padEnd(100)} | ${"before".padEnd(19)} | ${"after".padEnd(19)} | after + bulk\n${lines.join("\n")}\n`);
    expect(table.length).toBeGreaterThan(0);
  });
});
