/**
 * Project Production Screen — queries and mutations.
 *
 * Canvas screen: `Project Production Screen` (PM app)
 *   299 controls · 9 080 lines of Power Fx · 96 substantive blocks · band XL
 *
 * `OnVisible` opened with a `Concurrent(...)` of the Fabric reads plus six
 * `ClearCollect`s; the save path ended by `Select`ing a hidden 1 104-line button. Here
 * the reads are filtered queries and that button is `useRecalculateProject()`, whose body
 * is the pure builders in `rules.ts` plus one batch.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `btn_Load_StandardContracts_For_Project` and
 *    `btn_Seasonality_NegativePrice_Reset_Hidden` — hidden buttons used as subroutines.
 *  - `ForAll(colNegativePrices, Patch('PV Negative Prices', …))` — 15 round-trips per
 *    save; now one diffed batch (`planNegativePriceWrites`).
 *  - The revenue-sync block, copied four times; one call site each for save, delete,
 *    activate and deactivate.
 *  - `Set(gblRecordSelectedProject, Patch(Projects, …))` after every write.
 *
 * PERMISSIONS — every mutation path takes `canEdit` from `useProjectContext()` and refuses
 * with a 403 `AppError` before it issues anything, exactly as `saveGridOperator` does. The
 * four write paths (`saveEnergyYield`, `deleteEnergyYield`, `setYieldStatus`,
 * `recalculateProject`) are plain `Result`-returning functions for that reason: the guard is
 * unit-testable without rendering, and the `use*` hooks are thin wrappers over them.
 *
 * FLOW NOTE — no flow is called from this screen. `SynchroniseRecalculationCapexStandardCost`
 * is commented out in the canvas and absent from the solution export; see the note at the
 * top of `rules.ts`. `markForCapexRecalculation` writes the four flags instead, in one
 * PATCH, and does not wait for the server-side consumer.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, energyYieldFullRepo, seasonalityRepo, negativePriceRepo,
  projectRevenueNegativePriceRepo, opexLandLeaseAssumptionRepo, countryInflationProfileRepo,
  opexSubaccountRepo, assumptionsRevenuesRepo, generatorInProjectFullRepo,
  generatorTypeInProjectFullRepo, deviceTypeInProjectRepo, landLeaseCostFullRepo,
  landLeasePeriodRepo, opexProjectCostFullRepo, landLeaseAllocationRepo,
  type ProjectRow,
} from "@/data/repos";
import {
  ES_PLANT, ES_PRODUCTION, CHOICE_PRODUCTION, OANDM_SUBACCOUNT_NAME,
} from "@/data/entities";
import { qk } from "@/data/queryKeys";
import { type WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, ok, err, type AppError, type Result } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";
import {
  YIELD_COL, SEASONALITY_COL, NEGATIVE_PRICE_COL, REVENUE_COL, PROJECT_YIELD_COL,
  PRODUCTION_LOOKUP,
  parseFabricNumber, buildSeasonalityRows, deserialiseStandardValuesJson, seasonalityFields,
  buildNegativePriceRows, planNegativePriceWrites, negativePriceFields,
  syncRevenueNegativePrices, supersededInternalYields, projectYieldTotals,
  projectYieldFields, shouldGenerate, buildLandLeaseContracts, buildOpexContracts,
  markForCapexRecalculationFields, inflationStartYear, deriveYieldFields, radioFields,
  MONTH_NAMES, SAVE_ERROR_PREFIX,
  type ProductionProject, type EnergyYieldRow, type SeasonalityRow, type NegativePriceRow,
  type RevenueRow, type StandardSeasonalityRow, type StandardNegativePriceRow,
  type StandardAssumption, type Technology, type YieldAllocation, type YieldFormInput,
  type AllocationInputMode, type LossesInputMode, type UncertaintyInputMode,
} from "./rules";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const bool = (v: unknown): boolean => v === true || v === 1;
const state = (v: unknown): number => (typeof v === "number" ? v : 0);

const REF_STALE = 30 * 60_000;

/* ══════════════════════════════════════════════════════════════════ mapping ════ */

export function toProductionProject(r: ProjectRow | undefined): ProductionProject | null {
  if (!r) return null;
  return {
    id: r.vsb_projectid,
    projectIdText: str(r[PROJECT_YIELD_COL.projectIdText]),
    projectName: str(r[PROJECT_YIELD_COL.projectName]),
    countryId: r._vsb_country_value,
    technology: num(r[PROJECT_YIELD_COL.technology]),
    totalCapacity: r.vsb_totalcapacity,
    endDate: str(r[PROJECT_YIELD_COL.endDate]),
    cod: str(r[PROJECT_YIELD_COL.cod]),
    netYieldP50: num(r[PROJECT_YIELD_COL.netYieldP50]),
    standardCostCreated: bool(r[PROJECT_YIELD_COL.standardCostCreated]),
    owningBusinessUnitId: str(r[PROJECT_YIELD_COL.owningBusinessUnit]),
  };
}

