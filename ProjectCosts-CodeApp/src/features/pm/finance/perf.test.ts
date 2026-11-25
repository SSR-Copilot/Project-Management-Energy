/**
 * Finance screen performance layer (D137) — `perf.ts`, `data/financeFlags.ts`, `data/financeBulk.ts` and the
 * `failureText` field of `usePlanWrite`.
 *
 * The core claim of this work is "same rows, fewer requests". So the main tests run the SAME plan three ways against an
 * in-memory fake Dataverse — today's per-row path (every switch off), the concurrent path (the defaults) and the bulk
 * path — and compare the rows each one leaves behind, ids aside. The fake client and the fake bulk backend answer the
 * way the real ones do for a row that exists and for one that does not.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHOICE_FINANCE, ES, ES_FINANCE } from "@/data/dataverseNames";
import { FINANCE_PERF_ALL_OFF, financePerf, setFinancePerfFlags, type FinancePerfFlags } from "@/data/financeFlags";
import { executePlan, PlanError, PlanRefusedError, type PlanClient } from "@/data/executePlan";
import { setOwnerBindGuard } from "@/data/ownerBindGuard";
import { BulkRowsGoneError, setBulkBackend, type BulkBackend } from "@/data/bulkBackend";
import { createGeneratorsBulkBackend } from "@/data/generatorsBulk";
import { FINANCE_BULK_TABLES } from "@/data/financeBulk";
import { writeErrorMessage } from "@/data/usePlanWrite";
import { BulkBackendValidationError } from "@/data/bulkTypes";
import type { WritePlan } from "@/data/writePlan";
import {
  FINANCE_WRITE_ACTION, optimizeFinancingOptionPlan, optimizeTrancheDeletePlan, optimizeTrancheSavePlan,
  reloadKeys, seedGroupJob, withReload,
} from "./perf";
import {
  NOTIFY, buildCategoryMap, buildDecommissioningStandard, buildDsraStandard, buildSeniorDebtStandard, financingOptionJob,
  planFinancingOption, planSeeds, planTrancheDelete, planTrancheSave, seedJobs, seedWrite, seedsAllowed, toDebtTech,
  type FinanceProject, type FinancingInputRow, type RepaymentRow, type SeniorDebtFormState, type StepUpRow,
} from "./rules";
import { withCategoryOrder } from "@/data/finance";

/* ═══════════════════════════════════════════════════════════════ fixtures ══ */

const d = (s: string) => new Date(`${s}T00:00:00`);

const project: FinanceProject = {
  id: "P1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryName: "Germany", countryCode: "DE",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: d("2026-06-30"), construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120_000, totalCapacity: 50, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", clusterStateOrder: 4, financingOptions: null,
};

const seniorForm = (over: Partial<SeniorDebtFormState> = {}): SeniorDebtFormState => ({
  formDirty: true, isSaving: false, trancheId: null, trancheStatus: CHOICE_FINANCE.trancheStatus.termSheet,
  bankId: "B7", bankName: "NordLB", otherBankName: "", kfwEnabled: false, kfwValue: null,
  financialClose: d("2026-12-01"), tenorYears: 25, tenorMonths: 0,
  drawdown: CHOICE_FINANCE.drawdown.proRata, gearing: CHOICE_FINANCE.gearing.debtSizing,
  fixedAmountOption: CHOICE_FINANCE.fixedAmount.percentOfCapex, fixedAmountValue: "",
  repaymentProfile: CHOICE_FINANCE.repaymentProfile.individual, startRepaymentYears: 1, startRepaymentMonths: 0,
  frequencyOfRepayment: 2, hedging: "85.0", upfrontFeeOption: CHOICE_FINANCE.upfrontFee.percentageOfDebt,
  upfrontFeeValue: "1.25", commitmentFeeOption: CHOICE_FINANCE.commitmentFee.percentageOfMargin,
  commitmentFeeValue: "0.35", commitmentFeePeriodYears: 1, commitmentFeePeriodMonths: 0, swapMargin: "",
  bankMarginConstruction: "1.85", bankMarginOperational: "1.65", fixedInterestRateYears: 10, fixedInterestRateMonths: 0,
  swapAfterFixedPeriod: false, bankRate: "", baseRate: CHOICE_FINANCE.baseRate.euribor3M, swapRate: "2.70",
  dscrContracted: "1.15x", dscrUncontracted: "1.35x", stepUpEnabled: true, stepUpRows: [], repaymentRows: [],
  country: "Germany", otherTranches: [], projectId: "P1", ...over,
});

const years = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
const repayRows = (ys: number[], stored: boolean): RepaymentRow[] =>
  ys.map((year, i) => ({ year, value: String(1000 + i), valid: true, dirty: true, repaymentAmountRecordId: stored ? `r${year}` : null }));
const stepUps = (n: number): StepUpRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, durationYY: (i + 1) * 3, margin: `${1 + i * 0.25}`, valid: true }));
const storedRepay = (ys: number[]) => ys.map((year) => ({ id: `r${year}`, year, financingInputId: "t1" }));
const storedStep = (n: number) => Array.from({ length: n }, (_, i) =>
  ({ id: `s${i + 1}`, order: i + 1, startYear: 1, duration: 3, margin: 1, financingInputId: "t1" }));

