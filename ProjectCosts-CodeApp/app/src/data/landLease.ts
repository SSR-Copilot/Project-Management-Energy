/**
 * Land Lease — the Cost module's Land Lease reads and its write executor.
 *
 * WHERE THIS CAME FROM. It was written as `src/features/land-lease/hooks.ts` while `src/data/*`
 * was frozen for another change, and it is here now because `costRepository.ts`'s own header
 * calls itself "the Cost module's single data boundary" and warns that bypassing it "is how a
 * boundary like this rots". The queries are unchanged; only the address is. Every function here
 * is reached by the screen through `costRepository()` and the hooks in
 * `features/costing/useCostBook.ts`, exactly as every other Cost screen reaches its data.
 *
 * WHY IT IS NOT `costBook.ts`'s `loadLandLeasePeriods`. The shared cost book flattens OPEX and
 * Land Lease into one `CostPeriod`, and three things the Land Lease screen needs do not survive
 * that flattening — each of which was a real defect in the shared path and is fixed here:
 *
 *   1. MONEY IS NULLABLE. `landLeaseRules`' `formatGrouped` prints a STORED `0` and BLANKS a
 *      null, and `firstPeriodHasRate` — the `Add Period` gate — asks whether any of the five
 *      rates is non-blank. MEASURED, VSBCloud_Dev 16 Sep: of 517 `vsb_landleaseperiods` rows only
 *      173 carry `vsb_fixedcosts`, 102 `vsb_ofrevenues`, 23 `vsb_eurmwh`, 11 `vsb_eurmw` and 269
 *      `vsb_eurwtg`. A `?? 0` coalesce therefore prints `0` in five columns the canvas leaves
 *      empty on the large majority of rows, and turns `Add Period` permanently on. `nullableNumber`
 *      below keeps null as null.
 *   2. THE HEADER'S OWN COLUMNS. `vsb_landowner` and the six one-time-payment columns
 *      (`vsb_amountonetimepayment` 1..3, `vsb_duedateonetimepayment` 1..3) are selected here and
 *      written by `planLeaseSave`'s cost payload. MEASURED: 12 of 416 headers carry a land owner,
 *      27 carry a first amount and 29 a first due date — so the panel's One-Time Payment section
 *      has real data to show, and without these columns it would be cosmetic.
 *   3. ALLOCATIONS AND GENERATORS. `vsb_landleaseallocationwtgs` is read per header and
 *      reconciled by `planLeaseSave` (`diffAllocation`), and `loadLeaseGenerators` is the
 *      `colGeneratorsInProject` the WTG picker's `Items` needs. Without both,
 *      `canSaveLandLease`'s PV/Wind allocation clause can only be satisfied by "allocate to all",
 *      which blocks Save on every PV/Wind project that allocates per WTG.
 *
 * `costBook.ts`'s Land Lease functions now read through `loadLeaseBook` rather than issuing a
 * second, lossier set of queries, so there is ONE Land Lease read path in the app.
 *
 * NO `$batch`. `convertOptionsToQueryString` in `@microsoft/power-apps` serialises only
 * `$select/$filter/$orderby/$top/$skip/$count/$skiptoken` and the SDK exposes no changeset, so
 * `applyLeaseWrites` runs a plan's writes SEQUENTIALLY in the order the planner emitted them.
 * That order is the canvas' own and it is load-bearing: a create that others bind to comes
 * first, and deletes run children-before-parents.
 */
import type { IOperationResult } from "@microsoft/power-apps/data";
import { Vsb_landleasesubaccountsService } from "@/generated/services/Vsb_landleasesubaccountsService";
import { Vsb_landleaseprojectcostsService } from "@/generated/services/Vsb_landleaseprojectcostsService";
import { Vsb_landleaseperiodsService } from "@/generated/services/Vsb_landleaseperiodsService";
import { Vsb_landleaseallocationwtgsService } from "@/generated/services/Vsb_landleaseallocationwtgsService";
import { Vsb_generatorinprojectsService } from "@/generated/services/Vsb_generatorinprojectsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_pvmoduletypeinprojectsService } from "@/generated/services/Vsb_pvmoduletypeinprojectsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { Vsb_countryinflationprofilesService } from "@/generated/services/Vsb_countryinflationprofilesService";
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { unwrap } from "@/platform/errors";
import {
  bindParent, generatorOptions, LEASE_ENTITY_SET, TYPE_OF_CONTRACT,
  type GeneratorOption, type LeaseAllocationRow, type LeaseAssumptionRow, type LeaseCostRow,
  type LeasePeriodRow, type LeaseSubaccountRow, type LeaseWrite,
} from "@/features/periods/landLeaseRules";
import { fetchAll } from "./client";
import { ACTIVE, and, chunk, eq, lookupEq, lookupIn } from "./odata";

