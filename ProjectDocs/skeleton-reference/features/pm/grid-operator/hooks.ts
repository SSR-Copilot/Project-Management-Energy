/**
 * Grid Operator Screen — queries and mutations.
 *
 * Canvas screen: `Grid Operator Screen` (PM app)
 *   68 controls · 1 320 lines of Power Fx · 23 substantive blocks · band M
 *
 * `OnVisible` did `Set(gblRecordGridOperator, Blank()); Set(gblRecordGridOperator,
 * LookUp('Grid Operators', Project.Project = …))` — a blanking write followed by an
 * unprojected table scan, re-run on every navigation. Here it is one `useQuery` keyed on
 * the project, projected to the fifteen columns the screen reads, and `null` is a
 * first-class result rather than an error.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gridOperatorFullRepo, projectFullRepo, type ProjectRow } from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { ES } from "@/data/entities";
import { f } from "@/platform/odata";
import { toAppError, ok, err, type AppError, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  GRID_OPERATOR_COL, buildPayload, toForm, SAVE_ERROR_PREFIX,
  type GridOperatorForm, type GridOperatorProject, type GridOperatorRecord,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

/** `Projects` → the seven fields this screen reads. */
export function toGridOperatorProject(r: ProjectRow | undefined): GridOperatorProject | null {
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
    owningBusinessUnitId: str(r["_owningbusinessunit_value"]),
  };
}

/** `Grid Operators` row → the narrowed record. */
export function toGridOperatorRecord(
  r: Record<string, unknown> | undefined,
): GridOperatorRecord | null {
  if (!r) return null;
  return {
    id: String(r[GRID_OPERATOR_COL.id] ?? ""),
    operator: str(r[GRID_OPERATOR_COL.operator]),
    voltageLevel: num(r[GRID_OPERATOR_COL.voltageLevel]),
    expansionRequired: num(r[GRID_OPERATOR_COL.expansionRequired]),
    expansionDetails: str(r[GRID_OPERATOR_COL.expansionDetails]),
    substationConstructionRequired: num(r[GRID_OPERATOR_COL.substationConstructionRequired]),
    substationOperator: str(r[GRID_OPERATOR_COL.substationOperator]),
    lengthInternal: num(r[GRID_OPERATOR_COL.lengthInternal]),
    diameterInternal: num(r[GRID_OPERATOR_COL.diameterInternal]),
    lengthExternal: num(r[GRID_OPERATOR_COL.lengthExternal]),
    diameterExternal: num(r[GRID_OPERATOR_COL.diameterExternal]),
  };
}

/* ══════════════════════════════════════════════════════════════════ queries ════ */

export const gridOperatorKey = (projectId: string) => qk.child("gridOperator", projectId);

/**
 * Rule 1 — `LookUp('Grid Operators', Project.Project = gblRecordSelectedProject.Project)`.
 *
 * `$top=1` because the table holds at most one row per project, and the query resolves to
 * `null` when there is none. That is the NORMAL state for a project nobody has filled in;
 * the screen renders an empty form and the Save becomes a create.
 *
 * The filter column is `_vsb_projectid_value`, not `_vsb_project_value`: `Grid Operators`
 * names its project lookup `vsb_projectid`. (The spec's UT-GRIDOP-003 quotes
 * `_vsb_project_value`, which is the shape most other tables use.)
 */
export function useGridOperator(projectId: string | undefined) {
  const q = useQuery({
    queryKey: gridOperatorKey(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<GridOperatorRecord | null> => {
      const row = await gridOperatorFullRepo.getOne(
        f.guid(GRID_OPERATOR_COL.project, projectId!),
      );
      return toGridOperatorRecord(row);
    },
  });
  return {
    record: q.data ?? null,
    /** The bound values, i.e. what Cancel restores. */
    baseline: useMemo(() => toForm(q.data ?? null), [q.data]),
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error as AppError | null,
    refetch: () => void q.refetch(),
  };
}

/** The project record plus the user's language, for the numeric locale branch. */
export function useGridOperatorProject(projectId: string | undefined) {
  const user = useAppStore((s) => s.session.user);
  const q = useQuery({
    queryKey: qk.projects.one(projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!),
  });
  return {
    project: useMemo(() => toGridOperatorProject(q.data), [q.data]),
    language: user?.language ?? "en-US",
    isLoading: q.isLoading,
  };
}

/* ═════════════════════════════════════════════════════════════════ the save ════ */

export interface SaveGridOperatorArgs {
  project: GridOperatorProject;
  /** The current row, or `null` when the project has none yet. */
  record: GridOperatorRecord | null;
  form: GridOperatorForm;
  canEdit: boolean;
  language: string;
}

export interface SaveGridOperatorOutcome {
  projectId: string;
  gridOperatorId: string;
  created: boolean;
}

/**
 * Rule 10 — `Patch('Grid Operators', If(IsBlank(record), Defaults(...), record), {…})`,
 * i.e. an upsert. One request either way; the create additionally binds `Project` and
 * `Owning Business Unit`.
 *
 * Step 18 of the CheckList plan applies here too and the canvas did not do it: the
 * permission flag is checked BEFORE any request is issued, not only by the button's
 * DisplayMode. A disabled button is a UI convenience, not an authorisation boundary.
 */
export async function saveGridOperator(
  args: SaveGridOperatorArgs,
): Promise<Result<SaveGridOperatorOutcome>> {
  if (!args.canEdit) {
    return err(toAppError(
      { status: 403, message: "You do not have permission to edit this project." },
      "gridOperator/save",
    ));
  }
  if (!args.project.id) {
    return err(toAppError(
      { status: 400, message: "The project must be saved on General Data first." },
      "gridOperator/save",
    ));
  }
  const isCreate = args.record === null;
  const payload = buildPayload(args.form, args.project, {
    isCreate,
    language: args.language,
  });
  try {
    trace("information", "gridOperator/save", {
      projectId: args.project.id,
      mode: isCreate ? "create" : "update",
      columns: Object.keys(payload).length,
    });
    if (isCreate) {
      const id = await gridOperatorFullRepo.create(payload);
      return ok({ projectId: args.project.id, gridOperatorId: id, created: true });
    }
    await gridOperatorFullRepo.update(args.record!.id, payload);
    return ok({
      projectId: args.project.id,
      gridOperatorId: args.record!.id,
      created: false,
    });
  } catch (e) {
    // Rule 13 — the canvas concatenated FirstError.Source / .Message /
    // .Details.HttpResponse into one Notify string. The user-facing prefix survives; the
    // detail is structured telemetry on AppError.
    const appError = toAppError(e, "gridOperator/save");
    trace("error", SAVE_ERROR_PREFIX, {
      source: appError.source, status: appError.status, message: appError.message,
    });
    return err(appError);
  }
}

export function useSaveGridOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveGridOperatorArgs) => {
      const res = await saveGridOperator(args);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (out) => {
      // The row's own key, plus the project — `Grid Operators` feeds no project field,
      // but the left-nav completeness dots read the project record.
      void qc.invalidateQueries({ queryKey: gridOperatorKey(out.projectId) });
    },
  });
}

/** The entity set, exported so the integration tests can assert the request target. */
export const GRID_OPERATOR_ENTITY_SET = ES.gridOperators;
