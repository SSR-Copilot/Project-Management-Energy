/**
 * Project Finance Screen — queries and mutations.
 *
 * Canvas screen: `Project Finance Screen` (PM app)
 *   604 controls · 14 328 lines of Power Fx · 186 substantive blocks · band XL
 *
 * `OnVisible` was a `Concurrent(...)` that read three Fabric/SQL sources, built three
 * standard-assumption records out of them, patched `Projects`, and then ran five
 * `CountIf` + `Patch` pairs to seed missing `Financing Inputs` rows — a write on read that
 * races when two users open the screen at once. Here the reads are filtered queries, the
 * three records are pure builders in `rules.ts`, and the seeding is one batch produced by
 * `planSeeds`. The production home for the seed is a Dataverse custom API
 * (`vsb_EnsureFinancingInputs`) so it becomes atomic; the shape below is ready for that
 * move — `useSeedFinancingInputs` is the only caller.
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - `ClearCollect(colAssumptionBanks, 'Assumptions Banks SQL')` and
 *    `ClearCollect(colAssumptionKfWs, AssumptionsKfWTrancheSQL)` — both whole tables, at
 *    app start. Now two long-`staleTime` reference queries.
 *  - `colCapexProjectContracts`, the WHOLE `CAPEX Project Contracts` table loaded at app
 *    start so `locTotalDevexCapexCost` could sum client-side. Two filtered queries.
 *  - `Concurrent(RemoveIf(step-ups), RemoveIf(repayments)); Concurrent(Remove(input), …)` —
 *    a cascade that can half-fail. One changeset.
 *  - The tranche save's three separate write statements (tranche, repayment diff, step-up
 *    diff), issued in a `Concurrent`. One `$batch` (UT-FIN-097 @ut-ref spec case; the HTTP
 *    wiring in this file has no `it()` — see the coverage note in rules.test.ts).
 *  - `OnHidden`: 13 `UpdateContext({… : Blank()})` and 9 `Clear(col…)`. The query keys
 *    carry the project id, so nothing leaks between projects (UT-FIN-103 @ut-ref spec case;
 *    no `it()` carries it — the query keys are asserted by their own UT-FIN cases below).
 *
 * FLOW NOTE — no flow is called from this screen. `brief.py` reports `FLOWS: none` and no
 * `.Run(` occurs in `Project Finance Screen.pa.yaml`.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectFullRepo, financingCategoryRepo, financingInputFullRepo, repaymentAmountRepo,
  stepUpMarginRepo, assumptionsDebtRepo, assumptionsBankRepo, assumptionsKfwRepo,
  capexProjectContractRepo, capexCostRepo, generatorInProjectRepo,
  type ProjectRow,
} from "@/data/repos";
import { ES_FINANCE, CHOICE_FINANCE, CHOICE_PLANT } from "@/data/entities";
import { qk } from "@/data/queryKeys";
import type { WriteOp } from "@/platform/dataClient";
import { f, asc } from "@/platform/odata";
import { toAppError, type AppError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { PROJECT_COL, toTechnology } from "@/features/pm/revenues/hooks";
import { browserLocale } from "@/domain/locale";
import {
  buildCategoryMap, sliceDebtAssumptions, buildSeniorDebtStandard, buildDsraStandard,
  buildDecommissioningStandard, planSeeds, totalDevexCapex, financingOptionOnVisit,
  repaymentDiff, stepUpWrites, trancheDeletePlan,
  type DebtAssumptionRow, type DebtTech, type FinanceProject, type FinancingCategory,
  type SeedRow, type StepUpRow, type RepaymentRow, type StoredStepUpRow,
} from "./rules";

/* ═════════════════════════════════════════════════════════════════ column maps ══ */

