/**
 * The `Inflation Country Area` dropdown's options, derived from the country's inflation rows (B2, OPT-06).
 *
 * `Distinct(Filter('Country Inflation Profiles', Country.Country = gblSelectedProject.Country.Country).Area, Area)`
 * (`OpexCostScreenCode.txt:7622`), sorted so the list is stable between renders (the canvas' `Distinct` has no order of its own).
 *
 * The OPEX screen used to read the table a second time for this (`useCountryInflationAreas`, same country and ACTIVE filter,
 * `vsb_area` only) although `useCountryInflation` already holds every row of it; it now derives the list from those rows, as the
 * Land Lease screen does (`LandLeaseScreen.tsx`, `areaOptions`). Pure, so it is tested without React.
 */
export function inflationAreasOf(rows: readonly { area: string }[] | undefined): string[] {
  return [...new Set((rows ?? []).map((r) => r.area).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