export function toEnergyYieldRow(r: Record<string, unknown>): EnergyYieldRow {
  return {
    id: String(r[YIELD_COL.id] ?? ""),
    description: str(r[YIELD_COL.description]),
    type: num(r[YIELD_COL.type]),
    assessment: num(r[YIELD_COL.assessment]),
    allocation: num(r[YIELD_COL.allocation]),
    windSpeed: num(r[YIELD_COL.windSpeed]),
    irradiation: num(r[YIELD_COL.irradiation]),
    grossYield: num(r[YIELD_COL.grossYield]),
    totalLosses: num(r[YIELD_COL.totalLosses]),
    netYieldP50: num(r[YIELD_COL.netYieldP50]),
    uncertainty: num(r[YIELD_COL.uncertainty]),
    netYieldP75: num(r[YIELD_COL.netYieldP75]),
    netYieldP90: num(r[YIELD_COL.netYieldP90]),
    considerSeasonality: bool(r[YIELD_COL.considerSeasonality]),
    considerNegativePrices: bool(r[YIELD_COL.considerNegativePrices]),
    status: state(r["statecode"]),
  };
}

export function toStandardAssumption(r: Record<string, unknown>): StandardAssumption {
  return {
    id: String(r["vsb_opexlandleasestandardassumptionsid"] ?? ""),
    name: str(r["vsb_name"]),
    description: str(r["vsb_description"]),
    period: num(r["vsb_period"]),
    typeOfContract: num(r["vsb_typeofcontract"]),
    landLeaseSubaccountId: str(r["_vsb_landleasesubaccount_value"]),
    landLeaseSubaccountName: str(
      r["_vsb_landleasesubaccount_value@OData.Community.Display.V1.FormattedValue"],
    ),
    opexSubaccountId: str(r["_vsb_opexsubaccount_value"]),
    currencyId: str(r["_vsb_currency_value"]),
    secured: bool(r["vsb_secured"]),
    allWtgAllocated: bool(r["vsb_allwtgallocated"]),
    fixCosts: num(r["vsb_fixcosts"]),
    ofRevenues: num(r["vsb_ofrevenues"]),
    eurMw: num(r["vsb_eurmw"]),
    eurMwh: num(r["vsb_eurmwh"]),
    eurWtg: num(r["vsb_eurwtg"]),
    aggregation: num(r["vsb_aggregation"]),
    durationInYears: num(r["vsb_durationinyears"]),
    durationInMonths: num(r["vsb_durationinmonths"]),
    distributionFrequency: num(r["vsb_distributionfrequency"]),
    amountOneTimePayment: num(r["vsb_amountonetimepayment"]),
    amountOneTimePayment2: num(r["vsb_amountonetimepayment2"]),
    amountOneTimePayment3: num(r["vsb_amountonetimepayment3"]),
    dueDateOneTimePayment: str(r["vsb_duedateonetimepayment"]),
    dueDateOneTimePayment2: str(r["vsb_duedateonetimepayment2"]),
    dueDateOneTimePayment3: str(r["vsb_duedateonetimepayment3"]),
    useInflationProfile: bool(r["vsb_useinflationprofile"]),
    useCountryInflationProfile: bool(r["vsb_usecountryinflationprofile"]),
    inflationProfile: num(r["vsb_inflationprofile"]),
    inflationCountryArea: str(r["vsb_inflationcountryarea"]),
    alignWithProjectDuration: bool(r["vsb_alignwithprojectduration"]),
    externalContract: bool(r["vsb_externalcontract"]),
    threshold: bool(r["vsb_threshold"]),
    thresholdType: num(r["vsb_thresholdtype"]),
    thresholdIndividual: num(r["vsb_thresholdindividual"]),
  };
}

/* ═══════════════════════════════════════════════════════════════════ queries ════ */

export function useProductionProject(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["production", "project", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: () =>
      projectFullRepo.getById(projectId!, [
        PROJECT_YIELD_COL.id, PROJECT_YIELD_COL.projectIdText, PROJECT_YIELD_COL.projectName,
        PROJECT_YIELD_COL.country, PROJECT_YIELD_COL.technology,
        PROJECT_YIELD_COL.totalCapacity, PROJECT_YIELD_COL.endDate, PROJECT_YIELD_COL.cod,
        PROJECT_YIELD_COL.netYieldP50, PROJECT_YIELD_COL.standardCostCreated,
        PROJECT_YIELD_COL.owningBusinessUnit,
      ]),
    staleTime: 30_000,
  });
  return { project: toProductionProject(q.data), isLoading: q.isLoading, isError: q.isError };
}

