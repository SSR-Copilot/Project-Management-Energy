/**
 * Static fixture data (Phase 1 UI blocks, and the tests). Not imported by the running screen.
 */
import type { CountryRow } from "@/domain/countryPicker";
import {
  CLOSING_REF, CONTRACT_TYPE, MARGIN_TYPE, TECHNOLOGY,
  type CapexAccount, type DevCoRow, type StandardContract,
} from "./rules";

export const GERMANY_ID = "11111111-1111-1111-1111-111111111111";
export const FRANCE_ID = "22222222-2222-2222-2222-222222222222";
const SPAIN_ID = "33333333-3333-3333-3333-333333333333";

export const fixtureCountries: CountryRow[] = [
  { id: FRANCE_ID, name: "France", isoCurrencyCode: "EUR" },
  { id: SPAIN_ID, name: "Spain", isoCurrencyCode: "EUR" },
  { id: GERMANY_ID, name: "Germany", isoCurrencyCode: "EUR" },
  { id: "44444444-4444-4444-4444-444444444444", name: "Poland", isoCurrencyCode: "PLN" },
];

/** `00001` → roots (10000 Development Expenses, 20000 Other CAPEX, 10006 excluded) → L2 → L3. */
export const fixtureAccounts: CapexAccount[] = [
  { id: "acc-top", number: "00001", name: "CAPEX" },
  { id: "root-dev", number: "10000", name: "Development Expenses", order: 2, parentId: "acc-top" },
  { id: "root-oth", number: "20000", name: "Other CAPEX", order: 5, parentId: "acc-top" },
  { id: "root-x", number: "10006", name: "Excluded", order: 1, parentId: "acc-top" },
  { id: "root-empty", number: "30000", name: "Empty Root", order: 9, parentId: "acc-top" },
  { id: "l2-dev", number: "10100", name: "Permits", parentId: "root-dev" },
  { id: "l3-a", number: "10101", name: "Grid connection", parentId: "l2-dev" },
  { id: "l3-b", number: "10102", name: "Environmental study", parentId: "l2-dev" },
  { id: "l2-oth", number: "20100", name: "Misc", parentId: "root-oth" },
  { id: "l3-c", number: "20101", name: "Insurance", parentId: "l2-oth" },
  { id: "l4-deep", number: "20101-1", name: "Too deep", parentId: "l3-c" },
  { id: "l2-x", number: "10600", name: "Excluded L2", parentId: "root-x" },
  { id: "l3-x", number: "10601", name: "Excluded L3", parentId: "l2-x" },
];

export function contract(overrides: Partial<StandardContract> & { id: string }): StandardContract {
  return {
    name: `Development Contract - ${overrides.id}`,
    description: overrides.id,
    countryId: GERMANY_ID,
    technology: TECHNOLOGY.Wind,
    contractType: CONTRACT_TYPE.Development,
    closingRef: CLOSING_REF.FID,
    monthDifference: -3,
    margin: false,
    ...overrides,
  };
}

export const fixtureContracts: StandardContract[] = [
  contract({
    id: "c-con", name: "Construction Contract - Grid", description: "Grid",
    contractType: CONTRACT_TYPE.Construction, margin: true, marginType: MARGIN_TYPE.Percentage,
    marginPercentage: 5.5, comment: "Checked by finance",
  }),
  contract({ id: "c-dev", name: "Development Contract - Turbine", description: "Turbine", monthDifference: 0 }),
];

export const fixtureDevCo: DevCoRow[] = [
  { id: "child-1", contractId: "c-dev", accountId: "l3-a", rootAccountId: "root-dev" },
  { id: "child-2", contractId: "c-con", accountId: "l3-c", rootAccountId: "root-oth" },
];
