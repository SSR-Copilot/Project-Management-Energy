/**
 * DEVEX/CAPEX standard contracts — stage 2.3.
 *
 * Ported from the skeleton's `capex-costs/rules.ts`. A standard contract converts one row of
 * `vsb_devexcapexstandardassumptionses` into a real cost line: a unit cost (EUR flat, EUR/MW(p),
 * or EUR/WTG) multiplied out against the project, spread over whichever of its five clusters
 * the project's own timeline actually covers.
 *
 * Decided 15 Sep: built CLIENT-SIDE, no Dataverse Custom API — the canvas' equivalent
 * (`vsb_CreateCapexStandardContract`) does not exist in this environment. That means the
 * contract row and its monthly cost rows are two separate writes with no changeset between
 * them; `docs/06-DEMO-COMPLETION-PLAN.md` §5 records this as an accepted risk.
 */
import type { ClusterDuration } from "./clusters";

/** `vsb_unit` on the assumption — verified live. */
export const COST_UNIT = {
  eur: 952850000, eurPerMw: 952850001, eurPerWtg: 952850002,
  pln: 952850003, plnPerMw: 952850004, plnPerWtg: 952850005,
} as const;

export interface DevexCapexAssumption {
  id: string;
  description: string;
  subaccountId: string;
  countryId: string;
  /** `vsb_technology` — the SAME numeric option set as the project's own. */
  technology: number;
  costAmount: number;
  unit: number;
  costPaidBy: number;
  distributionFrequency: number;
  applyVat: boolean;
  depreciation: boolean;
  /** Cluster 1…5 ticks, index 0 = Cluster 1. */
  clusters: boolean[];
}

/**
 * The money a standard contract books, before distribution.
 *
 * A flat unit (EUR/PLN) passes through unchanged; a per-WTG unit multiplies by the count of
 * ACTIVE generators; a per-MW(p) unit multiplies by the project's total capacity.
 */
export function standardAssumptionAmount(
  unit: number,
  costAmount: number,
  ctx: { totalCapacity: number; activeWtgCount: number },
): number {
  switch (unit) {
    case COST_UNIT.eurPerWtg:
    case COST_UNIT.plnPerWtg:
      return Math.round(ctx.activeWtgCount * costAmount);
    case COST_UNIT.eurPerMw:
    case COST_UNIT.plnPerMw:
      return Math.round(ctx.totalCapacity * costAmount);
    default:
      return costAmount;
  }
}

/** Active generator + PV-module rows, summed by count — `activeWtgCount` in the skeleton. */
export function activeWtgCount(rows: readonly { count: number; active: boolean }[]): number {
  return rows.filter((r) => r.active).reduce((a, r) => a + r.count, 0);
}

/**
 * `locProjectStartClusterNo`, floored at 5 — a project that started construction or later
 * (cluster 5/6) can still apply an assumption ticked for cluster 5, but nothing earlier.
 */
export function applicableStartCluster(startClusterNo: number | undefined): number {
  const n = startClusterNo ?? 0;
  return n >= 5 ? 5 : n;
}

/**
 * Which of the project's clusters this assumption actually applies to: ticked on the
 * assumption, has a real (non-inverted) span, and is at or after the project's own start
 * cluster.
 */
export function eligibleClusters(
  assumption: Pick<DevexCapexAssumption, "clusters">,
  clusters: readonly ClusterDuration[],
  startClusterNo: number | undefined,
): ClusterDuration[] {
  const floor = applicableStartCluster(startClusterNo);
  const idx = (y: number, m: number) => y * 12 + m;
  return clusters.filter((c) => {
    if (c.order > 5) return false; // assumptions only tick clusters 1-5
    if (!assumption.clusters[c.order - 1]) return false;
    if (idx(c.endYear, c.endMonth) < idx(c.startYear, c.startMonth)) return false;
    return floor === 0 || c.order >= floor;
  });
}

/** The refusal message when an otherwise-matching assumption has no eligible cluster left. */
export const standardContractRefusal = (eligible: readonly ClusterDuration[]): string | null =>
  eligible.length === 0
    ? "Standard cost was not created because no applicable cost period was found for the "
      + "project's Start Cluster."
    : null;

/**
 * The options `Add Standard Contract` offers for one category: the project's country and
 * technology, a sub-account in that category, at least one eligible cluster, and not already
 * created for that sub-account.
 */
export function buildStandardOptions(args: {
  assumptions: readonly DevexCapexAssumption[];
  subaccountIdsInCategory: readonly string[];
  project: { countryId: string | undefined; technology: number | undefined; startClusterNo?: number };
  existingContracts: readonly { subaccountId: string; standardAssumptionId?: string }[];
  clusters: readonly ClusterDuration[];
}): { assumption: DevexCapexAssumption; eligible: ClusterDuration[] }[] {
  const inCategory = new Set(args.subaccountIdsInCategory);
  const used = new Set(
    args.existingContracts
      .filter((c) => c.standardAssumptionId)
      .map((c) => `${c.subaccountId}|${c.standardAssumptionId}`),
  );
  return args.assumptions
    .filter((a) => inCategory.has(a.subaccountId))
    .filter((a) => a.countryId === args.project.countryId)
    .filter((a) => a.technology === args.project.technology)
    .filter((a) => !used.has(`${a.subaccountId}|${a.id}`))
    .map((a) => ({ assumption: a, eligible: eligibleClusters(a, args.clusters, args.project.startClusterNo) }))
    .filter((o) => o.eligible.length > 0);
}

/** The submenu only renders above one option — `ItemVisible: CountRows(...) > 1`. */
export const showStandardSubMenu = (optionCount: number): boolean => optionCount > 1;

/**
 * The click-time re-check.
 *
 * The option list the PCF holds can be stale — another tab, another user — so this is checked
 * again at the moment of the click rather than trusted from the menu build.
 */
export function checkStandardContractClick(args: {
  subaccountSelected: boolean;
  alreadyExists: boolean;
}): { ok: boolean; message?: string } {
  if (!args.subaccountSelected) {
    return { ok: false, message: "Please select a valid subaccount before adding a standard contract." };
  }
  if (args.alreadyExists) {
    return {
      ok: false,
      message: "This standard contract is already created for this project and subaccount.",
    };
  }
  return { ok: true };
}
