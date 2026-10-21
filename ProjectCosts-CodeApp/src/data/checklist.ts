/**
 * PM Project General CheckList — the Dataverse reads behind `features/pm/checklist` (connected
 * 19 Oct 2026, D29).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1); the canvas
 * `OnVisible` / `but_Project_States_CheckList_Refresh` reads it replaces are cited per function.
 * Three tables were registered for this screen with `pac code add-data-source` (65 → 68):
 * `vsb_projectchecklist`, `vsb_projectstatetrackingnote` and `vsb_projectchecklisttrackingnote`.
 *
 * Reused, never copied (rule 17): the project states (`listProjectStates`, `data/generalData.ts`),
 * the gate rows, the check-list approval rows, the country/technology scope and the Entra people
 * (`listGateApprovals`, `listChecklistApprovals`, `findScopeCountryTechId`, `getEntraPeople`,
 * `data/adminGatesApprovals.ts`).
 *
 * The mappers are pure (`rules.test.ts` pins them).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectstatetrackingsService } from "@/generated/services/Vsb_projectstatetrackingsService";
import { Vsb_projectchecklistsService } from "@/generated/services/Vsb_projectchecklistsService";
import { Vsb_projectdefaultchecklistsesService } from "@/generated/services/Vsb_projectdefaultchecklistsesService";
import { Vsb_projectdefaultapprovalsesService } from "@/generated/services/Vsb_projectdefaultapprovalsesService";
import { Vsb_projectstatetrackingnotesService } from "@/generated/services/Vsb_projectstatetrackingnotesService";
import { Vsb_projectchecklisttrackingnotesService } from "@/generated/services/Vsb_projectchecklisttrackingnotesService";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  CHECKLIST_COL, NOTE_COL, TRACKING_COL,
  type ChecklistApprovalSetting, type ChecklistProject, type ChecklistRow, type DefaultChecklistTemplate,
  type GateSetting, type HistoryQueryDescriptor, type ProjectStateRef, type TrackingRow,
} from "@/features/pm/checklist/rules";
import { fetchAll, fetchPage } from "./client";
import { listProjectStates } from "./generalData";
import { findScopeCountryTechId, getEntraPeople, listChecklistApprovals, listGateApprovals } from "./adminGatesApprovals";
import { ACTIVE, and, eq, guid, lookupEq } from "./odata";
import { ES } from "./dataverseNames";

type Raw = Record<string, unknown>;
/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup's name. */
const formatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/* ═══════════════════════════════════════════════════════════════════ mappers ════ */

/**
 * A raw `vsb_projects` row → the project the screen branches on. `'Project ID'` is `vsb_name` and
 * `'Project Name'` is `vsb_projectname` (D25). Before D29 the mapper read the Project ID from
 * `vsb_internalprojectid` and the name from `vsb_name`.
 */
export function toChecklistProject(r: Raw | undefined): ChecklistProject | null {
  if (!r) return null;
  return {
    id: String(r[PROJECT_COL.id] ?? ""),
    projectName: str(r[PROJECT_COL.name]),
    projectNumber: str(r[PROJECT_COL.projectNumber]),
    startCluster: num(r[PROJECT_COL.startCluster]),
    clusterStateId: str(r["_vsb_clusterstate_value"]),
    clusterStateName: str(r[formatted("_vsb_clusterstate_value")]),
    approvalState: num(r[PROJECT_COL.approvalState]),
    countryId: str(r["_vsb_country_value"]),
    // `vsb_technology` is a picklist (Wind = 952850000 …), so it arrives as a number.
    technology: num(r[PROJECT_COL.technology]),
    owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
    totalCapacity: num(r["vsb_totalcapacity"]),
    netYieldP50: num(r["vsb_netyieldp50"]),
    milestones: {
      projectStartDate: str(r[PROJECT_COL.projectStartDate]),
      feasibilityStudies: str(r[PROJECT_COL.feasibilityStudies]),
      projectDevelopmentStarted: str(r[PROJECT_COL.projectDevelopmentStarted]),
      applicationSubmitted: str(r[PROJECT_COL.applicationSubmitted]),
      legallyBindingPermits: str(r[PROJECT_COL.legallyBindingPermits]),
      fid: str(r[PROJECT_COL.fid]),
      construction: str(r[PROJECT_COL.construction]),
      cod: str(r[PROJECT_COL.cod]),
    },
  };
}

