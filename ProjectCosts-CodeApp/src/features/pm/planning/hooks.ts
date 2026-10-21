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
 * Every write refreshes the screen's queries (`qk.planningAll`), the canvas reloads.
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
import { useQuery } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { executePlan } from "@/data/executePlan";
import { trace } from "@/platform/telemetry";
import {
  listAquisitionStatuses, listAquisitionTypes, listCustomChoiceValues, listPermits, loadPlanningProject,
  loadProjectPlanning,
} from "@/data/planning";
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
  if (plan.writes.length === 0) return false;
  try {
    await executePlan(plan, NOTIFY.loading);
  } catch (e) {
    trace("warning", "Project Planning: the OnVisible seed was refused", e);
  }
  return true;
}

/** `gblRecordSelectedProject`, re-read on every visit as `OnVisible` does. */
export function usePlanningProject(projectId: string | undefined): ScreenData<PlanningProject | null> {
  const q = useQuery({
    queryKey: qk.planning(projectId ?? "", "project"),
    queryFn: () => loadPlanningProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** `gblRecordProjectPlanning`, created when the project has none (`planEnsurePlanning`). */
export function useProjectPlanning(project: PlanningProject | null): ScreenData<PlanningRecord | null> {
  const q = useQuery({
    queryKey: qk.planning(project?.id ?? "", "row"),
    queryFn: async () => {
      const row = await loadProjectPlanning(project!.id);
      if (row) return row;
      return (await seed(planEnsurePlanning(project, null))) ? loadProjectPlanning(project!.id) : null;
    },
    enabled: Boolean(project?.id),
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
  const q = useQuery({ queryKey: qk.aquisitionTypes, queryFn: listAquisitionTypes, staleTime: 5 * 60 * 1000 });
  return out(q, NONE as AquisitionTypeRow[]);
}

/** `colAquisitionStatusesUnderLaw` / `…InRem`, seeded for every type that has no row (`planAquisitionSeed`). */
export function useAquisitionStatuses(
  project: PlanningProject | null, types: AquisitionTypeRow[], typesReady: boolean,
): ScreenData<AquisitionStatusRow[]> {
  const q = useQuery({
    queryKey: qk.planning(project?.id ?? "", "aquisition"),
    queryFn: async () => {
      const rows = await listAquisitionStatuses(project!.id, types);
      return (await seed(planAquisitionSeed(types, rows, project))) ? listAquisitionStatuses(project!.id, types) : rows;
    },
    enabled: Boolean(project?.id) && typesReady,
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