/** Option sets arrive as a number or as its string form depending on the column. */
function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A nullable money / numeric column. `undefined` and `null` both mean BLANK, never zero. */
export function nullableNumber(value: number | undefined | null): number | null {
  return value === undefined || value === null || !Number.isFinite(value) ? null : value;
}

export function nullableText(value: string | undefined | null): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

/* ═══════════════════════════════════════════════════════════════════ the book ══ */

export interface LeaseBook {
  subaccounts: LeaseSubaccountRow[];
  costs: LeaseCostRow[];
  periods: LeasePeriodRow[];
  allocations: LeaseAllocationRow[];
}

export const LEASE_COST_SELECT = [
  "vsb_landleaseprojectcostid", "vsb_name", "vsb_description", "vsb_landowner",
  "_vsb_subaccount_value", "_vsb_currency_value", "vsb_secured", "vsb_allwtgallocated",
  "vsb_isstandardcontract", "vsb_isstartdatestandardassumption",
  "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
  "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
  "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
  "vsb_inflationcountryarea", "vsb_inflationstartyear", "createdon",
];

export const LEASE_PERIOD_SELECT = [
  "vsb_landleaseperiodid", "vsb_name", "_vsb_projectcost_value", "vsb_period", "vsb_startdate",
  "vsb_landleasedurationyears", "vsb_landleasedurationmonths",
  "vsb_fixedcosts", "vsb_ofrevenues", "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg",
  "vsb_aggregation", "vsb_distributionfrequency",
];

/**
 * Everything the screen renders, in four queries.
 *
 * `OnVisible` (`PA:14`) is a `Concurrent` of the same four `ClearCollect`s, with one
 * difference: its `Land Lease Periods` collect is a CLIENT-side join
 * (`'Project Cost'.'Land Lease Project Cost' in colLandLeaseProjectCosts…`), which is a
 * delegation workaround. Here the period query is scoped server-side by the header ids the
 * first query returned, chunked because Dataverse has no `in` for GUIDs.
 */
