/**
 * UT-PRODBASE — the BASELINE of the Production write plans, taken from the code BEFORE any optimization.
 *
 * What it does (measurement, not a rule): builds each plan of the screen for fixed fixtures and prints, per plan, the
 * number of requests (a bulk step counts its rows), the sequential waves the engine awaits, the biggest wave and the
 * JSON payload bytes. Run `npx vitest run src/features/pm/production/productionPlans.baseline.test.ts --reporter=verbose`.
 *
 * The golden files under `__golden__/` are the exact plans (entity set, op, id, data, reason) of today's code with the
 * per-call `concurrencyGroup` counter removed. After an optimization, the same fixtures must give the same ROWS: the
 * equivalence test of the later phase compares them as multisets per entity set with the refs resolved.
 * Test support only: nothing in the app imports it.
 */
import { describe, expect, it } from "vitest";
import { CHOICE_PRODUCTION, ES_PRODUCTION } from "@/data/dataverseNames";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import { steps, withoutGroupIds, changes } from "@/features/pm/generators/bulkPlans.testkit";
import {
  buildNegativePriceRows, buildSeasonalityRows, buildYieldPayload, deriveYieldView, newYieldForm,
  planDeleteYield, planSaveYield, planStandardContracts, planStatusChange, planRollUp, planNegativePriceWrites,
  YIELD_COL,
  type EnergyYieldRow, type RevenueRow, type StoredNegativePrice, type YieldFormState,
} from "./rules";
import { generation, project } from "./productionPlans.testkit";

/* ═════════════════════════════════════════════════════════════════ fixtures ═══ */

const yieldRow = (over: Partial<EnergyYieldRow> = {}): EnergyYieldRow => ({
  id: "y1", name: "EY-0001", description: "Internal WTG 2028", type: CHOICE_PRODUCTION.yieldType.wtg,
  assessment: CHOICE_PRODUCTION.yieldAssessment.internal, allocation: CHOICE_PRODUCTION.yieldAllocation.wholePlant,
  windSpeed: 7, irradiation: null, grossYield: 12_000, totalLosses: 15, netYieldP50: 10_200, uncertainty: 10,
  netYieldP75: 9_326, netYieldP90: 8_718, productionAllocation: null, productionLossesP50: false,
  productionUncertainty: false, considerSeasonality: false, considerNegativePrices: false, status: 0, ...over,
});

const revenue = (id: string, over: Partial<RevenueRow> = {}): RevenueRow =>
  ({ id, description: `PPA ${id}`, considerNegativePrices: false, manualOverride: false, ...over });

const formOf = (over: Partial<YieldFormState> = {}): YieldFormState => ({
  ...newYieldForm("en-US"), description: "Assessment", windSpeed: "7", grossYield: "12000", totalLosses: "15", uncertainty: "10", ...over,
});

const payloadOf = (form: YieldFormState, tech: "WTG" | "PV" = "WTG") =>
  buildYieldPayload({ form, view: deriveYieldView(form, tech, { lang: "en-US" }), technology: tech, project: project() });

const twelve = (v: number) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: v, wtg: v }));

interface Row { scenario: string; requests: number; waves: number; widest: number; bytes: number }
const table: Row[] = [];

/** Requests of a plan the way the engine counts them: a bulk step is one request per chunk, but the BASELINE has none. */
function measure(scenario: string, plan: WritePlan): Row {
  const st = steps(plan.writes);
  const row: Row = {
    scenario, requests: changes(plan.writes), waves: st.length,
    widest: Math.max(0, ...st.map((s) => s.writes.length)),
    bytes: JSON.stringify(withoutGroupIds(plan.writes)).length,
  };
  table.push(row);
  return row;
}

/** The plan as the golden file stores it: no group counter, stable key order. */
const golden = (writes: readonly PlannedWrite[]): string => `${JSON.stringify(withoutGroupIds(writes), null, 1)}\n`;

const wtgOn = formOf({ considerSeasonality: true, considerNegativePrices: true });
const season = buildSeasonalityRows(twelve(8), "WTG");
/** The full curve a new yield gets (from the COD year). */
const curve = buildNegativePriceRows(2028, [], "WTG");

const storedCurve = (rows = curve): StoredNegativePrice[] =>
  rows.map((r, i) => ({ id: `n${i + 1}`, year: r.year, reduction: r.reductionValue, isStandard: r.standardAssumption }));

const saveNew = (rows = curve, revenues: RevenueRow[] = [revenue("r1", { considerNegativePrices: false }), revenue("r2")], yields: EnergyYieldRow[] = [yieldRow({ id: "i0", considerNegativePrices: true })]) =>
  planSaveYield({
    editing: null, payload: payloadOf(wtgOn), project: project(), seasonality: { on: true, rows: season, storedId: null },
    negativePrices: { on: true, rows, stored: [] }, yields, revenues,
  });

