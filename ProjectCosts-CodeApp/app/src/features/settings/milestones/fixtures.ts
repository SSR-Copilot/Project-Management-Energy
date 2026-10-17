/**
 * Static fixture data — the Phase 1 UI was built against these, and the tests still use them.
 * Illustrative values only; not production data.
 */
import type { MilestoneAssumption, MilestoneCountry, MilestoneField } from "@/data/settings/milestones";
import { MSA_KIND } from "./constants";

export const WIND = 952850000;
export const PV = 952850001;
export const BESS = 952850003;

export const GERMANY = "11111111-0000-0000-0000-000000000002";
export const FRANCE = "11111111-0000-0000-0000-000000000001";
export const POLAND = "11111111-0000-0000-0000-000000000010";
export const SPAIN = "11111111-0000-0000-0000-000000000099";

export const FIXTURE_COUNTRIES: MilestoneCountry[] = [
  { id: GERMANY, name: "Germany", key: "2" },
  { id: POLAND, name: "Poland", key: "10" },
  { id: FRANCE, name: "France", key: "1" },
  { id: SPAIN, name: "Spain", key: "" },
];

const blank: Record<MilestoneField, number | undefined> = {
  cluster1: undefined, cluster2: undefined, cluster3: undefined, cluster4: undefined,
  fid: undefined, cluster5: undefined, operationalLifetime: undefined,
  salesStart: undefined, salesEnd: undefined,
};

export function row(
  id: string, countryId: string, technology: number | undefined, kind: keyof typeof MSA_KIND,
  values: Partial<Record<MilestoneField, number>>,
): MilestoneAssumption {
  return { id, name: MSA_KIND[kind], countryId, technology, values: { ...blank, ...values } };
}

export const FIXTURE_ASSUMPTIONS: MilestoneAssumption[] = [
  // Germany — PV listed first on purpose: the grid must still order Wind (952850000) first.
  row("de-pv-m", GERMANY, PV, "months", { cluster1: 6, cluster2: 9, cluster3: 12, cluster4: 12, cluster5: 6, operationalLifetime: 30 }),
  row("de-pv-s", GERMANY, PV, "successRate", { cluster1: 0.9, cluster2: 0.8, cluster3: 0.7, cluster4: 0.9 }),
  row("de-wind-m", GERMANY, WIND, "months", { cluster1: 12, cluster2: 18, cluster3: 24, cluster4: 12, fid: 3, cluster5: 18, operationalLifetime: 300, salesStart: 6, salesEnd: 24 }),
  row("de-wind-s", GERMANY, WIND, "successRate", { cluster1: 0.5, cluster2: 0.6, cluster3: 0.75, cluster4: 0.95 }),
  // France — BESS has a duration row only (no success row).
  row("fr-bess-m", FRANCE, BESS, "months", { cluster1: 3 }),
];