export const toTrackingRow = (r: Raw): TrackingRow => ({
  id: String(r[TRACKING_COL.id] ?? ""),
  name: str(r[TRACKING_COL.name]),
  clusterStateId: str(r[TRACKING_COL.clusterState]),
  clusterStateName: str(r[formatted(TRACKING_COL.clusterState)]) ?? str(r[TRACKING_COL.name]),
  approvalClusterState: num(r[TRACKING_COL.approvalClusterState]),
  clusterStepState: num(r[TRACKING_COL.clusterStepState]),
  approvalComment: str(r[TRACKING_COL.approvalComment]),
  approvalDueDate: str(r[TRACKING_COL.approvalDueDate]),
  flowRunId: str(r[TRACKING_COL.flowRunId]),
  flowApprovalId: str(r[TRACKING_COL.flowApprovalId]),
  lastTriggeredApprovalMode: num(r[TRACKING_COL.lastTriggeredApprovalMode]),
  lastTriggeredApprovalPersonas: str(r[TRACKING_COL.lastTriggeredApprovalPersonas]),
});

/** Rule 12's flat projection, renaming the Dataverse columns to the gallery's shape. */
export const toChecklistRow = (r: Raw): ChecklistRow => ({
  id: String(r[CHECKLIST_COL.id] ?? ""),
  title: String(r[CHECKLIST_COL.name] ?? ""),
  clusterStateId: str(r[CHECKLIST_COL.clusterState]),
  clusterStateName: str(r[formatted(CHECKLIST_COL.clusterState)]),
  gateRelevance: r[CHECKLIST_COL.gateRelevance] === true,
  holdingDescription: str(r[CHECKLIST_COL.holdingTaskDescription]),
  isCompletionDate: r[CHECKLIST_COL.isCompletionDate] === true,
  completionDate: str(r[CHECKLIST_COL.completionDate]),
  taskState: num(r[CHECKLIST_COL.taskState]),
  approvalChecklistState: num(r[CHECKLIST_COL.approvalChecklistState]),
  note: str(r[CHECKLIST_COL.comments]),
  sort: num(r[CHECKLIST_COL.order]) ?? 0,
  projectDefaultChecklistId: str(r[CHECKLIST_COL.projectDefaultChecklist]),
  flowRunId: str(r[CHECKLIST_COL.flowRunId]),
  flowApprovalId: str(r[CHECKLIST_COL.flowApprovalId]),
  modifiedByName: str(r[formatted("_modifiedby_value")]),
  modifiedOn: str(r["modifiedon"]),
});

export const toTemplate = (r: Raw): DefaultChecklistTemplate => ({
  id: String(r["vsb_projectdefaultchecklistsid"] ?? ""),
  name: String(r["vsb_name"] ?? ""),
  clusterStateId: str(r["_vsb_clusterstate_value"]),
  gateRelevance: r["vsb_gaterelevance"] === true,
  holdingTaskDescription: str(r["vsb_holdingtaskdescription"]),
  isCompletionDate: r["vsb_iscompletiondate"] === true,
  order: num(r["vsb_order"]) ?? 0,
});

/** One history row of either note table. */
export interface HistoryEntry {
  id: string;
  name: string | null;
  comment: string | null;
  /** `vsb_note` — the HTML task table on a transition note. */
  note: string | null;
  noteType: number | null;
  createdOn: string | null;
  /** `ThisItem.modifiedby.'Full Name'` (`lbl_…_Form_Modifed.Text`, Y:4630). */
  modifiedByName: string | null;
}

const toHistoryEntry = (idCol: string) => (r: Raw): HistoryEntry => ({
  id: String(r[idCol] ?? ""),
  name: str(r[NOTE_COL.name]),
  comment: str(r[NOTE_COL.comment]),
  note: str(r[NOTE_COL.note]),
  noteType: num(r[NOTE_COL.noteType]),
  createdOn: str(r[NOTE_COL.createdOn]),
  modifiedByName: str(r[formatted("_modifiedby_value")]),
});