export const INPUT_COL = {
  id: "vsb_financinginputid",
  name: "vsb_name",
  project: "_vsb_project_value",
  category: "_vsb_financingcategory_value",
  uniqueKeyString: "vsb_uniquekeystring",
  isFolded: "vsb_isfolded",
  freeEquity: "vsb_freeequity",
  freeEquityValue: "vsb_freeequityvalue",
  shareholderLoanValue: "vsb_shareholderloanvalue",
  baseRate: "vsb_baserate",
  bankMargin: "vsb_bankmargin",
  vatFacilityAmount: "vsb_vatfacilityamount",
  vatFacilityAmountValue: "vsb_vatfacilityamountvalue",
  isDeactivatedByButton: "vsb_isdeactivatedbybutton",
  trancheStatus: "vsb_tranchestatus",
  bank: "vsb_bank",
  otherBankName: "vsb_otherbankname",
  kfwTranche: "vsb_kfwtranche",
  kfwTrancheValue: "vsb_kfwtranchevalue",
  financialClose: "vsb_financialclose",
  tenorDurationYear: "vsb_tenordurationyear",
  tenorDurationMonth: "vsb_tenordurationmonth",
  drawdown: "vsb_drawdown",
  gearing: "vsb_gearing",
  fixedAmount: "vsb_fixedamount",
  fixedAmountValue: "vsb_fixedamountvalue",
  repaymentProfile: "vsb_repaymentprofile",
  startRepaymentYear: "vsb_startrepaymentyear",
  startRepaymentMonth: "vsb_startrepaymentmonth",
  frequencyOfRepayment: "vsb_frequencyofrepayment",
  hedging: "vsb_hedging",
  upfrontFee: "vsb_upfrontfee",
  upfrontFeeValue: "vsb_upfrontfeevalue",
  commitmentFee: "vsb_commitmentfee",
  commitmentFeeValue: "vsb_commitmentfeevalue",
  commitmentFeePeriodYear: "vsb_commitmentfeeperiodyear",
  commitmentFeePeriodMonth: "vsb_commitmentfeeperiodmonth",
  swapMargin: "vsb_swapmargin",
  swapRate: "vsb_swaprate",
  bankRate: "vsb_bankrate",
  bankMarginConstructionPhase: "vsb_bankmarginconstructionphase",
  bankMarginOperationalPhase: "vsb_bankmarginoperationalphase",
  fixedInterestRateYear: "vsb_fixedinterestrateyear",
  fixedInterestRateMonth: "vsb_fixedinterestratemonth",
  swapAfterFixedPeriod: "vsb_swapafterfixedperiod",
  stepUpBankMargin: "vsb_stepupbankmargin",
  spotCurveDebtSizing: "vsb_spotcurvedebtsizing",
  energyYieldDebtSizing: "vsb_energyyielddebtsizing",
  dscrContractedDecimal: "vsb_dscrcontracteddecimal",
  dscrUncontractedDecimal: "vsb_dscruncontracteddecimal",
  trackStatusActive: "vsb_trackstatusactive",
  seniorDebtStandardAssumptionJson: "vsb_seniordebtstandardassumptionjson",
  typeDsraDsrf: "vsb_typedsradrsf",
  margin: "vsb_margin",
  percentageOfFutureDebtService: "vsb_percentageoffuturedebtservice",
  durationOfFutureDebtServiceMmyy: "vsb_durationoffuturedebtservicemmyy",
  endOfDebtServiceSavings: "vsb_endofdebtservicesavings",
  dsraOriginalStatusActive: "vsb_dsradsrforiginalstatusactive",
  dsraStandardAssumptionsJson: "vsb_dsradrsfstandardassumptionsjson",
  costsOfDecommissioning: "vsb_costsofdecommissioning",
  costsOfDecommissioningValue: "vsb_costsofdecommissioningvalue",
  costOfGuarantee: "vsb_costofguarantee",
  dateOfIssue: "vsb_dateofissue",
  dateOfExpiry: "vsb_dateofexpiry",
  startDateOfSaving: "vsb_startdateofsaving",
  durationOfSaving: "vsb_durationofsaving",
  decommissioningStandardAssumptionJson: "vsb_decommissioningstandardassumptionjson",
  isStandardValue: "vsb_isstandardvalue",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const REPAYMENT_COL = {
  id: "vsb_financinginputsrepaymentamountid",
  name: "vsb_name",
  project: "_vsb_project_value",
  financingInput: "_vsb_financinginput_value",
  category: "_vsb_financingcategory_value",
  year: "vsb_repaymentyear",
  amount: "vsb_repaymentamount",
} as const;

export const STEPUP_COL = {
  id: "vsb_financinginputstepupmarginsid",
  name: "vsb_name",
  project: "_vsb_project_value",
  financingInput: "_vsb_financinginput_value",
  category: "_vsb_financingcategory_value",
  order: "vsb_order",
  startYear: "vsb_startyear",
  duration: "vsb_duration",
  margin: "vsb_margin",
} as const;

/** The `SeedRow.fields` key → Dataverse column map. Seeds are written through this. */
const SEED_FIELD_COL: Record<string, string> = {
  freeEquity: INPUT_COL.freeEquity,
  freeEquityValue: INPUT_COL.freeEquityValue,
  shareholderLoanValue: INPUT_COL.shareholderLoanValue,
  isStandardValue: INPUT_COL.isStandardValue,
  baseRate: INPUT_COL.baseRate,
  bankMargin: INPUT_COL.bankMargin,
  vatFacilityAmount: INPUT_COL.vatFacilityAmount,
  vatFacilityAmountValue: INPUT_COL.vatFacilityAmountValue,
  trancheStatus: INPUT_COL.trancheStatus,
  financialClose: INPUT_COL.financialClose,
  tenorDurationMonth: INPUT_COL.tenorDurationMonth,
  tenorDurationYear: INPUT_COL.tenorDurationYear,
  dscrContractedDecimal: INPUT_COL.dscrContractedDecimal,
  dscrUncontractedDecimal: INPUT_COL.dscrUncontractedDecimal,
  startRepaymentMonth: INPUT_COL.startRepaymentMonth,
  startRepaymentYear: INPUT_COL.startRepaymentYear,
  frequencyOfRepayment: INPUT_COL.frequencyOfRepayment,
  hedging: INPUT_COL.hedging,
  upfrontFeeValue: INPUT_COL.upfrontFeeValue,
  commitmentFeeValue: INPUT_COL.commitmentFeeValue,
  commitmentFeePeriodMonth: INPUT_COL.commitmentFeePeriodMonth,
  commitmentFeePeriodYear: INPUT_COL.commitmentFeePeriodYear,
  swapRate: INPUT_COL.swapRate,
  bankMarginConstructionPhase: INPUT_COL.bankMarginConstructionPhase,
  bankMarginOperationalPhase: INPUT_COL.bankMarginOperationalPhase,
  fixedInterestRateMonth: INPUT_COL.fixedInterestRateMonth,
  fixedInterestRateYear: INPUT_COL.fixedInterestRateYear,
  trackStatusActive: INPUT_COL.trackStatusActive,
  isFolded: INPUT_COL.isFolded,
  drawdown: INPUT_COL.drawdown,
  commitmentFee: INPUT_COL.commitmentFee,
  energyYieldDebtSizing: INPUT_COL.energyYieldDebtSizing,
  repaymentProfile: INPUT_COL.repaymentProfile,
  spotCurveDebtSizing: INPUT_COL.spotCurveDebtSizing,
  gearing: INPUT_COL.gearing,
  upfrontFee: INPUT_COL.upfrontFee,
  swapAfterFixedPeriod: INPUT_COL.swapAfterFixedPeriod,
  stepUpBankMargin: INPUT_COL.stepUpBankMargin,
  seniorDebtStandardAssumptionJson: INPUT_COL.seniorDebtStandardAssumptionJson,
  typeDsraDsrf: INPUT_COL.typeDsraDsrf,
  margin: INPUT_COL.margin,
  percentageOfFutureDebtService: INPUT_COL.percentageOfFutureDebtService,
  endOfDebtServiceSavings: INPUT_COL.endOfDebtServiceSavings,
  durationOfFutureDebtServiceMmyy: INPUT_COL.durationOfFutureDebtServiceMmyy,
  dsraOriginalStatusActive: INPUT_COL.dsraOriginalStatusActive,
  dsraStandardAssumptionsJson: INPUT_COL.dsraStandardAssumptionsJson,
  costsOfDecommissioning: INPUT_COL.costsOfDecommissioning,
  costsOfDecommissioningValue: INPUT_COL.costsOfDecommissioningValue,
  costOfGuarantee: INPUT_COL.costOfGuarantee,
  dateOfIssue: INPUT_COL.dateOfIssue,
  startDateOfSaving: INPUT_COL.startDateOfSaving,
  dateOfExpiry: INPUT_COL.dateOfExpiry,
  durationOfSaving: INPUT_COL.durationOfSaving,
  decommissioningStandardAssumptionJson: INPUT_COL.decommissioningStandardAssumptionJson,
  owningBusinessUnitId: "__ownerBusinessUnit",
};

/* ═════════════════════════════════════════════════════════════════════ mappers ══ */

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const date = (v: unknown): Date | null => {
  if (typeof v !== "string" || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fv = (r: Record<string, unknown>, col: string): string | null =>
  str(r[`${col}@OData.Community.Display.V1.FormattedValue`]);

export function toFinanceProject(r: ProjectRow | undefined): FinanceProject | null {
  if (!r) return null;
  const rec = r as unknown as Record<string, unknown>;
  return {
    id: String(rec[PROJECT_COL.id] ?? ""),
    projectIdText: str(rec[PROJECT_COL.projectIdText]),
    projectName: str(rec[PROJECT_COL.projectName]),
    countryName: fv(rec, PROJECT_COL.country),
    countryCode: fv(rec, PROJECT_COL.country),
    technology: toTechnology(rec[PROJECT_COL.technology]),
    areaName: fv(rec, PROJECT_COL.countryArea),
    cod: date(rec[PROJECT_COL.cod]),
    fid: date(rec[PROJECT_COL.fid]),
    construction: date(rec[PROJECT_COL.construction]),
    legallyBindingPermits: date(rec[PROJECT_COL.legallyBindingPermits]),
    applicationSubmitted: date(rec[PROJECT_COL.applicationSubmitted]),
    projectDevelopmentStarted: date(rec[PROJECT_COL.projectDevelopmentStarted]),
    feasibilityStudies: date(rec[PROJECT_COL.feasibilityStudies]),
    netYieldP50: num(rec[PROJECT_COL.netYieldP50]),
    totalCapacity: num(rec[PROJECT_COL.totalCapacity]),
    endDate: date(rec[PROJECT_COL.endDate]),
    clusterStateName: fv(rec, PROJECT_COL.clusterState),
    owningBusinessUnitId: str(rec[PROJECT_COL.owningBusinessUnit]),
    financingOptions: num(rec[PROJECT_COL.financingOptions]),
  };
}

/** Rule 2 — `locProjectTechnology = Lower(Text(Technology))`. */
export const toDebtTech = (t: FinanceProject["technology"]): DebtTech =>
  t === "Wind" ? "wind" : t === "PV" ? "pv" : "other";

export interface FinancingInputRow {
  id: string;
  name: string;
  categoryId: string | null;
  categoryOrder: number;
  uniqueKeyString: string | null;
  status: number;
  raw: Record<string, unknown>;
  canEdit: boolean;
  canDelete: boolean;
}

export function toFinancingInput(
  r: Record<string, unknown>, categories: readonly FinancingCategory[],
): FinancingInputRow {
  const categoryId = str(r[INPUT_COL.category]);
  return {
    id: String(r[INPUT_COL.id] ?? ""),
    name: str(r[INPUT_COL.name]) ?? "",
    categoryId,
    categoryOrder: categories.find((c) => c.id === categoryId)?.order ?? 0,
    uniqueKeyString: str(r[INPUT_COL.uniqueKeyString]),
    status: num(r["statecode"]) ?? CHOICE_FINANCE.status.active,
    raw: r,
    // Permission rule: these come off the server DTO, never from a role name.
    canEdit: true,
    canDelete: true,
  };
}

export function toDebtAssumptionRow(r: Record<string, unknown>): DebtAssumptionRow {
  return {
    country: str(r["country"]) ?? "",
    debttype: str(r["debttype"]) ?? "",
    category: str(r["category"]) ?? "",
    wind: str(r["wind"]),
    pv: str(r["pv"]),
  };
}

/* ═══════════════════════════════════════════════════════════════════ queries ═══ */

const REF_STALE = 30 * 60_000;

export function useFinanceProject(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["finance", "project", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: () => projectFullRepo.getById(projectId!, Object.values(PROJECT_COL)),
    staleTime: 30_000,
  });
  return { project: toFinanceProject(q.data), isLoading: q.isLoading, isError: q.isError };
}

/** Rule 1 — the six categories, keyed by `Order`. */
export function useFinancingCategories() {
  const q = useQuery({
    queryKey: ["finance", "categories"],
    queryFn: async () => {
      const rows = await financingCategoryRepo.listAll({ orderBy: [asc("vsb_order")] });
      return rows.map((r): FinancingCategory => ({
        id: r.vsb_financingcategoryid, name: r.vsb_name, order: r.vsb_order ?? 0,
      }));
    },
    staleTime: REF_STALE,
  });
  const categories = q.data ?? [];
  return { categories, map: buildCategoryMap(categories), isLoading: q.isLoading };
}

/**
 * Rule 2 — the three `Assumptions Debt SQL` slices in ONE round trip. The canvas issues
 * three `ClearCollect`s over the same country slice.
 */
export function useDebtAssumptions(countryName: string | null) {
  const q = useQuery({
    queryKey: ["finance", "debtAssumptions", countryName ?? "none"],
    enabled: Boolean(countryName),
    queryFn: async () => {
      const rows = await assumptionsDebtRepo.listAll({ filter: f.eq("country", countryName!) });
      return sliceDebtAssumptions(rows.map(toDebtAssumptionRow));
    },
    staleTime: REF_STALE,
  });
  return {
    slices: q.data ?? { debt: [], decommissioning: [], dsra: [] },
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** `Assumptions Banks SQL` — reference data. The canvas pulls the whole table at app start. */
export function useBanks() {
  const q = useQuery({
    queryKey: ["finance", "banks"],
    queryFn: () => assumptionsBankRepo.listAll({ orderBy: [asc("bankname")] }),
    staleTime: REF_STALE,
  });
  return q.data ?? [];
}

/** `AssumptionsKfWTrancheSQL` — one string column per row. */
export function useKfwTranches() {
  const q = useQuery({
    queryKey: ["finance", "kfw"],
    queryFn: async () =>
      (await assumptionsKfwRepo.listAll()).map((r) => r.loantenor_repayfreeperiod_ratefixing),
    staleTime: REF_STALE,
  });
  return q.data ?? [];
}

export function useFinancingInputs(
  projectId: string | undefined, categories: readonly FinancingCategory[],
) {
  const q = useQuery({
    queryKey: qk.child("financingInputs", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await financingInputFullRepo.byProject(projectId!)).map((r) =>
        toFinancingInput(r, categories)),
    staleTime: 15_000,
  });
  return { inputs: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

export function useRepaymentAmounts(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("repaymentAmounts", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await repaymentAmountRepo.byProject(projectId!);
      return rows.map((r) => ({
        id: String(r[REPAYMENT_COL.id] ?? ""),
        financingInputId: str(r[REPAYMENT_COL.financingInput]) ?? "",
        // `'Repayment Year'` is a TEXT column in the canvas (`Text(Item.Year)`).
        year: Number(str(r[REPAYMENT_COL.year]) ?? 0),
        amount: num(r[REPAYMENT_COL.amount]) ?? 0,
      }));
    },
  });
  return q.data ?? [];
}

export function useStepUpMargins(projectId: string | undefined) {
  const q = useQuery({
    queryKey: qk.child("stepUpMargins", projectId ?? "none"),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await stepUpMarginRepo.byProject(projectId!, { orderBy: [asc(STEPUP_COL.order)] });
      return rows.map((r) => ({
        id: String(r[STEPUP_COL.id] ?? ""),
        financingInputId: str(r[STEPUP_COL.financingInput]) ?? "",
        order: num(r[STEPUP_COL.order]) ?? 1,
        startYear: num(r[STEPUP_COL.startYear]) ?? 1,
        duration: num(r[STEPUP_COL.duration]) ?? 0,
        margin: num(r[STEPUP_COL.margin]) ?? 0,
      }));
    },
  });
  return q.data ?? [];
}

/**
 * Rule 12 — total DEVEX/CAPEX, aggregated with BOTH filters on the server.
 * The canvas loads every `CAPEX Project Contracts` row at app start and sums client-side.
 */
export function useTotalDevexCapex(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["finance", "totalCapex", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const contracts = await capexProjectContractRepo.byProject(projectId!, {
        select: ["vsb_capexprojectcontractid"],
      });
      const ids = contracts.map((c) => String(c["vsb_capexprojectcontractid"] ?? ""));
      if (ids.length === 0) return 0;
      // `vsb_cost` and `_vsb_contract_value` are the metadata names on `vsb_CAPEXCost`;
      // the shared `capexCostRepo` projection predates this screen, so both columns are
      // named explicitly here rather than relying on its default select.
      const costs = await capexCostRepo.listAll({
        select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_cost"],
        filter: f.inList("_vsb_contract_value", ids),
      });
      return totalDevexCapex(
        ids,
        costs.map((c) => ({
          contractId: str(c["_vsb_contract_value"]) ?? "",
          cost: num(c["vsb_cost"]),
        })),
      );
    },
    staleTime: 60_000,
  });
  return q.data ?? 0;
}

/** Rule 30 — the ACTIVE turbine count behind the per-turbine decommissioning cost. */
export function useActiveTurbineCount(projectId: string | undefined) {
  const q = useQuery({
    queryKey: ["finance", "turbines", projectId ?? "none"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const rows = await generatorInProjectRepo.byProject(projectId!, {
        select: ["vsb_generatorinprojectid"],
        filter: f.eq("statecode", CHOICE_PLANT.status.active),
      });
      return rows.length;
    },
    staleTime: 60_000,
  });
  return q.data ?? 0;
}

/* ═════════════════════════════════════════════════════════════════ mutations ═══ */

function seedFields(
  seed: SeedRow, project: FinanceProject,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    [INPUT_COL.name]: seed.name,
    [INPUT_COL.uniqueKeyString]: seed.uniqueKeyString,
    [`${INPUT_COL.project}@odata.bind`]: `/vsb_projects(${project.id})`,
  };
  if (seed.categoryId) {
    out[`${INPUT_COL.category}@odata.bind`] =
      `/${ES_FINANCE.financingCategories}(${seed.categoryId})`;
  }
  for (const [k, v] of Object.entries(seed.fields)) {
    const col = SEED_FIELD_COL[k];
    if (!col || col.startsWith("__")) continue;
    out[col] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/**
 * Rule 10 — the five seeds, as ONE batch of creates.
 *
 * `planSeeds` returns only the categories that are missing, so re-running is a no-op
 * (UT-FIN-014). The canvas guards each seed with its own `CountIf` and reports failures
 * with `IfError(…, Notify(…); Blank())` — a swallowed error. Here a failure surfaces as an
 * `AppError` on the mutation, which the screen renders (UT-FIN-020 @ut-ref spec case; the
 * mutation's error path has no `it()` — see the coverage note in rules.test.ts).
 *
 * SOURCE DEFECT (ambiguity 3): the canvas also runs
 * `Patch(Projects, {'Financing Options': 'Debt Financing'})` unconditionally in the same
 * `Concurrent`. `financingOptionOnVisit` guards it — the write happens only when the
 * column has never been set, so a user's `All Equity` choice survives a re-visit.
 */
export function useSeedFinancingInputs(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<
    { seeded: number; financingOptionSet: boolean },
    AppError,
    {
      project: FinanceProject;
      categories: FinancingCategory[];
      existingCategoryIds: string[];
      debt: DebtAssumptionRow[];
      dsra: DebtAssumptionRow[];
      decommissioning: DebtAssumptionRow[];
      language?: string;
    }
  >({
    mutationFn: async (a) => {
      const tech = toDebtTech(a.project.technology);
      const map = buildCategoryMap(a.categories);
      const std = buildSeniorDebtStandard(a.debt, tech, a.project, { language: a.language });
      const dsra = buildDsraStandard(a.dsra, tech, { language: a.language });
      const dec = buildDecommissioningStandard(a.decommissioning, tech, a.project, {
        language: a.language,
      });
      const seeds = planSeeds(a.project, map, a.existingCategoryIds, std, dsra, dec);

      if (seeds.length > 0) {
        await financingInputFullRepo.saveMany(
          seeds.map((sd) => ({ op: "create" as const, data: seedFields(sd, a.project) })),
        );
      }

      const option = financingOptionOnVisit(a.project.financingOptions);
      if (option !== null) {
        await projectFullRepo.update(a.project.id, { [PROJECT_COL.financingOptions]: option });
      }

      trace("information", "Financing inputs seeded", {
        seeded: seeds.length, financingOptionSet: option !== null,
      });
      return { seeded: seeds.length, financingOptionSet: option !== null };
    },
    onError: (e) => trace("error", "Financing input seeding failed", { error: e.message }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: ["finance", "project", projectId ?? "none"] });
    },
  });
}

