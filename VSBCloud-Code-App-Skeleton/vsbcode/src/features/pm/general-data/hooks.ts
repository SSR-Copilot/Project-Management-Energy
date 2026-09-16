/**
 * Project General Data Screen — queries and mutations.
 *
 * Canvas screen: `Project General Data Screen` (PM app)
 *   311 controls · 7 438 lines of Power Fx · 88 substantive blocks · band XL
 *
 * Nothing here branches on data — every decision is a pure function in `rules.ts`.
 * This file only does I/O and sequencing.
 *
 * The canvas `OnVisible` fired nine `ClearCollect`s in sequence. Here they are
 * concurrent `useQuery`s with server-side filters, per CONVENTIONS rule 2: no table is
 * ever materialised in order to filter it.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, countryRepo, countryAreaRepo, projectStateRepo,
  shareholderEntityInProjectRepo, projectStateTrackingRepo, customChoiceValueRepo,
  entraIdRepo, generatorTypeInProjectRepo, type ProjectRow,
} from "@/data/repos";
import { qk } from "@/data/queryKeys";
import { ES, CHOICE, SELECT } from "@/data/entities";
import { dataClient } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, type Result, ok, err } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { cancelGateApproval } from "@/flows/flowClient";
import { useAppStore } from "@/store/appStore";
import { isBlank } from "@/domain/numeric";
import { technologyLabel } from "@/domain/technology";
import {
  PROJECT_COL, buildProjectPatch, planSaveCleanup, assertManagerSelected,
  type GeneralDataForm, type GeneralDataRefData, type ProjectSnapshot,
  type ProjectStateRef, type CountryRef, type ShareholdingEntity, type TrackingRow,
  type GeneratorRow, type SavePlan,
} from "./rules";

/* ───────────────────────────────────────────────────────────────────── mappers */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export function toSnapshot(r: ProjectRow | undefined): ProjectSnapshot | null {
  if (!r) return null;
  return {
    id: r.vsb_projectid,
    projectNumber: r.vsb_internalprojectid,
    internalProjectId: str(r[PROJECT_COL.internalProjectId]),
    originalProjectName: str(r["vsb_originalprojectname"]),
    approvalState: num(r[PROJECT_COL.approvalState]),
    statecode: num(r["statecode"]),
    clusterStateId: r._vsb_clusterstate_value,
    clusterStateName:
      str(r["_vsb_clusterstate_value@OData.Community.Display.V1.FormattedValue"]),
    clusterStateOrder: num(r["vsb_clusterstateorder"]),
    countryId: r._vsb_country_value,
    countryName: str(r["_vsb_country_value@OData.Community.Display.V1.FormattedValue"]),
    countryKey: str(r["vsb_countrykey"]),
    besitzerBusinessUnitId: str(r["_owningbusinessunit_value"]),
    startCluster: num(r[PROJECT_COL.startCluster]),
    shareOfFarmdown: num(r[PROJECT_COL.shareOfFarmdown]),
    isStandardShareOfFarmdown: bool(r[PROJECT_COL.isStandardShareOfFarmdown]),
    standardCostCreated: bool(r[PROJECT_COL.standardCostCreated]),
    projectStartDate: str(r[PROJECT_COL.projectStartDate]),
    feasibilityStudies: str(r[PROJECT_COL.feasibilityStudies]),
    projectDevelopmentStarted: str(r[PROJECT_COL.projectDevelopmentStarted]),
    applicationSubmitted: str(r[PROJECT_COL.applicationSubmitted]),
    legallyBindingPermits: str(r[PROJECT_COL.legallyBindingPermits]),
    fid: str(r[PROJECT_COL.fid]),
    construction: str(r[PROJECT_COL.construction]),
    cod: str(r[PROJECT_COL.cod]),
  };
}

