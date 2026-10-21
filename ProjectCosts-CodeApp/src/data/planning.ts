/**
 * Project Planning — the Dataverse reads behind `features/pm/planning` (connected 20 Oct 2026, D31).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Three tables
 * were registered for this screen with `pac code add-data-source`, one at a time (70 → 73):
 * `vsb_permit`, `vsb_aquisitionstatus` and `vsb_aquisitiontype`. `vsb_projectplanning` (D27) and
 * `vsb_customchoicevalue` (D25) were already registered. `loadProjectPlanning` in `data/generators.ts`
 * reads only the height columns, so this screen has its own full read.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_projectplanningsService } from "@/generated/services/Vsb_projectplanningsService";
import { Vsb_permitsService } from "@/generated/services/Vsb_permitsService";
import { Vsb_aquisitionstatusesService } from "@/generated/services/Vsb_aquisitionstatusesService";
import { Vsb_aquisitiontypesService } from "@/generated/services/Vsb_aquisitiontypesService";
import { Vsb_customchoicevaluesService } from "@/generated/services/Vsb_customchoicevaluesService";
import {
  AQUISITION_COL, AQUISITION_TYPE_COL, LLA_TYPE_VALUE, PERMIT_COL, PLANNING_COL, PROJECT_COL,
  type AquisitionStatusRow, type AquisitionTypeRow, type CustomChoiceOption, type PermitRow,
  type PlanningProject, type PlanningRecord,
} from "@/features/pm/planning/rules";
import { fetchAll, fetchPage } from "./client";
import { and, eq, guid, isNull, lookupEq, numberOf, or } from "./odata";

type Raw = Record<string, unknown>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const formatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;
const ymd = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

const PROJECT_SELECT = [
  PROJECT_COL.id, PROJECT_COL.projectNumber, PROJECT_COL.projectName, PROJECT_COL.endDate,
  PROJECT_COL.projectStartDate, PROJECT_COL.totalCapacity, PROJECT_COL.netYieldP50,
  PROJECT_COL.clusterState, PROJECT_COL.country, PROJECT_COL.owningBusinessUnit,
];

/** `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (`OnVisible`, Y:52-58). */
export async function loadPlanningProject(projectId: string): Promise<PlanningProject | null> {
  const r = raw(await fetchPage(
    "load the project",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
  ))[0];
  if (!r) return null;
  return {
    id: String(r[PROJECT_COL.id]),
    projectNumber: str(r[PROJECT_COL.projectNumber]),
    projectName: str(r[PROJECT_COL.projectName]),
    endDate: ymd(r[PROJECT_COL.endDate]),
    projectStartDate: ymd(r[PROJECT_COL.projectStartDate]),
    totalCapacity: num(r[PROJECT_COL.totalCapacity]),
    netYieldP50: num(r[PROJECT_COL.netYieldP50]),
    clusterStateName: str(r[formatted(PROJECT_COL.clusterState)]),
    countryId: str(r[PROJECT_COL.country]),
    owningBusinessUnitId: str(r[PROJECT_COL.owningBusinessUnit]),
  };
}

const PLANNING_SELECT = [
  PLANNING_COL.id, PLANNING_COL.cooperation, PLANNING_COL.cooperationPartner, PLANNING_COL.cooperationDetails,
  PLANNING_COL.legalPlanning, PLANNING_COL.planningBasisCategory, PLANNING_COL.permitProcedure,
  PLANNING_COL.planningBasisDetails, PLANNING_COL.repowering, PLANNING_COL.securedAccess,
  PLANNING_COL.repoweringDetails, PLANNING_COL.isHeightLimitation, PLANNING_COL.heightLimitation,
  PLANNING_COL.owningBusinessUnit,
];

/** `LookUp('Project Plannings', Project.Project = gblRecordSelectedProject.Project)` (Y:80-86). */
export async function loadProjectPlanning(projectId: string): Promise<PlanningRecord | null> {
  const r = raw(await fetchPage(
    "load the project planning",
    (o) => Vsb_projectplanningsService.getAll(o),
    { select: PLANNING_SELECT, filter: lookupEq("vsb_project", projectId), top: 1 },
  ))[0];
  if (!r) return null;
  return {
    id: String(r[PLANNING_COL.id]),
    cooperation: num(r[PLANNING_COL.cooperation]),
    cooperationPartner: str(r[PLANNING_COL.cooperationPartner]),
    cooperationDetails: str(r[PLANNING_COL.cooperationDetails]),
    legalPlanningId: str(r[PLANNING_COL.legalPlanning]),
    planningBasisCategory: num(r[PLANNING_COL.planningBasisCategory]),
    permitProcedureId: str(r[PLANNING_COL.permitProcedure]),
    planningBasisDetails: str(r[PLANNING_COL.planningBasisDetails]),
    repowering: num(r[PLANNING_COL.repowering]),
    securedAccess: str(r[PLANNING_COL.securedAccess]),
    repoweringDetails: str(r[PLANNING_COL.repoweringDetails]),
    // `If(IsBlank('Is Height Limitation For WTG'), false, …)` (Y:1532).
    isHeightLimitation: r[PLANNING_COL.isHeightLimitation] === true,
    heightLimitation: num(r[PLANNING_COL.heightLimitation]),
    owningBusinessUnitId: str(r[PLANNING_COL.owningBusinessUnit]),
  };
}

