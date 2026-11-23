/**
 * Shared fixtures of the Production plan baseline and wave tests (D135): a project, a standard assumption
 * and a realistic one-shot generation input. Test support only: nothing in the app imports it.
 */
import { CHOICE_PRODUCTION } from "@/data/dataverseNames";
import type { GenerationInputs, ProductionProject, StandardAssumption } from "./rules";

export const project = (over: Partial<ProductionProject> = {}): ProductionProject => ({
  id: "p1", projectIdText: "DE-0001", projectName: "Windpark Nord", countryId: "c1", countryName: "Germany", technology: 952850000,
  totalCapacity: 22.4, endDate: "2055-12-31", cod: "2028-09-01", plantPvCapacity: 5,
  grossYield: 12_000, windSpeed: 7.25, irradiation: null, netYieldP50: 12_000, netYieldP75: 11_000, netYieldP90: 10_000,
  standardCostCreated: false, owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-0000000000b1", ...over,
});


export const assumption = (over: Partial<StandardAssumption> = {}): StandardAssumption => ({
  id: "a1", name: "LL Standard", description: "A Land lease", period: CHOICE_PRODUCTION.opexLandLeasePeriod.period1,
  typeOfContract: CHOICE_PRODUCTION.typeOfContract.landlease, landLeaseSubaccountId: "lls1", landLeaseSubaccountName: "Land lease",
  opexSubaccountId: null, opexSubaccountName: null, currencyId: "cur1", secured: true, allWtgAllocated: false, fixCosts: 1000,
  ofRevenues: 2, eurMw: 1, eurMwh: 2, eurWtg: 3, aggregation: CHOICE_PRODUCTION.aggregation.sum, durationInYears: 2,
  durationInMonths: 6, distributionFrequency: 12, amountOneTimePayment: 1_234.5678, amountOneTimePayment2: null,
  amountOneTimePayment3: null, dueDateOneTimePayment: "2029-01-01", dueDateOneTimePayment2: null, dueDateOneTimePayment3: null,
  useInflationProfile: true, useCountryInflationProfile: false, inflationProfile: 1.8, inflationCountryArea: "DE",
  alignWithProjectDuration: false, externalContract: false, threshold: false, thresholdType: null, thresholdIndividual: null, ...over,
});


export const P = CHOICE_PRODUCTION.opexLandLeasePeriod;
export const T = CHOICE_PRODUCTION.typeOfContract;

/**
 * A realistic generation: `ll` land-lease Period-1 assumptions (each its own subaccount, all-WTG allocated) over `gens`
 * turbines; Other OPEX with 3 heads and 10 later periods; O&M with one Period-1 and two later assumptions over `devices`
 * device types.
 */
export function generation(ll: number, gens: number, devices: number): GenerationInputs {
  const assumptions: StandardAssumption[] = [];
  for (let i = 1; i <= ll; i++) {
    assumptions.push(assumption({
      id: `ll${i}`, name: `LL ${i}`, description: `LL ${String(i).padStart(2, "0")}`, landLeaseSubaccountId: `lls${i}`,
      landLeaseSubaccountName: `Sub ${i}`, allWtgAllocated: true,
    }));
  }
  const opex = (id: string, desc: string, sub: string, period: number): StandardAssumption =>
    assumption({ id, name: id, description: desc, typeOfContract: T.opexOther, period, opexSubaccountId: sub, opexSubaccountName: sub, landLeaseSubaccountId: null });
  for (let s = 1; s <= 3; s++) assumptions.push(opex(`oh${s}`, `OO head ${s}`, `os${s}`, P.period1));
  const laterPeriods = [P.period2, P.period3, P.period4, P.period5];
  for (let k = 0; k < 10; k++) assumptions.push(opex(`op${k}`, `OO period ${String(k).padStart(2, "0")}`, `os${(k % 3) + 1}`, laterPeriods[k % laterPeriods.length]!));
  const om = (id: string, desc: string, period: number): StandardAssumption =>
    assumption({ id, name: id, description: desc, typeOfContract: T.opexOandM, period, landLeaseSubaccountId: null });
  assumptions.push(om("om1", "OM 1", P.period1), om("om2", "OM 2", P.period2), om("om3", "OM 3", P.period3));
  return {
    project: project(), assumptions, existing: { landLease: 0, otherOpex: 0, oAndM: 0 },
    generators: Array.from({ length: gens }, (_, i) => ({ id: `g${i + 1}`, name: `WTG A_${i + 1}` })),
    deviceTypes: Array.from({ length: devices }, (_, i) => ({ id: `d${i + 1}` })),
    oAndM: { id: "om", name: "Operation & Maintenance" }, countryInflation: 2.1,
  };
}

/* ═════════════════════════════════════════════════════════════════ measuring ═══ */