const PKS: Record<string, string> = {
  [ES_FINANCE.financingInputs]: "vsb_financinginputid",
  [ES_FINANCE.financingInputsRepaymentAmounts]: "vsb_financinginputsrepaymentamountid",
  [ES_FINANCE.financingInputStepUpMargins]: "vsb_financinginputstepupmarginsid",
};

/* ═════════════════════════════════════════════════════════ fake Dataverse ══ */

type Row = Record<string, unknown>;

interface Env {
  client: PlanClient;
  store: Map<string, Row>;
  /** Every request in the order it STARTED: `<kind>:<entitySet>`. */
  sent: string[];
  /** The rows left behind, with their own ids dropped, in a stable order. */
  snapshot: () => string[];
  /** Make the matching request fail. */
  failWhen: ((kind: string, entitySet: string, id?: string) => boolean) | null;
}

const key = (es: string, id: string) => `${es}|${id.toLowerCase()}`;

function makeEnv(initial: readonly [string, string, Row][] = []): Env {
  const store = new Map<string, Row>(initial.map(([es, id, row]) => [key(es, id), { ...row }]));
  let n = 0;
  const env: Env = {
    store, sent: [], failWhen: null,
    snapshot: () => [...store.entries()].map(([k, row]) => `${k.split("|")[0]}|${JSON.stringify(Object.fromEntries(Object.entries(row).sort()))}`).sort(),
    client: undefined as unknown as PlanClient,
  };
  const refuse = (kind: string, es: string, id?: string) =>
    (env.failWhen?.(kind, es, id) ? { success: false as const, error: Object.assign(new Error(`${kind} ${es} refused`), { status: 400 }) } : null); // 400: deterministic, so the T-11 policy never retries it (a status-less error is transient by design)
  env.client = {
    createRecordAsync: async (es: string, data: Row) => {
      env.sent.push(`create:${es}`);
      const no = refuse("create", es);
      if (no) return no;
      n += 1;
      const id = `new-${n}`;
      store.set(key(es, id), { ...data });
      return { success: true, data: { [PKS[es] ?? "id"]: id } };
    },
    updateRecordAsync: async (es: string, id: string, data: Row) => {
      env.sent.push(`update:${es}`);
      const no = refuse("update", es, id);
      if (no) return no;
      store.set(key(es, id), { ...(store.get(key(es, id)) ?? {}), ...data });
      return { success: true, data: {} };
    },
    deleteRecordAsync: async (es: string, id: string) => {
      env.sent.push(`delete:${es}`);
      const no = refuse("delete", es, id);
      if (no) return no;
      store.delete(key(es, id));
      return { success: true };
    },
  } as unknown as PlanClient;
  return env;
}

/** A fake bulk backend over the same store: `updateMany` is guarded exactly as the real one is. */
function fakeBulk(env: Env): BulkBackend & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createMany(es, rows) {
      calls.push(`createMany:${es}:${rows.length}`);
      env.sent.push(`createMany:${es}`);
      if (env.failWhen?.("createMany", es)) throw new Error(`createMany ${es} refused`);
      for (const r of rows) env.store.set(key(es, r.id), { ...r.data });
      return { ids: rows.map((r) => r.id), requests: 1 };
    },
    async updateMany(es, rows) {
      calls.push(`updateMany:${es}:${rows.length}`);
      env.sent.push(`updateMany:${es}`);
      const missing = rows.filter((r) => !env.store.has(key(es, r.id))).map((r) => r.id);
      if (missing.length > 0) throw new BulkRowsGoneError(missing);
      for (const r of rows) env.store.set(key(es, r.id), { ...(env.store.get(key(es, r.id)) ?? {}), ...r.data });
      return { requests: 1 };
    },
  };
}

const ids = () => { let i = 0; return () => `bulk-${(i += 1)}`; };
const flags = (over: Partial<FinancePerfFlags> = {}): FinancePerfFlags => ({ ...financePerf(), ...over });

afterEach(() => { setBulkBackend(null); setFinancePerfFlags(null); });

/* ══════════════════════════════════════════════════════════ switches ══ */

