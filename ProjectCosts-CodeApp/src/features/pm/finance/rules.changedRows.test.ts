/**
 * UT-FINROWS — PA-03 (dvopt T-32, `FinancePerfFlags.changedRowsOnly`): a tranche Save writes only the repayment and step-up rows whose
 * values changed, not every row.
 *
 * The oracle is the full rewrite (`changedRowsOnly` false = the canvas `ForAll(Patch)`, the old code). Both plans run against the same
 * in-memory Dataverse seeded by a real first Save, the stored rows are read back the way `listRepaymentAmounts` / `listStepUpMargins` read them,
 * and the rows left behind must be identical for seeded random edits (the D51 equivalence-test pattern). New rows, deletions and the
 * tranche write itself are unchanged; the number of child writes is exactly the number of rows that changed.
 */
import { describe, expect, it } from "vitest";
import { CHOICE_FINANCE, ES_FINANCE } from "@/data/dataverseNames";
import { executePlan, type PlanClient } from "@/data/executePlan";
import { setOwnerBindGuard } from "@/data/ownerBindGuard";
import { FINANCE_PERF_ALL_OFF, financePerf, setFinancePerfFlags } from "@/data/financeFlags";
import {
  REPAYMENT_COL, STEPUP_COL, planTrancheSave,
  type FinanceProject, type RepaymentRow, type SeniorDebtFormState, type StepUpRow, type StoredRepaymentRow, type StoredStepUpMarginRow,
} from "./rules";

const d = (s: string) => new Date(`${s}T00:00:00`);
const project: FinanceProject = {
  id: "P1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryName: "Germany", countryCode: "DE",
  technology: "Wind", areaName: null, cod: d("2028-01-01"), fid: d("2026-06-30"), construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: null, projectDevelopmentStarted: null,
  feasibilityStudies: null, netYieldP50: 120_000, totalCapacity: 50, endDate: d("2055-12-31"),
  clusterStateName: "Cluster 4", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", clusterStateOrder: 4, financingOptions: null,
};

