/**
 * Project General Team Screen — the data layer (connected 19 Oct 2026, D30).
 *
 * READS (`data/team.ts`): the project (with its Project Manager and Deputy resolved through Entra),
 * the project's `Project Members` (members resolved through Entra, descriptions joined), the
 * `Project Member Descriptions` for the panel dropdown, and the people search on `aadusers`
 * (`searchEntraPeople`, `data/adminGatesApprovals.ts`, shared with General Data).
 *
 * WRITES — each a `WritePlan` from `rules.ts`, run by `usePlanWrite`:
 *  - Save: one create or one update of `vsb_projectmembers` (`planSaveMember`), with the project's
 *    Owning Business Unit, as the canvas `Patch` writes;
 *  - Delete: one delete of `vsb_projectmembers` (`planDeleteMember`), through `executePlan`, which
 *    checks the SDK result (rule 14).
 *
 * SERVER AUTOMATION (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified 19 Oct 2026, and a
 * search of every workflow JSON and `SdkMessageProcessingStep` in the extract): NO flow is triggered
 * by `vsb_projectmembers` and no plugin step is registered on it, so adding, changing or removing a
 * member grants or revokes no Teams / SharePoint membership and sends no mail. The screen calls no
 * flow (the canvas has no `.Run(`).
 *
 * PERMISSIONS: the canvas `DataSourceInfo` / `RecordInfo` checks have no SDK equivalent (D1); they
 * pass and Dataverse refuses what the user may not do (`TEAM_PERMISSIONS`).
 */
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/features/shared/useDebouncedValue";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { searchEntraPeople } from "@/data/adminGatesApprovals";
import { listMemberDescriptions, listTeamMembers, loadTeamProject } from "@/data/team";
import {
  sortMembers,
  type MemberDescriptionOption, type ProjectMemberRow, type TeamPermissions, type TeamPerson, type TeamProject,
} from "./rules";
import { teamReloadKeys } from "./reload";

/** Entity sets this screen reads and writes. */
export const TABLES: readonly string[] = [
  ES.projects,
  ES.projectMembers,
  ES.projectMemberDescriptions,
  ES.aadUsers,
];

/** `DataSourceInfo` / `RecordInfo` — pass; the server decides (D1). */
export const TEAM_PERMISSIONS: TeamPermissions = { canCreate: true, canEditProject: true, canEditMember: true };

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const NONE: never[] = [];

/** `gblRecordSelectedProject`, re-read on every visit as `OnVisible` does. */
export function useTeamProject(projectId: string | undefined): ScreenData<TeamProject | null> {
  const q = useQuery({
    queryKey: qk.team(projectId ?? "", "project"),
    queryFn: () => loadTeamProject(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, null);
}

/** The member gallery, sorted by display name. */
export function useProjectMembers(projectId: string | undefined): ScreenData<ProjectMemberRow[]> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.team(projectId ?? "", "members"),
    // OPT-14: the descriptions come from the screen's own cached read (one table read per visit, none after a save), handed
    // over as a promise so the members read and the descriptions still start together.
    queryFn: async () => sortMembers(await listTeamMembers(projectId!, qc.fetchQuery(memberDescriptionsQuery()))),
    enabled: Boolean(projectId),
  });
  return out(q, NONE as ProjectMemberRow[]);
}

/** The descriptions read, shared by the panel's dropdown and the member gallery's description column. */
const memberDescriptionsQuery = () => queryOptions({
  queryKey: qk.teamMemberDescriptions, queryFn: listMemberDescriptions, staleTime: 5 * 60 * 1000,
});

/** The panel's Description dropdown. */
export function useMemberDescriptions(): ScreenData<MemberDescriptionOption[]> {
  const q = useQuery(memberDescriptionsQuery());
  return out(q, NONE as MemberDescriptionOption[]);
}

/** How long the member search waits for a pause in typing (OPT-19; General Data uses the same 250 ms). */
export const MEMBER_SEARCH_DEBOUNCE_MS = 250;

/**
 * `pcf_Team_RightPanel_Member_Form_Principal.OnSearch` (Y:1408): blank text searches nothing; the
 * same query (and cache key) as General Data's pickers.
 */
export function useMemberSearch(search: string): ScreenData<TeamPerson[]> {
  // OPT-19: wait for a pause in typing instead of one query per keystroke (as General Data's Manager / Deputy pickers, GD-024).
  // A blank box is not delayed: it searches nothing at once.
  const typed = search.trim();
  const settled = useDebouncedValue(typed, MEMBER_SEARCH_DEBOUNCE_MS);
  const term = typed === "" ? "" : settled;
  const q = useQuery({
    queryKey: qk.entraPeopleSearch(term),
    queryFn: () => searchEntraPeople(term),
    enabled: term.length > 0,
    staleTime: 60 * 1000,
  });
  const people = (q.data ?? NONE).map((p) => ({ rowId: p.id, displayName: p.displayName, mail: p.mail || null }));
  return { data: people, isLoading: q.isLoading, error: q.error ?? undefined, connected: true };
}

/** Runs the Save / Delete jobs from `rules.ts` and refreshes the screen (`Refresh('Project Members')`). */
export function useTeamWrites(projectId: string | undefined) {
  return usePlanWrite({
    // OPT-13: only the queries that read `vsb_projectmembers` (see `reload.ts`); the project and its Entra lookups are not re-read.
    invalidate: teamReloadKeys(projectId),
    action: "change this project's team",
  });
}
