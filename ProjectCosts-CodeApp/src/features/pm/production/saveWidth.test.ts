/**
 * UT-PRODSAVE — the Production Save's write group goes out 16 at a time instead of 8 (`PRODUCTION_WIDE_GROUPS`).
 *
 * (D145, number provisional.) The change is only HOW the group is sent. These tests pin that the rows are exactly those of the 8-wide plan
 * (`{ wide: false }` is the oracle: same writes, same order, same binds, zero / negative / null values untouched), that
 * the yield still goes first and alone, that the awaited rounds drop where the group is wider than 8, and, through the
 * REAL engine with a latency-simulating client, that the same requests are sent in fewer virtual round trips with at most
 * 16 in flight. The round-trip figures are MODELLED (fixed latency per request), not Dataverse timings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHOICE_PRODUCTION, ES_PRODUCTION } from "@/data/dataverseNames";
import { WIDE_GROUP_CONCURRENCY, WRITE_CONCURRENCY } from "@/data/concurrency";
import { executePlan, PlanError, type PlanClient } from "@/data/executePlan";
import type { PlannedWrite, WritePlan } from "@/data/writePlan";
import { steps, withoutGroupIds } from "@/features/pm/generators/bulkPlans.testkit";
import { dataSourcesInfo } from "../../../../.power/schemas/appschemas/dataSourcesInfo";
import {
  buildNegativePriceRows, buildSeasonalityRows, buildYieldPayload, deriveYieldView, newYieldForm, planSaveYield,
  PRODUCTION_WIDE_GROUPS,
  type EnergyYieldRow, type NegativePriceRow, type RevenueRow, type StoredNegativePrice, type YieldFormState,
} from "./rules";
import { project } from "./productionPlans.testkit";

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
const payloadOf = (form: YieldFormState) =>
  buildYieldPayload({ form, view: deriveYieldView(form, "WTG", { lang: "en-US" }), technology: "WTG", project: project() });
const twelve = (v: number) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, pv: v, wtg: v }));

const wtgOn = formOf({ considerSeasonality: true, considerNegativePrices: true });
const season = buildSeasonalityRows(twelve(8), "WTG");
const curve = buildNegativePriceRows(2028, [], "WTG");
const curveOf = (years: number): NegativePriceRow[] =>
  Array.from({ length: years }, (_, i) => ({ ...curve[i % curve.length]!, year: 2028 + i }));
const storedOf = (rows: readonly NegativePriceRow[]): StoredNegativePrice[] =>
  rows.map((r, i) => ({ id: `n${i + 1}`, year: r.year, reduction: r.reductionValue, isStandard: r.standardAssumption }));

type Args = Parameters<typeof planSaveYield>[0];
const newYield = (rows: readonly NegativePriceRow[] = curve): Args => ({
  editing: null, payload: payloadOf(wtgOn), project: project(), seasonality: { on: true, rows: season, storedId: null },
  negativePrices: { on: true, rows, stored: [] }, yields: [yieldRow({ id: "i0", considerNegativePrices: true })],
  revenues: [revenue("r1"), revenue("r2")], // both off while a curve is on: two syncs
});
const editYield = (rows: readonly NegativePriceRow[], stored: readonly StoredNegativePrice[]): Args => {
  const editing = yieldRow({ considerSeasonality: true, considerNegativePrices: true });
  return {
    editing, payload: payloadOf(wtgOn), project: project(), seasonality: { on: true, rows: season, storedId: "s1" },
    negativePrices: { on: true, rows, stored }, yields: [editing], revenues: [revenue("r1")],
  };
};

/** The plan's rows with every concurrency marker removed: what the 8-wide plan and the 16-wide plan must share. */
const plain = (writes: readonly PlannedWrite[]) =>
  withoutGroupIds(writes).map(({ concurrent: _c, stopOnFailure: _s, concurrencyLimit: _l, ...rest }) => rest);

/** Awaited sequential rounds the engine needs: a group is ceil(size / limit), a single write one. */
const rounds = (writes: readonly PlannedWrite[]): number =>
  steps(writes).reduce((n, s) => n + (s.kind === "group" ? Math.ceil(s.writes.length / (s.limit ?? WRITE_CONCURRENCY)) : 1), 0);