const form = (over: Partial<SeniorDebtFormState> = {}): SeniorDebtFormState => ({
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

type Row = Record<string, unknown>;
const PKS: Record<string, string> = {
  [ES_FINANCE.financingInputs]: "vsb_financinginputid",
  [ES_FINANCE.financingInputsRepaymentAmounts]: "vsb_financinginputsrepaymentamountid",
  [ES_FINANCE.financingInputStepUpMargins]: "vsb_financinginputstepupmarginsid",
};

/** A minimal in-memory Dataverse: every request is recorded as `<kind>:<entitySet>`. */
function makeEnv(initial: ReadonlyMap<string, Row> = new Map()) {
  const store = new Map<string, Row>([...initial].map(([k, v]) => [k, { ...v }]));
  const sent: string[] = [];
  let n = initial.size;
  const key = (es: string, id: string) => `${es}|${id}`;
  const client = {
    createRecordAsync: async (es: string, data: Row) => {
      sent.push(`create:${es}`);
      n += 1;
      const id = `id-${n}`;
      store.set(key(es, id), { ...data });
      return { success: true, data: { [PKS[es] ?? "id"]: id } };
    },
    updateRecordAsync: async (es: string, id: string, data: Row) => {
      sent.push(`update:${es}`);
      store.set(key(es, id), { ...(store.get(key(es, id)) ?? {}), ...data });
      return { success: true, data: {} };
    },
    deleteRecordAsync: async (es: string, id: string) => {
      sent.push(`delete:${es}`);
      store.delete(key(es, id));
      return { success: true };
    },
  } as unknown as PlanClient;
  const snapshot = () => [...store.entries()].map(([k, row]) => `${k}=${JSON.stringify(Object.fromEntries(Object.entries(row).sort()))}`).sort();
  return { store, sent, client, snapshot };
}

const repayRows = (years: number[], values: string[]): RepaymentRow[] =>
  years.map((year, i) => ({ year, value: values[i] ?? "", valid: true, dirty: true, repaymentAmountRecordId: null }));
const stepRows = (spec: { yy: number; margin: string }[]): StepUpRow[] =>
  spec.map((s, i) => ({ id: i + 1, durationYY: s.yy, margin: s.margin, valid: true }));

/** What the readers hand to `planTrancheSave`: the rows of the store, as `listRepaymentAmounts` / `listStepUpMargins` build them. */
function readBack(store: Map<string, Row>, trancheId: string) {
  const rep: StoredRepaymentRow[] = []; const steps: StoredStepUpMarginRow[] = [];
  for (const [k, row] of store) {
    const [es, id] = k.split("|") as [string, string];
    if (es === ES_FINANCE.financingInputsRepaymentAmounts) {
      const amount = (row[REPAYMENT_COL.amount] as number | null | undefined) ?? null;
      rep.push({ id, financingInputId: trancheId, year: Number(row[REPAYMENT_COL.year]), amount: amount ?? 0, storedAmount: amount });
    } else if (es === ES_FINANCE.financingInputStepUpMargins) {
      steps.push({
        id, financingInputId: trancheId, order: row[STEPUP_COL.order] as number, startYear: row[STEPUP_COL.startYear] as number,
        duration: row[STEPUP_COL.duration] as number, margin: row[STEPUP_COL.margin] as number, hasBlank: false,
      });
    }
  }
  return { rep, steps };
}

const seed = async (f: SeniorDebtFormState) => {
  setOwnerBindGuard({ refuseCreateWithoutOwner: false } as never);
  const env = makeEnv();
  await executePlan(planTrancheSave({
    form: f, project, seniorDebtCategoryId: "c3", duplicateIds: [], storedRepayments: [], storedStepUps: [],
  }), "seed", env.client);
  const tranche = [...env.store.keys()].find((k) => k.startsWith(`${ES_FINANCE.financingInputs}|`))!.split("|")[1]!;
  return { env, tranche };
};

const childWrites = (sent: string[]) => sent.filter((s) => !s.includes(ES_FINANCE.financingInputs + "|") && !s.endsWith(`:${ES_FINANCE.financingInputs}`));

describe("a tranche Save writes only the changed schedule rows (PA-03)", () => {
  it("UT-FINROWS-001 the switch ships OFF at integration until product approves (PA-03), the all-off set is off, and the plan input defaults to the canvas full rewrite", () => {
    expect(financePerf().changedRowsOnly).toBe(false);
    expect(FINANCE_PERF_ALL_OFF.changedRowsOnly).toBe(false);
    setFinancePerfFlags({ changedRowsOnly: true });
    expect(financePerf().changedRowsOnly).toBe(true);
    setFinancePerfFlags(null);
    expect(financePerf().changedRowsOnly).toBe(false);
  });

  it("UT-FINROWS-002 a header-only edit (the bank, the margin): unchanged schedule gives 0 child writes, the full rewrite gives 29", async () => {
    const ys = Array.from({ length: 25 }, (_, i) => 2029 + i);
    const base = form({ repaymentRows: repayRows(ys, ys.map((_, i) => String(1000 + i))), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }, { yy: 6, margin: "1.75" }, { yy: 9, margin: "2" }, { yy: 10, margin: "2.25" }]) });
    const { env, tranche } = await seed(base);
    const edited = { ...base, trancheId: tranche, bankName: "Other Bank", bankMarginOperational: "1.95" };
    const stored = readBack(env.store, tranche);
    for (const [changedRowsOnly, expectedChildren] of [[true, 0], [false, 29]] as const) {
      const run = makeEnv(env.store);
      await executePlan(planTrancheSave({
        form: edited, project, seniorDebtCategoryId: "c3", duplicateIds: [tranche], storedRepayments: stored.rep, storedStepUps: stored.steps, changedRowsOnly,
      }), "save", run.client);
      expect(childWrites(run.sent).length, `changedRowsOnly ${changedRowsOnly}`).toBe(expectedChildren);
      expect(run.sent.filter((s) => s === `update:${ES_FINANCE.financingInputs}`)).toHaveLength(1); // the tranche itself is always written
    }
  });

  it("UT-FINROWS-003 one changed amount = exactly one repayment write; one changed margin = exactly one step-up write", async () => {
    const ys = Array.from({ length: 10 }, (_, i) => 2029 + i);
    const base = form({ repaymentRows: repayRows(ys, ys.map((_, i) => String(1000 + i))), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }, { yy: 6, margin: "1.75" }]) });
    const { env, tranche } = await seed(base);
    const stored = readBack(env.store, tranche);
    const values = ys.map((_, i) => String(1000 + i)); values[4] = "7777";
    const edited = { ...base, trancheId: tranche, repaymentRows: repayRows(ys, values), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }, { yy: 6, margin: "1.8" }]) };
    const run = makeEnv(env.store);
    await executePlan(planTrancheSave({
      form: edited, project, seniorDebtCategoryId: "c3", duplicateIds: [tranche], storedRepayments: stored.rep, storedStepUps: stored.steps, changedRowsOnly: true,
    }), "save", run.client);
    expect(run.sent.filter((s) => s === `update:${ES_FINANCE.financingInputsRepaymentAmounts}`)).toHaveLength(1);
    expect(run.sent.filter((s) => s === `update:${ES_FINANCE.financingInputStepUpMargins}`)).toHaveLength(1);
  });

  it("UT-FINROWS-004 DIFFERENTIAL: 200 seeded random edits leave exactly the rows the full rewrite leaves, with fewer or equal requests", async () => {
    let s = 20261125;
    const rnd = (n: number) => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s % n; };
    for (let round = 0; round < 200; round += 1) {
      const n0 = 3 + rnd(12);
      const ys0 = Array.from({ length: n0 }, (_, i) => 2029 + i);
      const vals0 = ys0.map(() => (rnd(6) === 0 ? "0" : String(100 + rnd(900))));
      const nSteps0 = 1 + rnd(4);
      const spec0 = Array.from({ length: nSteps0 }, (_, i) => ({ yy: (i + 1) * 3, margin: (1 + rnd(40) / 20).toFixed(2) }));
      const { env, tranche } = await seed(form({ repaymentRows: repayRows(ys0, vals0), stepUpRows: stepRows(spec0) }));
      const stored = readBack(env.store, tranche);
      // the edit: some amounts changed or blanked, the schedule longer or shorter, some margins changed, a period added or removed
      const n1 = Math.max(1, n0 + rnd(5) - 2);
      const ys1 = Array.from({ length: n1 }, (_, i) => 2029 + i);
      const vals1 = ys1.map((_, i) => {
        const old = vals0[i];
        const roll = rnd(10);
        if (old !== undefined && roll < 6) return old;
        if (roll === 6) return "";
        return String(100 + rnd(900));
      });
      const nSteps1 = Math.max(1, nSteps0 + rnd(3) - 1);
      const spec1 = Array.from({ length: nSteps1 }, (_, i) => ({ yy: (i + 1) * 3, margin: spec0[i] !== undefined && rnd(3) > 0 ? spec0[i]!.margin : (1 + rnd(40) / 20).toFixed(2) }));
      const edited = form({ trancheId: tranche, repaymentRows: repayRows(ys1, vals1), stepUpRows: stepRows(spec1), bankName: round % 2 === 0 ? "NordLB" : "Other" });
      const plan = (changedRowsOnly: boolean) => planTrancheSave({
        form: edited, project, seniorDebtCategoryId: "c3", duplicateIds: [tranche], storedRepayments: stored.rep, storedStepUps: stored.steps, changedRowsOnly,
      });
      const full = makeEnv(env.store); await executePlan(plan(false), "save", full.client);
      const lean = makeEnv(env.store); await executePlan(plan(true), "save", lean.client);
      expect(lean.snapshot(), `round ${round}`).toEqual(full.snapshot());
      expect(lean.sent.length, `round ${round}`).toBeLessThanOrEqual(full.sent.length);
      // The number of repayment updates is exactly the rows of the schedule that already existed and changed.
      const expectedUpdates = ys1.filter((y, i) => {
        const j = ys0.indexOf(y);
        if (j < 0) return false;
        const old = Number(vals0[j]); const now = vals1[i] === "" ? null : Number(vals1[i]);
        return old !== now;
      }).length;
      expect(lean.sent.filter((x) => x === `update:${ES_FINANCE.financingInputsRepaymentAmounts}`).length, `round ${round}`).toBe(expectedUpdates);
      // New years are created and removed years deleted in both.
      for (const kind of ["create", "delete"]) {
        expect(lean.sent.filter((x) => x === `${kind}:${ES_FINANCE.financingInputsRepaymentAmounts}`).length)
          .toBe(full.sent.filter((x) => x === `${kind}:${ES_FINANCE.financingInputsRepaymentAmounts}`).length);
        expect(lean.sent.filter((x) => x === `${kind}:${ES_FINANCE.financingInputStepUpMargins}`).length)
          .toBe(full.sent.filter((x) => x === `${kind}:${ES_FINANCE.financingInputStepUpMargins}`).length);
      }
    }
  });

  it("UT-FINROWS-005 a stored BLANK amount is never mistaken for 0: typing 0 over a blank is written, and so is a row of an unknown stored value", async () => {
    const ys = [2029, 2030];
    const base = form({ repaymentRows: repayRows(ys, ["", "500"]), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }]) });
    const { env, tranche } = await seed(base);
    const stored = readBack(env.store, tranche);
    expect(stored.rep.find((r) => r.year === 2029)!.storedAmount).toBeNull();
    const edited = { ...base, trancheId: tranche, repaymentRows: repayRows(ys, ["0", "500"]) };
    const run = makeEnv(env.store);
    await executePlan(planTrancheSave({
      form: edited, project, seniorDebtCategoryId: "c3", duplicateIds: [tranche], storedRepayments: stored.rep, storedStepUps: stored.steps, changedRowsOnly: true,
    }), "save", run.client);
    expect(run.sent.filter((s) => s === `update:${ES_FINANCE.financingInputsRepaymentAmounts}`)).toHaveLength(1);
    // A reader that does not say what is stored (no `storedAmount`, no `hasBlank`) never lets a row be skipped.
    const unknown = makeEnv(env.store);
    await executePlan(planTrancheSave({
      form: { ...base, trancheId: tranche }, project, seniorDebtCategoryId: "c3", duplicateIds: [tranche],
      storedRepayments: stored.rep.map(({ storedAmount: _a, ...r }) => r), storedStepUps: stored.steps.map(({ hasBlank: _b, ...r }) => r), changedRowsOnly: true,
    }), "save", unknown.client);
    expect(childWrites(unknown.sent).length).toBe(3);
  });

  it("UT-FINROWS-006 a new tranche still creates every row, and a non-Individual profile still deletes every stored repayment", async () => {
    const ys = [2029, 2030, 2031];
    const created = makeEnv();
    await executePlan(planTrancheSave({
      form: form({ repaymentRows: repayRows(ys, ["1", "2", "3"]), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }]) }), project,
      seniorDebtCategoryId: "c3", duplicateIds: [], storedRepayments: [], storedStepUps: [], changedRowsOnly: true,
    }), "save", created.client);
    expect(created.sent.filter((s) => s.startsWith("create:"))).toHaveLength(1 + 3 + 1);

    const { env, tranche } = await seed(form({ repaymentRows: repayRows(ys, ["1", "2", "3"]), stepUpRows: stepRows([{ yy: 3, margin: "1.5" }]) }));
    const stored = readBack(env.store, tranche);
    const run = makeEnv(env.store);
    await executePlan(planTrancheSave({
      form: form({ trancheId: tranche, repaymentProfile: CHOICE_FINANCE.repaymentProfile.straightLine, stepUpEnabled: false }), project,
      seniorDebtCategoryId: "c3", duplicateIds: [tranche], storedRepayments: stored.rep, storedStepUps: stored.steps, changedRowsOnly: true,
    }), "save", run.client);
    expect(run.sent.filter((s) => s === `delete:${ES_FINANCE.financingInputsRepaymentAmounts}`)).toHaveLength(3);
    expect(run.sent.filter((s) => s === `delete:${ES_FINANCE.financingInputStepUpMargins}`)).toHaveLength(1);
  });
});