/** `colEnergyYieldsInProject` — filtered on the server, not materialised and filtered. */
export function useEnergyYields(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("energyYields", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (
        await energyYieldFullRepo.byProject(projectId!, {
          orderBy: [asc(YIELD_COL.description)],
        })
      ).map(toEnergyYieldRow),
    staleTime: 15_000,
  });
  const rows = q.data ?? [];
  return {
    yields: rows,
    activeWtg: rows.filter(
      (y) => y.type === CHOICE_PRODUCTION.yieldType.wtg && y.status === 0,
    ),
    activePv: rows.filter(
      (y) => y.type === CHOICE_PRODUCTION.yieldType.pv && y.status === 0,
    ),
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * Rules 10, 13, 26–27 — the Fabric-backed `Assumptions Revenues SQL` reads.
 *
 * Locale parsing (rule 27) happens ONCE, here; the UI never sees a string.
 * UT-PROD-058: a failed request degrades to empty standards, so the panel stays usable
 * and the seasonality rows seed with zeros rather than throwing.
 */
export function useRevenueAssumptions(countryName: string | null | undefined, locale: string) {
  const q = useQuery({
    queryKey: ["production", "assumptions", countryName ?? "none"],
    enabled: Boolean(countryName),
    queryFn: () =>
      assumptionsRevenuesRepo.listAll({ filter: f.eq("country", countryName!) }),
    staleTime: REF_STALE,
    retry: 1,
  });

  const seasonality: StandardSeasonalityRow[] = useMemo(() => {
    const rows = (q.data ?? []).filter((r) => str(r["valuetype"]) === "seasonality");
    return rows.map((r) => ({
      // `category` carries the month number for the seasonality rows.
      month: Math.trunc(parseFabricNumber(r["category"] as string, locale)),
      // The canvas multiplies the fraction by 100 to get a percentage.
      pv: parseFabricNumber(r["pv"] as string, locale) * 100,
      wtg: parseFabricNumber(r["wind"] as string, locale) * 100,
    }));
  }, [q.data, locale]);

  const negativePrices: StandardNegativePriceRow[] = useMemo(() => {
    const rows = (q.data ?? []).filter((r) => str(r["valuetype"]) === "negativeprices");
    return rows.map((r) => ({
      year: Math.trunc(parseFabricNumber(r["category"] as string, locale)),
      pv: Math.round(parseFabricNumber(r["pv"] as string, locale) * 100 * 10) / 10,
      wind: Math.round(parseFabricNumber(r["wind"] as string, locale) * 100 * 10) / 10,
    }));
  }, [q.data, locale]);

  return { seasonality, negativePrices, isLoading: q.isLoading, isError: q.isError };
}

/** The stored seasonality row for one yield, mapped back into the 12-row editor shape. */
export function useStoredSeasonality(energyYieldId: string | null) {
  const q = useQuery({
    queryKey: ["production", "seasonality", energyYieldId ?? "none"],
    enabled: Boolean(energyYieldId),
    queryFn: async () =>
      seasonalityRepo.getOne(f.guid(SEASONALITY_COL.energyYield, energyYieldId!)!),
    staleTime: 15_000,
  });
  const record = q.data;
  const rows: SeasonalityRow[] | null = record
    ? (() => {
        const flags = deserialiseStandardValuesJson(
          str(record[SEASONALITY_COL.standardValuesJson]),
        );
        return MONTH_NAMES.map((month, i) => ({
          id: i + 1,
          month,
          value: num(record[SEASONALITY_COL.months[i]]) ?? 0,
          isStandard: flags[i],
        }));
      })()
    : null;
  return {
    recordId: record ? String(record[SEASONALITY_COL.id] ?? "") : null,
    rows,
    isLoading: q.isLoading,
  };
}

export function useStoredNegativePrices(energyYieldId: string | null) {
  const q = useQuery({
    queryKey: ["production", "negativePrices", energyYieldId ?? "none"],
    enabled: Boolean(energyYieldId),
    queryFn: async () =>
      negativePriceRepo.listAll({
        filter: f.guid(NEGATIVE_PRICE_COL.energyYield, energyYieldId!),
        orderBy: [asc(NEGATIVE_PRICE_COL.year)],
      }),
    staleTime: 15_000,
  });
  const stored = (q.data ?? []).map((r) => ({
    id: String(r[NEGATIVE_PRICE_COL.id] ?? ""),
    year: num(r[NEGATIVE_PRICE_COL.year]) ?? 0,
    reduction: num(r[NEGATIVE_PRICE_COL.reduction]),
    isStandard: bool(r[NEGATIVE_PRICE_COL.isStandard]),
  }));
  return { stored, isLoading: q.isLoading };
}

/** Rule 15's other half — the revenue contracts the sync may flip. */
export function useProjectRevenues(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["production", "revenues", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await projectRevenueNegativePriceRepo.byProject(projectId!)).map<RevenueRow>((r) => ({
        id: String(r[REVENUE_COL.id] ?? ""),
        description: str(r[REVENUE_COL.description]),
        considerNegativePrices: bool(r[REVENUE_COL.considerNegativePrices]),
        manualOverride: bool(r[REVENUE_COL.manualOverride]),
      })),
    staleTime: 30_000,
  });
  return { revenues: q.data ?? [], isLoading: q.isLoading };
}