export async function loadLeaseBook(projectId: string): Promise<LeaseBook> {
  const [subaccountRows, costRows] = await Promise.all([
    fetchAll(
      "list Land Lease subaccounts",
      (o) => Vsb_landleasesubaccountsService.getAll(o),
      {
        select: ["vsb_landleasesubaccountid", "vsb_name", "vsb_order"],
        filter: ACTIVE,
      },
    ),
    fetchAll(
      "list Land Lease project costs",
      (o) => Vsb_landleaseprojectcostsService.getAll(o),
      { select: LEASE_COST_SELECT, filter: and(lookupEq("vsb_project", projectId), ACTIVE) },
    ),
  ]);

  const subaccounts: LeaseSubaccountRow[] = subaccountRows.map((r) => ({
    id: r.vsb_landleasesubaccountid,
    name: r.vsb_name ?? "",
    order: r.vsb_order ?? 0,
  }));

  const headerIds = costRows.map((r) => r.vsb_landleaseprojectcostid);
  const currencyIds = [...new Set(
    costRows.map((r) => r._vsb_currency_value).filter((v): v is string => Boolean(v)),
  )];

  const [periodBatches, allocationBatches, currencyName] = await Promise.all([
    Promise.all(chunk(headerIds).map((ids) => fetchAll(
      "list Land Lease periods",
      (o) => Vsb_landleaseperiodsService.getAll(o),
      { select: LEASE_PERIOD_SELECT, filter: lookupIn("vsb_projectcost", ids) },
    ))),
    Promise.all(chunk(headerIds).map((ids) => fetchAll(
      "list Land Lease WTG allocations",
      (o) => Vsb_landleaseallocationwtgsService.getAll(o),
      {
        select: [
          "vsb_landleaseallocationwtgid", "_vsb_projectcost_value",
          "_vsb_generatorinproject_value",
        ],
        filter: lookupIn("vsb_projectcost", ids),
      },
    ))),
    loadCurrencyNames(currencyIds),
  ]);

  const costs: LeaseCostRow[] = costRows.map((r) => ({
    id: r.vsb_landleaseprojectcostid,
    name: r.vsb_name ?? "",
    description: r.vsb_description ?? "",
    subaccountId: r._vsb_subaccount_value ?? null,
    landOwner: nullableText(r.vsb_landowner),
    currencyId: r._vsb_currency_value ?? null,
    currencyName: currencyName.get(r._vsb_currency_value ?? "") ?? null,
    secured: numberOf(r.vsb_secured),
    allWtgAllocated: r.vsb_allwtgallocated === true,
    isStandardContract: r.vsb_isstandardcontract === true,
    isStartDateStandardAssumption: r.vsb_isstartdatestandardassumption === true,
    amountOneTimePayment: nullableNumber(r.vsb_amountonetimepayment),
    amountOneTimePayment2: nullableNumber(r.vsb_amountonetimepayment2),
    amountOneTimePayment3: nullableNumber(r.vsb_amountonetimepayment3),
    dueDateOneTimePayment: nullableText(r.vsb_duedateonetimepayment),
    dueDateOneTimePayment2: nullableText(r.vsb_duedateonetimepayment2),
    dueDateOneTimePayment3: nullableText(r.vsb_duedateonetimepayment3),
    useInflationProfile: r.vsb_useinflationprofile === true,
    useCountryInflationProfile: r.vsb_usecountryinflationprofile === true,
    inflationProfile: nullableNumber(r.vsb_inflationprofile),
    inflationCountryArea: nullableText(r.vsb_inflationcountryarea),
    inflationStartYear: nullableNumber(r.vsb_inflationstartyear),
    createdOn: nullableText(r.createdon),
  }));

  const periods: LeasePeriodRow[] = periodBatches.flat().map((r) => ({
    id: r.vsb_landleaseperiodid,
    name: r.vsb_name ?? "",
    projectCostId: r._vsb_projectcost_value ?? null,
    period: numberOf(r.vsb_period),
    startDate: r.vsb_startdate ? r.vsb_startdate.slice(0, 10) : null,
    durationYears: nullableNumber(r.vsb_landleasedurationyears),
    durationMonths: nullableNumber(r.vsb_landleasedurationmonths),
    fixedCosts: nullableNumber(r.vsb_fixedcosts),
    percentOfRevenues: nullableNumber(r.vsb_ofrevenues),
    eurPerMwh: nullableNumber(r.vsb_eurmwh),
    eurPerMw: nullableNumber(r.vsb_eurmw),
    eurPerWtg: nullableNumber(r.vsb_eurwtg),
    aggregation: numberOf(r.vsb_aggregation),
    distributionFrequency: nullableNumber(r.vsb_distributionfrequency),
  }));

  const allocations: LeaseAllocationRow[] = allocationBatches.flat().map((r) => ({
    id: r.vsb_landleaseallocationwtgid,
    projectCostId: r._vsb_projectcost_value ?? null,
    generatorInProjectId: r._vsb_generatorinproject_value ?? null,
  }));

  return { subaccounts, costs, periods, allocations };
}

/** One `Currencies` row, as the panel's disabled dropdown and the grid's column need it. */
export interface CurrencyRow {
  id: string;
  /** `Currency Name` — "Euro", the dropdown's display field (`LL:2770`). */
  name: string;
  /** `Currency Code` — "EUR", what `defaultCurrencyCode` returns. */
  code: string;
}

/**
 * `Currencies`, unfiltered.
 *
 * Deliberately NOT filtered by `statecode`, for the reason `costBook.loadCurrencyNames` gives:
 * a contract that points at a since-deactivated currency should still show the name it was
 * saved with.
 */
export async function loadCurrencies(): Promise<CurrencyRow[]> {
  const rows = await fetchAll(
    "list transaction currencies for Land Lease",
    (o) => TransactioncurrenciesService.getAll(o),
    { select: ["transactioncurrencyid", "currencyname", "isocurrencycode"] },
  );
  return rows.map((r) => ({
    id: r.transactioncurrencyid,
    name: r.currencyname ?? "",
    code: r.isocurrencycode ?? "",
  }));
}

async function loadCurrencyNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  return new Map((await loadCurrencies()).map((c) => [c.id, c.name]));
}

/* ═════════════════════════════════════════════════════════════════ generators ══ */