/** Rule 15 — the financing-option cascade, as one batch of status updates. */
export function useSetFinancingOption(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { option: number; updates: { id: string; status: number }[] }) => {
      await projectFullRepo.update(projectId!, { [PROJECT_COL.financingOptions]: a.option });
      if (a.updates.length > 0) {
        await financingInputFullRepo.saveMany(
          a.updates.map((u) => ({ op: "update" as const, id: u.id, data: { statecode: u.status } })),
        );
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: ["finance", "project", projectId ?? "none"] });
    },
  });
}

/** Rule 16 — activate / deactivate, with the memory columns written in the same PATCH. */
export function useToggleFinancingInputStatus(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; fields: Record<string, unknown> }) => {
      const data: Record<string, unknown> = {};
      if ("status" in a.fields) data["statecode"] = a.fields.status;
      if ("trackStatusActive" in a.fields) {
        data[INPUT_COL.trackStatusActive] = a.fields.trackStatusActive;
      }
      if ("dsraOriginalStatusActive" in a.fields) {
        data[INPUT_COL.dsraOriginalStatusActive] = a.fields.dsraOriginalStatusActive;
      }
      if ("isDeactivatedByButton" in a.fields) {
        data[INPUT_COL.isDeactivatedByButton] = a.fields.isDeactivatedByButton;
      }
      return financingInputFullRepo.update(a.id, data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
    },
  });
}

