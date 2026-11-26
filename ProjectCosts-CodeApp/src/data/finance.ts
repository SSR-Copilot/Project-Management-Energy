/**
 * PM Finance — the Dataverse reads behind `features/pm/finance` (connected 20 Oct 2026, D34).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Four tables
 * were registered for this screen with `pac code add-data-source`, one at a time (77 → 81):
 * `vsb_financingcategory`, `vsb_financinginput`, `vsb_financinginputsrepaymentamount` and
 * `vsb_financinginputstepupmargins`. The project row is mapped by `toRevenueProject`
 * (`data/pmProjectRow.ts`, shared with Revenues), the generator types by `listGeneratorTypes` (`data/generators.ts`, loaded
 * with `import()` when the turbine count is first read, FE-P2-05) — reused, not copied (rule 17);
 * the active turbine count reads `vsb_generatorinprojects` itself with the server-side `statecode eq 0` filter (OPT-07e).
 *
 * `Assumptions Debt SQL`, `Assumptions Banks SQL` and `AssumptionsKfWTrancheSQL` are Fabric SQL
 * sources (`[dbo].[AssumptionsDebt]` / `[AssumptionsBanks]` / `[AssumptionsKfWTranche]` on
 * `Lakehouse_Gold`, registered in D54), NOT Dataverse tables. They are read only, at the end of
 * this file (connected 3 Nov 2026, as Revenues in D57).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_financingcategoriesService } from "@/generated/services/Vsb_financingcategoriesService";
import { Vsb_financinginputsService } from "@/generated/services/Vsb_financinginputsService";
import { Vsb_financinginputsrepaymentamountsService } from "@/generated/services/Vsb_financinginputsrepaymentamountsService";
import { Vsb_financinginputstepupmarginsesService } from "@/generated/services/Vsb_financinginputstepupmarginsesService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { Vsb_generatorinprojectsService } from "@/generated/services/Vsb_generatorinprojectsService";
import { AssumptionsDebtService } from "@/generated/services/AssumptionsDebtService";
import { AssumptionsBanksService } from "@/generated/services/AssumptionsBanksService";
import { AssumptionsKfWTrancheService } from "@/generated/services/AssumptionsKfWTrancheService";
import {
  INPUT_COL, PROJECT_FINANCING_OPTIONS_COL, REPAYMENT_COL, STEPUP_COL, totalDevexCapex,
  type BankRow, type DebtAssumptionRow, type FinanceProject, type FinancingCategory,
  type FinancingInputRow, type StoredRepaymentRow, type StoredStepUpMarginRow,
} from "@/features/pm/finance/rules";
import { PROJECT_COL } from "@/features/pm/shared/projectRow";
import "./financeBulk"; // registers the schedule tables with the bulk backend (a side effect)
import { financePerf } from "./financeFlags";
import { generatorsPerf } from "./generatorsPerfFlags";
import { mapLimit } from "./concurrency";
import { fetchAll, fetchPage } from "./client";
import { ACTIVE, and, chunk, eq, guid, lookupEq, lookupIn } from "./odata";
import { rowStr as str, rowNum as num } from "./rowValues";
import { PROJECT_SELECT, toRevenueProject } from "./pmProjectRow";
import { listProjectStates } from "./generalData";

/** Cost-chunk reads in flight at once (`parallelReads`): a read shares the 52-request ceiling with the screen's other reads. */
const READ_CONCURRENCY = 8;

type Raw = Record<string, unknown>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];

/**
 * `gblRecordSelectedProject` with `'Financing Options'` — the project row the PM screens share,
 * read once per visit (the canvas `Set(gblRecordSelectedProject, Patch(…))` keeps it current).
 */
