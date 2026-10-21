/**
 * PM Finance — the Dataverse reads behind `features/pm/finance` (connected 20 Oct 2026, D34).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Four tables
 * were registered for this screen with `pac code add-data-source`, one at a time (77 → 81):
 * `vsb_financingcategory`, `vsb_financinginput`, `vsb_financinginputsrepaymentamount` and
 * `vsb_financinginputstepupmargins`. The project row is mapped by `toRevenueProject`
 * (`data/revenues.ts`), the generator types / turbines by `listGeneratorTypes` /
 * `listProjectTurbines` (`data/generators.ts`) — reused, not copied (rule 17).
 *
 * `Assumptions Debt SQL`, `Assumptions Banks SQL` and `AssumptionsKfWTrancheSQL` are Fabric SQL
 * sources (`References/DataSources.json`: `shared_sql`, `Lakehouse_Gold`), NOT Dataverse tables,
 * and are not read here (D2).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_financingcategoriesService } from "@/generated/services/Vsb_financingcategoriesService";
import { Vsb_financinginputsService } from "@/generated/services/Vsb_financinginputsService";
import { Vsb_financinginputsrepaymentamountsService } from "@/generated/services/Vsb_financinginputsrepaymentamountsService";
import { Vsb_financinginputstepupmarginsesService } from "@/generated/services/Vsb_financinginputstepupmarginsesService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import {
  INPUT_COL, PROJECT_FINANCING_OPTIONS_COL, REPAYMENT_COL, STEPUP_COL, totalDevexCapex,
  type FinanceProject, type FinancingCategory, type FinancingInputRow, type StoredRepaymentRow,
  type StoredStepUpMarginRow,
} from "@/features/pm/finance/rules";
import { PROJECT_COL } from "@/features/pm/revenues/rules";
import { fetchAll, fetchPage } from "./client";
import { chunk, eq, guid, lookupEq, lookupIn, numberOf } from "./odata";
import { PROJECT_SELECT, toRevenueProject } from "./revenues";
import { listProjectStates } from "./generalData";
import { listGeneratorTypes, listProjectTurbines } from "./generators";

type Raw = Record<string, unknown>;
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;

/**
 * `gblRecordSelectedProject` with `'Financing Options'` — the project row the PM screens share,
 * read once per visit (the canvas `Set(gblRecordSelectedProject, Patch(…))` keeps it current).
 */
export async function loadFinanceProject(projectId: string): Promise<FinanceProject | null> {
  const [rows, states] = await Promise.all([
    fetchPage(
      "load the project",
      (o) => Vsb_projectsService.getAll(o),
      { select: [...PROJECT_SELECT, PROJECT_FINANCING_OPTIONS_COL], filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
    ),
    listProjectStates(),
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
  const rows = raw(await fetchAll(
    "load the project's financing inputs",
    (o) => Vsb_financinginputsService.getAll(o),
    { select: INPUT_SELECT, filter: lookupEq("vsb_project", projectId), orderBy: ["createdon asc"] },
  ));
  return rows.map((r) => {
    const categoryId = str(r[INPUT_COL.category]);
    return {
      id: String(r[INPUT_COL.id]),
      name: str(r[INPUT_COL.name]) ?? "",
      categoryId,
      categoryOrder: categories.find((c) => c.id === categoryId)?.order ?? 0,
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
  }));
}

/**
 * `locTotalDevexCapexCost` (Y:1888-1910): `Sum(Filter('CAPEX Costs', Contract in <the project's
 * CAPEX Project Contracts>), Cost)`, 0 without contracts. Both filters run on the server (the canvas
 * loaded the whole contracts table at app start).
 */
export async function loadTotalDevexCapex(projectId: string): Promise<number> {
  const contracts = raw(await fetchAll(
    "load the project's CAPEX contracts",
    (o) => Vsb_capexprojectcontractsService.getAll(o),
    { select: ["vsb_capexprojectcontractid"], filter: lookupEq("vsb_project", projectId) },
  )).map((r) => String(r.vsb_capexprojectcontractid));
  const costs: { contractId: string; cost: number | null }[] = [];
  for (const part of chunk(contracts)) {
    const rows = raw(await fetchAll(
      "load the project's CAPEX costs",
      (o) => Vsb_capexcostsService.getAll(o),
      { select: ["vsb_capexcostid", "_vsb_contract_value", "vsb_cost"], filter: lookupIn("vsb_contract", part) },
    ));
    costs.push(...rows.map((r) => ({ contractId: str(r._vsb_contract_value) ?? "", cost: num(r.vsb_cost) })));
  }
  return totalDevexCapex(contracts, costs);
}

/**
 * The active turbine count of the decommissioning card (Y:5165): `CountRows(Filter(GeneratorInProjects,
 * AsType(ModuleTypeInProject, GeneratorTypeInProjects).Project = project, Status = Active))`.
 * `vsb_generatorinproject` has no project lookup (D8): the project's generator types are read, then
 * their turbines through the polymorphic `vsb_moduletypeinprojectid`.
 */
export async function countActiveTurbines(projectId: string): Promise<number> {
  const types = await listGeneratorTypes(projectId);
  if (types.length === 0) return 0;
  const turbines = await listProjectTurbines(types.map((t) => t.id));
  return turbines.filter((t) => t.status === 0).length;
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
