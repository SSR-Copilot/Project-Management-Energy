/**
 * Admin Milestones — the Dataverse reads behind `features/admin/admin-milestones`
 * (connected 19 Oct 2026, D21). Both tables were already registered.
 *
 * No flow and no plugin step fires on `vsb_milestonesstandardassumptions`
 * (04-flow-inventory.md, verified 19 Oct 2026).
 */
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_milestonesstandardassumptionsesService } from "@/generated/services/Vsb_milestonesstandardassumptionsesService";
import {
  MILESTONE_COL, countryOrder, type AssumptionRow, type CountryRow,
} from "@/features/admin/admin-milestones/rules";
import { fetchAll } from "./client";
import { lookupEq } from "./odata";

/**
 * `AddColumns(Countries, Title, Name, Order, Value(Key), …)` — the whole `Countries` table. No
 * server `$orderby`: the order is `Value(Key)` (`vsb_title`, text), sorted in `sortCountries`.
 */
export async function listMilestoneCountries(): Promise<CountryRow[]> {
  const rows = await fetchAll(
    "list countries for milestone assumptions",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name", "vsb_title"] },
  );
  return rows.map((r) => {
    const order = countryOrder(r.vsb_title);
    return { id: r.vsb_countryid, name: r.vsb_name ?? "", order, key: order };
  });
}

const VALUE_COLUMNS = [
  MILESTONE_COL.cluster1, MILESTONE_COL.cluster2, MILESTONE_COL.cluster3, MILESTONE_COL.cluster4,
  MILESTONE_COL.cluster5, MILESTONE_COL.finalInvestmentDecision, MILESTONE_COL.operationalLifetime,
  MILESTONE_COL.salesStart, MILESTONE_COL.salesEnd,
] as const;

/** `Filter('Milestones Standard Assumptions', Country.Country = <id>)` — two rows per technology. */
export async function listCountryAssumptions(countryId: string): Promise<AssumptionRow[]> {
  const rows = await fetchAll(
    "list milestone standard assumptions of a country",
    (o) => Vsb_milestonesstandardassumptionsesService.getAll(o),
    {
      select: [MILESTONE_COL.id, MILESTONE_COL.name, MILESTONE_COL.technology, MILESTONE_COL.country, ...VALUE_COLUMNS],
      filter: lookupEq("vsb_country", countryId),
    },
  );
  return rows.map((r) => {
    const raw = r as unknown as Record<string, unknown>;
    const values: Partial<Record<string, number | null>> = {};
    for (const c of VALUE_COLUMNS) values[c] = typeof raw[c] === "number" ? (raw[c] as number) : null;
    return {
      id: r.vsb_milestonesstandardassumptionsid,
      name: r.vsb_name ?? "",
      technology: r.vsb_technology === undefined || r.vsb_technology === null ? null : Number(r.vsb_technology),
      countryId: r._vsb_country_value ?? null,
      values,
    };
  });
}