/* ═══════════════════════════════════════════════════════════════ the project ════ */

const PROJECT_SELECT = [
  PROJECT_COL.id, PROJECT_COL.projectNumber, PROJECT_COL.name, PROJECT_COL.startCluster,
  "_vsb_clusterstate_value", PROJECT_COL.approvalState, "_vsb_country_value", PROJECT_COL.technology,
  "_owningbusinessunit_value", "vsb_totalcapacity", "vsb_netyieldp50",
  PROJECT_COL.projectStartDate, PROJECT_COL.feasibilityStudies, PROJECT_COL.projectDevelopmentStarted,
  PROJECT_COL.applicationSubmitted, PROJECT_COL.legallyBindingPermits, PROJECT_COL.fid,
  PROJECT_COL.construction, PROJECT_COL.cod,
];

/** `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (`OnVisible`, Y:93-98). */
export async function loadChecklistProject(projectId: string): Promise<ChecklistProject | null> {
  const rows = await fetchPage(
    "load the project for the checklist",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
  );
  return toChecklistProject(rows[0] as unknown as Raw | undefined);
}

/**
 * EVERY `'Project States'` row (visible or not): the sequences filter `'Is Visible On Checklist'`
 * themselves, and Abandoned / Inactive are looked up over all states (App.OnStart).
 */
export async function listChecklistProjectStates(): Promise<ProjectStateRef[]> {
  const rows = await listProjectStates();
  return rows.map((s) => ({ ...s, clusterDescription: s.clusterDescription ?? null }));
}

/* ═════════════════════════════════════════════════════════ trackings and gates ════ */

const TRACKING_SELECT = [
  TRACKING_COL.id, TRACKING_COL.name, TRACKING_COL.clusterState, TRACKING_COL.approvalClusterState,
  TRACKING_COL.clusterStepState, TRACKING_COL.approvalComment, TRACKING_COL.approvalDueDate,
  TRACKING_COL.flowRunId, TRACKING_COL.flowApprovalId, TRACKING_COL.lastTriggeredApprovalMode,
  TRACKING_COL.lastTriggeredApprovalPersonas,
];

/** `Filter('Project State Trackings', Project.Project = …)` (`OnVisible`, Y:153-173 and every refresh). */
export async function listChecklistTrackings(projectId: string): Promise<TrackingRow[]> {
  const rows = await fetchAll(
    "list the project's state trackings for the checklist",
    (o) => Vsb_projectstatetrackingsService.getAll(o),
    { select: TRACKING_SELECT, filter: lookupEq("vsb_project", projectId) },
  );
  return rows.map((r) => toTrackingRow(r as unknown as Raw));
}

const GATE_SELECT = [
  "vsb_projectdefaultapprovalsid", "vsb_name", "vsb_approvalmodecode", "vsb_gateactive", "_vsb_clusterstate_value",
  "_vsb_approvalscountry_value", "vsb_technologycode", "_vsb_approvalparticipant1_value",
  "vsb_defaultapprovals", "vsb_defaultcontributors", "vsb_defaultnotifications",
];

/**
 * `colDefaultProjectApprovalsSettings` (`OnVisible`, Y:184-189): `'Gate active' = true && (IsBlank(country)
 * || 'Approvals Country' = country) && (IsBlank(Technology) || Technology = …)`. With both values set
 * this is `listGateApprovals` (Admin Gates Approvals) filtered on the active flag; a blank country or
 * technology drops that clause, as the canvas does. The Portfolio Manager's mail is resolved from Entra
 * (the tooltips read `'Portfolio Manager'.Mail`).
 */
