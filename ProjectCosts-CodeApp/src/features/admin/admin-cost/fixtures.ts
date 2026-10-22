/**
 * Static fixture data — Phase 1 (UI blocks without Dataverse) and the render / rule tests.
 * Shapes are exactly the data-module models, so the UI is driven the same way live.
 */
import {
  buildCapexHierarchy, type CapexHierarchy, type CostCurrency, type DevexCost, type LandLeaseSubaccount,
  type OpexPeriod, type OpexSubaccountRow,
} from "@/data/adminCost";
import { CONTRACT_TYPE, COST_PAID_BY, COST_UNIT, TECHNOLOGY } from "@/domain/costStandards";
import type { CountryRow } from "@/domain/countryPicker";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

export const FX_COUNTRIES: CountryRow[] = [
  { id: id(1), name: "Spain" },
  { id: id(2), name: "Poland" },
  { id: id(3), name: "Germany" },
  { id: id(4), name: "Italy" },
  { id: id(5), name: "France" },
  { id: id(6), name: "Croatia" },
  { id: id(7), name: "Finland" },
  { id: id(8), name: "Greece" },
];
export const FX_GERMANY = FX_COUNTRIES[2] as CountryRow;

export const FX_HIERARCHY: CapexHierarchy = buildCapexHierarchy([
  { id: id(100), name: "CAPEX", number: "00001", order: 0, parentId: undefined },
  { id: id(110), name: "Development Expenses", number: "2", order: 2, parentId: id(100) },
  { id: id(120), name: "Wind Turbine / Panels", number: "1", order: 1, parentId: id(100) },
  { id: id(130), name: "Overleveraging", number: "4", order: 4, parentId: id(100) },
  { id: id(111), name: "Permits", number: "2.1", order: 1, parentId: id(110) },
  { id: id(112), name: "Studies", number: "2.2", order: 2, parentId: id(110) },
  { id: id(121), name: "Turbines", number: "1.1", order: 1, parentId: id(120) },
  { id: id(1111), name: "Building permit", number: "21001", order: 1, parentId: id(111) },
  { id: id(1121), name: "Wind study", number: "22001", order: 1, parentId: id(112) },
  { id: id(1211), name: "WTG supply", number: "11001", order: 1, parentId: id(121) },
]);

export const FX_PAYER_DEFAULTS = new Map<string, number>([[id(1111), COST_PAID_BY.devCo]]);

export const FX_CURRENCIES: CostCurrency[] = [
  { id: id(900), name: "Euro", code: "EUR" },
  { id: id(901), name: "Zloty", code: "PLN" },
];

export const FX_LAND_LEASE_SUBACCOUNTS: LandLeaseSubaccount[] = [
  { id: id(300), name: "Land Lease WTG", order: 1 },
  { id: id(301), name: "Land Lease Access", order: 2 },
];

export const FX_OPEX_SUBACCOUNTS: OpexSubaccountRow[] = [
  { id: id(400), name: "Operation & Maintenance", order: 1, accountId: id(40), accountOrder: 1, isOAndM: true },
  { id: id(401), name: "TCMA", order: 1, accountId: id(41), accountOrder: 2, isOAndM: false },
  { id: id(402), name: "Environmental and Compensation Meassures", order: 2, accountId: id(41), accountOrder: 2, isOAndM: false },
  { id: id(403), name: "Insurance", order: 3, accountId: id(41), accountOrder: 2, isOAndM: false },
];

export function fxDevexCost(over: Partial<DevexCost> = {}): DevexCost {
  return {
    id: id(500),
    description: "Standard Building permit - Fees",
    descriptionInput: "Fees",
    clusters: [true, false, true, false, true],
    costAmount: 1234567,
    unit: COST_UNIT.eurMw,
    costPaidBy: COST_PAID_BY.devCo,
    comment: "",
    countryId: FX_GERMANY.id,
    technology: TECHNOLOGY.wind,
    categoryId: id(110),
    subaccountId: id(1111),
    ...over,
  };
}

export const FX_DEVEX_COSTS: DevexCost[] = [
  fxDevexCost(),
  fxDevexCost({ id: id(501), descriptionInput: "Study", description: "Standard Wind study - Study", subaccountId: id(1121), comment: "Check yearly", costAmount: 5000 }),
  fxDevexCost({ id: id(502), descriptionInput: "Turbines", description: "Standard WTG supply - Turbines", categoryId: id(120), subaccountId: id(1211), unit: COST_UNIT.eurWtg }),
];

const EMPTY_OTP = { dueDate1: null, amount1: null, dueDate2: null, amount2: null, dueDate3: null, amount3: null };

export function fxPeriod(over: Partial<OpexPeriod> = {}): OpexPeriod {
  return {
    id: id(600),
    description: "Standard LL Land Lease WTG",
    type: CONTRACT_TYPE.landLease,
    period: 1,
    isLastPeriodFlag: false,
    countryId: FX_GERMANY.id,
    technology: TECHNOLOGY.wind,
    landLeaseSubaccountId: id(300),
    opexSubaccountId: undefined,
    currencyId: id(900),
    startDate: "Cluster 6: Operation",
    years: 5,
    months: 0,
    fixCosts: 12000,
    ofRevenues: 2.5,
    eurMwh: 1.25,
    eurMw: 300,
    eurWtg: undefined,
    aggregation: 952850000,
    distributionFrequency: 3,
    secured: false,
    allWtgAllocated: true,
    externalContract: undefined,
    alignWithProjectDuration: false,
    useInflation: true,
    useCountryInflation: false,
    inflationProfile: 2,
    inflationArea: undefined,
    threshold: false,
    thresholdType: undefined,
    thresholdIndividual: undefined,
    otp: { ...EMPTY_OTP },
    ...over,
  };
}

export const FX_OPEX_PERIODS: OpexPeriod[] = [
  fxPeriod(),
  fxPeriod({ id: id(601), period: 2, description: "Standard LL Land Lease WTG - 2", years: 2, months: 6, startDate: "COD + 5 Years 0 Months", isLastPeriodFlag: true }),
  fxPeriod({
    id: id(610), type: CONTRACT_TYPE.oAndM, description: "Standard Operation & Maintenance",
    landLeaseSubaccountId: undefined, opexSubaccountId: id(400), useCountryInflation: true, inflationProfile: undefined,
    externalContract: false, isLastPeriodFlag: true,
  }),
];
