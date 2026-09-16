/**
 * The per-screen project + permission context.
 *
 * This is the code-app replacement for the block that opens nearly every canvas
 * `OnVisible`:
 *
 *   Set(gblRecordSelectedProject, LookUp(Projects, Project = gblRecordSelectedProject.Project));
 *   Set(gblCurrentUser, Patch(gblCurrentUser, { CanEditSelectedProject:
 *       And(DataSourceInfo(Projects, CreatePermission),
 *           Coalesce(RecordInfo(gblRecordSelectedProject, EditPermission), false)) }));
 *
 * Calling it once per screen gives every screen the same freshly-read project record and
 * the same server-derived edit flag, without each screen re-implementing the idiom.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectFullRepo, type ProjectRow } from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { useAppStore } from "@/store/appStore";
import { canEditSelectedProject } from "@/domain/session";
import type { SelectedProject } from "@/domain/navigation";
import { ES } from "@/data/entities";
import { privileges } from "@/platform/privileges";

export function toSelectedProject(r: ProjectRow): SelectedProject {
  return {
    projectId: r.vsb_projectid,
    projectNumber: r.vsb_internalprojectid,
    projectStartDate: r.vsb_projectstartdate,
    totalCapacity: r.vsb_totalcapacity,
    netYieldP50: r.vsb_netyieldp50,
    clusterStateName:
      (r["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
    plantWtgCapacityMw: r.vsb_plantwtgcapacity,
    name: r.vsb_name,
    // The RAW choice value, deliberately — `features/checklist`, `features/milestones` and
    // `features/production` all pass this straight into `f.eq("vsb_technology", …)`, so it has
    // to stay comparable against the column. The label is resolved for display only, in
    // `selectProjectHeader`.
    technology: r.vsb_technology,
    countryId: r._vsb_country_value,
  };
}

export interface ProjectPrivileges {
  create: boolean;
  edit: boolean;
}

/**
 * `DataSourceInfo(Projects, CreatePermission)` + `RecordInfo(record, EditPermission)`.
 *
 * Both must be answered by the server. In mock mode we grant them so the demo is usable;
 * against a real environment this reads the record's own privilege annotations.
 *
 * Exported because the portfolio screen needs the same answer for the row it has selected.
 * It previously derived edit rights from the user's *role names*, which CLAUDE.md rule 5
 * forbids outright — a role name is not a privilege, and row-level sharing means the two
 * genuinely disagree.
 */
/**
 * `RecordInfo(project, EditPermission)` plus `DataSourceInfo(Projects, CreatePermission)`.
 *
 * This used to build `RetrievePrincipalAccess`'s `@odata.type` from the ENTITY SET
 * (`Microsoft.Dynamics.CRM.vsb_projects`) where the LOGICAL NAME (`…vsb_project`) is
 * required. Against a real environment the call faulted, the `catch` correctly denied, and
 * the symptom was every project silently read-only for everyone — a permissions bug that
 * looks exactly like a UI bug and would have survived a demo in mock mode, because mock mode
 * short-circuits to `true`.
 *
 * It now goes through `platform/privileges`, which owns the logical name and the cache, so
 * there is one implementation of this call rather than two that can disagree.
 */
export async function readPrivileges(projectId: string): Promise<ProjectPrivileges> {
  const [table, record] = await Promise.all([
    Promise.resolve(privileges.forTable(ES.projects)),
    privileges.forRecord(ES.projects, projectId),
  ]);
  return { create: table.canCreate, edit: record.canWrite };
}

export interface ProjectContext {
  project: SelectedProject | null;
  record: ProjectRow | undefined;
  canEdit: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useProjectContext(): ProjectContext {
  const selected = useAppStore((s) => s.project.selected);
  const selectProject = useAppStore((s) => s.selectProject);
  const patchUser = useAppStore((s) => s.patchUser);
  const id = selected?.projectId;

  const q = useQuery({
    queryKey: qk.projects.one(id ?? "none"),
    enabled: Boolean(id),
    queryFn: async () => {
      const [record, priv] = await Promise.all([
        projectFullRepo.getById(id!),
        readPrivileges(id!),
      ]);
      return { record, priv };
    },
    staleTime: 30_000,
  });

  const record = q.data?.record;
  const canEdit = canEditSelectedProject(q.data?.priv.create, q.data?.priv.edit);

  // Re-hydrate the store with the freshly read record, exactly as the canvas OnVisible did.
  useEffect(() => {
    if (record) selectProject(toSelectedProject(record));
  }, [record, selectProject]);

  useEffect(() => {
    if (q.data) patchUser({ canEditSelectedProject: canEdit });
  }, [q.data, canEdit, patchUser]);

  return {
    project: selected,
    record,
    canEdit,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
  };
}

/** Load a project by id and put it in the store — used by deep links and the list. */
export async function selectProjectById(id: string) {
  const record = await projectFullRepo.getById(id);
  if (record) useAppStore.getState().selectProject(toSelectedProject(record));
  return record;
}
