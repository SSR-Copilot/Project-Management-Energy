/**
 * Country inflation profiles (`vsb_countryinflationprofile`) for one country: the one read Production, Land Lease and OPEX share.
 *
 * Moved here from `data/landLease.ts` (D162, FE-P2-06) so the Production screen does not download the Land Lease data module and
 * its rules (44 kB) for this one 15-line read. `data/landLease.ts` re-exports both names, so its callers are unchanged.
 */
import { Vsb_countryinflationprofilesService } from "@/generated/services/Vsb_countryinflationprofilesService";
import { fetchAll } from "./client";
import { ACTIVE, and, lookupEq } from "./odata";

/* ════════════════════════════════════════════════════ country inflation rows ══ */

export interface CountryInflationRow {
  year: number;
  /** `vsb_area` — blank on every country but Italy. */
  area: string;
  inflation: number;
}

/**
 * `Country Inflation Profiles` for the project's country.
 *
 * One query serves four consumers that would otherwise each want their own: the Land Lease
 * panel's read-only percentage (`resolveInflationProfileValue`), the Area dropdown's `Items`,
 * the standard import's `Inflation Profile` (`resolveStandardInflationProfile`) — and, through
 * `countryInflationPercent` in `costBook.ts`, the OPEX panel and "Add Standard Contract".
 *
 * MEASURED, VSBCloud_Dev 16 Sep: Italy carries SEVEN rows per year, one per price zone (North,
 * Centre - North, Centre - South, South, Sicily, Sardinia, Calabria); every other country
 * carries exactly one row per year with `vsb_area` blank. That is why `countryInflationPercent`
 * only applies the Area term for Italy.
 */
export async function loadCountryInflation(countryId: string): Promise<CountryInflationRow[]> {
  const rows = await fetchAll(
    "list country inflation profiles",
    (o) => Vsb_countryinflationprofilesService.getAll(o),
    {
      select: ["vsb_countryinflationprofileid", "vsb_year", "vsb_area", "vsb_inflation"],
      filter: and(lookupEq("vsb_country", countryId), ACTIVE),
    },
  );
  return rows.map((r) => ({
    year: r.vsb_year ?? 0,
    area: r.vsb_area ?? "",
    inflation: r.vsb_inflation ?? 0,
  }));
}
