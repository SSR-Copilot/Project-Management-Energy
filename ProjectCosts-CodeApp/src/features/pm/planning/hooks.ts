/**
 * Project Planning Screen — the data layer (connected 20 Oct 2026, D31).
 *
 * READS (`data/planning.ts`): the project, its `Project Plannings` row, the planning row's
 * `Permits`, the `Aquisition Types`, the project's `Aquisition Statuses`, and the two
 * `Custom Choice Values` lists (Legal Planning Basis, Permit Procedure).
 *
 * WRITES ON VISIT — `OnVisible` (Y:80-100, 204-277), run inside the reads that need them, each
 * guarded so a second run finds the row and writes nothing:
 *  - no planning row → one create (`planEnsurePlanning`: Project, Name, Owning Business Unit);
 *  - a type with no acquisition row → one create per type (`planAquisitionSeed`), In personam
 *    first, then In rem.
 * As in the canvas (whose `Patch` here has no `IfError`), a refused seed does not stop the screen:
 * it is traced and the read continues.
 *
 * WRITES — each a `WritePlan` from `rules.ts`, run in order by `usePlanWrite`:
 *  - Save: one update (or create) of `vsb_projectplannings` (`savePlanningJob`);
 *  - permit Save / Delete: one create / update / delete of `vsb_permits`; the delete goes through
 *    `executePlan`, which checks the SDK result (rule 14);
 *  - acquisition Save / Clear & Save: one update of `vsb_aquisitionstatuses`.
 * Every write refreshes the queries that read the table it wrote (OPT-13, `reload.ts`; the canvas reloads them all).
 * The hook's own `qk.planningAll` list is the fallback of a job that names none.
 *
 * SERVER AUTOMATION (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified 19 Oct 2026, and a
 * search of every workflow JSON and `SdkMessageProcessingStep` in the extract): NO flow is triggered
 * by `vsb_projectplanning`, `vsb_permit`, `vsb_aquisitionstatus` or `vsb_aquisitiontype`, and no
 * plugin step is registered on them. `CreatingTeamsandSPOSite-ProjectCreation`, `UpdateTeamsandSPOSite`,
 * `ManualTrigger-UpdateTeamsandSPOSite` and the two gate / checklist approval flows only READ the
 * planning row. The screen calls no flow (the canvas has no `.Run(`).
 *
 * PERMISSIONS: the canvas `DataSourceInfo` / `RecordInfo` checks have no SDK equivalent (D1); they
 * pass and Dataverse refuses what the user may not do (`PLANNING_CAN_EDIT`).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { executePlan } from "@/data/executePlan";
import { trace } from "@/platform/telemetry";
import { bootDvopt } from "@/data/bootDvoptFlags";
import {
  listAquisitionStatuses, listCustomChoiceValues, listPermits, loadProjectPlanning,
} from "@/data/planning";
import { aquisitionTypesQuery, planningAquisitionKey, planningProjectQuery, planningRowKey } from "./queries";
import { seedOnce, type SeedStepResult } from "./seedOnce";
import {
  NOTIFY, planAquisitionSeed, planEnsurePlanning,
  type AquisitionStatusRow, type AquisitionTypeRow, type CustomChoiceOption, type PermitRow, type PlanningProject,
  type PlanningRecord,
} from "./rules";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.projectPlannings,
  ES.permits,
  ES.aquisitionStatuses,
  ES.aquisitionTypes,
  ES.customChoiceValues,
];

/** `gblCurrentUser.CanEditSelectedProject` — `DataSourceInfo` / `RecordInfo` pass; the server decides (D1). */
export const PLANNING_CAN_EDIT = true;

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];

/** Runs an `OnVisible` seed; a refusal is traced, not thrown (the canvas `Patch` has no `IfError`). */
async function seed(plan: ReturnType<typeof planEnsurePlanning>): Promise<boolean> {
  return (await seedChecked(plan)) !== "none";
}

/** `seed`, telling a refusal from a create (the once-guard remembers only a create). */
async function seedChecked(plan: ReturnType<typeof planEnsurePlanning>): Promise<SeedStepResult> {
  if (plan.writes.length === 0) return "none";
  try {
    await executePlan(plan, NOTIFY.loading);
  } catch (e) {
    trace("warning", "Project Planning: the OnVisible seed was refused", e);
    return "refused";
  }
  return "created";
}