describe("UT-PRODBASE write-plan baseline (the code before optimization)", () => {
  it("UT-PRODBASE-001 the negative-price curve a new yield gets: its length is the N of every save count", () => {
    console.info(`[BASELINE] new-yield curve rows = ${curve.length}, seasonality rows = ${season.length}`);
    expect(curve.length).toBeGreaterThan(0);
  });

  it("UT-PRODBASE-002 save: new WTG with seasonality, the full curve and two revenue syncs", () => {
    const r = measure("save new WTG (seasonality + curve + 2 revenue syncs)", saveNew());
    expect(r.requests).toBe(1 + 1 + curve.length + 2);
    expect(r.waves).toBe(2); // the yield alone, then one group
    expect(golden(saveNew().writes)).toMatchSnapshot();
  });

  it("UT-PRODBASE-003 save: new WTG with a 28-year curve (the size the D108 note talks about)", () => {
    const rows28 = Array.from({ length: 28 }, (_, i) => ({ ...curve[i % curve.length]!, year: 2028 + i }));
    const r = measure("save new WTG, 28-year curve", saveNew(rows28));
    expect(r.requests).toBe(1 + 1 + 28 + 2);
  });

  it("UT-PRODBASE-004 save: edit that changes only the description (unchanged curve years are skipped)", () => {
    const editing = yieldRow({ considerSeasonality: true, considerNegativePrices: true });
    const plan = planSaveYield({
      editing, payload: payloadOf(wtgOn), project: project(), seasonality: { on: true, rows: season, storedId: "s1" },
      negativePrices: { on: true, rows: curve, stored: storedCurve() }, yields: [editing], revenues: [revenue("r1")],
    });
    measure("save edit, description only", plan);
    expect(plan.writes.filter((w) => w.entitySet === ES_PRODUCTION.negativePrices)).toHaveLength(0);
  });

  it("UT-PRODBASE-005 save: edit that moves the whole curve (every stored year changes)", () => {
    const editing = yieldRow({ considerSeasonality: true, considerNegativePrices: true });
    const moved = curve.map((r) => ({ ...r, reductionValue: r.reductionValue + 1, standardAssumption: false }));
    const plan = planSaveYield({
      editing, payload: payloadOf(wtgOn), project: project(), seasonality: { on: true, rows: season, storedId: "s1" },
      negativePrices: { on: true, rows: moved, stored: storedCurve() }, yields: [editing], revenues: [],
    });
    measure("save edit, every curve year changes", plan);
    expect(planNegativePriceWrites(moved, storedCurve()).upserts).toHaveLength(curve.length);
  });

  it("UT-PRODBASE-006 save: External supersedes two Internals of its type", () => {
    const ext = formOf({ assessment: CHOICE_PRODUCTION.yieldAssessment.external, considerSeasonality: true, considerNegativePrices: true });
    const plan = planSaveYield({
      editing: null, payload: payloadOf(ext), project: project(), seasonality: { on: true, rows: season, storedId: null },
      negativePrices: { on: true, rows: curve, stored: [] },
      yields: [yieldRow({ id: "i1", considerNegativePrices: true }), yieldRow({ id: "i2", considerNegativePrices: true })],
      revenues: [revenue("r1", { considerNegativePrices: true }), revenue("r2", { considerNegativePrices: true })],
    });
    measure("save new External superseding 2 Internals", plan);
    expect(plan.writes.filter((w) => w.entitySet === ES_PRODUCTION.energyYields && w.op === "update")).toHaveLength(2);
  });

  it("UT-PRODBASE-007 delete, status change and roll-up", () => {
    const row = yieldRow({ considerNegativePrices: true });
    const revs = [revenue("r1", { considerNegativePrices: true }), revenue("r2", { considerNegativePrices: true }), revenue("r3", { considerNegativePrices: true })];
    measure("delete a yield (3 revenue syncs)", planDeleteYield({ row, yields: [row], revenues: revs }));
    measure("deactivate a yield (3 revenue syncs)", planStatusChange({ row, yields: [row], revenues: revs }));
    measure("roll-up (project update)", planRollUp("p1", [row]));
    expect(golden(planDeleteYield({ row, yields: [row], revenues: revs }).writes)).toMatchSnapshot();
  });

  it("UT-PRODBASE-008 one-shot generation: 4 land leases x 30 turbines, 13 Other OPEX, O&M on 3 device types", () => {
    const plan = planStandardContracts(generation(4, 30, 3), { waves: false }); // `waves: false` = the code before D135
    const r = measure("generation 4 LL x 30 WTG, 13 OO, O&M x 3 dev", plan);
    expect(r.waves).toBe(r.requests); // every request is its own wave today
    const byEntity = new Map<string, number>();
    for (const w of plan.writes) byEntity.set(`${w.op}:${w.entitySet}`, (byEntity.get(`${w.op}:${w.entitySet}`) ?? 0) + 1);
    console.info(`[BASELINE] generation rows by table: ${JSON.stringify(Object.fromEntries(byEntity))}`);
  });

  it("UT-PRODBASE-009 one-shot generation at scale: 4 land leases x 200 turbines", () => {
    measure("generation 4 LL x 200 WTG, 13 OO, O&M x 3 dev", planStandardContracts(generation(4, 200, 3), { waves: false }));
  });

  it("UT-PRODBASE-010 generation golden master (small, every family): 3 land leases x 4 turbines, 2 device types", () => {
    const seq = { waves: false }; // the golden files are the plans of the code before D135
    const plan = planStandardContracts(generation(3, 4, 2), seq);
    expect(golden(plan.writes)).toMatchSnapshot();
    expect(golden(planStandardContracts({ ...generation(3, 4, 2), project: project({ cod: null }) }, seq).writes)).toMatchSnapshot();
    expect(golden(planStandardContracts({ ...generation(3, 4, 2), project: project({ owningBusinessUnitId: null }) }, seq).writes)).toMatchSnapshot();
  });

  it("UT-PRODBASE-099 prints the baseline table", () => {
    const w = Math.max(...table.map((r) => r.scenario.length));
    const lines = table.map((r) => `${r.scenario.padEnd(w)}  requests=${String(r.requests).padStart(4)}  waves=${String(r.waves).padStart(4)}  widest=${String(r.widest).padStart(3)}  bytes=${r.bytes}`);
    console.info(`\n[BASELINE] write plans (requests = engine changes; each wave is one awaited round trip)\n${lines.join("\n")}`);
    expect(YIELD_COL.id).toBeDefined();
  });
});