const widths = (plan: WritePlan): number[] => steps(plan.writes).filter((s) => s.kind === "group").map((s) => s.limit ?? WRITE_CONCURRENCY);

/* ═════════════════════════════════════════════════════════════════ the plan ═══ */

describe("UT-PRODSAVE the Save's write group is 16 wide, with the rows of the 8-wide plan", () => {
  it("UT-PRODSAVE-001 the switch is on, the group is 16 wide and `wide: false` is the 8-wide plan; the yield is first and alone", () => {
    expect(PRODUCTION_WIDE_GROUPS).toBe(true);
    const wide = planSaveYield(newYield());
    const legacy = planSaveYield(newYield(), { wide: false });
    expect(widths(wide)).toEqual([WIDE_GROUP_CONCURRENCY]);
    expect(widths(legacy)).toEqual([WRITE_CONCURRENCY]);
    expect(planSaveYield(newYield(), { wide: true }).writes.map((w) => w.concurrencyLimit)).toEqual(wide.writes.map((w) => w.concurrencyLimit));
    for (const plan of [wide, legacy]) {
      expect(plan.writes[0]).toMatchObject({ op: "create", entitySet: ES_PRODUCTION.energyYields });
      expect(plan.writes[0]!.concurrent).toBeUndefined(); // the yield goes first and alone: a refused yield sends nothing else
      expect(plan.writes.slice(1).every((w) => w.concurrent === true)).toBe(true);
    }
  });

  const SCENARIOS: [string, () => Args][] = [
    ["P01/P08 new WTG, seasonality, 15-year curve, revenue syncs", () => newYield()],
    ["P01 new WTG, 28-year curve", () => newYield(curveOf(28))],
    ["P02 edit, description only", () => editYield(curve, storedOf(curve))],
    ["P04 edit, the whole curve moves", () => editYield(curve.map((r) => ({ ...r, reductionValue: r.reductionValue + 1, standardAssumption: false })), storedOf(curve))],
    ["P04 edit, years removed from the curve are deleted", () => editYield(curveOf(5), storedOf(curveOf(15)))],
    ["P04 edit, a stored null against a typed 0, a typed 0 over a stored 7, a negative reduction", () => {
      const rows = curveOf(4).map((r, i) => ({ ...r, reductionValue: [0, 0, -2.5, 3][i]!, standardAssumption: false }));
      const stored = storedOf(curveOf(4)).map((s, i) => ({ ...s, reduction: ([null, 7, 1, 3] as (number | null)[])[i]! }));
      return editYield(rows, stored as StoredNegativePrice[]);
    }],
    ["P05 add seasonality on an edit (no stored row)", () => ({ ...editYield(curve, storedOf(curve)), seasonality: { on: true, rows: season, storedId: null } })],
    ["P06 edit seasonality (stored row)", () => ({ ...editYield(curve, storedOf(curve)), seasonality: { on: true, rows: season.map((r, i) => (i === 3 ? { ...r, value: 9 } : r)), storedId: "s1" } })],
    ["P07 delete seasonality (toggle off, stored row)", () => ({ ...editYield(curve, storedOf(curve)), seasonality: { on: false, rows: season, storedId: "s1" } })],
    ["P04 negative prices off with stored rows (every row deleted)", () => ({ ...editYield(curve, storedOf(curve)), negativePrices: { on: false, rows: curve, stored: storedOf(curve) } })],
    ["P08 External supersedes two Internals", () => ({
      ...newYield(),
      payload: payloadOf(formOf({ assessment: CHOICE_PRODUCTION.yieldAssessment.external, considerSeasonality: true, considerNegativePrices: true })),
      yields: [yieldRow({ id: "i1", considerNegativePrices: true }), yieldRow({ id: "i2", considerNegativePrices: true })],
    })],
  ];

  it.each(SCENARIOS)("UT-PRODSAVE-002 %s: the same writes, in the same order, with the same binds as the 8-wide plan", (_name, build) => {
    const args = build();
    const wide = planSaveYield(args).writes;
    expect(plain(wide)).toEqual(plain(planSaveYield(args, { wide: false }).writes));
    expect(wide[0]!.concurrent).toBeUndefined(); // the yield write is first and alone
    expect(wide.slice(1).every((w) => w.concurrent === true && w.concurrencyLimit === WIDE_GROUP_CONCURRENCY)).toBe(true);
  });

  it("UT-PRODSAVE-005 the scenarios that remove rows really contain the deletes, in the wide plan too", () => {
    const ops = (build: () => Args, table: string) =>
      planSaveYield(build()).writes.filter((w) => w.entitySet === table && w.op === "delete").length;
    expect(ops(() => editYield(curveOf(5), storedOf(curveOf(15))), ES_PRODUCTION.negativePrices)).toBe(10);
    expect(ops(() => ({ ...editYield(curve, storedOf(curve)), negativePrices: { on: false, rows: curve, stored: storedOf(curve) } }), ES_PRODUCTION.negativePrices)).toBe(curve.length);
    expect(ops(() => ({ ...editYield(curve, storedOf(curve)), seasonality: { on: false, rows: season, storedId: "s1" } }), ES_PRODUCTION.seasonalityValues)).toBe(1);
  });

  it("UT-PRODSAVE-003 zero and negative reductions are written, never dropped as falsy", () => {
    const rows = curveOf(3).map((r, i) => ({ ...r, reductionValue: [0, -2.5, 4][i]!, standardAssumption: false }));
    const negatives = planSaveYield(newYield(rows)).writes.filter((w) => w.entitySet === ES_PRODUCTION.negativePrices && w.op === "create");
    expect(negatives.map((w) => w.data?.["vsb_netyieldp50reduction"])).toEqual([0, -2.5, 4]);
  });

  it("UT-PRODSAVE-004 the awaited rounds fall where the group is wider than 8 and stay where it is not", () => {
    const table = [
      ["new WTG, 15-year curve + seasonality + 2 syncs", newYield(), 18],
      ["new WTG, 28-year curve + seasonality + 2 syncs", newYield(curveOf(28)), 31],
      ["edit, description only", editYield(curve, storedOf(curve)), 2],
    ] as const;
    const out: string[] = [];
    for (const [name, args, size] of table) {
      const wide = planSaveYield(args);
      const legacy = planSaveYield(args, { wide: false });
      expect(wide.writes.length - 1).toBe(size);
      out.push(`${name}: group ${size}, rounds ${rounds(legacy.writes)} -> ${rounds(wide.writes)}`);
      expect(rounds(wide.writes)).toBeLessThanOrEqual(rounds(legacy.writes));
    }
    console.info(`[PRODSAVE] awaited rounds of the write steps (the yield + the group)\n${out.join("\n")}`);
    expect(rounds(planSaveYield(newYield()).writes)).toBe(1 + Math.ceil(18 / 16)); // 3 rounds of the group became 2
    expect(rounds(planSaveYield(newYield(), { wide: false }).writes)).toBe(1 + Math.ceil(18 / 8));
    expect(rounds(planSaveYield(newYield(curveOf(28))).writes)).toBe(1 + Math.ceil(31 / 16)); // 4 became 2
    expect(rounds(planSaveYield(editYield(curve, storedOf(curve))).writes)).toBe(rounds(planSaveYield(editYield(curve, storedOf(curve)), { wide: false }).writes));
  });
});

