/**
 * Project Planning Screen — queries and mutations.
 *
 * Canvas screen: `Project Planning Screen` (PM app)
 *   178 controls · 3 562 lines of Power Fx · 43 substantive blocks · band M
 *
 * `OnVisible` did seven sequential things: LookUp the planning row, create it if missing,
 * `Trace` a warning if the create failed, seed both acquisition sets, and
 * `ClearCollect` four collections. Here the read is one query per table, the create is a
 * get-or-create keyed on `isSuccess && data === undefined` (step 2, so it cannot fire on
 * every mount), and the acquisition seed is one `$batch` of only the MISSING rows.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, projectPlanningFullRepo, permitRepo, aquisitionStatusRepo,
  aquisitionTypeRepo, customChoiceValueFullRepo, type ProjectRow,
} from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { dataClient } from "@/platform/dataClient";
import { ES } from "@/data/entities";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type AppError, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  PLANNING_COL, PERMIT_COL, AQUISITION_COL, CUSTOM_CHOICE_FIELD,
  buildPlanningPayload, buildPlanningSeedPayload, buildPermitPayload,
  buildAquisitionPayload, buildAquisitionClearPayload, planAquisitionSeed,
  toPlanningForm, SAVE_ERROR_PREFIX,
  type PlanningForm, type PlanningProject, type PlanningRecord, type PermitRow,
  type PermitDraft, type AquisitionDraft, type AquisitionStatusRow, type AquisitionTypeRow,
  type CustomChoiceOption, type LlaType,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

const REF_STALE = 30 * 60_000;

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export function toPlanningProject(r: ProjectRow | undefined): PlanningProject | null {
  if (!r) return null;
  return {
    id: r.vsb_projectid,
    projectNumber: r.vsb_internalprojectid,
    endDate: str(r[PROJECT_COL.endDate]),
    projectStartDate: str(r[PROJECT_COL.projectStartDate]),
    totalCapacity: r.vsb_totalcapacity,
    netYieldP50: r.vsb_netyieldp50,
    clusterStateName:
      str(r["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"]),
    countryId: r._vsb_country_value,
    owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
    projectName: r.vsb_name,
    createdOn: str(r["createdon"]),
    modifiedOn: str(r["modifiedon"]),
  };
}

export function toPlanningRecord(
  r: Record<string, unknown> | undefined,
): PlanningRecord | null {
  if (!r) return null;
  return {
    id: String(r[PLANNING_COL.id] ?? ""),
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
    isHeightLimitation: r[PLANNING_COL.isHeightLimitation] === true,
    heightLimitation: num(r[PLANNING_COL.heightLimitation]),
    owningBusinessUnitId: str(r[PLANNING_COL.owningBusinessUnit]),
  };
}

export function toPermitRow(r: Record<string, unknown>): PermitRow {
  return {
    id: String(r[PERMIT_COL.id] ?? ""),
    name: str(r[PERMIT_COL.name]),
    submissionDate: str(r[PERMIT_COL.submissionDate]),
    submissionDateType: num(r[PERMIT_COL.submissionDateType]),
    approvalDate: str(r[PERMIT_COL.approvalDate]),
    approvalDateType: num(r[PERMIT_COL.approvalDateType]),
    // `RecordInfo(record, RecordInfo.EditPermission/DeletePermission)`. Dataverse answers
    // these per row; until the privilege annotations are requested the repository has no
    // opinion, and "no opinion" must not read as "allowed" for delete. See step 9 —
    // never re-implement the privilege rules client-side.
    canEdit: r["__canEdit"] !== false,
    canDelete: r["__canDelete"] !== false,
  };
}

export function toAquisitionRow(r: Record<string, unknown>): AquisitionStatusRow {
  return {
    id: String(r[AQUISITION_COL.id] ?? ""),
    typeId: str(r[AQUISITION_COL.type]),
    typeName: str(
      r[`${AQUISITION_COL.type}@OData.Community.Display.V1.FormattedValue`],
    ) ?? str(r[AQUISITION_COL.name]),
    typeOrder: num(r["__typeOrder"]),
    secured: num(r[AQUISITION_COL.secured]),
    required: num(r[AQUISITION_COL.required]),
    percentage: num(r[AQUISITION_COL.percentage]),
  };
}

/* ══════════════════════════════════════════════════════════════════ queries ════ */

export const planningKey = (projectId: string) => qk.child("projectPlanning", projectId);
export const permitsKey = (planningId: string) => qk.child("permits", planningId);
export const aquisitionKey = (projectId: string) => qk.child("aquisitionStatuses", projectId);

