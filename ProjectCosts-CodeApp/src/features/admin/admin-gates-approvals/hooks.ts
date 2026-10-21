/**
 * Admin Project Gates Approvals Screen — the data layer (connected 19 Oct 2026, D22).
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app). Every table was already
 * registered (`power.config.json`); none was added. The reads live in `data/adminGatesApprovals.ts`:
 *
 *   useGateCountries()             `vsb_countries` — the rail (`col_cmpCountryPickerItems`).
 *   useGateStates()                `vsb_projectstates` — every state (gate list + dropdown labels).
 *   useGateApprovals(scope)        `vsb_projectdefaultapprovalses` for the country × technology.
 *   useScopeCountryTechId(scope)   `vsb_checklistcountryandtechnologies` — the scope row.
 *   useChecklistItems(id)          `vsb_projectdefaultchecklistses` of that scope row.
 *   useChecklistApprovals(ids)     `vsb_checklistdefaultapprovalses` of those templates.
 *   usePeopleSearch(term)          `aadusers` (`'Microsoft Entra IDs'`), enabled accounts only.
 *   usePortfolioManagerPersonas()  `aadusers` by key, for the two Portfolio Manager lookups.
 *
 * WRITES — each `WritePlan` from `rules.ts` runs through `usePlanWrite` (one write each: save,
 * the two status chips, delete, Reset Gate). FLOWS AND PLUGINS: none fires on
 * `vsb_projectdefaultapprovals` or `vsb_checklistdefaultapprovals` (04-flow-inventory.md,
 * verified 19 Oct 2026). The approval request flows only read these rows later from the PM
 * Checklist screen; this screen starts no flow and sends no mail.
 *
 * After a write: this screen's approvals and Portfolio Manager lookups are refreshed, and so are
 * Admin Default Checklists' task locks (`checklistTaskLocksAll`), which read the check-list
 * approvals' mode.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ES, ES_PROCESS } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  findScopeCountryTechId, getEntraPeople, listChecklistApprovals, listGateApprovals,
  listGateCountries, listGateStates, listScopeChecklistItems, searchEntraPeople,
} from "@/data/adminGatesApprovals";
import {
  saveErrorText, shouldSearchPeople, technologyValue,
  type ChecklistApproval, type ChecklistItem, type CountryRef, type GateApproval, type GateState,
  type Persona, type Scope,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.countries,
  ES.projectStates,
  ES_PROCESS.projectDefaultApprovals,
  ES.checklistCountryAndTechnologies,
  ES_PROCESS.projectDefaultChecklists,
  ES_PROCESS.checkListDefaultApprovals,
  ES.aadUsers,
];

/** Reference data — edited rarely. */
const STALE_MS = 5 * 60 * 1000;
const NO_COUNTRIES: CountryRef[] = [];
const NO_STATES: GateState[] = [];
const NO_APPROVALS: GateApproval[] = [];
const NO_ITEMS: ChecklistItem[] = [];
const NO_CHECKLIST_APPROVALS: ChecklistApproval[] = [];
const NO_PEOPLE: Persona[] = [];
const NOBODY = (): Persona | null => null;

function asScreenData<T>(
  q: { data: T | undefined; isLoading: boolean; error: unknown }, empty: T,
): ScreenData<T> {
  return { data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

const scopeArgs = (scope: Scope): { countryId: string; tech: number } | null => {
  const tech = technologyValue(scope.technology);
  return scope.country && tech !== null ? { countryId: scope.country.id, tech } : null;
};

export function useGateCountries(): ScreenData<CountryRef[]> {
  return asScreenData(
    useQuery({ queryKey: qk.gateCountries, queryFn: listGateCountries, staleTime: 30 * 60 * 1000 }),
    NO_COUNTRIES,
  );
}

export function useGateStates(): ScreenData<GateState[]> {
  return asScreenData(
    useQuery({ queryKey: qk.gateStates, queryFn: listGateStates, staleTime: STALE_MS }),
    NO_STATES,
  );
}

/** The gate gallery's rows for the scope. */
export function useGateApprovals(scope: Scope): ScreenData<GateApproval[]> {
  const a = scopeArgs(scope);
  return asScreenData(useQuery({
    queryKey: qk.gateApprovals(a?.countryId ?? "", a?.tech ?? -1),
    queryFn: () => listGateApprovals(a!.countryId, a!.tech),
    enabled: a !== null,
  }), NO_APPROVALS);
}

/** The scope's `Checklist Country And Technologies` row id. */
export function useScopeCountryTechId(scope: Scope): ScreenData<string | null> {
  const a = scopeArgs(scope);
  const q = useQuery({
    queryKey: qk.gateScopeCountryTech(a?.countryId ?? "", a?.tech ?? -1),
    queryFn: () => findScopeCountryTechId(a!.countryId, a!.tech),
    enabled: a !== null,
    staleTime: STALE_MS,
  });
  return asScreenData<string | null>(q, null);
}

/** The scope's check-list templates. */
export function useChecklistItems(countryTechId: string | null): ScreenData<ChecklistItem[]> {
  return asScreenData(useQuery({
    queryKey: qk.gateChecklistItems(countryTechId ?? ""),
    queryFn: () => listScopeChecklistItems(countryTechId!),
    enabled: Boolean(countryTechId),
  }), NO_ITEMS);
}

/** The check-list approvals of those templates. */
export function useChecklistApprovals(itemIds: readonly string[]): ScreenData<ChecklistApproval[]> {
  return asScreenData(useQuery({
    queryKey: qk.gateChecklistApprovals(itemIds),
    queryFn: () => listChecklistApprovals(itemIds),
    enabled: itemIds.length > 0,
  }), NO_CHECKLIST_APPROVALS);
}

/** The pickers' `OnSearch` — enabled Entra accounts matching the term; nothing for a blank term. */
export function usePeopleSearch(term: string): ScreenData<Persona[]> {
  const t = term.trim();
  return asScreenData(useQuery({
    queryKey: qk.entraPeopleSearch(t),
    queryFn: () => searchEntraPeople(t),
    enabled: shouldSearchPeople(t),
    staleTime: 60 * 1000,
  }), NO_PEOPLE);
}

/** Resolves Portfolio Manager lookup ids (`aaduserid`) to directory entries. */
export function usePortfolioManagerPersonas(
  ids: readonly (string | null)[],
): ScreenData<(id: string | null) => Persona | null> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))].sort();
  const q = useQuery({
    queryKey: qk.entraPeople(unique),
    queryFn: () => getEntraPeople(unique),
    enabled: unique.length > 0,
    staleTime: STALE_MS,
  });
  const map = q.data;
  const resolve = useMemo(
    () => (map ? (id: string | null): Persona | null => (id ? map.get(id) ?? null : null) : NOBODY),
    [map],
  );
  return { data: resolve, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** Runs this screen's write plans and refreshes what they change. */
export function useGateWrites() {
  return usePlanWrite({
    invalidate: [qk.gateApprovalsAll, qk.gateChecklistApprovalsAll, qk.entraPeopleAll, qk.checklistTaskLocksAll],
    action: "change the default approvals",
    errorText: saveErrorText,
  });
}