/** Rule 6 — `CountIf(colGeneratorsInProjectsTemporary, true)` for "Each turbine". */
export function useTurbineCount(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["production", "turbineCount", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const types = await generatorTypeInProjectFullRepo.byProject(projectId!, {
        select: ["vsb_generatortypeinprojectid"],
      });
      const ids = types.map((t) => String(t["vsb_generatortypeinprojectid"] ?? ""));
      if (ids.length === 0) return [] as { id: string; name: string | null }[];
      const rows = await generatorInProjectFullRepo.listAll({
        filter: f.inList("_vsb_moduletypeinprojectid_value", ids),
        select: ["vsb_generatorinprojectid", "vsb_name"],
      });
      return rows.map((r) => ({
        id: String(r["vsb_generatorinprojectid"] ?? ""),
        name: str(r["vsb_name"]),
      }));
    },
    staleTime: 60_000,
  });
  return { generators: q.data ?? [], count: (q.data ?? []).length, isLoading: q.isLoading };
}

/** `locOAndMSubaccount = LookUp('Opex Subaccounts', Name = "Operation & Maintenance")`. */
export function useOandMSubaccount() {
  const q = useQuery({
    queryKey: ["production", "oandm"],
    queryFn: () => opexSubaccountRepo.getOne(f.eq("vsb_name", OANDM_SUBACCOUNT_NAME)!),
    staleTime: REF_STALE,
  });
  return { subaccount: q.data ?? null, isLoading: q.isLoading };
}

/* ═════════════════════════════════════════════════════════════════ mutations ════ */

/**
 * The pre-request permission guard — the same one `saveGridOperator` applies, and for the
 * same reason (step 18 of the CheckList plan).
 *
 * `canEdit` is the caller's `useProjectContext().canEdit`, i.e. the server's own answer to
 * `DataSourceInfo(Projects, CreatePermission)` && `RecordInfo(record, EditPermission)`.
 * It is never derived from a role name, and it is checked BEFORE any request is issued:
 * every one of this screen's write paths previously relied only on the command bar's
 * `disabled` prop, and a disabled command is a UI convenience, not an authorisation
 * boundary. A user who reaches a mutation with `canEdit === false` gets a 403 `AppError`
 * and no request leaves the client.
 */
export function editDenial(canEdit: boolean, source: string): AppError | null {
  if (canEdit) return null;
  return toAppError(
    { status: 403, message: "You do not have permission to edit this project." },
    source,
  );
}

export interface SaveYieldPayload {
  project: ProductionProject;
  /** `useProjectContext().canEdit`. See `editDenial`. */
  canEdit: boolean;
  technology: Technology;
  existing: EnergyYieldRow | null;
  description: string;
  assessment: number;
  allocation: YieldAllocation;
  modes: {
    allocationInput: AllocationInputMode;
    lossesInput: LossesInputMode;
    uncertaintyInput: UncertaintyInputMode;
  };
  input: YieldFormInput;
  turbineCount: number;
  considerSeasonality: boolean;
  considerNegativePrices: boolean;
  seasonality: SeasonalityRow[];
  seasonalityRecordId: string | null;
  negativePrices: NegativePriceRow[];
  storedNegativePrices: {
    id: string; year: number; reduction: number | null; isStandard: boolean;
  }[];
  allYields: EnergyYieldRow[];
  revenues: RevenueRow[];
}

/**
 * The WTG and PV `OnChange` save handlers, unified.
 *
 * Ordering is the canvas's: upsert the yield, then (concurrently in the source, in one
 * batch here) the seasonality row, the negative-price rows and the revenue sync, then
 * rule 9's supersede, then the project recalculation.
 */