export function usePlanningProject(projectId: string | undefined) {
  const user = useAppStore((s) => s.session.user);
  const q = useQuery({
    queryKey: qk.projects.one(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!),
  });
  return {
    project: useMemo(() => toPlanningProject(q.data), [q.data]),
    language: user?.language ?? "en-US",
    isLoading: q.isLoading,
  };
}

/**
 * Rule 1 — get-or-create.
 *
 * `useQuery` returns `null` for a project with no planning row; the create fires once,
 * guarded by a ref so a re-render cannot re-issue it. The canvas's second
 * `If(IsBlank(...), Trace("Warning: Project Planning record was not loaded..."))` becomes
 * a real error surfaced by the mutation, not a trace nobody reads.
 */
export function useProjectPlanning(project: PlanningProject | null, canEdit: boolean) {
  const qc = useQueryClient();
  const seeded = useRef<string | null>(null);

  const q = useQuery({
    queryKey: planningKey(project?.id ?? "none"),
    enabled: Boolean(project?.id),
    queryFn: async (): Promise<PlanningRecord | null> => {
      const row = await projectPlanningFullRepo.getOne(
        f.guid(PLANNING_COL.project, project!.id),
      );
      return toPlanningRecord(row);
    },
  });

  const seed = useMutation({
    mutationFn: async (p: PlanningProject) => {
      const id = await projectPlanningFullRepo.create(buildPlanningSeedPayload(p));
      trace("information", "planning/seed created the Project Plannings row", {
        projectId: p.id, planningId: id,
      });
      return id;
    },
    onSuccess: () => {
      if (project?.id) void qc.invalidateQueries({ queryKey: planningKey(project.id) });
    },
  });

  useEffect(() => {
    if (!project?.id || !canEdit) return;
    if (!q.isSuccess || q.data !== null) return;
    if (seeded.current === project.id) return;
    seeded.current = project.id;
    seed.mutate(project);
    // `seed` is a stable mutation object; including it would re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, canEdit, q.isSuccess, q.data]);

  return {
    record: q.data ?? null,
    baseline: useMemo(() => toPlanningForm(q.data ?? null), [q.data]),
    isLoading: q.isLoading || seed.isPending,
    isError: q.isError || seed.isError,
    error: (q.error ?? seed.error) as AppError | null,
    /** True while the self-heal is creating the row — the form is not editable yet. */
    isSeeding: seed.isPending,
  };
}

/** The permit sub-grid. Scoped by the PLANNING row, not the project. */
export function usePermits(planningId: string | undefined) {
  const q = useQuery({
    queryKey: permitsKey(planningId ?? "none"),
    enabled: Boolean(planningId),
    queryFn: async (): Promise<PermitRow[]> => {
      const rows = await permitRepo.listAll({
        filter: f.guid(PERMIT_COL.projectPlanning, planningId!),
        orderBy: [asc(PERMIT_COL.submissionDate)],
      });
      return rows.map(toPermitRow);
    },
  });
  return { permits: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** `Aquisition Types` — a reference table, so a long `staleTime`. */
export function useAquisitionTypes() {
  const q = useQuery({
    queryKey: ["ref", "aquisitionTypes"] as const,
    staleTime: REF_STALE,
    queryFn: async (): Promise<AquisitionTypeRow[]> => {
      const rows = await aquisitionTypeRepo.listAll({ orderBy: [asc("vsb_order")] });
      return rows.map((r) => ({
        id: String(r["vsb_aquisitiontypeid"] ?? ""),
        name: str(r["vsb_name"]),
        type: num(r["vsb_type"]),
        order: num(r["vsb_order"]),
      }));
    },
  });
  return { types: q.data ?? [], isLoading: q.isLoading };
}

/**
 * The project's acquisition rows, joined to their type so both galleries can sort by the
 * TYPE's order (rule 3) without an N+1.
 *
 * The canvas kept two collections; one query key serves both galleries and the split is a
 * client-side partition on the type, which is free once the join is done.
 */
export function useAquisitionStatuses(projectId: string | undefined) {
  const { types } = useAquisitionTypes();
  const q = useQuery({
    queryKey: aquisitionKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<Record<string, unknown>[]> =>
      aquisitionStatusRepo.listAll({ filter: f.guid(AQUISITION_COL.project, projectId!) }),
  });

  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const rows = useMemo(() => (q.data ?? []).map((r) => {
    const typeId = str(r[AQUISITION_COL.type]);
    const type = typeId ? byId.get(typeId) : undefined;
    return {
      ...toAquisitionRow({
        ...r,
        __typeOrder: type?.order ?? null,
      }),
      typeName: type?.name
        ?? str(r[`${AQUISITION_COL.type}@OData.Community.Display.V1.FormattedValue`]),
    };
  }), [q.data, byId]);

  const forType = (lla: LlaType, typeValue: number): AquisitionStatusRow[] => {
    void lla;
    return rows.filter((r) => (r.typeId ? byId.get(r.typeId)?.type : null) === typeValue);
  };

  return {
    rows,
    forType,
    types,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * Rule 8's picker — one server-filtered query per field name.
 *
 * `$filter=vsb_fieldname eq '…' and (_vsb_country_value eq null or _vsb_country_value eq
 * {id})` and `$orderby=vsb_order`. The canvas pulled the whole table into
 * `colCustomChoiceValues` on app start and filtered client-side.
 */
export function useCustomChoiceValues(
  fieldName: string,
  projectCountryId: string | null,
) {
  const q = useQuery({
    queryKey: ["ref", "customChoiceValues", fieldName, projectCountryId ?? ""] as const,
    staleTime: REF_STALE,
    queryFn: async (): Promise<CustomChoiceOption[]> => {
      const countryClause = projectCountryId
        ? f.or(
            f.isNull("_vsb_country_value"),
            f.guid("_vsb_country_value", projectCountryId),
          )
        : undefined;
      const rows = await customChoiceValueFullRepo.listAll({
        filter: f.and(f.eq("vsb_fieldname", fieldName), countryClause),
        orderBy: [asc("vsb_order")],
      });
      return rows.map((r) => ({
        id: r.vsb_customchoicevalueid,
        label: r.vsb_value ?? "",
        order: r.vsb_order,
        countryId: r._vsb_country_value,
      }));
    },
  });
  return { options: q.data ?? [], isLoading: q.isLoading };
}

export const useLegalPlanningBasisOptions = (countryId: string | null) =>
  useCustomChoiceValues(CUSTOM_CHOICE_FIELD.legalPlanningBasis, countryId);

export const usePermitProcedureOptions = (countryId: string | null) =>
  useCustomChoiceValues(CUSTOM_CHOICE_FIELD.permitProcedure, countryId);

/* ═══════════════════════════════════════════════════════════ the acquisition seed ════ */

export interface SeedAquisitionArgs {
  project: PlanningProject;
  types: AquisitionTypeRow[];
  existing: AquisitionStatusRow[];
  canEdit: boolean;
}

/**
 * Rule 2 — one `$batch` of creates for the MISSING types only, replacing the source's
 * two duplicated `ForAll(colTypes, Patch('Aquisition Statuses', Defaults(...), …))` loops.
 */
export async function seedAquisitionStatuses(
  args: SeedAquisitionArgs,
): Promise<Result<{ created: number }>> {
  if (!args.canEdit) return ok({ created: 0 });
  const plan = planAquisitionSeed(args.types, args.existing, {
    projectId: args.project.id,
    owningBusinessUnitId: args.project.owningBusinessUnitId,
  });
  if (plan.length === 0) return ok({ created: 0 });
  try {
    await aquisitionStatusRepo.saveMany(plan.map((p) => ({ op: "create", data: p.data })));
    trace("information", "planning/aquisition seed", {
      projectId: args.project.id, created: plan.length,
    });
    return ok({ created: plan.length });
  } catch (e) {
    return err(toAppError(e, "planning/aquisitionSeed"));
  }
}

export function useAquisitionSeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SeedAquisitionArgs) => {
      const res = await seedAquisitionStatuses(args);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (out, args) => {
      if (out.created > 0) {
        void qc.invalidateQueries({ queryKey: aquisitionKey(args.project.id) });
      }
    },
  });
}

/* ═════════════════════════════════════════════════════════════════ the saves ════ */

export interface SavePlanningArgs {
  project: PlanningProject;
  record: PlanningRecord | null;
  form: PlanningForm;
  canEdit: boolean;
  language: string;
}

/** Rule 18's surviving half — the single `Project Plannings` patch (step 13). */
export async function savePlanning(
  args: SavePlanningArgs,
): Promise<Result<{ planningId: string; created: boolean }>> {
  if (!args.canEdit) {
    return err(toAppError(
      { status: 403, message: "You do not have permission to edit this project." },
      "planning/save",
    ));
  }
  const isCreate = args.record === null;
  const payload = buildPlanningPayload(args.form, args.project, {
    isCreate, language: args.language,
  });
  try {
    if (isCreate) {
      const id = await projectPlanningFullRepo.create(payload);
      return ok({ planningId: id, created: true });
    }
    await projectPlanningFullRepo.update(args.record!.id, payload);
    return ok({ planningId: args.record!.id, created: false });
  } catch (e) {
    const appError = toAppError(e, "planning/save");
    trace("error", SAVE_ERROR_PREFIX, {
      source: appError.source, status: appError.status, message: appError.message,
    });
    return err(appError);
  }
}

export function useSavePlanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SavePlanningArgs) => {
      const res = await savePlanning(args);
      if (!res.ok) throw res.error;
      return { ...res.value, projectId: args.project.id };
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: planningKey(out.projectId) });
    },
  });
}