/** `statecode` on `vsb_generatorinprojects` — the canvas' `Status` in `$"{Name} - {Status}"`. */
const GENERATOR_STATE_LABEL: Record<number, string> = { 0: "Active", 1: "Inactive" };

/**
 * `colGeneratorsInProject` (`PA:14`) — two `Collect`s into one collection, then sorted by
 * `Order` ascending by the picker.
 *
 * A `GeneratorInProjects` row reaches its project through the POLYMORPHIC
 * `ModuleTypeInProject` lookup, which points either at a `GeneratorTypeInProjects` row (a WTG)
 * or at a `PVModuleTypeInProjects` row (a PV string). Both type tables carry the project, so
 * they are resolved first and the generators filtered by the ids they yield — the same shape
 * `periodWrites.resolveDeviceType` uses.
 */
export async function loadLeaseGenerators(projectId: string): Promise<GeneratorOption[]> {
  const [generatorTypes, pvTypes] = await Promise.all([
    fetchAll(
      "list generator types in project for Land Lease",
      (o) => Vsb_generatortypeinprojectsService.getAll(o),
      {
        select: ["vsb_generatortypeinprojectid"],
        filter: and(lookupEq("vsb_project", projectId), ACTIVE),
      },
    ),
    fetchAll(
      "list PV module types in project for Land Lease",
      (o) => Vsb_pvmoduletypeinprojectsService.getAll(o),
      {
        select: ["vsb_pvmoduletypeinprojectid", "vsb_label"],
        filter: and(lookupEq("vsb_project", projectId), ACTIVE),
      },
    ),
  ]);

  const wtgTypeIds = new Set(generatorTypes.map((g) => g.vsb_generatortypeinprojectid));
  const pvLabel = new Map(
    pvTypes.map((p) => [p.vsb_pvmoduletypeinprojectid, p.vsb_label ?? ""]),
  );
  const typeIds = [...wtgTypeIds, ...pvLabel.keys()];
  if (typeIds.length === 0) return [];

  const batches = await Promise.all(
    chunk(typeIds).map((ids) => fetchAll(
      "list generators in project for Land Lease",
      (o) => Vsb_generatorinprojectsService.getAll(o),
      {
        select: [
          "vsb_generatorinprojectid", "vsb_name", "statecode",
          "_vsb_moduletypeinprojectid_value",
        ],
        filter: lookupIn("vsb_moduletypeinprojectid", ids),
      },
    )),
  );

  const wtg: { id: string; name: string; status: string | null }[] = [];
  const pv: { id: string; name: string; label: string }[] = [];
  for (const r of batches.flat()) {
    const typeId = r._vsb_moduletypeinprojectid_value ?? "";
    const row = {
      id: r.vsb_generatorinprojectid,
      name: r.vsb_name ?? "",
    };
    if (wtgTypeIds.has(typeId)) {
      wtg.push({ ...row, status: GENERATOR_STATE_LABEL[numberOf(r.statecode) ?? 0] ?? "" });
    } else {
      pv.push({ ...row, label: pvLabel.get(typeId) ?? row.name });
    }
  }
  // `generatorOptions` owns the labelling and the `Order` rule, including the canvas quirk
  // that a PV row has no `Order` column at all and therefore sorts ahead of every WTG.
  return generatorOptions(wtg, pv);
}

/* ════════════════════════════════════════════════════ country inflation rows ══ */

export interface CountryInflationRow {
  year: number;
  /** `vsb_area` — blank on every country but Italy. */
  area: string;
  inflation: number;
}

/**
 * `Country Inflation Profiles` for the project's country.
 *
 * One query serves four consumers that would otherwise each want their own: the Land Lease
 * panel's read-only percentage (`resolveInflationProfileValue`), the Area dropdown's `Items`,
 * the standard import's `Inflation Profile` (`resolveStandardInflationProfile`) — and, through
 * `countryInflationPercent` in `costBook.ts`, the OPEX panel and "Add Standard Contract".
 *
 * MEASURED, VSBCloud_Dev 16 Sep: Italy carries SEVEN rows per year, one per price zone (North,
 * Centre - North, Centre - South, South, Sicily, Sardinia, Calabria); every other country
 * carries exactly one row per year with `vsb_area` blank. That is why `countryInflationPercent`
 * only applies the Area term for Italy.
 */