export async function listChecklistGates(
  project: Pick<ChecklistProject, "countryId" | "technology">,
): Promise<GateSetting[]> {
  let rows: Omit<GateSetting, "portfolioManagerMail">[];
  if (project.countryId && project.technology !== null) {
    rows = (await listGateApprovals(project.countryId, project.technology))
      .filter((g) => g.gateActive)
      .map((g) => ({
        id: g.id, clusterStateId: g.clusterStateId, approvalMode: g.approvalMode, gateActive: g.gateActive,
        portfolioManagerId: g.portfolioManagerId, defaultApprovals: g.defaultApprovals,
        defaultContributors: g.defaultContributors, defaultNotifications: g.defaultNotifications,
      }));
  } else {
    const raw = await fetchAll(
      "list the active gate approvals",
      (o) => Vsb_projectdefaultapprovalsesService.getAll(o),
      {
        select: GATE_SELECT,
        filter: and(
          eq("vsb_gateactive", true),
          project.countryId ? lookupEq("vsb_approvalscountry", project.countryId) : undefined,
          project.technology !== null ? eq("vsb_technologycode", project.technology) : undefined,
        ),
        orderBy: ["createdon asc"],
      },
    );
    rows = raw.map((x) => {
      const r = x as unknown as Raw;
      return {
        id: String(r["vsb_projectdefaultapprovalsid"] ?? ""),
        clusterStateId: str(r["_vsb_clusterstate_value"]),
        approvalMode: num(r["vsb_approvalmodecode"]),
        gateActive: r["vsb_gateactive"] === true,
        portfolioManagerId: str(r["_vsb_approvalparticipant1_value"]),
        defaultApprovals: str(r["vsb_defaultapprovals"]),
        defaultContributors: str(r["vsb_defaultcontributors"]),
        defaultNotifications: str(r["vsb_defaultnotifications"]),
      };
    });
  }
  const people = await getEntraPeople(rows.map((g) => g.portfolioManagerId).filter((x): x is string => Boolean(x)));
  return rows.map((g) => ({
    ...g,
    portfolioManagerMail: g.portfolioManagerId ? people.get(g.portfolioManagerId)?.mail || null : null,
  }));
}

/* ═════════════════════════════════════════════════════════════ the checklist ════ */

const CHECKLIST_SELECT = [
  CHECKLIST_COL.id, CHECKLIST_COL.name, CHECKLIST_COL.clusterState, CHECKLIST_COL.approvalChecklistState,
  CHECKLIST_COL.comments, CHECKLIST_COL.completionDate, CHECKLIST_COL.flowRunId, CHECKLIST_COL.flowApprovalId,
  CHECKLIST_COL.gateRelevance, CHECKLIST_COL.holdingTaskDescription, CHECKLIST_COL.isCompletionDate,
  CHECKLIST_COL.order, CHECKLIST_COL.projectDefaultChecklist, CHECKLIST_COL.taskState,
  "_modifiedby_value", "modifiedon",
];

const projectCluster = (projectId: string, clusterStateId: string) =>
  and(lookupEq("vsb_project", projectId), lookupEq("vsb_clusterstate", clusterStateId));

/**
 * `colProjectCheckList` (Y:2568-2638): `Filter('Project Checklists', Project = …, 'Cluster State' = …,
 * Status = Active)`, sorted by `Order`.
 */
export async function listClusterChecklist(projectId: string, clusterStateId: string): Promise<ChecklistRow[]> {
  const rows = await fetchAll(
    "list the cluster's checklist tasks",
    (o) => Vsb_projectchecklistsService.getAll(o),
    { select: CHECKLIST_SELECT, filter: and(projectCluster(projectId, clusterStateId), ACTIVE), orderBy: ["vsb_order asc"] },
  );
  return rows.map((r) => toChecklistRow(r as unknown as Raw));
}

/**
 * The materialisation guard's count (Y:2478-2486): `CountRows(Filter('Project Checklists', Project = …,
 * 'Cluster State' = …))` — rows of ANY status. One row answers "is it zero".
 */
export async function countClusterChecklistRows(projectId: string, clusterStateId: string): Promise<number> {
  const rows = await fetchPage(
    "check whether the cluster has checklist tasks",
    (o) => Vsb_projectchecklistsService.getAll(o),
    { select: [CHECKLIST_COL.id], filter: projectCluster(projectId, clusterStateId), top: 1 },
  );
  return rows.length;
}