export async function saveEnergyYield(
  p: SaveYieldPayload,
): Promise<Result<{ yieldId: string }>> {
  const denied = editDenial(p.canEdit, "production/saveYield");
  if (denied) return err(denied);
  try {
    const derived = deriveYieldFields(p.input, p.allocation, p.turbineCount);
    const fields: Record<string, unknown> = {
      [YIELD_COL.description]: p.description,
      [YIELD_COL.type]:
        p.technology === "WTG"
          ? CHOICE_PRODUCTION.yieldType.wtg
          : CHOICE_PRODUCTION.yieldType.pv,
      [YIELD_COL.assessment]: p.assessment,
      [YIELD_COL.allocation]:
        p.allocation === "Each turbine"
          ? CHOICE_PRODUCTION.yieldAllocation.eachTurbine
          : CHOICE_PRODUCTION.yieldAllocation.wholePlant,
      [YIELD_COL.windSpeed]: derived.windSpeed,
      [YIELD_COL.irradiation]: derived.irradiation,
      [YIELD_COL.grossYield]: derived.grossYield,
      [YIELD_COL.totalLosses]: derived.totalLosses ?? null,
      [YIELD_COL.netYieldP50]: derived.netP50,
      [YIELD_COL.uncertainty]: derived.uncertainty ?? null,
      [YIELD_COL.netYieldP75]: derived.netP75,
      [YIELD_COL.netYieldP90]: derived.netP90,
      [YIELD_COL.considerSeasonality]: p.considerSeasonality,
      [YIELD_COL.considerNegativePrices]: p.considerNegativePrices,
      ...radioFields(p.modes),
    };
    if (!p.existing) {
      fields[`${PRODUCTION_LOOKUP.project}@odata.bind`] = `/vsb_projects(${p.project.id})`;
      if (p.project.owningBusinessUnitId) {
        fields[`${PRODUCTION_LOOKUP.owningBusinessUnit}@odata.bind`] =
          `/businessunits(${p.project.owningBusinessUnitId})`;
      }
    }

    const yieldId = p.existing
      ? (await energyYieldFullRepo.update(p.existing.id, fields), p.existing.id)
      : await energyYieldFullRepo.create(fields);

    const bind = `/${ES_PRODUCTION.energyYields}(${yieldId})`;

    /* Rule 12 — seasonality, upsert or delete. Shared table (ambiguity 3). */
    if (p.considerSeasonality) {
      const seasonFields = {
        ...seasonalityFields({ rows: p.seasonality, yieldDescription: p.description }),
        [`${PRODUCTION_LOOKUP.energyYield}@odata.bind`]: bind,
      };
      if (p.seasonalityRecordId) {
        await seasonalityRepo.update(p.seasonalityRecordId, seasonFields);
      } else {
        await seasonalityRepo.create(seasonFields);
      }
    } else if (p.seasonalityRecordId) {
      await seasonalityRepo.remove(p.seasonalityRecordId);
    }

    /* Rule 14 — negative prices, diffed upsert or a wholesale removal. */
    if (p.considerNegativePrices) {
      const plan = planNegativePriceWrites(p.negativePrices, p.storedNegativePrices);
      const ops: Omit<WriteOp, "entitySet">[] = [
        ...plan.upserts.map((u) =>
          u.id
            ? { op: "update" as const, id: u.id, data: negativePriceFields(u) }
            : {
                op: "create" as const,
                data: {
                  ...negativePriceFields(u),
                  [`${PRODUCTION_LOOKUP.energyYield}@odata.bind`]: bind,
                },
              },
        ),
        ...plan.deletes.map((id) => ({ op: "delete" as const, id })),
      ];
      if (ops.length > 0) await negativePriceRepo.saveMany(ops);
    } else if (p.storedNegativePrices.length > 0) {
      await negativePriceRepo.saveMany(
        p.storedNegativePrices.map((r) => ({ op: "delete" as const, id: r.id })),
      );
    }

    /* Rule 15 — the revenue synchronisation, computed against the SAVED state. */
    const nextYields = p.existing
      ? p.allYields.map((y) =>
          y.id === yieldId
            ? { ...y, considerNegativePrices: p.considerNegativePrices }
            : y,
        )
      : [
          ...p.allYields,
          {
            id: yieldId, description: p.description,
            type:
              p.technology === "WTG"
                ? CHOICE_PRODUCTION.yieldType.wtg
                : CHOICE_PRODUCTION.yieldType.pv,
            assessment: p.assessment, allocation: null,
            windSpeed: derived.windSpeed, irradiation: derived.irradiation,
            grossYield: derived.grossYield, totalLosses: derived.totalLosses ?? null,
            netYieldP50: derived.netP50, uncertainty: derived.uncertainty ?? null,
            netYieldP75: derived.netP75, netYieldP90: derived.netP90,
            considerSeasonality: p.considerSeasonality,
            considerNegativePrices: p.considerNegativePrices,
            status: 0,
          } satisfies EnergyYieldRow,
        ];
    await applyRevenueSync(nextYields, p.revenues);

    /* Rule 9 — an external assessment supersedes the internal ones of the same type. */
    const superseded = supersededInternalYields({
      assessment: p.assessment,
      type:
        p.technology === "WTG"
          ? CHOICE_PRODUCTION.yieldType.wtg
          : CHOICE_PRODUCTION.yieldType.pv,
      yields: p.allYields,
      savedId: yieldId,
    });
    if (superseded.length > 0) {
      await energyYieldFullRepo.saveMany(
        superseded.map((id) => ({ op: "update" as const, id, data: { statecode: 1 } })),
      );
    }
    return ok({ yieldId });
  } catch (e) {
    return err(toAppError(e, SAVE_ERROR_PREFIX));
  }
}

