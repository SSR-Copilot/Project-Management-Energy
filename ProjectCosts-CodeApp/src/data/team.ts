/**
 * Project Team — the Dataverse reads behind `features/pm/team` (connected 19 Oct 2026, D30).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Two tables
 * were registered for this screen with `pac code add-data-source`, one at a time (68 → 70):
 * `vsb_projectmembers` and `vsb_projectmemberdescriptions`.
 *
 * `Member`, `'Project Manager'` and `'Deputy Project Manager'` are lookups to the virtual table
 * `aaduser` (`'Microsoft Entra IDs'`). Their display names and mails come from `getEntraPeople`
 * (`data/adminGatesApprovals.ts`, reused — rule 17), one keyed request per person, because the
 * Graph-backed table is queried by key only. The lookup's formatted value is the fallback name.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectmembersesService } from "@/generated/services/Vsb_projectmembersesService";
import { Vsb_projectmemberdescriptionsesService } from "@/generated/services/Vsb_projectmemberdescriptionsesService";
import {
  DESCRIPTION_COL, MEMBER_COL, PROJECT_COL,
  type MemberDescriptionOption, type ProjectMemberRow, type TeamPerson, type TeamProject,
} from "@/features/pm/team/rules";
import { getEntraPeople } from "./adminGatesApprovals";
import { fetchAll, fetchPage } from "./client";
import { guid, lookupEq, numberOf } from "./odata";

type Raw = Record<string, unknown>;
type People = Awaited<ReturnType<typeof getEntraPeople>>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const formatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;
const ymd = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

/** A person lookup, resolved through Entra; the lookup's formatted name when Entra has no row. */
function person(r: Raw, col: string, people: People): TeamPerson | null {
  const id = str(r[col]);
  if (!id) return null;
  const p = people.get(id);
  return {
    rowId: id,
    displayName: p?.displayName || str(r[formatted(col)]) || "",
    mail: p?.mail || null,
  };
}

const PROJECT_SELECT = [
  PROJECT_COL.id, PROJECT_COL.projectNumber, PROJECT_COL.endDate, PROJECT_COL.projectStartDate,
  PROJECT_COL.totalCapacity, PROJECT_COL.netYieldP50, PROJECT_COL.clusterState, PROJECT_COL.owningBusinessUnit,
  PROJECT_COL.projectManager, PROJECT_COL.deputyProjectManager,
];

/** `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (`OnVisible`, Y:24). */
export async function loadTeamProject(projectId: string): Promise<TeamProject | null> {
  const r = raw(await fetchPage(
    "load the project's team data",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
  ))[0];
  if (!r) return null;
  const ids = [str(r[PROJECT_COL.projectManager]), str(r[PROJECT_COL.deputyProjectManager])]
    .filter((x): x is string => Boolean(x));
  const people = ids.length > 0 ? await getEntraPeople(ids) : new Map() as People;
  return {
    id: String(r[PROJECT_COL.id]),
    projectNumber: str(r[PROJECT_COL.projectNumber]),
    endDate: ymd(r[PROJECT_COL.endDate]),
    projectStartDate: ymd(r[PROJECT_COL.projectStartDate]),
    totalCapacity: numberOf(r[PROJECT_COL.totalCapacity]) ?? null,
    netYieldP50: numberOf(r[PROJECT_COL.netYieldP50]) ?? null,
    clusterStateName: str(r[formatted(PROJECT_COL.clusterState)]),
    owningBusinessUnitId: str(r[PROJECT_COL.owningBusinessUnit]),
    projectManager: person(r, PROJECT_COL.projectManager, people),
    deputyProjectManager: person(r, PROJECT_COL.deputyProjectManager, people),
  };
}

/**
 * `drp_Team_RightPanel_Member_Form_Position_TableBackedChoices.Items = 'Project Member Descriptions'`
 * (Y:1319) — the whole table, unfiltered and unsorted, as the canvas reads it.
 */
export async function listMemberDescriptions(): Promise<MemberDescriptionOption[]> {
  const rows = raw(await fetchAll(
    "load the project member descriptions",
    (o) => Vsb_projectmemberdescriptionsesService.getAll(o),
    { select: [DESCRIPTION_COL.id, DESCRIPTION_COL.name, DESCRIPTION_COL.description] },
  ));
  return rows.map((r) => ({
    id: String(r[DESCRIPTION_COL.id]),
    name: str(r[DESCRIPTION_COL.name]) ?? "",
    description: str(r[DESCRIPTION_COL.description]),
  }));
}

const MEMBER_SELECT = [
  MEMBER_COL.id, MEMBER_COL.name, MEMBER_COL.comment, MEMBER_COL.position, MEMBER_COL.member, MEMBER_COL.description,
];

/**
 * `gal_Team_DisplayProject_Body_Content_Memebers.Items` (Y:923):
 * `Filter('Project Members', Project = gblRecordSelectedProject)`, with `Member.'Display Name'`,
 * `Member.Mail` and `'Project Member Description'.Description` resolved. Sorted by `sortMembers`
 * in the hook (`$orderby` cannot reach the expanded name).
 */
export async function listTeamMembers(projectId: string): Promise<ProjectMemberRow[]> {
  const [rows, descriptions] = await Promise.all([
    fetchAll(
      "load the project members",
      (o) => Vsb_projectmembersesService.getAll(o),
      { select: MEMBER_SELECT, filter: lookupEq("vsb_project", projectId) },
    ).then(raw),
    listMemberDescriptions(),
  ]);
  const ids = rows.map((r) => str(r[MEMBER_COL.member])).filter((x): x is string => Boolean(x));
  const people = ids.length > 0 ? await getEntraPeople(ids) : new Map() as People;
  const byId = new Map(descriptions.map((d) => [d.id, d]));
  return rows.map((r) => {
    const who = person(r, MEMBER_COL.member, people);
    const descriptionId = str(r[MEMBER_COL.description]);
    return {
      id: String(r[MEMBER_COL.id]),
      displayName: who?.displayName ?? "",
      memberRowId: who?.rowId ?? null,
      mail: who?.mail ?? null,
      descriptionId,
      description: descriptionId ? byId.get(descriptionId)?.description ?? null : null,
      positionLabel: str(r[formatted(MEMBER_COL.position)]),
      comment: str(r[MEMBER_COL.comment]) ?? "",
    };
  });
}
