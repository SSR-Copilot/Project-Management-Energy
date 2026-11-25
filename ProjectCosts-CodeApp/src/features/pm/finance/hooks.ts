/**
 * Project Finance Screen — the data layer (connected 20 Oct 2026, D34).
 *
 * READS (`data/finance.ts`, every one server-filtered with a `$select`):
 *  - the project (`gblRecordSelectedProject`, with `'Financing Options'`), re-read on every visit;
 *  - `colFinancingCategories` (the six categories, by `Order`);
 *  - `colFinancingInputInProject`, `colRepaymentAmountInProject`, `colStepUpMarginInProject`;
 *  - `locTotalDevexCapexCost` (the project's CAPEX contracts' costs, summed);
 *  - the active turbine count (generator types → turbines, D8);
 *  - at Save time, the tranche duplicate check (`UniqueKeyString`, all projects as the canvas).
 *
 * FABRIC SQL (connected 3 Nov 2026): `Assumptions Debt SQL`, `Assumptions Banks SQL` and
 * `AssumptionsKfWTrancheSQL` (`[dbo].[AssumptionsDebt]` / `[AssumptionsBanks]` /
 * `[AssumptionsKfWTranche]`, D54) are read only by `useDebtAssumptions` (the project country's rows,
 * split by `debttype`), `useBanks` and `useKfwTranches`. They feed the senior-debt, DSRA/DSRF and
 * decommissioning standards and seeds, and the bank and KfW pickers. While the debt read is loading
 * or has failed, the Screen treats it as unavailable, so no Fabric-built seed is written from empty
 * rows (`seedsAllowed`).
 *
 * WRITES — `WritePlan`s from `rules.ts`, run in order by `usePlanWrite`:
 *  - on visit: the guarded `'Financing Options'` patch (`financingOptionOnVisit`, SOURCE DEFECT 2)
 *    and the missing Equity / VAT-Financing seeds, each its own job (the canvas `IfError` per seed);
 *  - the financing-option cascade; the three Activate / Deactivate toggles; the tranche Delete
 *    cascade; the Equity, VAT, Decommissioning, DSRA/DSRF and tranche Saves.
 *
 * SERVER AUTOMATION (`ProjectDocs/migration-plans/04-flow-inventory.md`, verified 19 Oct 2026):
 *  - NO flow and NO plugin step is registered on `vsb_financinginput`,
 *    `vsb_financinginputsrepaymentamount`, `vsb_financinginputstepupmargins` or
 *    `vsb_financingcategory`.
 *  - The screen's only `vsb_projects` write is `vsb_financingoptions`. The project plugins filter
 *    on other columns (`vsb_operationsstartdatecod` — senior-debt repayment rebalancing;
 *    `vsb_construction` — financial-close shift; `vsb_construction, vsb_enddate,
 *    vsb_operationsstartdatecod` — decommissioning date sync; capacity and P50 triggers), and the
 *    project flows on `vsb_clusterstate` / creation / plant capacity. None fires from this screen;
 *    the plugins that READ financing inputs run when other screens move those project dates.
 *  - The canvas calls no flow (no `.Run(`). There is no approval, project-create or Apply control.
 *
 * PERMISSIONS: `CanEditSelectedProject`, `DataSourceInfo` and `RecordInfo` have no SDK equivalent
 * (D1): they pass and Dataverse refuses what the user may not do.
 *
 * PERFORMANCE (D137, switches in `data/financeFlags.ts`; `perf.ts` shapes the writes):
 *  - the inputs read does not wait for the categories (`parallelReads`), the project-state list is cached, the CAPEX
 *    cost chunks are read together;
 *  - the CAPEX total and the turbine count are read only while their panel or card is wanted (`lazyReads`);
 *  - a write reloads only the reads it can change (`PlanJob.invalidate`, `reloadKeys`), not `financeAll`.
 *  `useFinanceWrites`' own `invalidate` list (`financeAll`) is the default for a job that sets none.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_FINANCE, ES_PLANT } from "@/data/dataverseNames";
import { financePerf } from "@/data/financeFlags";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import { projectStatesQueryOptions } from "@/data/projectStates";
import {
  countActiveTurbines, findFinancingInputsByKey, listBanks, listDebtAssumptions,
  listFinancingCategories, listFinancingInputsRaw, listKfwTranches, listRepaymentAmounts,
  listStepUpMargins, loadFinanceProject, loadTotalDevexCapex, withCategoryOrder,
} from "@/data/finance";
import {
  sliceDebtAssumptions,
  type BankRow, type DebtAssumptionSlices, type FinanceProject, type FinancingCategory,
  type FinancingInputRow, type StoredRepaymentRow, type StoredStepUpMarginRow,
} from "./rules";
import { FINANCE_WRITE_ACTION } from "./perf";

/** The Dataverse entity sets the screen reads and writes. */
/**
 * The project-scoped reads re-run on EVERY visit, as the Canvas `OnVisible` does (`Refresh('Financing Inputs')`
 * and a `ClearCollect` of each collection, Y:69-166). Corrected 12 Nov 2026 (D109): with the app-wide 30 s
 * `staleTime`, coming back within 30 s of a change made elsewhere (COD, CAPEX, turbines) showed the old values.
 */