/* ══════════════════════════════════════ the real engine, with a latency client ═══ */

const LAT = 100;
const ok = <T,>(data: T) => ({ success: true as const, data });
const key = (table: string): string => (dataSourcesInfo as Record<string, { primaryKey: string }>)[table]!.primaryKey;

/** A client where every request takes LAT ms of fake time, counting the requests in flight and when each one started. */
function latencyClient(refuseCreateNumber?: number) {
  const bodies: string[] = [];
  const started: number[] = [];
  let inFlight = 0;
  let peak = 0;
  let creates = 0;
  const seq = new Map<string, number>();
  const hold = async (): Promise<void> => {
    started.push(Date.now());
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise<void>((resolve) => setTimeout(resolve, LAT));
    inFlight -= 1;
  };
  const client = {
    createRecordAsync: vi.fn(async (table: string, data: Record<string, unknown>) => {
      creates += 1;
      const mine = creates;
      bodies.push(`create ${table} ${JSON.stringify(data)}`);
      await hold();
      if (refuseCreateNumber === mine) return { success: false as const, data: undefined, error: { message: "refused", status: 500 } };
      const n = (seq.get(table) ?? 0) + 1;
      seq.set(table, n);
      return ok({ [key(table)]: `${table}-${n}` });
    }),
    updateRecordAsync: vi.fn(async (table: string, id: string, data: Record<string, unknown>) => {
      bodies.push(`update ${table} ${id} ${JSON.stringify(data)}`);
      await hold();
      return ok({});
    }),
    deleteRecordAsync: vi.fn(async (table: string, id: string) => {
      bodies.push(`delete ${table} ${id}`);
      await hold();
      return ok(undefined);
    }),
  };
  return { client: client as unknown as PlanClient, bodies, peak: () => peak, started };
}