export async function loadCountryInflation(countryId: string): Promise<CountryInflationRow[]> {
  const rows = await fetchAll(
    "list country inflation profiles",
    (o) => Vsb_countryinflationprofilesService.getAll(o),
    {
      select: ["vsb_countryinflationprofileid", "vsb_year", "vsb_area", "vsb_inflation"],
      filter: and(lookupEq("vsb_country", countryId), ACTIVE),
    },
  );
  return rows.map((r) => ({
    year: r.vsb_year ?? 0,
    area: r.vsb_area ?? "",
    inflation: r.vsb_inflation ?? 0,
  }));
}

/* ══════════════════════════════════════════════════════ standard assumptions ══ */

const ASSUMPTION_SELECT = [
  "vsb_opexlandleasestandardassumptionsid", "vsb_name", "vsb_description", "vsb_period",
  "_vsb_landleasesubaccount_value", "_vsb_currency_value",
  "vsb_durationinyears", "vsb_durationinmonths", "vsb_aggregation", "vsb_distributionfrequency",
  "vsb_secured", "vsb_allwtgallocated",
  "vsb_fixcosts", "vsb_ofrevenues", "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg",
  "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
  "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
  "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile",
  "vsb_inflationcountryarea",
];

/**
 * `Filter('OPEX & Land Lease Standard Assumptions', Country … && Technology … &&
 * 'Type Of Contract' = 'Contract Types'.Landlease …)` sorted by `Description` ascending
 * (`LL:388`) — `leaseAssumptionQuery` describes exactly this.
 *
 * The SUB-ACCOUNT clause is applied by the CALLER rather than here, so one cached query serves
 * all nine cards' `Add Standard Contract` gate as well as the import itself. The `$orderby` is
 * kept because defect LL-D8 depends on it: `standardPeriodStarts` chains the start dates in the
 * order the rows arrive, and re-sorting by period would quietly repair a defect the live data
 * already contains.
 */
export async function loadLeaseAssumptions(
  countryId: string | undefined,
  technology: number | null | undefined,
): Promise<LeaseAssumptionRow[]> {
  const rows = await fetchAll(
    "list Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o),
    {
      select: ASSUMPTION_SELECT,
      filter: and(
        eq("vsb_typeofcontract", TYPE_OF_CONTRACT.landlease),
        countryId ? lookupEq("vsb_country", countryId) : undefined,
        technology !== null && technology !== undefined
          ? eq("vsb_technology", technology) : undefined,
        ACTIVE,
      ),
      orderBy: ["vsb_description asc"],
    },
  );
  return rows.map((r) => ({
    id: r.vsb_opexlandleasestandardassumptionsid,
    subaccountId: r._vsb_landleasesubaccount_value ?? null,
    subaccountName: r.vsb_landleasesubaccountname ?? "",
    name: r.vsb_name ?? "",
    description: r.vsb_description ?? "",
    period: numberOf(r.vsb_period) ?? 0,
    durationYears: nullableNumber(r.vsb_durationinyears),
    durationMonths: nullableNumber(r.vsb_durationinmonths),
    aggregation: numberOf(r.vsb_aggregation),
    currencyId: r._vsb_currency_value ?? null,
    secured: r.vsb_secured === true,
    allWtgAllocated: r.vsb_allwtgallocated === true,
    fixCosts: nullableNumber(r.vsb_fixcosts),
    percentOfRevenues: nullableNumber(r.vsb_ofrevenues),
    eurPerMwh: nullableNumber(r.vsb_eurmwh),
    eurPerMw: nullableNumber(r.vsb_eurmw),
    eurPerWtg: nullableNumber(r.vsb_eurwtg),
    amountOneTimePayment: nullableNumber(r.vsb_amountonetimepayment),
    amountOneTimePayment2: nullableNumber(r.vsb_amountonetimepayment2),
    amountOneTimePayment3: nullableNumber(r.vsb_amountonetimepayment3),
    dueDateOneTimePayment: nullableText(r.vsb_duedateonetimepayment),
    dueDateOneTimePayment2: nullableText(r.vsb_duedateonetimepayment2),
    dueDateOneTimePayment3: nullableText(r.vsb_duedateonetimepayment3),
    distributionFrequency: nullableNumber(r.vsb_distributionfrequency),
    useInflationProfile: r.vsb_useinflationprofile === true,
    useCountryInflationProfile: r.vsb_usecountryinflationprofile === true,
    inflationProfile: nullableNumber(r.vsb_inflationprofile),
    inflationCountryArea: nullableText(r.vsb_inflationcountryarea),
  }));
}