export interface SavePermitArgs {
  planningId: string;
  owningBusinessUnitId: string | null;
  draft: PermitDraft;
  /** `null` → create, otherwise the row being edited (rule 16's upsert). */
  selected: PermitRow | null;
  canEdit: boolean;
}

/** Rule 16 — `Patch(Permits, If(IsBlank(selected), Defaults(Permits), selected), {…})`. */
export function useSavePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SavePermitArgs) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "planning/savePermit",
        );
      }
      const isCreate = args.selected === null;
      const payload = buildPermitPayload(
        args.draft, args.planningId, args.owningBusinessUnitId, { isCreate },
      );
      if (isCreate) {
        const id = await permitRepo.create(payload);
        return { permitId: id, created: true, planningId: args.planningId };
      }
      await permitRepo.update(args.selected!.id, payload);
      return { permitId: args.selected!.id, created: false, planningId: args.planningId };
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: permitsKey(out.planningId) });
    },
  });
}

export function useDeletePermit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { permit: PermitRow; planningId: string; canEdit: boolean }) => {
      if (!args.canEdit || !args.permit.canDelete) {
        throw toAppError(
          { status: 403, message: "You do not have permission to delete this permit." },
          "planning/deletePermit",
        );
      }
      await permitRepo.remove(args.permit.id);
      return { planningId: args.planningId };
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: permitsKey(out.planningId) });
    },
  });
}