/** The persisted project → the editable form. */
export function toForm(r: ProjectRow | undefined): GeneralDataForm {
  const s = toSnapshot(r);
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const numText = (v: unknown) => (typeof v === "number" ? String(v) : "");
  return {
    projectName: text(r?.vsb_name),
    shortName: text(r?.[PROJECT_COL.shortName]),
    projectType: str(r?.[PROJECT_COL.projectType]),
    managerEntraRowId: str(r?.["_vsb_projectmanager_value"]),
    // GUIDE p12/p14: the picker renders a chip with the person's name. Dataverse returns
    // the lookup's formatted value alongside the id (same pattern `toSnapshot` already
    // uses for country/cluster state) without it needing to be in `SELECT.projectFull`.
    managerName: str(r?.["_vsb_projectmanager_value@OData.Community.Display.V1.FormattedValue"]),
    deputyManagerEntraRowId: str(r?.["_vsb_deputyprojectmanager_value"]),
    deputyManagerName: str(
      r?.["_vsb_deputyprojectmanager_value@OData.Community.Display.V1.FormattedValue"],
    ),
    spvName: text(r?.[PROJECT_COL.spvName]),
    spvCompanyCode: numText(r?.[PROJECT_COL.spvCompanyCode]),
    spvLegalStructure: str(r?.[PROJECT_COL.spvLegalStructure]),
    countryId: s?.countryId ?? null,
    areaId: str(r?.["_vsb_countryarea_value"]),
    district: text(r?.[PROJECT_COL.district]),
    municipality: text(r?.[PROJECT_COL.municipality]),
    municipalityGermany:
      s?.countryName === "Germany" ? str(r?.[PROJECT_COL.municipality]) : null,
    municipalityFrance:
      s?.countryName === "France" ? str(r?.[PROJECT_COL.municipality]) : null,
    utilizationId: str(r?.["_vsb_utilization_value"]),
    terrainSize: numText(r?.[PROJECT_COL.terrainSize]),
    latitude: numText(r?.[PROJECT_COL.latitude]),
    longitude: numText(r?.[PROJECT_COL.longitude]),
    taxFactor: numText(r?.[PROJECT_COL.taxFactor]),
    // The form holds a LABEL — `isSubTechnologyVisible` compares it to "Hybrid" and the
    // Dropdown's options are label strings. `vsb_technology` is a choice, so reading the
    // column straight in put the raw option-set integer in the Dropdown.
    technology:
      technologyLabel(
        r?.vsb_technology,
        r?.["vsb_technology@OData.Community.Display.V1.FormattedValue"],
      ) || null,
    // GUIDE p10: a brand-new record already shows "Own Development" selected, not blank.
    developmentType: r
      ? num(r[PROJECT_COL.developmentType])
      : CHOICE.developmentType.ownDevelopment,
    startCluster: num(r?.[PROJECT_COL.startCluster]),
    acquisitionDate: str(r?.[PROJECT_COL.acquisitionDate]),
    acquisitionPrice: numText(r?.[PROJECT_COL.acquisitionPrice]),
  };
}

const toShareholder = (r: Record<string, unknown>): ShareholdingEntity => ({
  key: String(r["vsb_shareholderentityinprojectid"]),
  recordId: String(r["vsb_shareholderentityinprojectid"]),
  entityTypeValue: num(r["vsb_shareholderentitiytype"]),
  entityTypeName: str(
    r["vsb_shareholderentitiytype@OData.Community.Display.V1.FormattedValue"],
  ),
  customName: typeof r["vsb_customname"] === "string" ? r["vsb_customname"] : "",
  ownership: num(r["vsb_ownership"]) ?? 0,
});

const toProjectState = (r: Record<string, unknown>): ProjectStateRef => ({
  id: String(r["vsb_projectstateid"]),
  name: String(r["vsb_name"] ?? ""),
  order: num(r["vsb_order"]) ?? 0,
  isVisibleOnChecklist: r["vsb_isvisibleonchecklist"] === true,
  clusterDescription: str(r["vsb_clusterdescription"]),
});

const toTracking = (r: Record<string, unknown>): TrackingRow => ({
  id: String(r["vsb_projectstatetrackingid"]),
  clusterStateId: String(r["_vsb_clusterstate_value"] ?? ""),
  approvalClusterState: num(r["vsb_approvalclusterstate"]),
  flowRunId: str(r["vsb_flowrunid"]),
});

/* ───────────────────────────────────────────────────────────── reference data */

const REF_STALE = 10 * 60_000;