/**
 * `Filter(Permits, 'Project Planning'.'Project Planning' = gblRecordProjectPlanning.'Project Planning')`
 * (Y:131-137) — no sort, as in the canvas. `RecordInfo` has no SDK equivalent: Edit and Delete
 * pass and Dataverse decides (D1).
 */
export async function listPermits(planningId: string): Promise<PermitRow[]> {
  const rows = raw(await fetchAll(
    "load the permits",
    (o) => Vsb_permitsService.getAll(o),
    {
      select: [PERMIT_COL.id, PERMIT_COL.name, PERMIT_COL.submissionDate, PERMIT_COL.submissionDateType,
        PERMIT_COL.approvalDate, PERMIT_COL.approvalDateType],
      filter: lookupEq("vsb_projectplanning", planningId),
    },
  ));
  return rows.map((r) => ({
    id: String(r[PERMIT_COL.id]),
    name: str(r[PERMIT_COL.name]),
    submissionDate: ymd(r[PERMIT_COL.submissionDate]),
    submissionDateType: num(r[PERMIT_COL.submissionDateType]),
    approvalDate: ymd(r[PERMIT_COL.approvalDate]),
    approvalDateType: num(r[PERMIT_COL.approvalDateType]),
    canEdit: true,
    canDelete: true,
  }));
}

/**
 * `Sort(Filter('Aquisition Types', Type = UnderLaw / InRem), Order)` (Y:146-167) — both kinds in
 * one read.
 */
export async function listAquisitionTypes(): Promise<AquisitionTypeRow[]> {
  const rows = raw(await fetchAll(
    "load the acquisition types",
    (o) => Vsb_aquisitiontypesService.getAll(o),
    {
      select: [AQUISITION_TYPE_COL.id, AQUISITION_TYPE_COL.statusName, AQUISITION_TYPE_COL.type, AQUISITION_TYPE_COL.order],
      filter: or(eq(AQUISITION_TYPE_COL.type, LLA_TYPE_VALUE.personam), eq(AQUISITION_TYPE_COL.type, LLA_TYPE_VALUE.rem)),
      orderBy: [`${AQUISITION_TYPE_COL.order} asc`],
    },
  ));
  return rows.map((r) => ({
    id: String(r[AQUISITION_TYPE_COL.id]),
    statusName: str(r[AQUISITION_TYPE_COL.statusName]),
    type: num(r[AQUISITION_TYPE_COL.type]),
    order: num(r[AQUISITION_TYPE_COL.order]),
  }));
}

/**
 * `Filter('Aquisition Statuses', Project.Project = …, 'Aquisition Status Type'.Type = …)` (Y:168-203).
 * The type's Status Name, Order and kind come from `types` (read once); a row whose type is of
 * neither kind is in neither canvas gallery and is dropped here too.
 */
export async function listAquisitionStatuses(
  projectId: string, types: readonly AquisitionTypeRow[],
): Promise<AquisitionStatusRow[]> {
  const rows = raw(await fetchAll(
    "load the acquisition statuses",
    (o) => Vsb_aquisitionstatusesService.getAll(o),
    {
      select: [AQUISITION_COL.id, AQUISITION_COL.type, AQUISITION_COL.secured, AQUISITION_COL.required, AQUISITION_COL.percentage],
      filter: lookupEq("vsb_projectid", projectId),
    },
  ));
  const byId = new Map(types.map((t) => [t.id.toLowerCase(), t]));
  return rows.flatMap((r) => {
    const typeId = str(r[AQUISITION_COL.type]);
    const t = typeId ? byId.get(typeId.toLowerCase()) : undefined;
    if (!t) return [];
    return [{
      id: String(r[AQUISITION_COL.id]),
      typeId: t.id,
      typeName: t.statusName,
      typeOrder: t.order,
      typeKind: t.type,
      secured: num(r[AQUISITION_COL.secured]),
      required: num(r[AQUISITION_COL.required]),
      percentage: num(r[AQUISITION_COL.percentage]),
    }];
  });
}

/**
 * The two pickers' `Items` (Y:1051-1068, 1196-1213): `Custom Choice Values` with that Field Name,
 * country-neutral or the project's country, by `Order`. With no project country the canvas offers
 * every row, so the country clause is left out then.
 */
export async function listCustomChoiceValues(fieldName: string, countryId: string | null): Promise<CustomChoiceOption[]> {
  const rows = raw(await fetchAll(
    "load the planning choices",
    (o) => Vsb_customchoicevaluesService.getAll(o),
    {
      select: ["vsb_customchoicevalueid", "vsb_value", "vsb_order", "_vsb_country_value"],
      filter: and(eq("vsb_fieldname", fieldName), countryId ? or(isNull("_vsb_country_value"), lookupEq("vsb_country", countryId)) : undefined),
      orderBy: ["vsb_order asc"],
    },
  ));
  return rows.map((r) => ({
    id: String(r["vsb_customchoicevalueid"]),
    label: str(r["vsb_value"]) ?? "",
    order: num(r["vsb_order"]),
    countryId: str(r["_vsb_country_value"]),
  }));
}