const EVERY_VISIT = { refetchOnMount: "always" } as const;

export const TABLES: readonly string[] = [
  ES.projects,
  ES_FINANCE.financingCategories,
  ES_FINANCE.financingInputs,
  ES_FINANCE.financingInputsRepaymentAmounts,
  ES_FINANCE.financingInputStepUpMargins,
  ES.capexProjectContracts,
  ES_ADMIN.capexCosts,
  ES_PLANT.generatorTypeInProjects,
  ES_PLANT.generatorInProjects,
];

const out = <T,>(q: { data?: T; isLoading: boolean; error: unknown }, empty: T): ScreenData<T> =>
  ({ data: q.data ?? empty, isLoading: q.isLoading, error: q.error ?? undefined, connected: true });

const REFERENCE_STALE = 30 * 60 * 1000;

/** `gblRecordSelectedProject` (+ `'Financing Options'`). */
export function useFinanceProject(projectId: string | undefined): ScreenData<FinanceProject | null> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "project"),
    // `parallelReads`: the project-state list is reference data (the admin-managed cluster states, read once per app
    // session by the canvas `OnStart`), so it is cached like the other reference reads; the project row stays live.
    queryFn: () => loadFinanceProject(
      projectId!,
      financePerf().parallelReads
        ? () => qc.fetchQuery(projectStatesQueryOptions())   // D159: the one shared `Project States` entry
        : undefined,
    ),
    enabled: Boolean(projectId),
    ...EVERY_VISIT,
  });
  return out<FinanceProject | null>(q, null);
}

/** `colFinancingCategories`. */
export function useFinancingCategories(): ScreenData<FinancingCategory[]> {
  const q = useQuery({
    queryKey: qk.financeReference("categories"),
    queryFn: listFinancingCategories,
    staleTime: REFERENCE_STALE,
  });
  return out<FinancingCategory[]>(q, []);
}

const NO_SLICES: DebtAssumptionSlices = { debt: [], decommissioning: [], dsra: [] };

/** `Assumptions Debt SQL` (Fabric SQL, read only) for the project's country, split by `debttype`. */
export function useDebtAssumptions(countryName: string | null): ScreenData<DebtAssumptionSlices> {
  const q = useQuery({
    queryKey: qk.financeReference("debtAssumptions", countryName ?? "-"),
    queryFn: async () => sliceDebtAssumptions(await listDebtAssumptions(countryName!)),
    enabled: Boolean(countryName),
    staleTime: REFERENCE_STALE,
  });
  // Once enabled, `isLoading` is true from the first render until the rows are in (the visit seeds
  // wait for it, see the Screen); with no country the read never runs and there is no standard.
  return out<DebtAssumptionSlices>(q, NO_SLICES);
}

/**
 * The list `useBanks` answers while it has no rows (loading, a failed or unconnected Fabric read): ONE array, so the
 * memoized `FinanceCards` that takes `banks` is not re-rendered by every Screen render (FE-P2-01, UT-FIN-FE-005).
 */
const NO_BANKS: BankRow[] = [];

/** `Assumptions Banks SQL` (Fabric SQL, read only) — the bank picker. */
export function useBanks(): ScreenData<BankRow[]> {
  const q = useQuery({
    queryKey: qk.financeReference("banks"),
    queryFn: listBanks,
    staleTime: REFERENCE_STALE,
  });
  return out<BankRow[]>(q, NO_BANKS);
}

/** `AssumptionsKfWTrancheSQL` (Fabric SQL, read only) — the KfW-Tranche picker. */
export function useKfwTranches(): ScreenData<string[]> {
  const q = useQuery({
    queryKey: qk.financeReference("kfwTranches"),
    queryFn: listKfwTranches,
    staleTime: REFERENCE_STALE,
  });
  return out<string[]>(q, []);
}

/**
 * `colFinancingInputInProject` — each row's `Order` comes from the categories.
 *
 * `parallelReads` on (the default): the rows are read WITHOUT waiting for the categories (one query keyed by the
 * project alone) and `select` attaches each row's `Order` once both are in, so the two requests run side by side.
 * Off: the read waits for the categories and is keyed by their ids, as before. The rows the screen gets are the same.
 */