export function useSaveEnergyYield() {
  const qc = useQueryClient();
  return useMutation<{ yieldId: string }, AppError, SaveYieldPayload>({
    mutationFn: async (p) => {
      const res = await saveEnergyYield(p);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("energyYields", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
  });
}

/** Rule 15, once. Shared by save, delete, activate and deactivate. */
async function applyRevenueSync(activeYields: EnergyYieldRow[], revenues: RevenueRow[]) {
  const flips = syncRevenueNegativePrices({ activeYields, revenues });
  if (flips.length === 0) return;
  await projectRevenueNegativePriceRepo.saveMany(
    flips.map((r) => ({
      op: "update" as const,
      id: r.id,
      data: { [REVENUE_COL.considerNegativePrices]: r.considerNegativePrices },
    })),
  );
}

export interface DeleteYieldPayload {
  project: ProductionProject;
  /** `useProjectContext().canEdit`. See `editDenial`. */
  canEdit: boolean;
  row: EnergyYieldRow;
  allYields: EnergyYieldRow[];
  revenues: RevenueRow[];
}

export async function deleteEnergyYield(
  p: DeleteYieldPayload,
): Promise<Result<void>> {
  const denied = editDenial(p.canEdit, "production/deleteYield");
  if (denied) return err(denied);
  try {
    await energyYieldFullRepo.remove(p.row.id);
    await applyRevenueSync(
      p.allYields.filter((y) => y.id !== p.row.id),
      p.revenues,
    );
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e, "Energy yield could not be deleted"));
  }
}

export function useDeleteEnergyYield() {
  const qc = useQueryClient();
  return useMutation<void, AppError, DeleteYieldPayload>({
    mutationFn: async (p) => {
      const res = await deleteEnergyYield(p);
      if (!res.ok) throw res.error;
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("energyYields", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
  });
}

export interface SetYieldStatusPayload extends DeleteYieldPayload {
  nextStatus: 0 | 1;
}

export async function setYieldStatus(
  p: SetYieldStatusPayload,
): Promise<Result<void>> {
  const denied = editDenial(p.canEdit, "production/setYieldStatus");
  if (denied) return err(denied);
  try {
    await energyYieldFullRepo.update(p.row.id, { statecode: p.nextStatus });
    await applyRevenueSync(
      p.allYields.map((y) =>
        y.id === p.row.id ? { ...y, status: p.nextStatus } : y,
      ),
      p.revenues,
    );
    return ok(undefined);
  } catch (e) {
    return err(toAppError(e, "Energy yield status could not be changed"));
  }
}

export function useSetYieldStatus() {
  const qc = useQueryClient();
  return useMutation<void, AppError, SetYieldStatusPayload>({
    mutationFn: async (p) => {
      const res = await setYieldStatus(p);
      if (!res.ok) throw res.error;
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: qk.child("energyYields", p.project.id) });
      void qc.invalidateQueries({ queryKey: ["production"] });
    },
  });
}

export interface RecalculatePayload {
  project: ProductionProject;
  /** `useProjectContext().canEdit`. See `editDenial`. */
  canEdit: boolean;
  activeWtg: EnergyYieldRow[];
  activePv: EnergyYieldRow[];
  generators: { id: string; name: string | null }[];
  oAndMSubaccountId: string | null;
  oAndMSubaccountName: string;
}

/**
 * `btn_Load_StandardContracts_For_Project` — 1 104 lines of hidden button, ported.
 *
 * Three phases, in the canvas's order:
 *   1. rule 16 — average the ACTIVE yields onto `Projects` (sum of two averages);
 *   2. rule 17 — if p50 > 0 and `Standard Cost Created` is No, generate the land-lease
 *      and O&M standard contracts from `OPEX & Land Lease Standard Assumptions`;
 *   3. rule 25 — write the four recalculation flags (see the FLOW NOTE in rules.ts).
 *
 * The generators are pure functions returning payloads; this hook only issues them.
 */