/** `gblRecordSelectedProject`, re-read on every visit as `OnVisible` does. */
export function usePlanningProject(projectId: string | undefined): ScreenData<PlanningProject | null> {
  const q = useQuery({ ...planningProjectQuery(projectId ?? ""), enabled: Boolean(projectId) });
  return out(q, null);
}

/**
 * `gblRecordProjectPlanning`, created when the project has none (`planEnsurePlanning`).
 *
 * OPT-16: keyed on the project id, so the row read starts WITH the project read instead of after it (the old chain was
 * project -> row -> permits). The project object is needed only by the seed (its Owning Business Unit), and only when the row is
 * missing: the seed takes it from the shared project query (`fetchQuery`: the in-flight read, or the cached one), so it is still
 * gated on a loaded project: no project, no seed, as before.
 */
export function useProjectPlanning(projectId: string | undefined): ScreenData<PlanningRecord | null> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: planningRowKey(projectId ?? ""),
    queryFn: async () => {
      const row = await loadProjectPlanning(projectId!);
      if (row) return row;
      const project = await qc.fetchQuery(planningProjectQuery(projectId!));
      const plan = planEnsurePlanning(project, null);
      if (!bootDvopt().planningCreateOnce) return (await seed(plan)) ? loadProjectPlanning(projectId!) : null;
      // PB-05: the create runs once per project; right before it the row is read again (another tab, a retry, a second run).
      if (plan.writes.length === 0) return null;
      const result = await seedOnce(`planning:${projectId}`, async () =>
        (await loadProjectPlanning(projectId!)) ? "none" : seedChecked(plan));
      return result === "done" ? null : loadProjectPlanning(projectId!);
    },
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** `colPermits`. */
export function usePermits(projectId: string | undefined, planningId: string | undefined): ScreenData<PermitRow[]> {
  const q = useQuery({
    queryKey: qk.planning(projectId ?? "", "permits", planningId ?? ""),
    queryFn: () => listPermits(planningId!),
    enabled: Boolean(planningId),
  });
  return out(q, NONE as PermitRow[]);
}

/** `colAquisitionStatusesUnderLawTypes` / `…InRemTypes`. */
export function useAquisitionTypes(): ScreenData<AquisitionTypeRow[]> {
  const q = useQuery(aquisitionTypesQuery());
  return out(q, NONE as AquisitionTypeRow[]);
}

/** `colAquisitionStatusesUnderLaw` / `…InRem`, seeded for every type that has no row (`planAquisitionSeed`). */
export function useAquisitionStatuses(
  projectId: string | undefined, types: AquisitionTypeRow[], typesReady: boolean,
): ScreenData<AquisitionStatusRow[]> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: planningAquisitionKey(projectId ?? ""),
    queryFn: async () => {
      const rows = await listAquisitionStatuses(projectId!, types);
      // OPT-16: keyed on the project id (the read waits for the types, not for the project). The project is fetched only when
      // a type has no row yet (the seed's Owning Business Unit); with every row present no project is needed.
      if (planAquisitionSeed(types, rows, { id: projectId! } as PlanningProject).writes.length === 0) return rows;
      const project = await qc.fetchQuery(planningProjectQuery(projectId!));
      if (!bootDvopt().planningCreateOnce) {
        return (await seed(planAquisitionSeed(types, rows, project))) ? listAquisitionStatuses(projectId!, types) : rows;
      }
      // PB-05: once per project; the statuses are read again right before the create, and only the types still missing are created.
      const result = await seedOnce(`aquisition:${projectId}`, async () =>
        seedChecked(planAquisitionSeed(types, await listAquisitionStatuses(projectId!, types), project)));
      return result === "done" ? rows : listAquisitionStatuses(projectId!, types);
    },
    enabled: Boolean(projectId) && typesReady,
  });
  return out(q, NONE as AquisitionStatusRow[]);
}

/** The Legal Planning Basis / Permit Procedure options (`colCustomChoiceValues`, App.OnStart). */
export function useCustomChoiceValues(fieldName: string, countryId: string | null, enabled: boolean): ScreenData<CustomChoiceOption[]> {
  const q = useQuery({
    queryKey: qk.planningChoices(fieldName, countryId),
    queryFn: () => listCustomChoiceValues(fieldName, countryId),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  return out(q, NONE as CustomChoiceOption[]);
}

/** Runs the Save / permit / acquisition jobs from `rules.ts` and reloads the screen's rows. */
export function usePlanningWrites(projectId: string | undefined) {
  return usePlanWrite({
    invalidate: [qk.planningAll(projectId ?? "")],
    action: "change this project's planning",
  });
}
