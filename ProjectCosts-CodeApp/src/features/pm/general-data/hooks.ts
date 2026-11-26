/**
 * Project General Data Screen — the data layer (connected 19 Oct 2026, D25).
 *
 * Canvas screen: `Project General Data Screen` (PM app). With no `projectId` it is the New
 * Project screen; its Save CREATES the project (PO decision 20 Oct 2026, D25).
 *
 * The reads live in `data/generalData.ts`; the people search reuses `data/adminGatesApprovals.ts`
 * and the milestone durations reuse `data/costBook.ts`. Every write is a `WritePlan` from
 * `rules.ts`, run in order by `usePlanWrite`.
 *
 * SERVER AUTOMATION the writes fire (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified
 * 19 Oct 2026) — the client never does their work:
 *  - `UpdateTeamsandSPOSite` — `vsb_project` Modified, filtering column `vsb_clusterstate`. Every
 *    save writes `vsb_clusterstate` (Patch #1's `Coalesce(existing, Draft)`, as the canvas does);
 *    the flow reads the audit log and acts only when the value really changed AND the country is
 *    Croatia (it then posts to the Teams/SharePoint site service).
 *  - `SynchroniseProjectState` — `vsb_projectstatetracking` Added / Modified on
 *    `vsb_approvalclusterstate`: fired by the start-cluster tracking rebuild and by the Draft
 *    tracking create; it updates `vsb_projects`.
 *  - `CreatingTeamsandSPOSite-ProjectCreation` — `vsb_project` Added, Organization scope: fired
 *    server-side by the New Project create (Patch #1). It creates the project's Teams / SharePoint
 *    site and updates the project; the client neither calls it nor does any of its work.
 *  - Plugin steps on `vsb_project` filter on `vsb_initialp50trigger`, `vsb_capexstandard…`,
 *    `vsb_construction`, `vsb_enddate`, `vsb_operationsstartdatecod` — none of which this screen
 *    writes (the cluster panel writes Project Start … 4-Legally binding permits only).
 *  - `PerformRequestofGateApprovalCancellation` IS called since D81 (4 Nov 2026; `data/flows.ts`), between
 *    Patch #2 and the forced return to Draft, when the start cluster changes while the Draft gate approval
 *    is running (`cancelDraftGateApprovalIfRunning`). Until then that change was refused (D25).
 *  - `WhenProjectDatagetsupdated-SendE-MailCardtoPortfolioManagers` is referenced in the inventory
 *    but missing from the solution export; whether it fires on a project update is unknown (D25).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ES, ES_ADMIN } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { searchEntraPeople, getEntraPeople } from "@/data/adminGatesApprovals";
import { listChecklistGates } from "@/data/checklist";
import { checklistPerf } from "@/data/checklistPerfFlags";
import { lookupPeopleAll, onePersonCache } from "@/data/personCache";
import { loadMilestoneDurations } from "@/data/costBook";
import { cancelGateApproval } from "@/data/flows";
import { trace } from "@/platform/telemetry";
import {
  loadGeneralDataProject, lookupGermanTradeTaxRate,
  searchFrenchMunicipalities, searchGermanMunicipalities,
  type AreaOption, type MunicipalityRow, type UtilizationOption,
} from "@/data/generalData";
import type { Persona } from "@/data/adminGatesApprovals";
import {
  draftGateCancellationPayload, draftTrackingOf, municipalitySearchIsSuppressed, projectSaveErrorText,
  shouldCancelGateApproval, startClusterChanged, startClusterNo,
  type CountryRef, type GeneralDataForm, type MunicipalityMode, type ProjectRow, type ProjectSnapshot,
  type ProjectStateRef, type ShareholdingEntity, type TrackingRow,
} from "./rules";
import {
  generalDataAreasQueryOptions, generalDataCountriesQueryOptions, generalDataProjectQueryOptions,
  generalDataProjectStatesQueryOptions, generalDataUtilizationsQueryOptions, shareholdersQueryOptions,
  stateTrackingsQueryOptions, REFERENCE_STALE,
} from "./queries";
import { generalDataReloadKeys } from "./reload";
import { gdCancelReusesCache } from "./gdPerfFlags";

export type { AreaOption, MunicipalityRow, UtilizationOption } from "@/data/generalData";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.countries,
  ES.countryAreas,
  ES.projectStates,
  ES.customChoiceValues,
  ES.shareholderEntityInProjects,
  ES.projectStateTrackings,
  ES.aadUsers,
  ES.assumptionsLocalTaxGermanies,
  ES.assumptionsLocalTaxFrances,
  ES_ADMIN.milestonesStandardAssumptions,
];

const out = <T>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];
const NO_PEOPLE = new Map<string, Persona>();

/** The project row (`gblRecordSelectedProject`); null for New Project. */
export function useGeneralDataProject(projectId: string | undefined): ScreenData<ProjectRow | null> {
  // Key and function: `./queries.ts`, shared with the boot prefetch (D119).
  const q = useQuery({
    ...generalDataProjectQueryOptions(projectId ?? ""),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

export function useCountries(): ScreenData<CountryRef[]> {
  return out(useQuery(generalDataCountriesQueryOptions()), NONE as CountryRef[]);
}

export function useProjectStates(): ScreenData<ProjectStateRef[]> {
  return out(useQuery(generalDataProjectStatesQueryOptions()), NONE as ProjectStateRef[]);
}

/** One country's areas — the Area dropdown and the "has areas" half of the Area rule. */
export function useCountryAreas(countryId: string | null | undefined): ScreenData<AreaOption[]> {
  const q = useQuery({
    ...generalDataAreasQueryOptions(countryId ?? ""),
    enabled: Boolean(countryId),
  });
  return out(q, NONE as AreaOption[]);
}

export function useTerrainUtilizations(countryId: string | null | undefined): ScreenData<UtilizationOption[]> {
  const q = useQuery(generalDataUtilizationsQueryOptions(countryId ?? ""));
  return out(q, NONE as UtilizationOption[]);
}

export function useShareholders(projectId: string | undefined): ScreenData<ShareholdingEntity[]> {
  const q = useQuery({
    ...shareholdersQueryOptions(projectId ?? ""),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as ShareholdingEntity[]);
}

export function useStateTrackings(projectId: string | undefined): ScreenData<TrackingRow[]> {
  const q = useQuery({
    ...stateTrackingsQueryOptions(projectId ?? ""),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as TrackingRow[]);
}

/** How long the Manager / Deputy search waits for a pause in typing (GD-024). */
export const ENTRA_SEARCH_DEBOUNCE_MS = 250;

/**
 * `pcf_…_PeoplePicker.OnSearch` — `Search(Filter('Microsoft Entra IDs', 'Account Enabled' = Yes),
 * Trim(text), …)`, the shared query. Blank text searches nothing (`IsBlankOrError(Trim(text))`).
 */
export function useEntraSearch(search: string): ScreenData<Persona[]> {
  // GD-024: wait for a pause in typing instead of one query per keystroke (the canvas PCF searches per call).
  // A blank box is not delayed: it searches nothing at once.
  const typed = search.trim();
  const settled = useDebouncedValue(typed, ENTRA_SEARCH_DEBOUNCE_MS);
  const term = typed === "" ? "" : settled;
  const q = useQuery({
    queryKey: qk.entraPeopleSearch(term),
    queryFn: () => searchEntraPeople(term),
    enabled: term.length > 0,
    staleTime: 60 * 1000,
  });
  return out(q, NONE as Persona[]);
}

/**
 * The pickers' pre-selection. DIVERGENCE (D25): the canvas reads `Office365Users.UserProfile(id)`;
 * this app has no Office 365 Users connector, so the persona comes from `aadusers` by id.
 */
export function useEntraPeople(ids: readonly (string | null)[]): ScreenData<Map<string, Persona>> {
  const wanted = ids.filter((i): i is string => Boolean(i));
  const q = useQuery({
    queryKey: qk.entraPeople(wanted),
    // PB-16 (`ONE_PERSON_CACHE`): each person through the per-person Entra cache Team and the Check List share (same answers, same
    // one-request-per-person lookups, same failure: the whole read rejects). OFF: `getEntraPeople`, uncached, as before.
    queryFn: () => (onePersonCache() ? lookupPeopleAll(wanted, (id) => getEntraPeople([id])) : getEntraPeople(wanted)),
    enabled: wanted.length > 0,
    staleTime: REFERENCE_STALE,
  });
  return out(q, NO_PEOPLE);
}

/**
 * The Germany / France municipality comboboxes' `Items`: Germany lists the Area's municipalities
 * from the first letter (all of them while nothing is typed); France waits for three letters.
 */
export function useMunicipalitySearch(
  mode: MunicipalityMode,
  search: string,
  areaName?: string | null,
): ScreenData<MunicipalityRow[]> {
  const germany = mode === "germany" && Boolean(areaName);
  const france = mode === "france" && !municipalitySearchIsSuppressed(search);
  const q = useQuery({
    queryKey: germany ? qk.germanMunicipalities(areaName!, search.trim()) : qk.frenchMunicipalities(search),
    queryFn: () => (germany ? searchGermanMunicipalities(areaName!, search) : searchFrenchMunicipalities(search)),
    enabled: germany || france,
    staleTime: REFERENCE_STALE,
  });
  return out(q, NONE as MunicipalityRow[]);
}

/** The Tax Factor fallback — only read when the project has no tax factor but a municipality. */
export function useGermanTradeTaxRate(municipality: string | null | undefined): ScreenData<string | null> {
  const q = useQuery({
    queryKey: qk.germanTradeTaxRate(municipality ?? ""),
    queryFn: () => lookupGermanTradeTaxRate(municipality!),
    enabled: Boolean(municipality),
    staleTime: REFERENCE_STALE,
  });
  return out(q, null);
}

/** `colMilestonesAssumptions` — the CalendarAdd durations for the project's country + technology. */
export function useMilestoneDurations(countryId: string | null | undefined, technology: number | null | undefined, enabled: boolean) {
  const q = useQuery({
    queryKey: qk.milestoneDurations(countryId ?? "", technology ?? -1),
    queryFn: () => loadMilestoneDurations(countryId ?? undefined, technology ?? undefined),
    enabled: enabled && Boolean(countryId) && technology !== null && technology !== undefined,
    staleTime: REFERENCE_STALE,
  });
  return q.data;
}

/**
 * Runs the screen's write plans (the save, the cluster-panel save, a shareholder delete) and
 * refreshes the project, its child rows and the session's project header (`gblProjectHeaderData`,
 * `CanEditSelectedProject` — W10).
 */
export function useGeneralDataWrites(projectId: string | undefined) {
  const qc = useQueryClient();
  const keys = generalDataReloadKeys(projectId);
  const writes = usePlanWrite({
    invalidate: keys,
    action: "change this project's general data",
    errorText: projectSaveErrorText,
  });
  /** OPT-13: the real reload of the screen's keys, for a first job that only marked them stale and then failed. */
  const reloadAll = () => Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
  // PB-15: the query client travels with the call so the step can read the Check List's cached gates.
  const cancelWithCache: typeof cancelDraftGateApprovalIfRunning = (args) => cancelDraftGateApprovalIfRunning({ queryClient: qc, ...args });
  return { ...writes, cancelDraftGateApprovalIfRunning: cancelWithCache, reloadAll };
}

/**
 * Step 1 of the hidden `btn_General_CancelActiveDraftGateApproval…` (Y:288-323), D81: when the start cluster changes
 * while the Draft tracking's approval is running (`shouldCancelGateApproval`),
 * `IfError(PerformRequestofGateApprovalCancellation.Run(gblProjectManagmentAppID, JSON(…)), false)`. It runs between
 * Patch #2 and the forced return to Draft (`PlanJob.then`). `IfError(…, false)`: the canvas swallows a failed
 * cancellation and saves anyway; here the failure is logged with its cause (rule 23) and the save goes on.
 */
export async function cancelDraftGateApprovalIfRunning(args: {
  project: ProjectSnapshot;
  form: GeneralDataForm;
  projectStates: ProjectStateRef[];
  trackings: TrackingRow[];
  /** `gblProjectManagmentAppID` — the environment variable `vsb_ProjectManagementAppID`. */
  appId: string;
  /** PB-15: where the Check List keeps the gates; without it (or with `GD_CANCEL_REUSES_CACHE` off) they are read. */
  queryClient?: QueryClient;
}): Promise<void> {
  if (!startClusterChanged(args.project, args.form)) return;
  const draftTracking = draftTrackingOf(args.trackings, args.projectStates);
  if (!draftTracking || !shouldCancelGateApproval(draftTracking)) return;
  try {
    const scope = { countryId: args.project.countryId, technology: args.project.technology ?? null };
    // PB-15 (`GD_CANCEL_REUSES_CACHE`): the Check List's own gate query (same key and function, so its staleTime applies and a fresh
    // entry is returned without a request); the step reads only when none is fresh. The key is the Check List's only with `scopedGates`.
    const gates = args.queryClient && gdCancelReusesCache() && checklistPerf().scopedGates
      ? await args.queryClient.fetchQuery({
        queryKey: qk.checklistGates(scope.countryId ?? "", scope.technology ?? ""),
        queryFn: () => listChecklistGates(scope),
      })
      : await listChecklistGates(scope);
    const payload = draftGateCancellationPayload({
      project: args.project, projectStates: args.projectStates,
      oldStartClusterNo: startClusterNo(args.project.startCluster), draftTracking, gates,
    });
    if (payload) await cancelGateApproval({ appId: args.appId, project: payload });
  } catch (error) {
    trace("warning", "General Data: the Draft gate-approval cancellation flow failed; the save continues, as the canvas (IfError … false)", error);
  }
}

/**
 * Re-reads a project row on demand — the canvas `Set(gblRecordSelectedProject, LookUp(Projects, …))`
 * after Patch #1. A new project's autonumber 'Project ID' only exists after the create.
 */
export function useProjectReader() {
  const qc = useQueryClient();
  return useCallback(
    (projectId: string) => qc.fetchQuery({
      queryKey: qk.generalDataProject(projectId),
      queryFn: () => loadGeneralDataProject(projectId),
      staleTime: 0,
    }),
    [qc],
  );
}