export async function recalculateProject(
  p: RecalculatePayload,
): Promise<Result<{ generated: boolean }>> {
  const denied = editDenial(p.canEdit, "production/recalculate");
  if (denied) return err(denied);
  try {
    /* 1 — the roll-up. */
    const totals = projectYieldTotals(p.activeWtg, p.activePv);
    await projectFullRepo.update(p.project.id, projectYieldFields(totals));

    const projectAfter: ProductionProject = { ...p.project, netYieldP50: totals.netP50 };
    if (!shouldGenerate(projectAfter)) return ok({ generated: false });

    /* 2 — the standard contracts. */
    const [assumptions, existingLandLease, existingOpex, deviceTypes, countryProfileRows] =
      await Promise.all([
        p.project.countryId
          ? opexLandLeaseAssumptionRepo.listAll({
              filter: f.and(
                f.guid("_vsb_country_value", p.project.countryId),
                p.project.technology !== null
                  ? f.eq("vsb_technology", p.project.technology)
                  : undefined,
              ),
            })
          : Promise.resolve([] as Record<string, unknown>[]),
        landLeaseCostFullRepo.byProject(p.project.id, {
          filter: f.eq("vsb_isstandardcontract", true),
          select: ["vsb_landleaseprojectcostid"],
        }),
        p.oAndMSubaccountId
          ? opexProjectCostFullRepo.byProject(p.project.id, {
              filter: f.and(
                f.eq("vsb_isstandardcontract", true),
                f.guid("_vsb_subaccount_value", p.oAndMSubaccountId),
              ),
              select: ["vsb_opexprojectcostid"],
            })
          : Promise.resolve([] as Record<string, unknown>[]),
        deviceTypeInProjectRepo.listAll({ select: ["vsb_devicetypesinprojectid"] }),
        p.project.countryId && inflationStartYear(p.project.cod) !== null
          ? countryInflationProfileRepo.listAll({
              filter: f.and(
                f.guid("_vsb_country_value", p.project.countryId),
                f.eq("vsb_year", inflationStartYear(p.project.cod)!),
              ),
            })
          : Promise.resolve([]),
      ]);

    const parsed = assumptions.map(toStandardAssumption);
    const countryProfile = countryProfileRows[0]?.vsb_inflation ?? null;

    const landLease = buildLandLeaseContracts({
      project: projectAfter,
      assumptions: parsed,
      existingStandardCosts: existingLandLease.map((r) => ({
        id: String(r["vsb_landleaseprojectcostid"] ?? ""),
      })),
      generators: p.generators,
      countryProfile,
    });

    const costIdBySubaccount = new Map<string, string>();
    for (const cost of landLease.costs) {
      const id = await landLeaseCostFullRepo.create({
        ...cost.fields,
        [`${PRODUCTION_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
        ...(cost.subaccountId
          ? {
              [`${PRODUCTION_LOOKUP.subaccount}@odata.bind`]:
                `/${ES_PLANT.landLeaseSubaccounts}(${cost.subaccountId})`,
            }
          : {}),
      });
      if (cost.subaccountId) costIdBySubaccount.set(cost.subaccountId, id);
    }

    const periodOps = landLease.periods
      .filter((pr) => pr.subaccountId && costIdBySubaccount.has(pr.subaccountId))
      .map((pr) => ({
        op: "create" as const,
        data: {
          ...pr.fields,
          [`${PRODUCTION_LOOKUP.projectCost}@odata.bind`]:
            `/${ES_PLANT.landLeaseProjectCosts}(${costIdBySubaccount.get(pr.subaccountId!)})`,
        },
      }));
    if (periodOps.length > 0) await landLeasePeriodRepo.saveMany(periodOps);

    const allocationOps = landLease.allocations
      .filter((a) => a.subaccountId && costIdBySubaccount.has(a.subaccountId))
      .map((a) => ({
        op: "create" as const,
        data: {
          "vsb_name": a.name,
          [`${PRODUCTION_LOOKUP.projectCost}@odata.bind`]:
            `/${ES_PLANT.landLeaseProjectCosts}(${costIdBySubaccount.get(a.subaccountId!)})`,
          [`${PRODUCTION_LOOKUP.generatorInProject}@odata.bind`]:
            `/${ES_PLANT.generatorInProjects}(${a.generatorInProjectId})`,
        },
      }));
    if (allocationOps.length > 0) await landLeaseAllocationRepo.saveMany(allocationOps);

    const opex = buildOpexContracts({
      project: projectAfter,
      assumptions: parsed,
      existingStandardCosts: existingOpex.map((r) => ({
        id: String(r["vsb_opexprojectcostid"] ?? ""),
      })),
      deviceTypes: deviceTypes.map((d) => ({
        id: String(d["vsb_devicetypesinprojectid"] ?? ""),
      })),
      oAndMSubaccountName: p.oAndMSubaccountName,
      countryProfile,
    });

    const parentByDevice = new Map<string, string>();
    for (const row of opex.filter((r) => r.kind === "opexCost")) {
      const id = await opexProjectCostFullRepo.create({
        ...row.fields,
        [`${PRODUCTION_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
        ...(p.oAndMSubaccountId
          ? {
              [`${PRODUCTION_LOOKUP.subaccount}@odata.bind`]:
                `/${ES_PLANT.opexSubaccounts}(${p.oAndMSubaccountId})`,
            }
          : {}),
        [`${PRODUCTION_LOOKUP.deviceTypeInProject}@odata.bind`]:
          `/${ES_PLANT.deviceTypesInProjects}(${row.deviceTypeInProjectId})`,
      });
      if (!parentByDevice.has(row.deviceTypeInProjectId)) {
        parentByDevice.set(row.deviceTypeInProjectId, id);
      }
    }
    const childOps = opex
      .filter((r) => r.kind === "opexPeriod")
      .map((row) => ({
        op: "create" as const,
        data: {
          ...row.fields,
          [`${PRODUCTION_LOOKUP.project}@odata.bind`]: `/vsb_projects(${p.project.id})`,
          ...(p.oAndMSubaccountId
            ? {
                [`${PRODUCTION_LOOKUP.subaccount}@odata.bind`]:
                  `/${ES_PLANT.opexSubaccounts}(${p.oAndMSubaccountId})`,
              }
            : {}),
          [`${PRODUCTION_LOOKUP.deviceTypeInProject}@odata.bind`]:
            `/${ES_PLANT.deviceTypesInProjects}(${row.deviceTypeInProjectId})`,
          ...(parentByDevice.has(row.deviceTypeInProjectId)
            ? {
                [`${PRODUCTION_LOOKUP.parentCost}@odata.bind`]:
                  `/${ES_PLANT.opexProjectCosts}(${parentByDevice.get(row.deviceTypeInProjectId)})`,
              }
            : {}),
        },
      }));
    if (childOps.length > 0) await opexProjectCostFullRepo.saveMany(childOps);

    /* 3 — the recalculation flags. No flow: see the FLOW NOTE in rules.ts. */
    trace(
      "information",
      "Production: marking project for CAPEX standard-cost recalculation",
      { projectId: p.project.id },
    );
    await projectFullRepo.update(p.project.id, markForCapexRecalculationFields());
    return ok({ generated: true });
  } catch (e) {
    return err(toAppError(e, "Project figures could not be recalculated"));
  }
}

export function useRecalculateProject() {
  const qc = useQueryClient();
  return useMutation<{ generated: boolean }, AppError, RecalculatePayload>({
    mutationFn: async (p) => {
      const res = await recalculateProject(p);
      if (!res.ok) throw res.error;
      return res.value;
    },
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: ["production", "project", p.project.id] });
      void qc.invalidateQueries({ queryKey: qk.projects.one(p.project.id) });
    },
  });
}