/** Runs the plan through the real `executePlan` on fake time; returns the virtual rounds it took (elapsed / LAT). */
async function run(plan: WritePlan, refuseCreateNumber?: number) {
  const lc = latencyClient(refuseCreateNumber);
  const t0 = Date.now();
  const settled = executePlan(plan, "UT-PRODSAVE", lc.client).then((r) => ({ r, e: null as unknown }), (e: unknown) => ({ r: null, e }));
  await vi.advanceTimersByTimeAsync(LAT * 60);
  const out = await settled;
  return { ...out, bodies: lc.bodies, peak: lc.peak(), rounds: (Math.max(...lc.started) + LAT - t0) / LAT };
}

describe("UT-PRODSAVE through the real engine with a latency-simulating client (MODELLED rounds, not Dataverse time)", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("UT-PRODSAVE-010 the same requests go out in fewer rounds: 15-year curve 4 -> 3, 28-year curve 5 -> 3, at most 16 in flight", async () => {
    const lines: string[] = [];
    for (const [name, args, before, after] of [
      ["new WTG 15-year curve + seasonality + 2 syncs (19 requests)", newYield(), 4, 3],
      ["new WTG 28-year curve + seasonality + 2 syncs (32 requests)", newYield(curveOf(28)), 5, 3],
    ] as const) {
      const legacy = await run(planSaveYield(args, { wide: false }));
      const wide = await run(planSaveYield(args));
      expect(legacy.e).toBeNull();
      expect(wide.e).toBeNull();
      expect([...wide.bodies].sort()).toEqual([...legacy.bodies].sort()); // the same requests
      expect(wide.bodies.some((b) => b.includes("@created"))).toBe(false); // every ref was resolved
      expect(legacy.peak).toBeLessThanOrEqual(WRITE_CONCURRENCY);
      expect(wide.peak).toBeLessThanOrEqual(WIDE_GROUP_CONCURRENCY);
      expect(wide.peak).toBeGreaterThan(WRITE_CONCURRENCY);
      expect(legacy.rounds).toBe(before);
      expect(wide.rounds).toBe(after);
      lines.push(`${name}: rounds ${legacy.rounds} -> ${wide.rounds}, peak in flight ${legacy.peak} -> ${wide.peak}`);
    }
    console.info(`[PRODSAVE] engine, ${LAT} ms per request (MODELLED)\n${lines.join("\n")}`);
  });

  it("UT-PRODSAVE-011 a refused child leaves the rest of the group to finish, then the plan fails with true counts (the yield landed)", async () => {
    const plan = planSaveYield(newYield());
    const total = plan.writes.length;
    const r = await run(plan, 6); // the yield is create 1; the 6th create is a child inside the group
    expect(r.e).toBeInstanceOf(PlanError);
    const e = r.e as PlanError;
    expect(e.total).toBe(total);
    expect(e.done).toBe(total - 1); // every other write of the group was sent and landed
    expect(r.bodies).toHaveLength(total);
  });
});
