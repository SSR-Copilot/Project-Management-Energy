/**
 * Project General Team Screen — queries and mutations.
 *
 * Canvas screen: `Project General Team Screen` (PM app)
 *   66 controls · 1 394 lines of Power Fx · 16 substantive blocks · band S
 *
 * `Filter('Project Members', Project.Project = …)` becomes a server-filtered query with
 * the two lookups projected, so the grid can render the display name and the description
 * without an N+1 (CONVENTIONS rule 2).
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectMemberFullRepo, projectMemberDescriptionRepo, projectFullRepo,
  type ProjectRow,
} from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { asc } from "@/platform/odata";
import { toAppError } from "@/platform/errors";
import { useAppStore } from "@/store/appStore";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  buildMemberPayload, sortMembers,
  type MemberDraft, type ProjectMemberRow, type TeamProject, type TeamPerson,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const fv = (r: Record<string, unknown>, col: string): string | null =>
  str(r[`${col}@OData.Community.Display.V1.FormattedValue`]);

/* ─────────────────────────────────────────────────────────────────── mapping */

export function toTeamProject(r: ProjectRow | undefined): TeamProject | null {
  if (!r) return null;
  const person = (idCol: string, nameCol: string): TeamPerson | null => {
    const id = str(r[idCol]);
    if (!id) return null;
    return {
      rowId: id,
      displayName: fv(r as Record<string, unknown>, idCol) ?? "",
      mail: str(r[nameCol]),
    };
  };
  return {
    id: r.vsb_projectid,
    projectNumber: r.vsb_internalprojectid,
    endDate: str(r[PROJECT_COL.endDate]),
    projectStartDate: r.vsb_projectstartdate,
    totalCapacity: r.vsb_totalcapacity,
    netYieldP50: r.vsb_netyieldp50,
    clusterStateName: fv(r as Record<string, unknown>, "_vsb_clusterstate_value"),
    owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
    projectManager: person("_vsb_projectmanager_value", "vsb_projectmanagermail"),
    deputyProjectManager: person("_vsb_deputyprojectmanager_value", "vsb_deputyprojectmanagermail"),
  };
}

const toMemberRow = (r: Record<string, unknown>): ProjectMemberRow => ({
  id: String(r["vsb_projectmemberid"]),
  displayName: fv(r, "_vsb_member_value") ?? "",
  memberRowId: str(r["_vsb_member_value"]),
  mail: str(r["vsb_membermail"]),
  descriptionId: str(r["_vsb_projectmemberdescription_value"]),
  description: fv(r, "_vsb_projectmemberdescription_value"),
  // The legacy `Position` choice, read for rows created before the switch (rule 14).
  positionLabel: fv(r, "vsb_position"),
  comment: typeof r["vsb_comment"] === "string" ? r["vsb_comment"] : "",
});

/* ───────────────────────────────────────────────────────────────────── queries */

export function useTeamProject(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.projects.one(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!),
  });
  return { project: useMemo(() => toTeamProject(q.data), [q.data]), isLoading: q.isLoading };
}

/**
 * Rule 3 — this project's members only, sorted by display name.
 *
 * `$orderby` on an expanded lookup's own column is not supported by Dataverse, so the
 * ORDER is applied here through `sortMembers`; the FILTER stays on the server, which is
 * the part that matters.
 */
export function useProjectMembers(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("projectMembers", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectMemberFullRepo.byProject(projectId!),
  });
  return {
    members: useMemo(() => sortMembers((q.data ?? []).map(toMemberRow)), [q.data]),
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** The panel's description dropdown — reference data, cached hard. */
export function useMemberDescriptions() {
  const q = useQuery({
    queryKey: ["ref", "projectMemberDescriptions"] as const,
    staleTime: 30 * 60_000,
    queryFn: () => projectMemberDescriptionRepo.listAll({ orderBy: [asc("vsb_order")] }),
  });
  return { descriptions: q.data ?? [], isLoading: q.isLoading };
}

/* ────────────────────────────────────────────────────────────────── mutations */

export interface SaveMemberArgs {
  draft: MemberDraft;
  project: TeamProject;
}

/**
 * Rule 13 — one `Project Members` row, created when nothing is selected.
 *
 * The empty-picker hole from rule 15 is closed in `buildMemberPayload`, which throws
 * before a request is issued rather than letting the server accept an arbitrary member.
 */
export function useSaveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, project }: SaveMemberArgs) => {
      const data = buildMemberPayload(draft, project);
      if (draft.memberId) {
        await projectMemberFullRepo.update(draft.memberId, data);
        return { id: draft.memberId, created: false };
      }
      const id = await projectMemberFullRepo.create(data);
      return { id, created: true };
    },
    onSuccess: (_r, vars) => {
      void qc.invalidateQueries({
        queryKey: qk.child("projectMembers", vars.project.id ?? "none"),
      });
    },
    onError: (e) => toAppError(e, "team/saveMember"),
  });
}

/** Rule 17 — delete behind the confirmation dialog. */
export function useDeleteMember(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => projectMemberFullRepo.remove(memberId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("projectMembers", projectId ?? "none") });
    },
  });
}

/**
 * The server-derived permissions rule 8 and rule 9 need.
 *
 * `canEditMember` is a RECORD-level check on the selected member row, which the canvas did
 * with `RecordInfo(locSelectedMember, RecordInfo.EditPermission)`. Dataverse returns the
 * project's own privileges through `useProjectContext`; a member row inherits from the
 * project's business unit in this solution, so the project's edit right is the honest
 * answer until a per-row probe exists. It is passed explicitly rather than assumed from a
 * role name (CONVENTIONS rule 4).
 */
export function useTeamPermissions(canEditProject: boolean) {
  const user = useAppStore((s) => s.session.user);
  return {
    canCreate: canEditProject,
    canEditProject,
    canEditMember: canEditProject,
    /** Only used to label the toast; never to decide anything. */
    actorName: user?.displayName ?? "",
  };
}

/** Exposed for the grid footer. */
export const memberCount = (m: ProjectMemberRow[]): number => m.length;
