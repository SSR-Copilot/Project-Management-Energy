/**
 * SPB throwaway timing of the PURE calculation / plan-building functions of the Production, Revenues, Finance and
 * Generators screens. Every input is SYNTHETIC (sizes stated in each label). Wall-clock numbers are from one Node
 * process on a developer laptop: relative only, not a user-perceived time. Run (one file at a time, from ProjectCosts-CodeApp):
 *   npx vitest run --config ../ProjectDocs/bottleneck-identification/_bench/SPB/vitest.spb.config.ts
 */
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import { planStandardContracts, groupIntoWaves, type GenerationInputs, type StandardAssumption } from "@/features/pm/production/rules";
import { validateHedgedVolume, generateVolumeRows, applyRevenueEngine, planSaveContract, type AssumptionRow } from "@/features/pm/revenues/rules";
import { regenerateRepaymentYears, repaymentDiff } from "@/features/pm/finance/rules";
import {
  projectCatalog, cascadeOptions, planTurbineAllocation, buildTurbineNames, planToggleStatus as _unused,
} from "@/features/pm/generators/rules";
import { allocationCreates, planToggleStatus, planCreateGeneratorType } from "@/features/pm/generators/plans";

void _unused;
const G = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const BU = G(7);
const out: string[] = [];
const time = (label: string, reps: number, fn: () => unknown): void => {
  fn(); // warm-up
  const t0 = performance.now();
  let last: unknown;
  for (let i = 0; i < reps; i++) last = fn();
  const per = (performance.now() - t0) / reps;
  const size = Array.isArray(last) ? ` -> ${last.length} items` : (last && typeof last === "object" && "writes" in (last as object) ? ` -> ${(last as { writes: unknown[] }).writes.length} plan steps` : "");
  out.push(`${label}: ${per.toFixed(3)} ms per call (${reps} reps)${size}`);
};

const t = CHOICE_PRODUCTION.typeOfContract;
const P = CHOICE_PRODUCTION.opexLandLeasePeriod;
const assumption = (i: number, type: number, period: number, over: Partial<StandardAssumption> = {}): StandardAssumption => ({
  id: G(2000 + i), name: `n${i}`, description: `Standard ${type}-${i}`, period, typeOfContract: type,
  landLeaseSubaccountId: G(i % 3), landLeaseSubaccountName: `LL${i % 3}`, opexSubaccountId: G(50 + (i % 3)), opexSubaccountName: `OX${i % 3}`,
  currencyId: BU, secured: true, allWtgAllocated: false, fixCosts: 1, ofRevenues: 0, eurMw: 1, eurMwh: 1, eurWtg: 1, aggregation: 952850000,
  durationInYears: 5, durationInMonths: 0, distributionFrequency: 1, amountOneTimePayment: null, amountOneTimePayment2: null,
  amountOneTimePayment3: null, dueDateOneTimePayment: null, dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: false, useCountryInflationProfile: false, inflationProfile: null, inflationCountryArea: null,
  alignWithProjectDuration: false, externalContract: false, threshold: false, thresholdType: null, thresholdIndividual: null, ...over,
});
const generationInput = (turbines: number, deviceTypes: number): GenerationInputs => {
  const assumptions: StandardAssumption[] = [];
  // 3 land-lease subaccounts x (P1 all-WTG + P2..P4), 5 Other OPEX heads x 3 periods, O&M P1 + P2..P5
  for (let s = 0; s < 3; s++) {
    assumptions.push(assumption(s * 10, t.landlease, P.period1, { landLeaseSubaccountId: G(s), allWtgAllocated: true }));
    for (const [k, p] of [P.period2, P.period3, P.period4].entries()) assumptions.push(assumption(s * 10 + k + 1, t.landlease, p, { landLeaseSubaccountId: G(s) }));
  }
  for (let s = 0; s < 5; s++) {
    assumptions.push(assumption(100 + s * 10, t.opexOther, P.period1, { opexSubaccountId: G(50 + s) }));
    for (const [k, p] of [P.period2, P.period3].entries()) assumptions.push(assumption(100 + s * 10 + k + 1, t.opexOther, p, { opexSubaccountId: G(50 + s) }));
  }
  assumptions.push(assumption(300, t.opexOandM, P.period1));
  for (const [k, p] of [P.period2, P.period3, P.period4, P.period5].entries()) assumptions.push(assumption(300 + k + 1, t.opexOandM, p));
  return {
    project: {
      id: BU, projectIdText: "P-1", projectName: "Synthetic", countryId: "c", countryName: "Germany", technology: 100, totalCapacity: 100,
      endDate: "2060-12-31", cod: "2028-01-01", plantPvCapacity: 0, grossYield: 1, windSpeed: 1, irradiation: 1, netYieldP50: 1, netYieldP75: 1,
      netYieldP90: 1, standardCostCreated: false, owningBusinessUnitId: BU,
    },
    assumptions,
    existing: { landLease: 0, otherOpex: 0, oAndM: 0 },
    generators: Array.from({ length: turbines }, (_, i) => ({ id: G(1000 + i), name: `WTG X_${i + 1}` })),
    deviceTypes: Array.from({ length: deviceTypes }, (_, i) => ({ id: G(900 + i) })),
    oAndM: { id: G(1), name: "Operation & Maintenance" },
    countryInflation: 2,
  };
};