export async function loadFinanceProject(
  projectId: string,
  /** The project-state list. The screen passes a cached read (`parallelReads`); the default reads it every time. */
  loadStates: () => Promise<Awaited<ReturnType<typeof listProjectStates>>> = listProjectStates,
): Promise<FinanceProject | null> {
  const [rows, states] = await Promise.all([
    fetchPage(
      "load the project",
      (o) => Vsb_projectsService.getAll(o),
      { select: [...PROJECT_SELECT, PROJECT_FINANCING_OPTIONS_COL], filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
    ),
    loadStates(),
  ]);
  const r = raw(rows)[0];
  if (!r) return null;
  return { ...toRevenueProject(r, states), financingOptions: num(r[PROJECT_FINANCING_OPTIONS_COL]) };
}

/** `colFinancingCategories` = `Sort('Financing Categories', Order)` (App `OnStart`). */
export async function listFinancingCategories(): Promise<FinancingCategory[]> {
  const rows = raw(await fetchAll(
    "load the financing categories",
    (o) => Vsb_financingcategoriesService.getAll(o),
    { select: ["vsb_financingcategoryid", "vsb_name", "vsb_order"], orderBy: ["vsb_order asc"] },
  ));
  return rows.map((r) => ({
    id: String(r.vsb_financingcategoryid),
    name: str(r.vsb_name) ?? "",
    order: num(r.vsb_order) ?? 0,
  }));
}

const INPUT_SELECT = [...Object.values(INPUT_COL), "statecode", "createdon"];

/**
 * `colFinancingInputInProject` = `Filter('Financing Inputs', Project = …)`, sorted by `'Created On'`
 * (the tranche gallery's sort, D10). `categoryOrder` comes from the categories by id.
 */
export async function listFinancingInputs(
  projectId: string, categories: readonly FinancingCategory[],
): Promise<FinancingInputRow[]> {
  return withCategoryOrder(await listFinancingInputsRaw(projectId), categories);
}

/**
 * The project's financing input rows as Dataverse returned them. `listFinancingInputs` is this read plus
 * `withCategoryOrder`; the screen reads the rows alone (so the read does not wait for the categories, `parallelReads`)
 * and attaches each row's `Order` when both are in.
 */
export async function listFinancingInputsRaw(projectId: string): Promise<Raw[]> {
  return raw(await fetchAll(
    "load the project's financing inputs",
    (o) => Vsb_financinginputsService.getAll(o),
    { select: INPUT_SELECT, filter: lookupEq("vsb_project", projectId), orderBy: ["createdon asc"] },
  ));
}

/** The rows of `listFinancingInputsRaw` as `FinancingInputRow`s; `categoryOrder` comes from the categories by id. */
export function withCategoryOrder(rows: readonly Raw[], categories: readonly FinancingCategory[]): FinancingInputRow[] {
  const orderById = new Map(categories.map((c) => [c.id, c.order]));
  return rows.map((r) => {
    const categoryId = str(r[INPUT_COL.category]);
    return {
      id: String(r[INPUT_COL.id]),
      name: str(r[INPUT_COL.name]) ?? "",
      categoryId,
      // Category ids are primary keys, so the map lookup equals the `find` it replaced.
      categoryOrder: (categoryId ? orderById.get(categoryId) : undefined) ?? 0,
      uniqueKeyString: str(r[INPUT_COL.uniqueKeyString]),
      status: num(r.statecode) ?? 0,
      raw: r,
      // `RecordInfo(…, Edit/DeletePermission)` has no SDK equivalent (D1): Dataverse decides.
      canEdit: true,
      canDelete: true,
    };
  });
}

/** `colRepaymentAmountInProject`. `'Repayment Year'` is TEXT; the canvas reads it with `Value()`. */
export async function listRepaymentAmounts(projectId: string): Promise<StoredRepaymentRow[]> {
  const rows = raw(await fetchAll(
    "load the project's repayment amounts",
    (o) => Vsb_financinginputsrepaymentamountsService.getAll(o),
    {
      select: [REPAYMENT_COL.id, REPAYMENT_COL.financingInput, REPAYMENT_COL.year, REPAYMENT_COL.amount],
      filter: lookupEq("vsb_project", projectId),
    },
  ));
  return rows.map((r) => ({
    id: String(r[REPAYMENT_COL.id]),
    financingInputId: str(r[REPAYMENT_COL.financingInput]) ?? "",
    year: Number(str(r[REPAYMENT_COL.year]) ?? NaN),
    amount: num(r[REPAYMENT_COL.amount]) ?? 0,
    storedAmount: num(r[REPAYMENT_COL.amount]),
  }));
}

/** `colStepUpMarginInProject`. */
export async function listStepUpMargins(projectId: string): Promise<StoredStepUpMarginRow[]> {
  const rows = raw(await fetchAll(
    "load the project's step-up margins",
    (o) => Vsb_financinginputstepupmarginsesService.getAll(o),
    {
      select: [STEPUP_COL.id, STEPUP_COL.financingInput, STEPUP_COL.order, STEPUP_COL.startYear, STEPUP_COL.duration, STEPUP_COL.margin],
      filter: lookupEq("vsb_project", projectId),
      orderBy: [`${STEPUP_COL.order} asc`],
    },
  ));
  return rows.map((r) => ({
    id: String(r[STEPUP_COL.id]),
    financingInputId: str(r[STEPUP_COL.financingInput]) ?? "",
    order: num(r[STEPUP_COL.order]) ?? 0,
    startYear: num(r[STEPUP_COL.startYear]) ?? 0,
    duration: num(r[STEPUP_COL.duration]) ?? 0,
    margin: num(r[STEPUP_COL.margin]) ?? 0,
    hasBlank: [STEPUP_COL.order, STEPUP_COL.startYear, STEPUP_COL.duration, STEPUP_COL.margin].some((c) => num(r[c]) === null),
  }));
}

/**
 * `locTotalDevexCapexCost` (Y:1888-1910): `Sum(Filter('CAPEX Costs', Contract in <the project's
 * CAPEX Project Contracts>), Cost)`, 0 without contracts. Both filters run on the server (the canvas
 * loaded the whole contracts table at app start).
 */
export async function loadTotalDevexCapex(
  projectId: string,
  /** `true` (`parallelReads`): the cost chunks are read together, in chunk order. `false`: one after the other, as before. */
  parallel: boolean = financePerf().parallelReads,
): Promise<number> {
  const contracts = raw(await fetchAll(
    "load the project's CAPEX contracts",
    (o) => Vsb_capexprojectcontractsService.getAll(o),
    { select: ["vsb_capexprojectcontractid"], filter: lookupEq("vsb_project", projectId) },
  )).map((r) => String(r.vsb_capexprojectcontractid));
  const readChunk = async (part: string[]) => raw(await fetchAll(
    "load the project's CAPEX costs",
    (o) => Vsb_capexcostsService.getAll(o),
    // OPT-08a: 5000 rows a page (a project with 579 cost rows was two sequential pages at 500; it changes the number of round
    // trips and nothing else, as `loadContractCostSums`) and no unused `vsb_capexcostid`. No `ACTIVE` filter: the canvas has none.
    { select: ["_vsb_contract_value", "vsb_cost"], filter: lookupIn("vsb_contract", part), maxPageSize: 5000 },
  ));
  const parts = chunk(contracts);
  // `mapLimit` keeps the chunk order, so the rows (and the sum) are exactly the sequential ones; at most
  // `READ_CONCURRENCY` chunks are in flight, so a project with very many contracts cannot flood the 52-request ceiling.
  const chunks = parallel ? await mapLimit(parts, readChunk, READ_CONCURRENCY) : await readInOrder(parts, readChunk);
  const costs: { contractId: string; cost: number | null }[] = [];
  for (const rows of chunks) {
    costs.push(...rows.map((r) => ({ contractId: str(r._vsb_contract_value) ?? "", cost: num(r.vsb_cost) })));
  }
  return totalDevexCapex(contracts, costs);
}

/** `read` over `parts`, one at a time (the behaviour before `parallelReads`). */
async function readInOrder<T, R>(parts: readonly T[], read: (part: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const part of parts) out.push(await read(part));
  return out;
}

/**
 * The active turbine count of the decommissioning card (Y:5165): `CountRows(Filter(GeneratorInProjects,
 * AsType(ModuleTypeInProject, GeneratorTypeInProjects).Project = project, Status = Active))`.
 * `vsb_generatorinproject` has no project lookup (D8): the project's generator types are read, then
 * their turbines through the polymorphic `vsb_moduletypeinprojectid`.
 */
export async function countActiveTurbines(projectId: string, cachedTypeIds?: readonly string[] | null): Promise<number> {
  // PA-10 (`GENERATORS_PERF.typeReadsLean`, dvopt T-22): only the type ids are used, so (1) a list of the types the Generators warm-up
  // cached and that is as fresh as this visit is reused (`cachedTypeIds`, from the hook), and (2) otherwise the ids alone are read
  // (`$select` = the id) instead of the 12-column list. OFF: the full list is read, as before.
  let types: { id: string }[];
  if (generatorsPerf().typeReadsLean && cachedTypeIds) {
    types = cachedTypeIds.map((id) => ({ id }));
  } else {
    // A dynamic import (FE-P2-05, D162): the Generators data module is fetched only when the Decommissioning card or panel
    // first needs the count (`lazyReads`), not with the Finance screen's chunk.
    const { listGeneratorTypeIds, listGeneratorTypes } = await import("./generators");
    types = generatorsPerf().typeReadsLean ? await listGeneratorTypeIds(projectId) : await listGeneratorTypes(projectId);
  }
  if (types.length === 0) return 0;
  // OPT-07e: the `statecode eq 0` clause is sent to the server and only the id is selected, so the active rows come back and the
  // count is their number. Same count as the old browser-side `status === 0` over every turbine (`listProjectTurbines` maps a
  // row's `statecode` to `status`, `?? 0`; Dataverse always sends `statecode`).
  const parts = chunk(types.map((t) => t.id));
  const counts = await mapLimit(parts, async (part) => (await fetchAll(
    "count the project's active turbines",
    (o) => Vsb_generatorinprojectsService.getAll(o),
    { select: ["vsb_generatorinprojectid"], filter: and(lookupIn("vsb_moduletypeinprojectid", part), ACTIVE) },
  )).length, READ_CONCURRENCY);
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * The tranche Save's duplicate guard (Y:13733): `LookUp('Financing Inputs', UniqueKeyString = key)`
 * over the whole table, as the canvas (the key carries the project id). Returns the matching ids.
 */
export async function findFinancingInputsByKey(key: string): Promise<string[]> {
  const rows = raw(await fetchPage(
    "check for a duplicate tranche",
    (o) => Vsb_financinginputsService.getAll(o),
    { select: [INPUT_COL.id], filter: eq(INPUT_COL.uniqueKeyString, key), top: 5 },
  ));
  return rows.map((r) => String(r[INPUT_COL.id]));
}

/* ════════════════════════════════════════════════════ Fabric SQL (read only) ══ */

/**
 * `colStandardAssumptionsDebt` / `…Decommissioning` / `…DSRA_DSRF` (`OnVisible`, Y:119-150): every
 * `Filter('Assumptions Debt SQL', country = <project country>, debttype = …)`, read once. The rows
 * are re-checked against the country (in case the connector does not apply the filter) and split by
 * `debttype` in `sliceDebtAssumptions` (rules). A blank `category` is "", as the canvas sees it.
 */
export async function listDebtAssumptions(countryName: string): Promise<DebtAssumptionRow[]> {
  const rows = await fetchAll(
    "read the debt assumptions (Fabric SQL)",
    (o) => AssumptionsDebtService.getAll(o),
    { select: ["country", "debttype", "category", "pv", "wind"], filter: eq("country", countryName) },
  );
  // The delegated SQL compare ignores case and trailing spaces, so the re-check does too. Corrected 12 Nov 2026
  // (D109): an exact match dropped every row when Fabric spelt the country differently from Dataverse.
  const key = countryName.trim().toLowerCase();
  return rows
    .filter((r) => (r.country ?? "").trim().toLowerCase() === key)
    .map((r) => ({
      country: r.country ?? "", debttype: r.debttype ?? "", category: r.category ?? "",
      wind: r.wind ?? null, pv: r.pv ?? null,
    }));
}

/**
 * `colAssumptionBanks` = `'Assumptions Banks SQL'` (Y:1878), the whole table. A tranche stores the
 * bank row's `id` (`LookUp(colAssumptionBanks, id = ThisItem.Bank, bankname)`, Y:3624).
 */
export async function listBanks(): Promise<BankRow[]> {
  const rows = await fetchAll(
    "read the banks (Fabric SQL)",
    (o) => AssumptionsBanksService.getAll(o),
    { select: ["id", "bankname"] },
  );
  return rows.flatMap((r) => (r.id ? [{ id: String(r.id), bankname: r.bankname ?? "" }] : []));
}

/**
 * `colAssumptionKfWs` = `AssumptionsKfWTrancheSQL` (Y:1874), the whole table: the KfW-Tranche
 * dropdown's `loantenor_repayfreeperiod_ratefixing` values, in table order, blanks dropped.
 */
export async function listKfwTranches(): Promise<string[]> {
  const rows = await fetchAll(
    "read the KfW tranches (Fabric SQL)",
    (o) => AssumptionsKfWTrancheService.getAll(o),
    { select: ["loantenor_repayfreeperiod_ratefixing"] },
  );
  return rows.flatMap((r) => (r.loantenor_repayfreeperiod_ratefixing ? [r.loantenor_repayfreeperiod_ratefixing] : []));
}
