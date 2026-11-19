/**
 * Revenue contract Save — the write path under `REVENUE_PERF.parallelVolumeWrites` (D136).
 *
 * The legacy plan (`perf: { parallelVolumeWrites: false }`: one request after another) is the ORACLE. The new plan is
 * run through the REAL `executePlan` against a recording mock SDK in which every request takes a fixed 10 virtual
 * milliseconds, so the counts below are deterministic: `requests` = what reached the SDK, `roundTrips` = virtual
 * elapsed time / 10 ms (a request that runs beside another adds nothing).
 *
 * What must hold: the SAME rows, payloads and ids are written; the contract first, every delete before the first create,
 * the volumes bound to the contract; the same refusals; the same totals; and far fewer round trips. The cases the group
 * changes on purpose (a failure inside a group lets the rest of that group run) are pinned as the DIVERGENCE they are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  log: [] as { method: string; table: string; id?: string; body?: Record<string, unknown> }[],
  n: 0,
  LAT: 10,
  /** 1-based number of the request (in the order they START) that answers HTTP 500, or 0. */
  failRequest: 0,
}));

vi.mock("@microsoft/power-apps/data", () => {
  const wait = () => new Promise<void>((r) => setTimeout(r, sdk.LAT));
  const refused = () => ({
    success: false as const, data: undefined,
    error: Object.assign(new Error("HTTP 500"), { status: 500 }),
  });
  const started = (): boolean => sdk.log.length === sdk.failRequest;
  const client = {
    retrieveMultipleRecordsAsync: async () => ({ success: true, data: [] }),
    createRecordAsync: async (table: string, body: Record<string, unknown>) => {
      sdk.log.push({ method: "create", table, body });
      const fail = started();
      await wait();
      if (fail) return refused();
      sdk.n += 1;
      const id = `00000000-0000-0000-0000-${String(sdk.n).padStart(12, "0")}`;
      return { success: true, data: { vsb_projectrevenueid: id, vsb_revenueindividualhedgevolumeid: id } };
    },
    updateRecordAsync: async (table: string, id: string, body: Record<string, unknown>) => {
      sdk.log.push({ method: "update", table, id, body });
      const fail = started();
      await wait();
      return fail ? refused() : { success: true, data: {} };
    },
    deleteRecordAsync: async (table: string, id: string) => {
      sdk.log.push({ method: "delete", table, id });
      const fail = started();
      await wait();
      return fail ? refused() : { success: true, data: undefined };
    },
  };
  return { getClient: () => client };
});

import { executePlan, PlanError, type PlanResult } from "@/data/executePlan";
import { REVENUE_PERF } from "@/data/revenuesFlags";
import type { WritePlan } from "@/data/writePlan";
import {
  field, generateVolumeRows, NOTHING_STANDARD, planSaveContract, REVENUE_SCREEN_TEXT,
  type RevenueFormState, type RevenueProject,
} from "./rules";
import { revenueReloadKeys } from "./reload";
import { qk } from "@/data/keys";

/* ─────────────────────────────────────────────────────────────────────── fixtures ── */

const d = (s: string) => new Date(`${s}T00:00:00`);
const project = (over: Partial<RevenueProject> = {}): RevenueProject => ({
  id: "p1", projectIdText: "DE-0001", projectName: "x", countryName: "Germany", countryCode: "DE", technology: "Wind",
  areaName: null, cod: d("2028-01-01"), fid: d("2026-06-30"), construction: d("2027-03-01"),
  legallyBindingPermits: d("2026-01-15"), applicationSubmitted: d("2025-05-01"),
  projectDevelopmentStarted: d("2024-02-01"), feasibilityStudies: d("2023-01-01"), netYieldP50: 120000, totalCapacity: 50,
  endDate: d("2055-12-31"), clusterStateName: "Cluster 4", owningBusinessUnitId: "bu-1", ...over,
}) as RevenueProject;

const form = (over: Partial<RevenueFormState>): RevenueFormState => ({
  mode: "New", formDirty: true, contractId: null, subaccountId: "sub-1", revenueTypeLabel: "PPA", description: "PPA",
  currencyCode: "EUR", tariff: "65.00", tariffP90: "", biddingPrice: "", siteQuality: "", siteQualityP90: "",
  correctionFactor: "", correctionFactorP90: "", startDate: d("2028-01-01"), endDate: d("2043-06-30"),
  durationYears: 15, durationMonths: 6,
  hedge: { type: "percentage", percentage: field("70"), fixed: { ...field(""), initialState: true }, individual: [] },
  useInflation: false, useCountryInflationProfile: false, inflationProfile: "", inflationStartYear: "",
  considerNegativePrices: false, negativePriceManualOverride: false, isStandardContract: false, showsGermanFitBlock: false,
  technology: "Wind", country: "Germany", netYieldP50: 120000, std: NOTHING_STANDARD, ...over,
}) as RevenueFormState;