describe("UT-FINPERF switches", () => {
  it("UT-FINPERF-101 the defaults: every switch on except the bulk one (waits for the live probe) and changedRowsOnly (ships OFF at integration until product approves, PA-03)", () => {
    expect(financePerf()).toEqual({
      parallelReads: true, lazyReads: true, targetedReload: true, concurrentWrites: true, wideGroups: true, changedRowsOnly: false, bulkSchedules: false,
    }); // D149: `wideGroups` joined the list (on); dvopt PA-03: `changedRowsOnly` joined it, OFF at integration
  });

  it("UT-FINPERF-102 a test override replaces switches, and null restores the defaults", () => {
    setFinancePerfFlags({ concurrentWrites: false, bulkSchedules: true });
    expect(financePerf()).toMatchObject({ concurrentWrites: false, bulkSchedules: true, parallelReads: true });
    setFinancePerfFlags(null);
    expect(financePerf().bulkSchedules).toBe(false);
  });

  it("UT-FINPERF-103 with every switch off each transform returns the SAME plan object and no key list", () => {
    const save = planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(years(2029, 8), true), stepUpRows: stepUps(2) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(years(2029, 8)), storedStepUps: storedStep(2),
    });
    const del = planTrancheDelete("t1", storedStep(2), storedRepay(years(2029, 8)));
    const option = planFinancingOption(project, CHOICE_FINANCE.financingOptions.allEquity, [
      { id: "v", name: "v", categoryId: "c2", categoryOrder: 2, uniqueKeyString: null, status: 0, raw: {}, canEdit: true, canDelete: true },
      { id: "a", name: "a", categoryId: "c3", categoryOrder: 3, uniqueKeyString: null, status: 0, raw: {}, canEdit: true, canDelete: true },
    ] as FinancingInputRow[]);
    expect(optimizeTrancheSavePlan(save, FINANCE_PERF_ALL_OFF)).toBe(save);
    expect(optimizeTrancheDeletePlan(del, FINANCE_PERF_ALL_OFF)).toBe(del);
    expect(optimizeFinancingOptionPlan(option, FINANCE_PERF_ALL_OFF)).toBe(option);
    for (const kind of ["option", "inputs", "schedules"] as const) expect(reloadKeys("P1", kind, FINANCE_PERF_ALL_OFF)).toBeUndefined();
  });

  it("UT-FINPERF-104 a refused plan is returned as it is (nothing is sent)", () => {
    const refused = planTrancheSave({
      form: seniorForm({ trancheId: "t2" }), project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"],
      storedRepayments: [], storedStepUps: [],
    });
    expect(refused.refusedReason).toBeTruthy();
    expect(optimizeTrancheSavePlan(refused)).toBe(refused);
    expect(optimizeTrancheDeletePlan(refused)).toBe(refused);
    expect(optimizeFinancingOptionPlan(refused)).toBe(refused);
  });
});

/* ═════════════════════════════════════════════════ reload targets ══ */

describe("UT-FINPERF reload targets", () => {
  it("UT-FINPERF-110 each kind of write reloads only what it can change; CAPEX and turbines are never reloaded", () => {
    expect(reloadKeys("P1", "option")).toEqual([["pmFinance", "P1", "project"], ["pmFinance", "P1", "inputs"]]);
    expect(reloadKeys("P1", "inputs")).toEqual([["pmFinance", "P1", "inputs"]]);
    expect(reloadKeys("P1", "schedules")).toEqual([
      ["pmFinance", "P1", "inputs"], ["pmFinance", "P1", "repayments"], ["pmFinance", "P1", "stepUps"],
    ]);
    const all = (["option", "inputs", "schedules"] as const).flatMap((k) => reloadKeys("P1", k) ?? []);
    expect(all.some((k) => k.includes("totalCapex") || k.includes("activeTurbines"))).toBe(false);
  });

  it("UT-FINPERF-111 withReload sets the job's own list; without a project or with the switch off the job is unchanged", () => {
    const job = financingOptionJob({ writes: [], log: [] });
    expect(withReload(job, "P1", "inputs").invalidate).toEqual([["pmFinance", "P1", "inputs"]]);
    expect(withReload(job, undefined, "inputs")).toBe(job);
    expect(withReload(job, "P1", "inputs", flags({ targetedReload: false }))).toBe(job);
    expect(job.invalidate).toBeUndefined();
  });
});

/* ═══════════════════════════════════ same rows: tranche save ══ */

/** Runs `plan` three ways over copies of `initial` and returns each way's rows and requests. */
async function threeWays(build: () => WritePlan, initial: readonly [string, string, Row][]) {
  const run = async (transform: (p: WritePlan) => WritePlan, bulk = false) => {
    const env = makeEnv(initial);
    const backend = fakeBulk(env);
    if (bulk) setBulkBackend(backend);
    const plan = transform(build());
    await executePlan(plan, "test", env.client);
    return { env, backend, snapshot: env.snapshot() };
  };
  return {
    legacy: await run((p) => p),
    concurrent: await run((p) => optimizeTrancheSavePlan(p, flags({ bulkSchedules: false }), { newId: ids() })),
    bulk: await run((p) => optimizeTrancheSavePlan(p, flags({ bulkSchedules: true }), { newId: ids() }), true),
  };
}

const initialSchedule = (ys: number[], steps: number): [string, string, Row][] => [
  [ES_FINANCE.financingInputs, "t1", { vsb_name: "old" }],
  ...ys.map((y): [string, string, Row] => [ES_FINANCE.financingInputsRepaymentAmounts, `r${y}`, { vsb_name: `${y} - Value`, vsb_repaymentamount: 1, vsb_repaymentyear: String(y) }]),
  ...Array.from({ length: steps }, (_, i): [string, string, Row] => [ES_FINANCE.financingInputStepUpMargins, `s${i + 1}`, { vsb_order: i + 1 }]),
];

