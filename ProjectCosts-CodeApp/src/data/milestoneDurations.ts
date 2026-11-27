import { Vsb_milestonesstandardassumptionsesService } from "@/generated/services/Vsb_milestonesstandardassumptionsesService";
import type { MilestoneDurations } from "@/features/cost/capex-costs/clusters";
import { fetchAll } from "./client";
import { ACTIVE, and, eq, lookupEq } from "./odata";

/**
 * `Name` on the one `Milestones Standard Assumptions` row the cluster chain uses.
 *
 * The table holds two rows per Country+Technology — `"average duration [months]"` and
 * `"success rate [-]"` — with the same six numeric columns meaning entirely different things
 * (17 months versus 0.2 probability). The canvas' `LookUp` names it explicitly
 * (`CapexScreenCode.txt:18139-18142`) and so must this: reading the wrong row would back-date
 * clusters by a fraction of a month and look almost right.
 */
const AVERAGE_DURATION_NAME = "average duration [months]";

/**
 * The cluster durations for a project's country and technology, for `synthesiseClusterDates`.
 *
 *     LookUp('Milestones Standard Assumptions',
 *            Name = "average duration [months]"
 *            && Country.Country = gblSelectedProject.Country.Country
 *            && Technology = gblSelectedProject.Technology)
 *
 * — `CapexScreenCode.txt:18138-18143`. The canvas compares `Country.Country`, i.e. the country
 * row's primary key, which is `_vsb_country_value` here; `Technology` is the same global option
 * set on both tables (952850000 Wind, 952850001 PV, 952850002 Hybrid, 952850003 BESS …), so the
 * numbers compare directly with no mapping.
 *
 * `undefined` when nothing matches, which `synthesiseClusterDates` treats exactly as the canvas'
 * `Coalesce(varMilestoneDurations.'Cluster N', 0)` does — see its doc comment. That is not rare:
 * measured 16 Sep, the table has 19 "average duration [months]" rows covering DE/IT/PL/ES/FR/FI/
 * HR/GR/RO against Wind/PV/BESS only, so a Hydro or Substation project matches nothing at all.
 *
 * `countryId` and `technology` come from `loadProjectExtras` (`./project.ts`); neither is on
 * `ProjectContext`. This lives here rather than in `project.ts` because the only thing that
 * consumes it is the CAPEX cluster timeline, next to `loadProjectStates` above.
 */
export async function loadMilestoneDurations(
  countryId: string | undefined,
  technology: number | undefined,
): Promise<MilestoneDurations | undefined> {
  const row = await loadMilestoneAssumptionValues(countryId, technology);
  if (!row) return undefined;
  const months = (value: number | null) => value ?? 0;
  return {
    cluster1: months(row.cluster1),
    cluster2: months(row.cluster2),
    cluster3: months(row.cluster3),
    cluster4: months(row.cluster4),
    cluster5: months(row.cluster5),
    finalInvestmentDecision: months(row.finalInvestmentDecision),
  };
}

/**
 * Every duration column of the same `"average duration [months]"` row, a blank kept as `null`.
 * `loadMilestoneDurations` above coalesces them to 0 for the CAPEX timeline; PM Milestones (D26)
 * needs the blanks, because its CalendarAdd buttons treat a blank duration differently from 0
 * (`Coalesce('Operational Lifetime', 30 * 12)` for the End Date). One query, one place.
 */
export interface MilestoneAssumptionValues {
  cluster1: number | null;
  cluster2: number | null;
  cluster3: number | null;
  cluster4: number | null;
  cluster5: number | null;
  /** `'Final Investment Decision'` — the FID → Cluster 5 duration. */
  finalInvestmentDecision: number | null;
  /** `'Operational Lifetime'`, in months. */
  operationalLifetime: number | null;
  /** `'Sales Start'` — Cluster 4 → Sales Start Date. */
  salesStart: number | null;
  /** `'Sales End'` (`vsb_salesduration`) — FID → Sales Completion Date. */
  salesEnd: number | null;
}

export async function loadMilestoneAssumptionValues(
  countryId: string | undefined,
  technology: number | undefined,
): Promise<MilestoneAssumptionValues | undefined> {
  if (!countryId || technology === undefined) return undefined;
  const rows = await fetchAll(
    "load milestone standard assumptions",
    (o) => Vsb_milestonesstandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_milestonesstandardassumptionsid",
        "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
        "vsb_finalinvestmentdecision", "vsb_operationallifetime", "vsb_salesstart", "vsb_salesduration",
      ],
      filter: and(
        eq("vsb_name", AVERAGE_DURATION_NAME),
        lookupEq("vsb_country", countryId),
        eq("vsb_technology", technology),
        ACTIVE,
      ),
      top: 1,
    },
  );
  const row = rows[0];
  if (!row) return undefined;
  const value = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    cluster1: value(row.vsb_cluster1),
    cluster2: value(row.vsb_cluster2),
    cluster3: value(row.vsb_cluster3),
    cluster4: value(row.vsb_cluster4),
    cluster5: value(row.vsb_cluster5),
    finalInvestmentDecision: value(row.vsb_finalinvestmentdecision),
    operationalLifetime: value(row.vsb_operationallifetime),
    salesStart: value(row.vsb_salesstart),
    salesEnd: value(row.vsb_salesduration),
  };
}