interface Case {
  edit: boolean;
  stored: number;
  years: number;
  /** "individual" writes `years` volume rows; "percentage" writes none (the stored ones are still removed). */
  type?: "individual" | "percentage";
  owner?: string | null;
}

function planFor(c: Case, parallel: boolean): WritePlan {
  const rows = generateVolumeRows(d("2028-01-01"), d(`${2028 + Math.max(c.years, 1) - 1}-12-31`))
    .slice(0, c.years).map((r) => ({ ...r, value: "5", initialState: false }));
  const individual = (c.type ?? "individual") === "individual";
  return planSaveContract({
    form: form({
      mode: c.edit ? "Edit" : "New", contractId: c.edit ? "r1" : null,
      hedge: {
        type: individual ? "individual" : "percentage", percentage: field("70"),
        fixed: { ...field(""), initialState: true }, individual: individual ? rows : [],
      },
    }),
    project: project(c.owner === undefined ? {} : { owningBusinessUnitId: c.owner }),
    currencyId: "cur-1",
    storedVolumeIds: Array.from({ length: c.stored }, (_, i) => `v${i}`),
    perf: { parallelVolumeWrites: parallel },
  });
}

interface Outcome { requests: number; roundTrips: number; result?: PlanResult; error?: PlanError; lines: string[] }

const canonical = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : x);