describe("UT-FINPERF a tranche Save leaves the same rows however it is sent", () => {
  it("UT-FINPERF-120 EDIT: 25 stored years re-saved with new amounts + 4 step-ups", async () => {
    const ys = years(2029, 25);
    const r = await threeWays(() => planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(ys, true), stepUpRows: stepUps(4) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: storedStep(4),
    }), initialSchedule(ys, 4));
    expect(r.concurrent.snapshot).toEqual(r.legacy.snapshot);
    expect(r.bulk.snapshot).toEqual(r.legacy.snapshot);
    // 1 tranche + 25 + 4 writes in all three, but the bulk way sends the two schedules as 2 requests.
    expect(r.legacy.env.sent).toHaveLength(30);
    expect(r.concurrent.env.sent).toHaveLength(30);
    // Only the 25 repayments reach the threshold (5); the 4 step-ups stay per-row beside the tranche.
    expect(r.bulk.backend.calls).toEqual([`updateMany:${ES_FINANCE.financingInputsRepaymentAmounts}:25`]);
    expect(r.bulk.env.sent.filter((s) => !s.includes("Many"))).toHaveLength(1 + 4);
  });

  it("UT-FINPERF-121 NEW tranche: the children bind to the created tranche, the Owning Business Unit is on every row", async () => {
    const ys = years(2029, 25);
    const r = await threeWays(() => planTrancheSave({
      form: seniorForm({ trancheId: null, repaymentRows: repayRows(ys, false), stepUpRows: stepUps(4) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: [], storedRepayments: [], storedStepUps: [],
    }), []);
    expect(r.concurrent.snapshot).toEqual(r.legacy.snapshot);
    expect(r.bulk.snapshot).toEqual(r.legacy.snapshot);
    const children = r.bulk.snapshot.filter((s) => !s.startsWith(`${ES_FINANCE.financingInputs}|`));
    expect(children).toHaveLength(29);
    expect(children.every((s) => s.includes('"owningbusinessunit@odata.bind":"/businessunits(bbbbbbbb-0000-0000-0000-0000000000b1)"'))).toBe(true);
    expect(children.every((s) => s.includes('"vsb_FinancingInput@odata.bind":"/vsb_financinginputs(new-1)"'))).toBe(true);
    expect(r.bulk.backend.calls).toEqual([`createMany:${ES_FINANCE.financingInputsRepaymentAmounts}:25`]);
  });

  it("UT-FINPERF-122 the schedule SHRINKS and a step-up period is removed: the gone rows are deleted, the rest updated", async () => {
    const stored = years(2029, 25);
    const kept = years(2029, 18);
    const r = await threeWays(() => planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(kept, true), stepUpRows: stepUps(2) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(stored), storedStepUps: storedStep(4),
    }), initialSchedule(stored, 4));
    expect(r.concurrent.snapshot).toEqual(r.legacy.snapshot);
    expect(r.bulk.snapshot).toEqual(r.legacy.snapshot);
    expect(r.legacy.snapshot.filter((s) => s.startsWith(ES_FINANCE.financingInputsRepaymentAmounts))).toHaveLength(18);
    expect(r.legacy.snapshot.filter((s) => s.startsWith(ES_FINANCE.financingInputStepUpMargins))).toHaveLength(2);
  });

  it("UT-FINPERF-123 a non-Individual profile deletes every stored repayment and a step-up toggle off deletes every step-up", async () => {
    const ys = years(2029, 12);
    const r = await threeWays(() => planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentProfile: CHOICE_FINANCE.repaymentProfile.straightLine, stepUpEnabled: false }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: storedStep(3),
    }), initialSchedule(ys, 3));
    expect(r.concurrent.snapshot).toEqual(r.legacy.snapshot);
    expect(r.bulk.snapshot).toEqual(r.legacy.snapshot);
    expect(r.legacy.snapshot).toHaveLength(1);
    expect(r.bulk.backend.calls).toEqual([]);
  });

  it("UT-FINPERF-124 under the threshold a table stays per-row (no bulk step), above it one step", () => {
    const small = planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(years(2029, 4), true), stepUpRows: stepUps(4) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(years(2029, 4)), storedStepUps: storedStep(4),
    });
    const smallOut = optimizeTrancheSavePlan(small, flags({ bulkSchedules: true }));
    expect(smallOut.writes.filter((w) => w.op === "createMany" || w.op === "updateMany")).toHaveLength(0);
    const big = planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(years(2029, 5), true), stepUpRows: stepUps(1) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(years(2029, 5)), storedStepUps: storedStep(1),
    });
    const bigOut = optimizeTrancheSavePlan(big, flags({ bulkSchedules: true }));
    expect(bigOut.writes.filter((w) => w.op === "updateMany").map((w) => w.rows?.length)).toEqual([5]);
  });

  it("UT-FINPERF-125 the plan's shape: the tranche first and alone, then ONE concurrent group; bulk steps last and never inside a group", () => {
    const ys = years(2029, 25);
    const plan = planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(years(2029, 20), true), stepUpRows: stepUps(4) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: storedStep(4),
    });
    const out = optimizeTrancheSavePlan(plan, flags({ bulkSchedules: false }));
    expect(out.writes[0]!.entitySet).toBe(ES_FINANCE.financingInputs);
    expect(out.writes[0]!.concurrent).toBeUndefined();
    const rest = out.writes.slice(1);
    expect(rest).toHaveLength(plan.writes.length - 1);
    expect(rest.every((w) => w.concurrent === true && w.stopOnFailure === true)).toBe(true);
    expect(new Set(rest.map((w) => w.concurrencyGroup)).size).toBe(1);
    // The same writes, as a set: nothing added, nothing dropped.
    const sig = (w: { op: string; entitySet: string; id?: string; data?: unknown }) => `${w.op}|${w.entitySet}|${w.id ?? ""}|${JSON.stringify(w.data ?? null)}`;
    expect(rest.map(sig).sort()).toEqual(plan.writes.slice(1).map(sig).sort());
    const bulk = optimizeTrancheSavePlan(plan, flags({ bulkSchedules: true }), { newId: ids() });
    expect(bulk.writes.filter((w) => w.concurrent && (w.op === "createMany" || w.op === "updateMany"))).toHaveLength(0);
    expect(bulk.writes.slice(1).some((w) => w.op === "updateMany")).toBe(true);
  });

  it("UT-FINPERF-126 a create row without the Owning Business Unit is refused before anything is sent (D158); with the guard off the bulk path still fails closed (rule 4)", async () => {
    const ys = years(2029, 8);
    const noOwner = { ...project, owningBusinessUnitId: null };
    const plan = () => planTrancheSave({
      form: seniorForm({ trancheId: null, repaymentRows: repayRows(ys, false), stepUpRows: [], stepUpEnabled: false }),
      project: noOwner, seniorDebtCategoryId: "c3", duplicateIds: [], storedRepayments: [], storedStepUps: [],
    });
    // D158: the engine refuses the whole plan (a tranche and its repayment rows are project-scoped creates), whichever way it is sent.
    await expect(threeWays(plan, [])).rejects.toBeInstanceOf(PlanRefusedError);
    // The behaviour before D158 (the rows were written without the bind), kept behind the switch.
    setOwnerBindGuard({ refuseCreateWithoutOwner: false });
    try {
      const r = await threeWays(plan, []);
      expect(r.bulk.backend.calls).toEqual([]);
      expect(r.bulk.snapshot).toEqual(r.legacy.snapshot);
      expect(r.legacy.snapshot.some((s) => s.includes("owningbusinessunit@odata.bind"))).toBe(false);
    } finally {
      setOwnerBindGuard(null);
    }
  });

  it("UT-FINPERF-127 a row another user deleted fails the bulk update, nothing of that step is sent, and the tranche write stays", async () => {
    const ys = years(2029, 10);
    const env = makeEnv(initialSchedule(ys.slice(1), 0)); // 2029 is gone
    setBulkBackend(fakeBulk(env));
    const plan = optimizeTrancheSavePlan(planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(ys, true), stepUpRows: [], stepUpEnabled: false }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: [],
    }), flags({ bulkSchedules: true }));
    const error = await executePlan(plan, "test", env.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect((error as PlanError).rowsGone).toBe(true);
    expect(env.store.get(key(ES_FINANCE.financingInputs, "t1"))).toMatchObject({ vsb_name: "Windpark Nord - Senior Debt" });
    expect(env.store.get(key(ES_FINANCE.financingInputsRepaymentAmounts, "r2030"))).toMatchObject({ vsb_repaymentamount: 1 });
    expect(writeErrorMessage(error, FINANCE_WRITE_ACTION)).toMatch(/no longer exist/);
  });

  it("UT-FINPERF-128 after a failed child write no NEW child starts, and the plan stops (as the sequential save did)", async () => {
    const ys = years(2029, 40);
    const env = makeEnv(initialSchedule(ys, 0));
    let updates = 0;
    env.failWhen = (kind, es) => kind === "update" && es === ES_FINANCE.financingInputsRepaymentAmounts && (updates += 1) === 3;
    const plan = optimizeTrancheSavePlan(planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(ys, true), stepUpRows: [], stepUpEnabled: false }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: [],
    }), flags({ wideGroups: false })); // D149: this pin is the 8-wide group, so it runs with `wideGroups` off
    const error = await executePlan(plan, "test", env.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    // 1 tranche + at most the writes that were already in flight when the third one failed (the gate is 8).
    expect(env.sent.length).toBeLessThan(1 + 40);
    expect(env.sent.length).toBeLessThanOrEqual(1 + 3 + 8);
  });

  it("UT-FINPERF-129 with `wideGroups` on, the group is 16 wide and a failed child still stops every NEW child (the window is 16)", async () => {
    const ys = years(2029, 40);
    const env = makeEnv(initialSchedule(ys, 0));
    let updates = 0;
    env.failWhen = (kind, es) => kind === "update" && es === ES_FINANCE.financingInputsRepaymentAmounts && (updates += 1) === 3;
    const plan = optimizeTrancheSavePlan(planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(ys, true), stepUpRows: [], stepUpEnabled: false }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys), storedStepUps: [],
    }), flags());
    expect(plan.writes[0]!.concurrent).toBeUndefined(); // the tranche is first and alone
    expect(plan.writes.slice(1).every((w) => w.concurrent === true && w.concurrencyLimit === 16)).toBe(true);
    const error = await executePlan(plan, "test", env.client).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(env.sent.length).toBeLessThan(1 + 40); // nothing new started after the failure
    expect(env.sent.length).toBeLessThanOrEqual(1 + 3 + 16);
  });
});

