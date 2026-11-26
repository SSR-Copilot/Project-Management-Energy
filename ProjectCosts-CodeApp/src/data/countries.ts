/**
 * One `vsb_countries` read for every Application Settings screen.
 *
 * Before: four reads under four keys — Project Gates (id, name, ALL rows), Costs (id, name,
 * active), Contracts (id, name, ISO currency, active) and Milestones (id, name, `vsb_title`,
 * active). This reads the union of those columns plus `statecode` ONCE, caches it under
 * `qk.adminCountries`, and lets each screen narrow it with `select`:
 *
 *   - `useActiveCountries()`      Costs, Contracts, Milestones (`statecode eq 0`, as today)
 * `useCountries({ includeInactive: true })`  Project Gates (no state filter, as today)
 *
 * So the screens keep their current filtering while sharing one request and one cache entry.
 */
import { useQuery } from "@tanstack/react-query";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import type { CountryRow } from "@/domain/countryPicker";
import { bootDvopt } from "./bootDvoptFlags";
import { fetchAll } from "./client";
import { qk } from "./keys";

/** The union of the columns the four screens selected, plus `statecode`. */
export const COUNTRY_SELECT_SETTINGS = ["vsb_countryid", "vsb_name", "vsb_isocurrencycode", "vsb_title", "statecode"];

/**
 * PB-06 (`COUNTRIES_ONE_KEY`): the widest select any consumer needs, so the Project Overview's country list and the signed-in
 * user's country-to-business-unit map are views of this one read: the settings columns plus the two business-unit columns
 * (`CountryRef.businessUnitId` of General Data, `currentUser`'s map). OFF: the narrow select above, as before.
 */
export const COUNTRY_SELECT = [...COUNTRY_SELECT_SETTINGS, "_vsb_businessunit_value", "_owningbusinessunit_value"];

/** Country reference data changes rarely; matches the longest of the four old stale times. */
export const COUNTRIES_STALE_MS = 30 * 60 * 1000;

export interface CountryRecord extends CountryRow {
  isoCurrencyCode: string | undefined;
  /** `vsb_title` — Milestones' numeric "Key" (sorted by that screen's `sortCountries`). */
  title: string | undefined;
  /** `statecode === 0`. */
  active: boolean;
  /** `_vsb_businessunit_value` — the country's business unit (the badge's country map, General Data); only with `COUNTRIES_ONE_KEY`. */
  businessUnitId?: string;
  /** `_owningbusinessunit_value`; only with `COUNTRIES_ONE_KEY`. */
  owningBusinessUnitId?: string;
}

interface RawCountry {
  vsb_countryid: string;
  vsb_name?: string | null;
  vsb_isocurrencycode?: string | null;
  vsb_title?: string | null;
  statecode?: number | string | null;
  _vsb_businessunit_value?: string | null;
  _owningbusinessunit_value?: string | null;
}

export function toCountryRecord(r: RawCountry): CountryRecord {
  return {
    id: r.vsb_countryid,
    name: r.vsb_name ?? "",
    isoCurrencyCode: r.vsb_isocurrencycode ?? undefined,
    title: r.vsb_title ?? undefined,
    // A missing statecode is not expected from Dataverse; treat it as active, like the
    // checklist mappers do.
    active: r.statecode === null || r.statecode === undefined ? true : Number(r.statecode) === 0,
    ...(r._vsb_businessunit_value ? { businessUnitId: r._vsb_businessunit_value } : {}),
    ...(r._owningbusinessunit_value ? { owningBusinessUnitId: r._owningbusinessunit_value } : {}),
  };
}

/** Every country, active and inactive, ordered by name (Project Gates' order; others re-sort). */
export async function listCountries(): Promise<CountryRecord[]> {
  const rows = await fetchAll<RawCountry>(
    "list countries",
    (o) => Vsb_countriesService.getAll(o) as never,
    { select: bootDvopt().countriesOneKey ? COUNTRY_SELECT : COUNTRY_SELECT_SETTINGS, orderBy: ["vsb_name asc"] },
  );
  return rows.map(toCountryRecord);
}

export const activeOnly = (rows: readonly CountryRecord[]): CountryRecord[] => rows.filter((r) => r.active);

export const countriesQueryOptions = {
  queryKey: qk.adminCountries,
  queryFn: listCountries,
  staleTime: COUNTRIES_STALE_MS,
} as const;

/**
 * The shared countries query. `includeInactive` defaults to false (`statecode eq 0`, the rule of
 * Costs, Contracts and Milestones); Project Gates passes true to keep its unfiltered read.
 */
export function useCountries(options: { includeInactive?: boolean } = {}) {
  const includeInactive = options.includeInactive === true;
  return useQuery({
    ...countriesQueryOptions,
    select: includeInactive ? undefined : activeOnly,
  });
}

export function useActiveCountries() {
  return useCountries();
}