/* ═════════════════════════════════════════════════════════════ write executor ══ */

/** `entitySet` -> the three calls and the primary key a create returns. */
type Row = Record<string, unknown>;

interface LeaseWriter {
  /** The primary key a create returns, so a `ref` can be resolved into it. */
  idField: string;
  create: (payload: Row) => Promise<IOperationResult<Row>>;
  update: (id: string, payload: Row) => Promise<IOperationResult<Row>>;
  remove: (id: string) => Promise<void>;
  /** The noun `unwrap`'s operation string uses, so a 403 names what was refused. */
  label: string;
}

/**
 * The three generated services are structurally different types, so each is adapted to one
 * signature here. The `as never` on the payload is the same cast `src/data/periodWrites.ts`
 * uses: the generated `…Base` types demand columns (`ownerid`, `statecode`) that Dataverse
 * fills itself and that no canvas `Patch` sends either.
 */
const WRITERS: Record<string, LeaseWriter> = {
  [LEASE_ENTITY_SET.cost]: {
    idField: "vsb_landleaseprojectcostid",
    create: (p) => Vsb_landleaseprojectcostsService.create(p as never) as unknown as Promise<IOperationResult<Row>>,
    update: (id, p) =>
      Vsb_landleaseprojectcostsService.update(id, p as never) as unknown as Promise<IOperationResult<Row>>,
    remove: (id) => Vsb_landleaseprojectcostsService.delete(id),
    label: "Land Lease contract",
  },
  [LEASE_ENTITY_SET.period]: {
    idField: "vsb_landleaseperiodid",
    create: (p) => Vsb_landleaseperiodsService.create(p as never) as unknown as Promise<IOperationResult<Row>>,
    update: (id, p) =>
      Vsb_landleaseperiodsService.update(id, p as never) as unknown as Promise<IOperationResult<Row>>,
    remove: (id) => Vsb_landleaseperiodsService.delete(id),
    label: "Land Lease period",
  },
  [LEASE_ENTITY_SET.allocation]: {
    idField: "vsb_landleaseallocationwtgid",
    create: (p) =>
      Vsb_landleaseallocationwtgsService.create(p as never) as unknown as Promise<IOperationResult<Row>>,
    update: (id, p) =>
      Vsb_landleaseallocationwtgsService.update(id, p as never) as unknown as Promise<IOperationResult<Row>>,
    remove: (id) => Vsb_landleaseallocationwtgsService.delete(id),
    label: "Land Lease WTG allocation",
  },
};

export interface LeaseWriteResult {
  /** The id each `ref`-tagged create returned, for a caller that needs to re-select. */
  createdIds: Record<string, string>;
}

/**
 * Runs a `planLeaseSave` / `planLeaseDelete` / `planStandardImport` plan.
 *
 * Writes go in the planner's order, one at a time. Each write's `parentRef` is resolved
 * against the ids the earlier creates returned — `bindParent` does the substitution, which is
 * why the plan carries a marker rather than an OData `$<contentid>` reference: there is no
 * changeset for one to resolve inside.
 *
 * A write whose `parentRef` is still unresolved when its turn comes is a planner/caller bug,
 * and it throws rather than POSTing a row with no parent.
 */
export async function applyLeaseWrites(
  writes: readonly LeaseWrite[],
): Promise<LeaseWriteResult> {
  const createdIds: Record<string, string> = {};

  for (const write of writes) {
    const [bound] = bindParent([write], createdIds);
    if (!bound) continue;
    const writer = WRITERS[bound.entitySet];
    if (!writer) throw new Error(`No writer for "${bound.entitySet}".`);

    if (bound.op === "delete") {
      await writer.remove(bound.id);
      continue;
    }
    if (bound.parentRef) {
      throw new Error(
        `"${bound.entitySet}" write still needs its "${bound.parentRef}" parent id.`,
      );
    }
    if (bound.op === "update") {
      unwrap(await writer.update(bound.id, bound.payload), `update ${writer.label}`);
      continue;
    }
    const created = unwrap(await writer.create(bound.payload), `create ${writer.label}`);
    const id = created[writer.idField];
    if (bound.ref && typeof id === "string") createdIds[bound.ref] = id;
  }

  return { createdIds };
}