describe("SPB synthetic timings", () => {
  it("Production generation plan", () => {
    for (const [n, d] of [[30, 3], [100, 4], [800, 8]] as const) {
      const input = generationInput(n, d);
      const plan = planStandardContracts(input);
      const flat = planStandardContracts(input, { waves: false });
      out.push(`  [SYNTHETIC] ${n} turbines, ${d} device types, 3 all-WTG land-lease heads: ${flat.writes.length} writes, grouped into ${plan.writes.length} plan steps`);
      time(`planStandardContracts (waves on) ${n} turbines`, n >= 800 ? 20 : 100, () => planStandardContracts(input));
      time(`planStandardContracts (waves off) ${n} turbines`, n >= 800 ? 20 : 100, () => planStandardContracts(input, { waves: false }));
      time(`groupIntoWaves only ${n} turbines`, n >= 800 ? 20 : 100, () => groupIntoWaves(flat.writes));
    }
  });

  it("Revenues calculations", () => {
    const start = new Date(2028, 0, 1);
    const end = new Date(2063, 11, 31);
    const overlap = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, startDate: new Date(2028 + (i % 5), 0, 1), endDate: new Date(2050 + (i % 10), 11, 31), hedgedVolume: 2 }));
    time("validateHedgedVolume 36 years (432 months) x 30 overlapping contracts", 200, () => validateHedgedVolume({ startDate: start, endDate: end, hedgedVolume: 50 }, overlap));
    time("generateVolumeRows 36 years", 2000, () => generateVolumeRows(start, end));
    const rows: AssumptionRow[] = [];
    const vts = ["revenuetype", "price", "duration", "inflation", "hedge", "negativeprice", "startdate"];
    for (let i = 0; i < 3000; i++) rows.push({ country: "Germany", valuetype: i < 5 ? vts[i % vts.length]! : "price", category: String(2000 + (i % 60)), wind: String(i), pv: String(i) });
    const project = {
      id: BU, projectIdText: "P", projectName: "S", countryName: "Germany", countryCode: "c", technology: "Wind" as const, areaName: null,
      cod: new Date(2034, 0, 29), fid: null, construction: null, legallyBindingPermits: null, applicationSubmitted: null,
      projectDevelopmentStarted: null, feasibilityStudies: null, netYieldP50: 120000, totalCapacity: 40, endDate: new Date(2060, 11, 31),
      clusterStateName: "Cluster 4", owningBusinessUnitId: BU, clusterStateOrder: 4,
    };
    time("applyRevenueEngine with 3,000 assumption rows (SYNTHETIC)", 200, () => applyRevenueEngine({
      project: project as never, rows, region: null, label: "PPA", productionExists: true, subaccountId: G(3), profiles: [], today: new Date(2026, 10, 26),
    }));
    // planSaveContract with 36 individual volumes needs a full form: use the engine's form, switch to individual
    const form = applyRevenueEngine({ project: project as never, rows, region: null, label: "PPA", productionExists: true, subaccountId: G(3), profiles: [], today: new Date(2026, 10, 26) });
    const ind = { ...form, hedge: { ...form.hedge, type: "individual" as const, individual: generateVolumeRows(start, end).map((r) => ({ ...r, value: "100", initialState: false })) }, startDate: start, endDate: end };
    const ids = Array.from({ length: 36 }, (_, i) => `v${i}`);
    time("planSaveContract Edit, 36 stored + 36 new volumes", 500, () => planSaveContract({
      form: { ...ind, mode: "Edit", contractId: G(4) } as never, project: project as never, currencyId: BU, storedVolumeIds: ids, language: "en-US",
    }));
  });

  it("Finance calculations", () => {
    const cod = new Date(2028, 0, 1);
    const prev = Array.from({ length: 40 }, (_, i) => ({ year: 2030 + i, value: String(i), valid: true, dirty: true, repaymentAmountRecordId: `r${i}` }));
    const existing = prev.map((p, i) => ({ year: p.year, id: `r${i}` }));
    time("regenerateRepaymentYears 40 years", 5000, () => regenerateRepaymentYears(cod, 2, 0, 42, 0, prev, existing));
    const stored = prev.map((p, i) => ({ id: `r${i}`, year: p.year }));
    time("repaymentDiff 40 rows (individual profile)", 5000, () => repaymentDiff(CHOICE_FINANCE_INDIVIDUAL, prev, stored));
  });

  it("Generators calculations", () => {
    const models = Array.from({ length: 2000 }, (_, i) => ({
      id: `m${i}`, name: `M${i}`, displayName: `Model ${i}`, supplier: `Supplier ${i % 12}`, turbineType: `T${i % 80}`, hubHeight: 100 + (i % 9) * 10,
      rotorDiameter: 150, specificCapacity: 6, totalHeight: 180, earliestPhaseout: "2040-01-01", countryAvailability: [1, 2, 3],
      foundationCostIncluded: false, additionalFoundationCost: 1, prices: [1, 2, 3, 4, 5] as (number | null)[],
    }));
    time("projectCatalog 2,000 catalogue models (SYNTHETIC)", 200, () => projectCatalog(models as never, { countryOptionValue: 1, fidDate: "2030-01-01" }));
    const projected = projectCatalog(models as never, { countryOptionValue: 1, fidDate: "2030-01-01" });
    time("cascadeOptions 2,000 models, supplier + type selected (per type-panel render)", 500, () => cascadeOptions(projected, { inCountry: true, supplier: "Supplier 3", turbineType: "T3" }));
    for (const [n, l] of [[20, 2], [200, 5]] as const) {
      const turbines = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `WTG X_${i + 1}` }));
      const costs = Array.from({ length: l }, (_, i) => ({ id: `c${i}`, landOwner: `O${i}`, description: `D${i}`, allWtgAllocated: true }));
      time(`planTurbineAllocation ${n} turbines x ${l} all-WTG costs`, 500, () => planTurbineAllocation({ costs, turbines }));
      time(`allocationCreates ${n} turbines x ${l} all-WTG costs`, 500, () => allocationCreates({ costs, turbines, owningBusinessUnitId: BU }));
    }
    const existingTurbines = Array.from({ length: 800 }, (_, i) => ({ index: i + 1 }));
    time("buildTurbineNames count 200 over 800 existing", 2000, () => buildTurbineNames({ shortName: "X", existing: existingTurbines, count: 200 }));
    const typeRow = { id: "ty", status: 0, generatorId: "m1", name: "T", numberOfGenerators: 200, costPerWtg: 1, generatorsCost: 1, generatorsCapacity: 1, requestPermissionState: null, generatorDisplayName: null, flowRunId: null, flowApprovalId: null, specificCapacity: null };
    const turbinesFor = Array.from({ length: 200 }, (_, i) => ({ id: `t${i}` }));
    time("planToggleStatus 200 turbines", 2000, () => planToggleStatus({ project: { id: BU, shortName: "X", owningBusinessUnitId: BU }, type: typeRow as never, turbines: turbinesFor, allTypes: [typeRow as never] }));
    time("planCreateGeneratorType N=200 over 800 existing", 500, () => planCreateGeneratorType({
      project: { id: BU, shortName: "X", owningBusinessUnitId: BU }, inCountry: true,
      model: { id: "m1", specificCapacity: 6, hubHeight: 120, rotorDiameter: 150 }, numberOfGenerators: 200, costPerWtg: 1000, selectedHeight: 0,
      revisedHubHeight: 120, existingTypes: [], projectTurbines: existingTurbines,
    }));
  });

  it("prints", () => {
    // eslint-disable-next-line no-console
    console.log(`\nSPB BENCH (SYNTHETIC inputs; one Node process; relative only)\n${out.join("\n")}\n`);
  });
});

const CHOICE_FINANCE_INDIVIDUAL = (await import("@/data/dataverseNames")).CHOICE_FINANCE.repaymentProfile.individual;