/**
 * The templates to copy (Y:2500-2506): `'Project Default Checklists'` with `Status = Active`, the
 * selected cluster, and `'Associated Country And Technology'` of the project's country and technology.
 * The scope row is `findScopeCountryTechId` (Admin Gates Approvals). No To-Delete filter: the canvas
 * has none.
 */
export async function listClusterTemplates(
  project: Pick<ChecklistProject, "countryId" | "technology">,
  clusterStateId: string,
): Promise<DefaultChecklistTemplate[]> {
  if (!project.countryId || project.technology === null) return [];
  const scopeId = await findScopeCountryTechId(project.countryId, project.technology);
  if (!scopeId) return [];
  const rows = await fetchAll(
    "list the cluster's default checklist templates",
    (o) => Vsb_projectdefaultchecklistsesService.getAll(o),
    {
      select: [
        "vsb_projectdefaultchecklistsid", "vsb_name", "_vsb_clusterstate_value", "vsb_gaterelevance",
        "vsb_holdingtaskdescription", "vsb_iscompletiondate", "vsb_order",
      ],
      filter: and(
        ACTIVE,
        lookupEq("vsb_clusterstate", clusterStateId),
        lookupEq("vsb_associatedcountryandtechnology", scopeId),
      ),
      orderBy: ["vsb_order asc"],
    },
  );
  return rows.map((r) => toTemplate(r as unknown as Raw));
}

/**
 * `'Check List Default Approvals'` of the rows' templates (`listChecklistApprovals`, Admin Gates
 * Approvals), active AND inactive: the row icon and caption read the first row of any status, the
 * icon's visibility and the panel the first active one. The Portfolio Manager's mail comes from Entra.
 */
export async function listChecklistApprovalSettings(templateIds: readonly string[]): Promise<ChecklistApprovalSetting[]> {
  const rows = await listChecklistApprovals(templateIds);
  const people = await getEntraPeople(rows.map((r) => r.portfolioManagerId).filter((x): x is string => Boolean(x)));
  return rows.map((r) => ({
    id: r.id,
    projectDefaultChecklistId: r.projectDefaultChecklistId,
    approvalMode: r.approvalMode,
    gateActive: r.gateActive,
    portfolioManagerMail: r.portfolioManagerId ? people.get(r.portfolioManagerId)?.mail || null : null,
    defaultApprovers: r.defaultApprovers,
    defaultContributors: r.defaultContributors,
    defaultNotifications: r.defaultNotifications,
  }));
}

/* ═══════════════════════════════════════════════════════════════ the history ════ */

const NOTE_SELECT = [NOTE_COL.name, NOTE_COL.comment, NOTE_COL.note, NOTE_COL.noteType, NOTE_COL.createdOn, "_modifiedby_value"];

/**
 * `gal_CheckList_RightPanel_ChangeCluster_Form_Inputs_History.Items` (Y:4447-4468): the tracking's
 * `'Project State Tracking Notes'` (Cluster Transition) or the task's `'Project Checklist Tracking
 * Note'` (Checklist Completion), newest first.
 */
export async function listHistory(descriptor: HistoryQueryDescriptor): Promise<HistoryEntry[]> {
  const filter = `${descriptor.lookupColumn} eq ${guid(descriptor.lookupValue)}`;
  if (descriptor.entitySet === ES.projectStateTrackingNotes) {
    const rows = await fetchAll(
      "list the cluster transition history",
      (o) => Vsb_projectstatetrackingnotesService.getAll(o),
      { select: ["vsb_projectstatetrackingnoteid", ...NOTE_SELECT], filter, orderBy: [descriptor.orderBy] },
    );
    return rows.map((r) => toHistoryEntry("vsb_projectstatetrackingnoteid")(r as unknown as Raw));
  }
  const rows = await fetchAll(
    "list the checklist completion history",
    (o) => Vsb_projectchecklisttrackingnotesService.getAll(o),
    { select: ["vsb_projectchecklisttrackingnoteid", ...NOTE_SELECT], filter, orderBy: [descriptor.orderBy] },
  );
  return rows.map((r) => toHistoryEntry("vsb_projectchecklisttrackingnoteid")(r as unknown as Raw));
}

