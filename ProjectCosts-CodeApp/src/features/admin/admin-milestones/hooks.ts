/**
 * Admin Milestones Screen — the data layer (connected 19 Oct 2026, D21).
 *
 * Canvas screen: `Admin Milestones Screen` (PM app). Both tables are registered; the reads live in
 * `data/adminMilestones.ts`:
 *
 *   useMilestoneCountries()     `vsb_countries` — id, name, `vsb_title` (the canvas `Key`; the
 *                               order is `Value(Key)`, sorted client-side).
 *   useCountryAssumptions(id)   `vsb_milestonesstandardassumptionses` for one country.
 *   useMilestoneWrites()        runs `planSaveMilestones` (updates only) and refreshes the
 *                               assumptions of every country.
 *
 * Apply / Apply All and the Fabric recalculating badge are out of scope (D20), so `Fabric Sync
 * Jobs` is not read and not registered. No flow or plugin fires on these tables.
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { listCountryAssumptions, listMilestoneCountries } from "@/data/adminMilestones";
import { saveErrorText, type AssumptionRow, type CountryRow } from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.countries,
  ES_ADMIN.milestonesStandardAssumptions,
];

const NO_COUNTRIES: CountryRow[] = [];
const NO_ROWS: AssumptionRow[] = [];

/** The accordion axis — the whole `Countries` table. */
export function useMilestoneCountries(): ScreenData<CountryRow[]> {
  const q = useQuery({ queryKey: qk.milestoneCountries, queryFn: listMilestoneCountries, staleTime: 30 * 60 * 1000 });
  return { data: q.data ?? NO_COUNTRIES, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** One country's `Milestones Standard Assumptions` rows (two per technology). */
export function useCountryAssumptions(countryId: string | null): ScreenData<AssumptionRow[]> {
  const q = useQuery({
    queryKey: qk.milestoneAssumptions(countryId ?? ""),
    queryFn: () => listCountryAssumptions(countryId!),
    enabled: Boolean(countryId),
  });
  return { data: q.data ?? NO_ROWS, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** Runs the save plan and refreshes the assumptions. */
export function useMilestoneWrites() {
  return usePlanWrite({
    invalidate: [qk.milestoneAssumptionsAll],
    action: "change the milestone assumptions",
    errorText: saveErrorText,
  });
}