export function useGeneralDataRefData(projectId: string | undefined) {
  const env = useAppStore((s) => s.session.env);
  const user = useAppStore((s) => s.session.user);

  const countries = useQuery({
    queryKey: qk.ref.countries,
    // Country needs the two business-unit columns and the raw `Key` on top of the
    // shared projection, so it asks for them explicitly.
    queryFn: () => countryRepo.listAll({
      select: [
        "vsb_countryid", "vsb_name", "vsb_code", "vsb_key",
        "_vsb_besitzerunternehmenseinheit_value", "_vsb_businessunit_value",
      ],
      orderBy: [asc("vsb_name")],
    }),
    staleTime: REF_STALE,
  });

  /**
   * Rule 8 asks only "does this country have any areas?", so the query projects the
   * lookup column alone. `CountIf(Filter(CountryAreas, ...))` never reaches the client.
   */
  const areas = useQuery({
    queryKey: ["ref", "countryAreas"] as const,
    queryFn: () => countryAreaRepo.listAll({ orderBy: [asc("vsb_name")] }),
    staleTime: REF_STALE,
  });

  const projectStates = useQuery({
    queryKey: ["ref", "projectStates"] as const,
    queryFn: () => projectStateRepo.listAll({ orderBy: [asc("vsb_order")] }),
    staleTime: REF_STALE,
  });

  const utilizations = useQuery({
    queryKey: ["ref", "customChoiceValues", "utilization"] as const,
    queryFn: () => customChoiceValueRepo.listAll({
      filter: f.eq("vsb_category", "Utilization"),
      orderBy: [asc("vsb_name")],
    }),
    staleTime: REF_STALE,
  });

  const shareholders = useQuery({
    queryKey: qk.child("shareholderEntityInProjects", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => shareholderEntityInProjectRepo.byProject(projectId!),
  });

  const trackings = useQuery({
    queryKey: qk.child("projectStateTrackings", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: () => projectStateTrackingRepo.byProject(projectId!, {
      select: [
        "vsb_projectstatetrackingid", "_vsb_project_value", "_vsb_clusterstate_value",
        "vsb_approvalclusterstate", "vsb_flowrunid", "vsb_flowapprovalid",
      ],
    }),
  });

  const ref: GeneralDataRefData = useMemo(() => ({
    countries: (countries.data ?? []).map((c): CountryRef => {
      const row = c as unknown as Record<string, unknown>;
      return {
        id: c.vsb_countryid,
        name: c.vsb_name,
        key: str(row["vsb_key"]),
        besitzerBusinessUnitId: str(row["_vsb_besitzerunternehmenseinheit_value"]),
        businessUnitId: str(row["_vsb_businessunit_value"]),
      };
    }),
    countryIdsWithAreas: [...new Set((areas.data ?? []).map((a) => a._vsb_country_value))]
      .filter((id): id is string => Boolean(id)),
    projectStates: (projectStates.data ?? []).map(toProjectState),
    environmentName: env?.environmentName ?? "Dev",
    language: user?.language ?? "en-US",
  }), [countries.data, areas.data, projectStates.data, env?.environmentName, user?.language]);

  return {
    ref,
    areas: areas.data ?? [],
    utilizations: utilizations.data ?? [],
    shareholders: useMemo(() => (shareholders.data ?? []).map(toShareholder), [shareholders.data]),
    trackings: useMemo(() => (trackings.data ?? []).map(toTracking), [trackings.data]),
    isLoading:
      countries.isLoading || areas.isLoading || projectStates.isLoading
      || shareholders.isLoading || trackings.isLoading,
    isError: countries.isError || projectStates.isError,
  };
}

/* ──────────────────────────────────────────────────── the Entra people picker */

/**
 * Team rule 12 / General Data's two pickers: `Search(Filter('Microsoft Entra IDs',
 * enabled = Yes), Trim(SearchText), 'Display Name', 'Given Name', Surname, Mail)`.
 *
 * One hook, three call sites (Project Main, General Data, Team).
 */
export interface EntraPerson {
  /** `'A unique identifer for Microsoft Entra ID'` — the key the lookups are bound to. */
  rowId: string;
  entraId: string | null;
  displayName: string;
  mail: string | null;
}

export function useEntraSearch(search: string, enabled = true) {
  const q = search.trim();
  return useQuery({
    queryKey: ["entra", "search", q] as const,
    // Two characters is the smallest query worth a round trip; the canvas issued one per
    // keystroke from the first character.
    enabled: enabled && q.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<EntraPerson[]> => {
      const rows = await entraIdRepo.listAll({
        filter: f.and(
          f.eq("vsb_accountenabled", true),
          f.or(
            f.contains("vsb_displayname", q),
            f.contains("vsb_givenname", q),
            f.contains("vsb_surname", q),
            f.contains("vsb_mail", q),
          ),
        ),
        top: 25,
        orderBy: [asc("vsb_displayname")],
      });
      return rows.map((r) => ({
        rowId: String(r["vsb_microsoftentraidid"]),
        entraId: str(r["vsb_entraid"]),
        displayName: String(r["vsb_displayname"] ?? ""),
        mail: str(r["vsb_mail"]),
      }));
    },
  });
}

/* ─────────────────────────────────────────────────────── municipality lookups */

export interface MunicipalityRow {
  uid: string;
  municipality: string;
  state: string | null;
  tradetaxrate: string | null;
}

/**
 * Rule 12 — Germany filters the local-tax rows by `Trim(state) = <Area>.Name`; France
 * uses the same shape but is SUPPRESSED below three characters. Both are server-side
 * searches, not `Search()` over a client collection.
 */
export function useMunicipalitySearch(
  mode: "germany" | "france" | "text",
  search: string,
  areaName?: string | null,
) {
  const q = search.trim();
  const suppressed = mode === "france" && q.length < 3;
  return useQuery({
    queryKey: ["municipality", mode, areaName ?? "", q] as const,
    enabled: mode !== "text" && !suppressed && q.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MunicipalityRow[]> => {
      const entitySet = mode === "germany"
        ? ES.assumptionsLocalTaxGermanies
        : ES.assumptionsLocalTaxFrances;
      const page = await dataClient.list<Record<string, unknown>>(entitySet, {
        select: ["uid", "municipality", "state", "tradetaxrate"],
        filter: f.and(
          mode === "germany" && areaName ? f.eq("state", areaName) : undefined,
          f.contains("municipality", q),
        ),
        top: 50,
      });
      return page.rows.map((r) => ({
        uid: String(r["uid"] ?? ""),
        municipality: String(r["municipality"] ?? ""),
        state: str(r["state"]),
        tradetaxrate: r["tradetaxrate"] === null || r["tradetaxrate"] === undefined
          ? null : String(r["tradetaxrate"]),
      }));
    },
  });
}

/* ─────────────────────────────────────────────────────────────── the save call */

export interface SaveGeneralDataArgs {
  form: GeneralDataForm;
  ref: GeneralDataRefData;
  project: ProjectSnapshot | null;
  startClusterChanged: boolean;
  newStartClusterNo: number;
  trackings: TrackingRow[];
  shareholdersDirty: boolean;
  entities: ShareholdingEntity[];
  repriceGenerators: boolean;
  generators: GeneratorRow[];
  /** Rule 19 — existing shareholder rows the panel removed. */
  removedShareholderIds?: string[];
  /**
   * Rule 29 — the cluster-change panel's milestone payload
   * (`clearSkippedMilestones`). Merged into Patch #1 so the dates and the new start
   * cluster land in the same write, instead of the canvas's two sequential patches.
   */
  clusterMilestonePatch?: Record<string, unknown>;
}

export interface SaveGeneralDataOutcome {
  projectId: string;
  /** `colProcessingSteps` — the lines the canvas concatenated into one success Notify. */
  steps: string[];
  plan: SavePlan;
}

/**
 * The 463-line save, in the only shape it can honestly take.
 *
 * Two things MUST be sequential because each needs a server answer before the next value
 * exists; everything else is one batch:
 *   1. create-or-update `Projects`  (Dataverse assigns `Project ID` on create)
 *   2. re-read the row              (`Set(gbl..., LookUp(Projects, ...))`)
 *   3. `planSaveCleanup` → one batch of every remaining write
 *
 * The gate-approval cancellation runs between 2 and 3, before the tracking rebuild, and
 * is swallowed the way `IfError(..., false)` swallowed it — but logged as telemetry
 * rather than discarded.
 */
export async function saveGeneralData(
  args: SaveGeneralDataArgs,
): Promise<Result<SaveGeneralDataOutcome>> {
  const managerError = assertManagerSelected(args.form);
  if (managerError) {
    return err(toAppError({ status: 400, message: managerError }, "general-data/save"));
  }

  try {
    /* 1 — Patch #1 */
    const patch = {
      ...buildProjectPatch(args.form, args.ref, args.project),
      ...(args.clusterMilestonePatch ?? {}),
    };
    const projectId = args.project?.id
      ? (await projectFullRepo.update(args.project.id, patch), args.project.id)
      : await dataClient.create(ES.projects, patch);

    /* 2 — re-read so `Project ID` and the assigned business unit are known.
     *
     * The projection is this screen's own `PROJECT_COL`, not `projectFullRepo`'s default
     * `SELECT.projectFull`. General writes more columns than any other screen reads —
     * short name, SPV name and legal structure, development type, tax factor, the deputy
     * manager lookup — and a re-read on the narrower default silently returns them as
     * blank, which then renders as "the field I just filled in is empty again".
     * Revenues and Finance already re-read this way; this call site was the odd one out. */
    const saved = toSnapshot(
      await projectFullRepo.getById(projectId, [
        ...new Set([...SELECT.projectFull, ...Object.values(PROJECT_COL)]),
      ]),
    );
    if (!saved) {
      return err(toAppError(
        { status: 404, message: "The project was saved but could not be read back." },
        "general-data/save",
      ));
    }

    /* 3 — plan the cleanup */
    const plan = planSaveCleanup({
      saved,
      form: args.form,
      ref: args.ref,
      startClusterChanged: args.startClusterChanged,
      newStartClusterNo: args.newStartClusterNo,
      trackings: args.trackings,
      shareholdersDirty: args.shareholdersDirty,
      entities: args.entities,
      removedShareholderIds: args.removedShareholderIds,
      repriceGenerators: args.repriceGenerators,
      generators: args.generators,
    });

    /* 3a — the flow, before the tracking rebuild, failure-tolerant */
    for (const call of plan.flowCalls) {
      try {
        await cancelGateApproval({ stateTrackingId: call.stateTrackingId });
      } catch (e) {
        // IfError(..., false): a cancellation failure must not abort the save.
        trace("warning", "cancelGateApproval failed", {
          stateTrackingId: call.stateTrackingId,
          error: toAppError(e, "cancelGateApproval").message,
        });
      }
    }

    /* 3b — every remaining write, as ONE batch.
     *
     * `repo.saveMany` is exactly `dataClient.batch` with the entity set pinned; this plan
     * spans Projects, Project State Trackings, ShareholderEntityInProjects and
     * GeneratorTypeInProjects, so it goes through the shared primitive instead of four
     * per-repo calls. Still one bounded fan-out, never a write inside a loop. */
    await dataClient.batch(plan.writes);

    return ok({ projectId, steps: plan.log, plan });
  } catch (e) {
    return err(toAppError(e, "general-data/save"));
  }
}

export function useSaveGeneralData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SaveGeneralDataArgs) => {
      const res = await saveGeneralData(args);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (out) => {
      void qc.invalidateQueries({ queryKey: qk.projects.one(out.projectId) });
      void qc.invalidateQueries({ queryKey: qk.child("shareholderEntityInProjects", out.projectId) });
      void qc.invalidateQueries({ queryKey: qk.child("projectStateTrackings", out.projectId) });
    },
  });
}

/** Generators for the re-price step, loaded only when the plant cost is stale. */
export function useProjectGenerators(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.child("generatorTypeInProjects", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async (): Promise<GeneratorRow[]> => {
      const rows = await generatorTypeInProjectRepo.byProject(projectId!);
      return rows.map((r) => ({
        id: String(r["vsb_generatortypeinprojectid"]),
        generatorsCost: num(r["vsb_totalcosteur"]) ?? 0,
      }));
    },
  });
}

/** `IsBlank(gblRecordSelectedProject.'Project ID')` — the new-project flag. */
export const isNewProject = (p: ProjectSnapshot | null): boolean =>
  !p?.id || isBlank(p.projectNumber);
