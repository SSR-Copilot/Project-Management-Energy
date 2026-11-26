/**
 * PB-03 (`BOOT_PREFETCH_SCREEN_READS`): the boot prefetch of a Project Management screen's OWN first reads.
 *
 * `app/bootPrefetch.ts` started only the screen's chunk and the session project for a deep link to Check List, Team, Planning,
 * Grid Operator or Milestones. Every read these screens make with just the project id then waited for the session project and the
 * route gate (one wave on the critical path of every deep link, reload and new tab). General Data and Generators already prefetched
 * theirs; this does the same for the five others, under EXACTLY the keys and functions the screens' hooks use, so the screen finds
 * the answer in the cache. A wrong guess costs one wasted read; nothing is written, and no privilege is decided here.
 *
 *  - Planning and Grid Operator take their options from `features/pm/<screen>/queries.ts`, which their hooks use too.
 *  - Check List, Team and Milestones define their queries inside `hooks.ts`, which another owner edits: their keys and functions
 *    are repeated here, and `pmScreenPrefetch.test.tsx` mounts the REAL hook on a client this module has filled and fails if the
 *    hook asks the server again (UT-BOOT-SCREENS-*). When those hooks export option factories, import them here instead.
 *
 * The screen's modules are loaded on demand (dynamic imports), so the entry bundle does not carry them.
 */
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { PmBootSlug } from "./bootPlan";

type Prefetcher = (qc: QueryClient, projectId: string) => Promise<unknown>;

const REFERENCE_STALE = 30 * 60 * 1000;

async function prefetchChecklist(qc: QueryClient, projectId: string): Promise<void> {
  const [{ qk }, { checklistPerf }, data] = await Promise.all([
    import("@/data/keys"), import("@/data/checklistPerfFlags"), import("@/data/checklist"),
  ]);
  const perf = checklistPerf();
  const projectKey = qk.checklist(projectId, "project");
  const project = qc.prefetchQuery(queryOptions({ queryKey: projectKey, queryFn: () => data.loadChecklistProject(projectId) }));
  const rest = [
    // `useClusterSequence`: the states (the shared 30-minute list, or the screen's own), the trackings and, once the project is known, the gates.
    qc.prefetchQuery(queryOptions({
      queryKey: perf.sharedStates ? qk.generalDataProjectStates : qk.checklist(projectId, "states"),
      queryFn: data.listChecklistProjectStates,
      ...(perf.sharedStates ? { staleTime: REFERENCE_STALE } : {}),
    })),
    qc.prefetchQuery(queryOptions({ queryKey: qk.checklist(projectId, "trackings"), queryFn: () => data.listChecklistTrackings(projectId) })),
    project.then(() => {
      const row = qc.getQueryData<Awaited<ReturnType<typeof data.loadChecklistProject>>>(projectKey);
      if (!row) return undefined;
      return qc.prefetchQuery(queryOptions({
        queryKey: perf.scopedGates
          ? qk.checklistGates(row.countryId ?? "", row.technology ?? "")
          : qk.checklist(projectId, "gates", row.countryId ?? "", row.technology ?? ""),
        queryFn: () => data.listChecklistGates(row),
      }));
    }),
  ];
  await Promise.all([project, ...rest]);
}

async function prefetchTeam(qc: QueryClient, projectId: string): Promise<void> {
  const [{ qk }, data, rules] = await Promise.all([
    import("@/data/keys"), import("@/data/team"), import("@/features/pm/team/rules"),
  ]);
  // The descriptions read the members read waits for (`memberDescriptionsQuery` of `team/hooks.ts`).
  const descriptions = () => queryOptions({
    queryKey: qk.teamMemberDescriptions, queryFn: data.listMemberDescriptions, staleTime: 5 * 60 * 1000,
  });
  await Promise.all([
    qc.prefetchQuery(queryOptions({ queryKey: qk.team(projectId, "project"), queryFn: () => data.loadTeamProject(projectId) })),
    qc.prefetchQuery(queryOptions({
      queryKey: qk.team(projectId, "members"),
      queryFn: async () => rules.sortMembers(await data.listTeamMembers(projectId, qc.fetchQuery(descriptions()))),
    })),
    qc.prefetchQuery(descriptions()),
  ]);
}

async function prefetchMilestones(qc: QueryClient, projectId: string): Promise<void> {
  const [{ qk }, data, general] = await Promise.all([
    import("@/data/keys"), import("@/data/milestones"), import("@/features/pm/general-data/queries"),
  ]);
  await Promise.all([
    // `useMilestoneProject`: the project with its country's business unit, taken from the shared General Data countries list.
    qc.prefetchQuery(queryOptions({
      queryKey: qk.milestoneProject(projectId),
      queryFn: () => {
        const countries = qc.fetchQuery(general.generalDataCountriesQueryOptions());
        countries.catch(() => undefined);
        return data.loadMilestoneProject(projectId, {
          businessUnitOf: async (countryId) => {
            try {
              const country = (await countries).find((c) => c.id === countryId);
              return country ? country.businessUnitId : undefined;
            } catch {
              return undefined;
            }
          },
        });
      },
    })),
    // `useMilestoneLabels` (the shared project-states list), the COD guard's contract count and the recalculation icon.
    qc.prefetchQuery(general.generalDataProjectStatesQueryOptions()),
    qc.prefetchQuery(queryOptions({
      queryKey: qk.individualVolumeContracts(projectId), queryFn: () => data.countIndividualVolumeContracts(projectId),
    })),
    qc.prefetchQuery(queryOptions({
      queryKey: qk.milestoneRecalculationRunning(projectId), queryFn: () => data.isMilestoneRecalculationRunning(projectId),
    })),
  ]);
}

async function prefetchPlanningScreen(qc: QueryClient, projectId: string): Promise<void> {
  const q = await import("@/features/pm/planning/queries");
  await q.prefetchPlanning(qc, projectId);
}

async function prefetchGridOperator(qc: QueryClient, projectId: string): Promise<void> {
  const q = await import("@/features/pm/grid-operator/queries");
  await Promise.all([qc.prefetchQuery(q.gridOperatorProjectQuery(projectId)), qc.prefetchQuery(q.gridOperatorRowQuery(projectId))]);
}

/** The screens this module starts reads for, by route slug. Others (Production, Revenues, Finance) are another owner's. */
export const PM_SCREEN_PREFETCHERS: Partial<Record<PmBootSlug, Prefetcher>> = {
  checklist: prefetchChecklist,
  team: prefetchTeam,
  milestones: prefetchMilestones,
  planning: prefetchPlanningScreen,
  "grid-operator": prefetchGridOperator,
};

/** Starts the reads of the screen `slug` opens; resolves when they have settled (a failed one is the screen's to retry, never thrown). */
export function prefetchPmScreenReads(qc: QueryClient, slug: PmBootSlug, projectId: string): Promise<unknown> {
  const run = PM_SCREEN_PREFETCHERS[slug];
  return run ? run(qc, projectId) : Promise.resolve();
}
