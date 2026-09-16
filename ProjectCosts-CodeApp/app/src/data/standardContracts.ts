/**
 * DEVEX/CAPEX standard-contract data access.
 *
 * Reads for `buildStandardOptions` and `activeWtgCount`; the create write goes through
 * `capexWrites.ts` — a standard contract is, in the end, just a cost line with computed money.
 */
import { Vsb_devexcapexstandardassumptionsesService } from "@/generated/services/Vsb_devexcapexstandardassumptionsesService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { fetchAll } from "./client";
import { ACTIVE, and, lookupEq } from "./odata";
import type { DevexCapexAssumption } from "@/features/capex-costs/standardContracts";

/** Option sets arrive as a number or its string form depending on the column. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Every standard assumption for the sub-accounts of one category.
 *
 * Not filtered by country/technology here — `buildStandardOptions` does that narrowing, and
 * doing it client-side means one query per category tab rather than one per sub-account.
 */
export async function loadStandardAssumptions(
  subaccountIds: readonly string[],
): Promise<DevexCapexAssumption[]> {
  if (subaccountIds.length === 0) return [];
  const rows = await fetchAll(
    "list CAPEX standard assumptions",
    (o) => Vsb_devexcapexstandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_devexcapexstandardassumptionsid", "vsb_description", "_vsb_subaccount_value",
        "_vsb_country_value", "vsb_technology", "vsb_costamount", "vsb_unit", "vsb_costpaidby",
        "vsb_distributionfrequency", "vsb_applyvat", "vsb_depreciation",
        "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
      ],
      filter: ACTIVE,
    },
  );
  const wanted = new Set(subaccountIds);
  return rows
    .filter((r) => r._vsb_subaccount_value && wanted.has(r._vsb_subaccount_value))
    .map((r) => ({
      id: r.vsb_devexcapexstandardassumptionsid,
      description: r.vsb_description ?? "",
      subaccountId: r._vsb_subaccount_value as string,
      countryId: r._vsb_country_value ?? "",
      technology: numberOf(r.vsb_technology) ?? -1,
      costAmount: r.vsb_costamount ?? 0,
      unit: numberOf(r.vsb_unit) ?? 0,
      costPaidBy: numberOf(r.vsb_costpaidby) ?? 0,
      distributionFrequency: r.vsb_distributionfrequency ?? 1,
      applyVat: r.vsb_applyvat === true,
      depreciation: r.vsb_depreciation === true,
      clusters: [
        r.vsb_cluster1 === true, r.vsb_cluster2 === true, r.vsb_cluster3 === true,
        r.vsb_cluster4 === true, r.vsb_cluster5 === true,
      ],
    }));
}

/** The project's active WTG/PV-module count, for the EUR/WTG unit multiplier. */
export async function loadActiveWtgCount(projectId: string): Promise<number> {
  const rows = await fetchAll(
    "list generator types in project",
    (o) => Vsb_generatortypeinprojectsService.getAll(o),
    {
      select: ["vsb_generatortypeinprojectid", "vsb_numberofgenerators", "statecode"],
      filter: and(lookupEq("vsb_project", projectId), ACTIVE),
    },
  );
  return rows.reduce((sum, r) => sum + (r.vsb_numberofgenerators ?? 0), 0);
}