/* ═════════════════════════════════════════════ same rows: delete, option ══ */

describe("UT-FINPERF a tranche Delete and the option switch leave the same rows", () => {
  const ys = years(2029, 25);
  const initial = [...initialSchedule(ys, 4), [ES_FINANCE.financingInputs, "t2", { vsb_name: "other" }] as [string, string, Row]];

  it("UT-FINPERF-130 the Delete removes the same rows, children first, the tranche last", async () => {
    const legacy = makeEnv(initial);
    const fast = makeEnv(initial);
    const build = () => planTrancheDelete("t1", storedStep(4), storedRepay(ys));
    await executePlan(build(), "t", legacy.client);
    await executePlan(optimizeTrancheDeletePlan(build()), "t", fast.client);
    expect(fast.snapshot()).toEqual(legacy.snapshot());
    expect(fast.snapshot()).toEqual([`${ES_FINANCE.financingInputs}|{"vsb_name":"other"}`]);
    expect(fast.sent.at(-1)).toBe(`delete:${ES_FINANCE.financingInputs}`);
    expect(fast.sent.slice(0, -1).every((s) => s !== `delete:${ES_FINANCE.financingInputs}`)).toBe(true);
  });

  it("UT-FINPERF-131 a refused child delete leaves the tranche in place (it is never deleted after a failed child)", async () => {
    const env = makeEnv(initial);
    env.failWhen = (kind, es, id) => kind === "delete" && es === ES_FINANCE.financingInputsRepaymentAmounts && id === "r2035";
    const error = await executePlan(optimizeTrancheDeletePlan(planTrancheDelete("t1", storedStep(4), storedRepay(ys))), "t", env.client)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanError);
    expect(env.store.has(key(ES_FINANCE.financingInputs, "t1"))).toBe(true);
    expect(env.sent).not.toContain(`delete:${ES_FINANCE.financingInputs}`);
  });

  it("UT-FINPERF-132 the option switch: the project first and alone, then the same status updates together", async () => {
    const rows = ([["v", 2], ["a", 3], ["b", 3], ["c", 4]] as const).map(([id, order]): FinancingInputRow => ({
      id, name: id, categoryId: `c${order}`, categoryOrder: order, uniqueKeyString: null, status: CHOICE_FINANCE.status.active,
      raw: { vsb_trackstatusactive: true, vsb_dsradsrforiginalstatusactive: CHOICE_FINANCE.dsraOriginalStatusActive.yes }, canEdit: true, canDelete: true,
    }));
    const init: [string, string, Row][] = [[ES.projects, "P1", { vsb_financingoptions: 1 }],
      ...rows.map((r): [string, string, Row] => [ES_FINANCE.financingInputs, r.id, { statecode: 0 }])];
    const legacy = makeEnv(init);
    const fast = makeEnv(init);
    const build = () => planFinancingOption(project, CHOICE_FINANCE.financingOptions.allEquity, rows);
    await executePlan(build(), "t", legacy.client);
    const out = optimizeFinancingOptionPlan(build());
    expect(out.writes[0]!.entitySet).toBe(ES.projects);
    expect(out.writes.slice(1).every((w) => w.concurrent === true)).toBe(true);
    await executePlan(out, "t", fast.client);
    expect(fast.snapshot()).toEqual(legacy.snapshot());
    expect(fast.snapshot().filter((s) => s.includes('"statecode":1'))).toHaveLength(4);
  });
});