async function execute(plan: WritePlan, failRequest = 0): Promise<Outcome> {
  sdk.log.length = 0; sdk.n = 0; sdk.failRequest = failRequest;
  vi.setSystemTime(0);
  let doneAt = -1;
  const settled = executePlan(plan, "save").then(
    (result) => { doneAt = Date.now(); return { result } as { result?: PlanResult; error?: PlanError }; },
    (error: unknown) => { doneAt = Date.now(); return { error: error as PlanError }; },
  );
  await vi.advanceTimersByTimeAsync(sdk.LAT * 1000);
  const out = await settled;
  return {
    requests: sdk.log.length, roundTrips: doneAt / sdk.LAT, ...out,
    lines: sdk.log.map((r) => `${r.method}|${r.table}|${r.id ?? ""}|${canonical(r.body ?? null)}`),
  };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const CONTRACTS = "vsb_projectrevenues";
const VOLUMES = "vsb_revenueindividualhedgevolumes";

/* ───────────────────────────────────────────────────────────────── the baseline ── */

describe("UT-REVPERF contract Save — the legacy sequential path (oracle)", () => {
  it("UT-REVPERF-001 the switch is on by default, and off is the legacy plan: no write is marked concurrent", () => {
    expect(REVENUE_PERF.parallelVolumeWrites).toBe(true);
    const legacy = planFor({ edit: true, stored: 3, years: 3 }, false);
    expect(legacy.writes.some((w) => w.concurrent)).toBe(false);
    expect(legacy.writes.map((w) => `${w.op}:${w.entitySet}`)).toEqual([
      `update:${CONTRACTS}`, `delete:${VOLUMES}`, `delete:${VOLUMES}`, `delete:${VOLUMES}`,
      `create:${VOLUMES}`, `create:${VOLUMES}`, `create:${VOLUMES}`,
    ]);
  });

  it("UT-REVPERF-002 baseline, measured before the change: Edit with 12 stored and 12 new volumes is 25 requests in 25 round trips", async () => {
    const o = await execute(planFor({ edit: true, stored: 12, years: 12 }, false));
    expect(o.requests).toBe(25);
    expect(o.roundTrips).toBe(25);
  });

  it("UT-REVPERF-003 baseline, measured before the change: Edit with 36 and 36 is 73 requests in 73 round trips", async () => {
    const o = await execute(planFor({ edit: true, stored: 36, years: 36 }, false));
    expect(o.requests).toBe(73);
    expect(o.roundTrips).toBe(73);
  });
});

/* ──────────────────────────────────────────────────────────── the new path ── */

describe("UT-REVPERF contract Save — parallel volume writes", () => {
  it("UT-REVPERF-010 Edit 12 stored / 12 new: the same 25 requests, in 4 round trips instead of 25", async () => {
    const o = await execute(planFor({ edit: true, stored: 12, years: 12 }, true));
    expect(o.requests).toBe(25);
    // update (1) + 12 deletes at 16 at a time (1) + 12 creates at 8 at a time (2)
    expect(o.roundTrips).toBe(4);
  });

  it("UT-REVPERF-011 Edit 36 / 36: the same 73 requests, in 9 round trips instead of 73", async () => {
    const o = await execute(planFor({ edit: true, stored: 36, years: 36 }, true));
    expect(o.requests).toBe(73);
    // 1 + ceil(36/16) + ceil(36/8)
    expect(o.roundTrips).toBe(9);
  });

  it("UT-REVPERF-012 New contract with 12 volumes: 13 requests in 3 round trips instead of 13", async () => {
    const o = await execute(planFor({ edit: false, stored: 0, years: 12 }, true));
    expect(o.requests).toBe(13);
    expect(o.roundTrips).toBe(3);
  });

  it("UT-REVPERF-013 EQUIVALENCE: the same rows, ids and payloads are written, across hedge type x mode x stored x new rows", async () => {
    let cases = 0;
    for (const type of ["individual", "percentage"] as const) {
      for (const edit of [false, true]) {
        for (const stored of [0, 1, 3]) {
          for (const years of type === "individual" ? [0, 1, 12] : [0]) {
            const c: Case = { edit, stored: edit ? stored : 0, years, type };
            const legacy = await execute(planFor(c, false));
            const grouped = await execute(planFor(c, true));
            expect(grouped.lines.slice().sort(), JSON.stringify(c)).toEqual(legacy.lines.slice().sort());
            expect(grouped.requests, JSON.stringify(c)).toBe(legacy.requests);
            expect(grouped.result?.done, JSON.stringify(c)).toBe(legacy.result?.done);
            expect(grouped.result?.createdIds, JSON.stringify(c)).toEqual(legacy.result?.createdIds);
            expect(grouped.result?.deleted, JSON.stringify(c)).toEqual(legacy.result?.deleted);
            expect(grouped.roundTrips, JSON.stringify(c)).toBeLessThanOrEqual(legacy.roundTrips);
            cases += 1;
          }
        }
      }
    }
    // 2 modes x 3 stored x 3 row counts (individual) + 2 modes x 3 stored x 1 (percentage)
    expect(cases).toBe(24);
  });

  it("UT-REVPERF-014 ORDER: the contract first, every delete before the first create, creates after the contract write", async () => {
    const o = await execute(planFor({ edit: true, stored: 5, years: 5 }, true));
    const kinds = o.lines.map((l) => l.split("|").slice(0, 2).join(":"));
    expect(kinds[0]).toBe(`update:${CONTRACTS}`);
    const lastDelete = kinds.lastIndexOf(`delete:${VOLUMES}`);
    const firstCreate = kinds.indexOf(`create:${VOLUMES}`);
    expect(lastDelete).toBe(5);
    expect(firstCreate).toBe(6);
  });

  it("UT-REVPERF-015 a NEW contract's volumes all bind the contract the first write created, and ids[0] is that contract", async () => {
    const o = await execute(planFor({ edit: false, stored: 0, years: 6 }, true));
    const contractId = o.result!.createdIds[0]!;
    expect(contractId).toBe("00000000-0000-0000-0000-000000000001");
    const volumeBodies = o.lines.filter((l) => l.startsWith(`create|${VOLUMES}|`)).map((l) => l.split("|").slice(3).join("|"));
    expect(volumeBodies).toHaveLength(6);
    for (const body of volumeBodies) {
      expect(JSON.parse(body)["vsb_RevenueContract@odata.bind"]).toBe(`/${CONTRACTS}(${contractId})`);
    }
    expect(o.result!.createdIds).toHaveLength(7);
    expect(o.result!.landed[0]).toEqual({ entitySet: CONTRACTS, id: contractId });
  });

  it("UT-REVPERF-016 the owner bind (CONVENTIONS rule 4) is on every volume, and absent in both paths when the project has no business unit", async () => {
    const withOwner = await execute(planFor({ edit: false, stored: 0, years: 3 }, true));
    for (const l of withOwner.lines.filter((x) => x.startsWith(`create|${VOLUMES}|`))) {
      expect(JSON.parse(l.split("|").slice(3).join("|"))["owningbusinessunit@odata.bind"]).toBe("/businessunits(bu-1)");
    }
    const none = { edit: false, stored: 0, years: 3, owner: null } as const;
    const a = await execute(planFor(none, false));
    const b = await execute(planFor(none, true));
    expect(b.lines.slice().sort()).toEqual(a.lines.slice().sort());
    expect(b.lines.some((l) => l.includes("owningbusinessunit@odata.bind") && l.startsWith(`create|${VOLUMES}|`))).toBe(false);
  });

  it("UT-REVPERF-017 the refusals are the same with the switch on and off, and send nothing", () => {
    for (const parallel of [false, true]) {
      const perf = { parallelVolumeWrites: parallel };
      const base = { form: form({}), project: project(), currencyId: "c", storedVolumeIds: [], perf };
      expect(planSaveContract({ ...base, project: null }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noProject);
      expect(planSaveContract({ ...base, form: form({ subaccountId: null }) }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noSubaccount);
      expect(planSaveContract({ ...base, currencyId: null }).refusedReason).toBe(REVENUE_SCREEN_TEXT.noCurrency);
    }
  });

  it("UT-REVPERF-018 the 'N of M changes saved' total is the same in both paths", async () => {
    const legacy = await execute(planFor({ edit: true, stored: 4, years: 3 }, false));
    const grouped = await execute(planFor({ edit: true, stored: 4, years: 3 }, true));
    expect(legacy.result?.done).toBe(8);
    expect(grouped.result?.done).toBe(8);
  });
});

/* ───────────────────────────────────────────────────────────── part-way failures ── */

describe("UT-REVPERF contract Save — a failure part-way (DIVERGENCE, D136)", () => {
  // Edit, 5 stored volumes, 3 new: request 1 = the update, 2-6 = the deletes, 7-9 = the creates. Request 4 fails.
  const c: Case = { edit: true, stored: 5, years: 3 };

  it("UT-REVPERF-020 legacy: the Save stops AT the failed delete, so the later deletes are never sent", async () => {
    const o = await execute(planFor(c, false), 4);
    expect(o.error).toBeInstanceOf(PlanError);
    expect(o.requests).toBe(4);
    expect(o.error!.done).toBe(3);
    expect(o.error!.total).toBe(9);
  });

  it("UT-REVPERF-021 grouped: the other deletes of the group still run, then the Save stops: no create is ever sent", async () => {
    const o = await execute(planFor(c, true), 4);
    expect(o.error).toBeInstanceOf(PlanError);
    expect(o.requests).toBe(6); // the update and all five deletes
    expect(o.error!.done).toBe(5); // the update and the four deletes that landed
    expect(o.error!.total).toBe(9);
    expect(o.lines.some((l) => l.startsWith(`create|${VOLUMES}|`))).toBe(false);
    expect(o.error!.failedReason).toBe("remove the contract's individual hedge volumes");
  });

  it("UT-REVPERF-022 a failed volume create: the creates of its group finish, nothing is sent after, the error names the volume", async () => {
    const o = await execute(planFor({ edit: false, stored: 0, years: 4 }, true), 3); // contract = 1, volumes = 2..5
    expect(o.error).toBeInstanceOf(PlanError);
    expect(o.requests).toBe(5);
    expect(o.error!.done).toBe(4);
    expect(o.error!.failedReason).toMatch(/^create the individual hedge volume \d{4}$/);
    expect(o.error!.createdIds[0]).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("UT-REVPERF-023 a failed contract write sends nothing else, in both paths", async () => {
    for (const parallel of [false, true]) {
      const o = await execute(planFor({ edit: true, stored: 3, years: 3 }, parallel), 1);
      expect(o.requests).toBe(1);
      expect(o.error!.done).toBe(0);
    }
  });
});

/* ──────────────────────────────────────────────────────────────────── the reload ── */

describe("UT-REVPERF what a write reloads", () => {
  const prefix = (key: readonly unknown[], of: readonly unknown[]): boolean => key.every((k, i) => of[i] === k);

  it("UT-REVPERF-030 a contract write reloads the contracts and the volumes, and nothing else", () => {
    expect(revenueReloadKeys("p1", "contract")).toEqual([
      ["pmRevenues", "p1", "contracts"], ["pmRevenues", "p1", "volumes"],
    ]);
  });

  it("UT-REVPERF-031 a balancing write reloads the balancing prices only (the date-sync plugin's dates must be re-read)", () => {
    expect(revenueReloadKeys("p1", "balancing")).toEqual([["pmRevenues", "p1", "balancing"]]);
  });

  it("UT-REVPERF-032 neither list reaches the project, the energy-yield check or the reference queries", () => {
    const untouched = [qk.revenues("p1", "project"), qk.revenues("p1", "negativePriceProduction"), qk.revenuesReference("currency", "EUR"),
      qk.revenuesReference("assumptions", "Germany"), qk.generalDataProjectStates];
    for (const kind of ["contract", "balancing"] as const) {
      for (const key of revenueReloadKeys("p1", kind)) {
        for (const other of untouched) expect(prefix(key as readonly unknown[], other as readonly unknown[])).toBe(false);
      }
    }
  });

  it("UT-REVPERF-033 the volumes key is a prefix of every contract's cached volumes, so a reopened contract is re-read", () => {
    const [, volumes] = revenueReloadKeys("p1", "contract") as readonly (readonly unknown[])[];
    expect(prefix(volumes!, qk.revenues("p1", "volumes", "r-1") as readonly unknown[])).toBe(true);
  });

  it("UT-REVPERF-034 another project's keys are never touched", () => {
    for (const key of revenueReloadKeys("p1", "contract")) expect((key as readonly unknown[])[1]).toBe("p1");
    expect(revenueReloadKeys(undefined, "balancing")).toEqual([["pmRevenues", "", "balancing"]]);
  });
});