export interface TrancheSaveArgs {
  trancheId: string | null;
  projectId: string;
  categoryId: string | null;
  fields: Record<string, unknown>;
  repaymentProfile: number | null;
  repaymentRows: RepaymentRow[];
  storedRepayments: { id: string; year: number }[];
  stepUpEnabled: boolean;
  stepUpRows: StepUpRow[];
  storedStepUps: StoredStepUpRow[];
  language?: string;
}

/**
 * Rules 19 + 22 + 26 — the senior-debt tranche save.
 *
 * ONE unit of work covering the tranche upsert, the repayment diff and the step-up diff.
 * The canvas issues them separately inside a `Concurrent` and can half-fail, leaving a
 * tranche saved with orphaned repayment rows (UT-FIN-097 @ut-ref spec case; no `it()`
 * carries it — this file's HTTP wiring is untested). The re-entrancy guard of rule
 * 19 is TanStack's own `isPending`, surfaced to `canSaveSeniorDebtTranche` as `isSaving`.
 */
export function useSaveSeniorDebtTranche(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: TrancheSaveArgs) => {
      const fields = { ...a.fields, [`${INPUT_COL.project}@odata.bind`]: `/vsb_projects(${a.projectId})` };
      if (a.categoryId) {
        fields[`${INPUT_COL.category}@odata.bind`] =
          `/${ES_FINANCE.financingCategories}(${a.categoryId})`;
      }
      const id = a.trancheId
        ? (await financingInputFullRepo.update(a.trancheId, fields), a.trancheId)
        : await financingInputFullRepo.create(fields);

      const rd = repaymentDiff(
        a.repaymentProfile, a.repaymentRows, a.storedRepayments, a.language,
      );
      const repaymentOps: Omit<WriteOp, "entitySet">[] = [
        ...rd.toDelete.map((rid) => ({ op: "delete" as const, id: rid })),
        ...rd.toUpsert.map((u) => ({
          op: (u.recordId ? "update" : "create") as "update" | "create",
          id: u.recordId ?? undefined,
          data: {
            [REPAYMENT_COL.name]: u.name,
            [REPAYMENT_COL.year]: String(u.year),
            [REPAYMENT_COL.amount]: u.amount,
            [`${REPAYMENT_COL.financingInput}@odata.bind`]: `/${ES_FINANCE.financingInputs}(${id})`,
            [`${REPAYMENT_COL.project}@odata.bind`]: `/vsb_projects(${a.projectId})`,
            ...(a.categoryId
              ? {
                [`${REPAYMENT_COL.category}@odata.bind`]:
                  `/${ES_FINANCE.financingCategories}(${a.categoryId})`,
              }
              : {}),
          },
        })),
      ];
      if (repaymentOps.length > 0) await repaymentAmountRepo.saveMany(repaymentOps);

      const su = stepUpWrites(a.stepUpEnabled, a.stepUpRows, a.storedStepUps, a.language);
      const stepUpOps: Omit<WriteOp, "entitySet">[] = [
        ...su.toDelete.map((sid) => ({ op: "delete" as const, id: sid })),
        ...su.toUpsert.map((u) => ({
          op: (u.id ? "update" : "create") as "update" | "create",
          id: u.id,
          data: {
            [STEPUP_COL.name]: `Step ${u.order}`,
            [STEPUP_COL.order]: u.order,
            [STEPUP_COL.startYear]: u.startYear,
            [STEPUP_COL.duration]: u.duration,
            [STEPUP_COL.margin]: u.margin,
            [`${STEPUP_COL.financingInput}@odata.bind`]: `/${ES_FINANCE.financingInputs}(${id})`,
            [`${STEPUP_COL.project}@odata.bind`]: `/vsb_projects(${a.projectId})`,
          },
        })),
      ];
      if (stepUpOps.length > 0) await stepUpMarginRepo.saveMany(stepUpOps);

      trace("information", "Senior debt tranche saved", {
        id, repayments: rd.toUpsert.length, stepUps: su.toUpsert.length,
      });
      return id;
    },
    onError: (e) => trace("error", "Tranche save failed", { error: toAppError(e).message }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: qk.child("repaymentAmounts", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: qk.child("stepUpMargins", projectId ?? "none") });
    },
  });
}