/* ═══════════════════════════════════════════════════════════════ seeds ══ */

describe("UT-FINPERF the visit seeds as one job", () => {
  const tech = toDebtTech(project.technology);
  const categories = [1, 2, 3, 4, 5].map((order) => ({ id: `c${order}`, name: `cat${order}`, order }));
  const seeds = seedsAllowed(planSeeds(
    project, buildCategoryMap(categories), [],
    buildSeniorDebtStandard([], tech, project), buildDsraStandard([], tech), buildDecommissioningStandard([], tech, project),
  ), true);
  const optionPlan: WritePlan = {
    writes: [{ op: "update", entitySet: ES.projects, id: "P1", data: { vsb_financingoptions: 1 }, reason: "set the project's Financing Options" }],
    log: [],
  };

  it("UT-FINPERF-140 one job, the option patch and the five seeds in one concurrent group, no stop on failure", async () => {
    const job = seedGroupJob({ seeds, project, optionPlan, action: FINANCE_WRITE_ACTION })!;
    const plan = job.plan as WritePlan;
    expect(plan.writes).toHaveLength(6);
    expect(plan.writes.every((w) => w.concurrent === true && !w.stopOnFailure)).toBe(true);
    expect(new Set(plan.writes.map((w) => w.concurrencyGroup)).size).toBe(1);
    expect(plan.writes.slice(1).map((w) => w.data)).toEqual(seedJobs(seeds, project).map((j) => (j.plan as WritePlan).writes[0]!.data));
    expect(seedGroupJob({ seeds: [], project, optionPlan: null, action: FINANCE_WRITE_ACTION })).toBeNull();
  });

  it("UT-FINPERF-141 the same rows as six sequential jobs", async () => {
    const legacy = makeEnv();
    for (const j of seedJobs(seeds, project)) await executePlan(j.plan as WritePlan, "t", legacy.client);
    const fast = makeEnv();
    await executePlan((seedGroupJob({ seeds, project, optionPlan: null, action: FINANCE_WRITE_ACTION })!).plan as WritePlan, "t", fast.client);
    expect(fast.snapshot()).toEqual(legacy.snapshot());
    expect(fast.snapshot()).toHaveLength(5);
  });

  it("UT-FINPERF-142 one failing seed stops no other, and EVERY failed seed is named with the lone-seed text", async () => {
    const env = makeEnv();
    env.failWhen = (kind, _es) => kind === "create" && (env.sent.filter((s) => s.startsWith("create")).length === 2 || env.sent.filter((s) => s.startsWith("create")).length === 4);
    const job = seedGroupJob({ seeds, project, optionPlan: null, action: FINANCE_WRITE_ACTION })!;
    const error = await executePlan(job.plan as WritePlan, "t", env.client).catch((e: unknown) => e) as PlanError;
    expect(error).toBeInstanceOf(PlanError);
    expect(env.store.size).toBe(3);
    expect(error.failures).toHaveLength(2);
    const text = job.failureText!(error.failures)!;
    for (const f of error.failures) {
      const seed = seeds.find((s) => seedWrite(s, project).reason === f.reason)!;
      expect(seed).toBeDefined();
      // The text a lone failing seed job showed before: the same function with the same inputs.
      const lone = writeErrorMessage(new PlanError(0, 1, f.reason, f.cause), FINANCE_WRITE_ACTION, (detail) => NOTIFY.seed(seed.category, detail));
      expect(text).toContain(lone);
    }
  });

  it("UT-FINPERF-143 the option patch failing alone keeps the default message (no seed prefix)", () => {
    const job = seedGroupJob({ seeds, project, optionPlan, action: FINANCE_WRITE_ACTION })!;
    const text = job.failureText!([{ reason: "set the project's Financing Options", cause: new Error("nope") }])!;
    expect(text).toBe(writeErrorMessage(new PlanError(0, 1, "set the project's Financing Options", new Error("nope")), FINANCE_WRITE_ACTION));
    expect(text).not.toMatch(/Error while creating/);
  });

  it("UT-FINPERF-144 the job reloads only what the seeds change", () => {
    const keys = reloadKeys("P1", "option");
    expect(seedGroupJob({ seeds, project, optionPlan, action: FINANCE_WRITE_ACTION, reload: keys })!.invalidate).toEqual(keys);
    expect(seedGroupJob({ seeds, project, optionPlan, action: FINANCE_WRITE_ACTION })!.invalidate).toBeUndefined();
  });
});