export function useFinancingInputs(
  projectId: string | undefined, categories: readonly FinancingCategory[],
): ScreenData<FinancingInputRow[]> & { fresh: boolean } {
  const parallel = financePerf().parallelReads;
  const select = useMemo(() => (rows: readonly Record<string, unknown>[]) => withCategoryOrder(rows, categories), [categories]);
  const q = useQuery({
    queryKey: parallel
      ? qk.finance(projectId ?? "", "inputs")
      : qk.finance(projectId ?? "", "inputs", categories.map((c) => c.id).join(",")),
    queryFn: () => listFinancingInputsRaw(projectId!),
    select,
    enabled: Boolean(projectId) && (parallel || categories.length > 0),
    ...EVERY_VISIT,
  });
  /*
   * `fresh`: this visit's own read has landed. On a return visit the cached rows show at once
   * (`isLoading` is false) while the refetch runs; seeding from them re-created a row made after
   * that cache was filled (DuplicateRecordEntityKey on `UniqueKeyString`, 16 Nov 2026). The canvas
   * `CountIf('Financing Inputs', …)` always reads Dataverse live.
   */
  return { ...out<FinancingInputRow[]>(q, []), fresh: q.isFetchedAfterMount && !q.isFetching };
}

/** `colRepaymentAmountInProject`. */
export function useRepaymentAmounts(projectId: string | undefined): ScreenData<StoredRepaymentRow[]> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "repayments"),
    queryFn: () => listRepaymentAmounts(projectId!),
    enabled: Boolean(projectId),
    ...EVERY_VISIT,
  });
  return out<StoredRepaymentRow[]>(q, []);
}

/** `colStepUpMarginInProject`. */
export function useStepUpMargins(projectId: string | undefined): ScreenData<StoredStepUpMarginRow[]> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "stepUps"),
    queryFn: () => listStepUpMargins(projectId!),
    enabled: Boolean(projectId),
    ...EVERY_VISIT,
  });
  return out<StoredStepUpMarginRow[]>(q, []);
}

/** The app-wide `staleTime` (`app/Providers.tsx`). */
const APP_STALE = 30 * 1000;

/**
 * The `staleTime` of a LAZY read (D109 kept). A read that is wanted at mount is re-read by `refetchOnMount: "always"`;
 * one that becomes wanted later is not "mounted", so without this a copy cached by an EARLIER visit (less than the
 * app's 30 s old) would be shown without a read. Data fetched before this visit began is therefore stale at once, and
 * data fetched during it keeps the app's 30 s (so a card folded and unfolded again does not read again).
 */
function useVisitStaleTime() {
  const [mountedAt] = useState(() => Date.now());
  return useCallback(
    (query: { state: { dataUpdatedAt: number } }) => (query.state.dataUpdatedAt < mountedAt ? 0 : APP_STALE),
    [mountedAt],
  );
}

/**
 * `locTotalDevexCapexCost`. `wanted` (default true): `lazyReads` passes false while no card or panel that shows the
 * value has been opened, so the contracts and cost reads are not sent for a screen that never needs them. The screen
 * keeps a value it asked for once wanted for the rest of the visit.
 */
export function useTotalDevexCapex(projectId: string | undefined, wanted = true): ScreenData<number> {
  const staleTime = useVisitStaleTime();
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "totalCapex"),
    queryFn: () => loadTotalDevexCapex(projectId!),
    enabled: Boolean(projectId) && wanted,
    staleTime,
    ...EVERY_VISIT,
  });
  return out(q, 0);
}

/** The active turbines of the project (decommissioning card, Per Turbine). `wanted`: as `useTotalDevexCapex`. */
export function useActiveTurbineCount(projectId: string | undefined, wanted = true): ScreenData<number> {
  const staleTime = useVisitStaleTime();
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "activeTurbines"),
    queryFn: () => countActiveTurbines(projectId!),
    enabled: Boolean(projectId) && wanted,
    staleTime,
    ...EVERY_VISIT,
  });
  return out(q, 0);
}

/** The tranche Save's duplicate check, read when Save is pressed (as the canvas `LookUp`). */
export const fetchTrancheDuplicates = findFinancingInputsByKey;

/** Runs the write jobs from `rules.ts` and re-reads everything the screen shows. */
export function useFinanceWrites(projectId: string | undefined) {
  return usePlanWrite({
    invalidate: [qk.financeAll(projectId ?? "")],
    action: FINANCE_WRITE_ACTION,
  });
}