/** Rule 38 — delete a tranche and cascade to its step-ups and repayment amounts. */
export function useDeleteSeniorDebtTranche(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: {
      trancheId: string;
      stepUps: { id: string; financingInputId: string }[];
      repayments: { id: string; financingInputId: string }[];
    }) => {
      const plan = trancheDeletePlan(a.trancheId, a.stepUps, a.repayments);
      if (plan.stepUpIds.length > 0) {
        await stepUpMarginRepo.saveMany(plan.stepUpIds.map((id) => ({ op: "delete" as const, id })));
      }
      if (plan.repaymentIds.length > 0) {
        await repaymentAmountRepo.saveMany(
          plan.repaymentIds.map((id) => ({ op: "delete" as const, id })),
        );
      }
      await financingInputFullRepo.remove(plan.trancheId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: qk.child("repaymentAmounts", projectId ?? "none") });
      void qc.invalidateQueries({ queryKey: qk.child("stepUpMargins", projectId ?? "none") });
    },
  });
}

/** The Equity / VAT / DSRA / Decommissioning saves — one PATCH each, no children. */
export function useSaveFinancingInput(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; fields: Record<string, unknown> }) =>
      financingInputFullRepo.update(a.id, a.fields),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.child("financingInputs", projectId ?? "none") });
    },
  });
}

/** `Language()` — read once, passed explicitly into every rule so the rules stay pure. */
export const useLocale = (): string =>
  useMemo(() => browserLocale(), []);