/** The 12-row editor state, seeded from Fabric or from the stored row. */
export function useSeasonalityEditor(args: {
  stored: SeasonalityRow[] | null;
  standard: StandardSeasonalityRow[];
  technology: Technology;
}): SeasonalityRow[] {
  return useMemo(
    () => args.stored ?? buildSeasonalityRows(args.standard, args.technology),
    [args.stored, args.standard, args.technology],
  );
}

/** The 15-row negative-price editor state (rule 13). */
export function useNegativePriceEditor(args: {
  cod: string | null;
  standard: StandardNegativePriceRow[];
  technology: Technology;
  stored: { year: number; reduction: number | null; isStandard: boolean }[];
}): NegativePriceRow[] {
  return useMemo(() => {
    if (!args.cod) return [];
    const codYear = new Date(args.cod).getFullYear();
    const base = buildNegativePriceRows(codYear, args.standard, args.technology);
    if (args.stored.length === 0) return base;
    return base.map((row) => {
      const s = args.stored.find((x) => x.year === row.year);
      return s
        ? { ...row, reductionValue: s.reduction ?? 0, standardAssumption: s.isStandard }
        : row;
    });
  }, [args.cod, args.standard, args.technology, args.stored]);
}

/** The runtime locale — the cell regex and the Fabric parsing both need it. */
export function useLocale(): string {
  return useAppStore((s) => s.session.user?.language ?? "en-US");
}