export interface SaveAquisitionArgs {
  projectId: string;
  owningBusinessUnitId: string | null;
  row: AquisitionStatusRow;
  draft: AquisitionDraft;
  canEdit: boolean;
  language: string;
}

/**
 * Rule 13 — the acquisition save. One code path for both LLA types; the In-rem/In-personam
 * divergence (ambiguity 10) does not survive because the percentage is derived from the
 * numbers, never re-parsed from the rendered `"N/A"`.
 */
export function useSaveAquisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveAquisitionArgs) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "planning/saveAquisition",
        );
      }
      const payload = buildAquisitionPayload(args.draft, {
        projectId: args.projectId,
        typeId: args.row.typeId ?? "",
        owningBusinessUnitId: args.owningBusinessUnitId,
        isCreate: false,
        language: args.language,
      });
      await aquisitionStatusRepo.update(args.row.id, payload);
      return { projectId: args.projectId };
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: aquisitionKey(out.projectId) });
    },
  });
}

/** Rule 14's honest half — the explicit Clear (step 12). */
export function useClearAquisition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      projectId: string; row: AquisitionStatusRow; canEdit: boolean;
    }) => {
      if (!args.canEdit) {
        throw toAppError(
          { status: 403, message: "You do not have permission to edit this project." },
          "planning/clearAquisition",
        );
      }
      await aquisitionStatusRepo.update(args.row.id, buildAquisitionClearPayload());
      return { projectId: args.projectId };
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: aquisitionKey(out.projectId) });
    },
  });
}

/** The entity sets, exported so integration tests can name the request targets. */
export const PLANNING_ENTITY_SETS = {
  planning: ES.projectPlannings,
  permits: ES.permits,
  aquisitionStatuses: ES.aquisitionStatuses,
  aquisitionTypes: ES.aquisitionTypes,
  customChoiceValues: ES.customChoiceValues,
} as const;

/** The `$filter` rule 8 issues — asserted directly by UT-PLAN-011/012. */
export function customChoiceFilter(
  fieldName: string,
  projectCountryId: string | null,
): string {
  const countryClause = projectCountryId
    ? f.or(f.isNull("_vsb_country_value"), f.guid("_vsb_country_value", projectCountryId))
    : undefined;
  return f.and(f.eq("vsb_fieldname", fieldName), countryClause) ?? "";
}

/** The `$orderby` rule 3 issues for both acquisition galleries. */
export const AQUISITION_ORDER_BY = asc("vsb_AquisitionStatusType/vsb_order");

/** Used by the tests to prove the seed goes out as one batch, not N creates. */
export const aquisitionBatchClient = dataClient;