/* ═════════════════════════════════════════════ bulk registry (real backend) ══ */

describe("UT-FINPERF the bulk backend knows the two schedule tables, and only those", () => {
  const backend = createGeneratorsBulkBackend();
  const REP = ES_FINANCE.financingInputsRepaymentAmounts;
  const STEP = ES_FINANCE.financingInputStepUpMargins;

  it("UT-FINPERF-150 the registered tables carry the names of the generated schema", () => {
    expect(FINANCE_BULK_TABLES.map((t) => [t.entitySetName, t.logicalName, t.primaryKey, t.creates])).toEqual([
      [REP, "vsb_financinginputsrepaymentamount", "vsb_financinginputsrepaymentamountid", true],
      [STEP, "vsb_financinginputstepupmargins", "vsb_financinginputstepupmarginsid", true],
    ]);
  });

  it("UT-FINPERF-151 a registered table with no rows sends nothing; the inputs table and an unknown one are still refused", async () => {
    await expect(backend.createMany(REP, [])).resolves.toEqual({ ids: [], requests: 0 });
    await expect(backend.updateMany(STEP, [])).resolves.toEqual({ requests: 0 });
    await expect(backend.createMany(ES_FINANCE.financingInputs, [{ id: "a", data: {} }])).rejects.toBeInstanceOf(BulkBackendValidationError);
    await expect(backend.createMany("vsb_nothing", [{ id: "a", data: {} }])).rejects.toBeInstanceOf(BulkBackendValidationError);
  });

  it("UT-FINPERF-152 a create row without the Owning Business Unit is refused before anything is sent (fail closed)", async () => {
    await expect(backend.createMany(REP, [{ id: "00000000-0000-0000-0000-000000000001", data: { vsb_name: "2029 - Value" } }]))
      .rejects.toThrow(/owningbusinessunit@odata.bind/);
  });
});

/* ═════════════════════════════════════════════ input rows without waiting ══ */

describe("UT-FINPERF the inputs read no longer waits for the categories", () => {
  const raw = [
    { vsb_financinginputid: "i1", vsb_name: "a", _vsb_financingcategory_value: "c2", statecode: 0 },
    { vsb_financinginputid: "i2", vsb_name: "b", _vsb_financingcategory_value: "c9", statecode: 1 },
    { vsb_financinginputid: "i3", vsb_name: "c", statecode: 0 },
  ];
  it("UT-FINPERF-160 each row's Order comes from its category id (0 when unknown or blank), as before", () => {
    const rows = withCategoryOrder(raw, [{ id: "c2", name: "VAT", order: 2 }, { id: "c3", name: "SD", order: 3 }]);
    expect(rows.map((r) => [r.id, r.categoryId, r.categoryOrder, r.status])).toEqual([
      ["i1", "c2", 2, 0], ["i2", "c9", 0, 1], ["i3", null, 0, 0],
    ]);
    expect(withCategoryOrder(raw, []).every((r) => r.categoryOrder === 0)).toBe(true);
    expect(rows.every((r) => r.canEdit && r.canDelete)).toBe(true);
  });
});

