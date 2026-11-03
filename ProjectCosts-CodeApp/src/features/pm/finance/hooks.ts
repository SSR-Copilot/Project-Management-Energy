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
 */
import { useQuery } from "@tanstack/react-query";
import { ES, ES_ADMIN, ES_FINANCE, ES_PLANT } from "@/data/dataverseNames";
import { qk } from "@/data/keys";
import type { ScreenData } from "@/data/notConnected";
import { usePlanWrite } from "@/data/usePlanWrite";
import {
  countActiveTurbines, findFinancingInputsByKey, listBanks, listDebtAssumptions,
  listFinancingCategories, listFinancingInputs, listKfwTranches, listRepaymentAmounts,
  listStepUpMargins, loadFinanceProject, loadTotalDevexCapex,
} from "@/data/finance";
import {
  sliceDebtAssumptions,
  type BankRow, type DebtAssumptionSlices, type FinanceProject, type FinancingCategory,
  type FinancingInputRow, type StoredRepaymentRow, type StoredStepUpMarginRow,
} from "./rules";

/** The Dataverse entity sets the screen reads and writes. */
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
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "project"),
    queryFn: () => loadFinanceProject(projectId!),
    enabled: Boolean(projectId),
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

/** `Assumptions Banks SQL` (Fabric SQL, read only) — the bank picker. */
export function useBanks(): ScreenData<BankRow[]> {
  const q = useQuery({
    queryKey: qk.financeReference("banks"),
    queryFn: listBanks,
    staleTime: REFERENCE_STALE,
  });
  return out<BankRow[]>(q, []);
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

/** `colFinancingInputInProject` — needs the categories for each row's `Order`. */
export function useFinancingInputs(
  projectId: string | undefined, categories: readonly FinancingCategory[],
): ScreenData<FinancingInputRow[]> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "inputs", categories.map((c) => c.id).join(",")),
    queryFn: () => listFinancingInputs(projectId!, categories),
    enabled: Boolean(projectId) && categories.length > 0,
  });
  return out<FinancingInputRow[]>(q, []);
}

/** `colRepaymentAmountInProject`. */
export function useRepaymentAmounts(projectId: string | undefined): ScreenData<StoredRepaymentRow[]> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "repayments"),
    queryFn: () => listRepaymentAmounts(projectId!),
    enabled: Boolean(projectId),
  });
  return out<StoredRepaymentRow[]>(q, []);
}

/** `colStepUpMarginInProject`. */
export function useStepUpMargins(projectId: string | undefined): ScreenData<StoredStepUpMarginRow[]> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "stepUps"),
    queryFn: () => listStepUpMargins(projectId!),
    enabled: Boolean(projectId),
  });
  return out<StoredStepUpMarginRow[]>(q, []);
}

/** `locTotalDevexCapexCost`. */
export function useTotalDevexCapex(projectId: string | undefined): ScreenData<number> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "totalCapex"),
    queryFn: () => loadTotalDevexCapex(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, 0);
}

/** The active turbines of the project (decommissioning card, Per Turbine). */
export function useActiveTurbineCount(projectId: string | undefined): ScreenData<number> {
  const q = useQuery({
    queryKey: qk.finance(projectId ?? "", "activeTurbines"),
    queryFn: () => countActiveTurbines(projectId!),
    enabled: Boolean(projectId),
  });
  return out(q, 0);
}

/** The tranche Save's duplicate check, read when Save is pressed (as the canvas `LookUp`). */
export const fetchTrancheDuplicates = findFinancingInputsByKey;

/** Runs the write jobs from `rules.ts` and re-reads everything the screen shows. */
export function useFinanceWrites(projectId: string | undefined) {
  return usePlanWrite({
    invalidate: [qk.financeAll(projectId ?? "")],
    action: "change this project's financing inputs",
  });
}