beforeEach(() => { setFinancePerfFlags(null); });


/* ═══ D149: the tranche Save's group is 16 wide with the rows of the 8-wide group ═══ */

describe("UT-FINPERF D149 wideGroups: the same rows, a wider group", () => {
  /** The writes with every concurrency marker removed: what the 8-wide and the 16-wide plan must share. */
  const plain = (plan: WritePlan) =>
    plan.writes.map(({ concurrent: _c, concurrencyGroup: _g, concurrencyLimit: _l, stopOnFailure: _s, ...rest }) => rest);
  /** Awaited rounds of a plan's write steps: the tranche is one, the group is ceil(size / limit). */
  const rounds = (plan: WritePlan): number => {
    const group = plan.writes.filter((w) => w.concurrent);
    const limit = group[0]?.concurrencyLimit ?? 8;
    return plan.writes.length - group.length + (group.length === 0 ? 0 : Math.ceil(group.length / limit));
  };
  const planOf = (over: Partial<SeniorDebtFormState>, ys: number[], wide: boolean): WritePlan =>
    optimizeTrancheSavePlan(planTrancheSave({
      form: seniorForm(over), project, seniorDebtCategoryId: "c3", duplicateIds: over.trancheId ? ["t1"] : [],
      storedRepayments: over.trancheId ? storedRepay(ys) : [], storedStepUps: [],
    }), flags({ wideGroups: wide }));

  const ys25 = years(2029, 25);
  const SCENARIOS: [string, Partial<SeniorDebtFormState>, number[]][] = [
    ["edit, 25 repayments + 4 step-ups", { trancheId: "t1", repaymentRows: repayRows(ys25, true), stepUpRows: stepUps(4) }, ys25],
    ["new, 25 repayments + 4 step-ups", { trancheId: null, repaymentRows: repayRows(ys25, false), stepUpRows: stepUps(4) }, []],
    ["edit that drops stored years", { trancheId: "t1", repaymentRows: repayRows(ys25.slice(0, 5), true), stepUpRows: stepUps(2) }, ys25],
    ["small schedule (8 repayments, 2 step-ups)", { trancheId: "t1", repaymentRows: repayRows(years(2029, 8), true), stepUpRows: stepUps(2) }, years(2029, 8)],
  ];

  it.each(SCENARIOS)("UT-FINPERF-170 %s: the same writes, in the same order, as the 8-wide plan", (_n, over, ys) => {
    expect(plain(planOf(over, ys, true))).toEqual(plain(planOf(over, ys, false)));
  });

  it("UT-FINPERF-171 the tranche is first and alone; the group is 16 wide with `wideGroups` and 8 wide without", () => {
    const wide = planOf(SCENARIOS[0]![1], SCENARIOS[0]![2], true);
    const narrow = planOf(SCENARIOS[0]![1], SCENARIOS[0]![2], false);
    for (const plan of [wide, narrow]) {
      expect(plan.writes[0]).toMatchObject({ entitySet: ES_FINANCE.financingInputs });
      expect(plan.writes[0]!.concurrent).toBeUndefined();
      expect(plan.writes.slice(1).every((w) => w.concurrent === true && w.stopOnFailure === true)).toBe(true);
    }
    expect(new Set(wide.writes.slice(1).map((w) => w.concurrencyLimit))).toEqual(new Set([16]));
    expect(new Set(narrow.writes.slice(1).map((w) => w.concurrencyLimit))).toEqual(new Set([undefined]));
  });

  it("UT-FINPERF-172 the awaited write rounds: 29 group writes are 2 rounds instead of 4; a group of 10 is 1 instead of 2", () => {
    const edit = SCENARIOS[0]!;
    expect(planOf(edit[1], edit[2], true).writes.length - 1).toBe(29);
    expect(rounds(planOf(edit[1], edit[2], false))).toBe(1 + 4);
    expect(rounds(planOf(edit[1], edit[2], true))).toBe(1 + 2);
    const small = SCENARIOS[3]!;
    expect(planOf(small[1], small[2], true).writes.length - 1).toBe(10);
    expect(rounds(planOf(small[1], small[2], false))).toBe(1 + 2); // 10 at 8 wide: a round of 8, then a round of 2
    expect(rounds(planOf(small[1], small[2], true))).toBe(1 + 1); // 10 at 16 wide: one round
  });

  it("UT-FINPERF-173 with every switch off (`concurrentWrites` off) the plan is the sequential one: no group, no limit", () => {
    const plan = optimizeTrancheSavePlan(planTrancheSave({
      form: seniorForm({ trancheId: "t1", repaymentRows: repayRows(ys25, true), stepUpRows: stepUps(4) }),
      project, seniorDebtCategoryId: "c3", duplicateIds: ["t1"], storedRepayments: storedRepay(ys25), storedStepUps: [],
    }), FINANCE_PERF_ALL_OFF);
    expect(plan.writes.every((w) => w.concurrent === undefined && w.concurrencyLimit === undefined)).toBe(true);
  });
});
