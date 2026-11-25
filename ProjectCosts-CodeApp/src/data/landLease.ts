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
 * `applyLeaseWrites` sends a plan's writes as separate requests, in TIERS of the order the planner
 * emitted them (OPT-10, `leaseWriteTiers`). That order is the canvas' own and it is load-bearing:
 * a create that others bind to comes first, and deletes run children-before-parents. A tier never
 * starts before the one before it has landed; only the writes inside a tier (the allocation
 * re-writes of a Period-1 edit, the allocation deletes of a contract delete) go side by side.
 * `LEASE_WRITE_PARALLEL = false` restores the one-request-at-a-time loop.
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
import { unwrap } from "@/platform/errors";
import {
  bindParent, generatorOptions, LEASE_ENTITY_SET, LeaseStepsError, leaseHttpResponse, leaseStepOf, leaseWriteTiers,
  TYPE_OF_CONTRACT, type LeaseStepFailure, type GeneratorOption, type LeaseAllocationRow, type LeaseAssumptionRow, type LeaseCostRow,
  type LeasePeriodRow, type LeaseSubaccountRow, type LeaseWrite,
} from "@/features/cost/periods/landLeaseRules";
import { deleteRecord, fetchAll } from "./client";
import { CASCADE_DELETE_CONCURRENCY, LEAF_DELETE_CONCURRENCY, mapLimitFirstFailure, WRITE_CONCURRENCY } from "./concurrency";
import { loadAllCurrencies, loadCurrencyNameMap, type CurrencyRow } from "./currencies";
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
        // DIVERGENCE (product decision, FT-BR-LEASE-005): the canvas reads the whole table, no state
        // filter (LL:14 `ClearCollect(colLandLeaseSubaccounts, Sort(AddColumns('Land Lease
        // Subaccounts', …)))`); this app lists active rows only. Kept (cf. D45 G2).
        filter: ACTIVE,
      },
    ),
    fetchAll(
      "list Land Lease project costs",
      (o) => Vsb_landleaseprojectcostsService.getAll(o),
      // DIVERGENCE (product decision, FT-BR-LEASE-006/026): the canvas filters the contracts by
      // project only (LL:14 `Filter('Land Lease Project Costs', Project.Project = …)`), so an
      // inactive contract (and its periods, and the Add Contract/Standard gates) shows there; active only here.
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
    loadCurrencyNameMap(currencyIds),
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

/** One `Currencies` row — defined with the shared read (`./currencies`, OPT-07b). */
export type { CurrencyRow } from "./currencies";

/**
 * `Currencies`, unfiltered.
 *
 * Deliberately NOT filtered by `statecode`, for the reason `./currencies` gives:
 * a contract that points at a since-deactivated currency should still show the name it was
 * saved with. B2 (OPT-07b): one shared read of the whole table (it used to be read here AND in `costBook`, and the name
 * helper below ignored its `ids`), so the Land Lease screen's dropdown and both books share one request.
 */
export async function loadCurrencies(): Promise<CurrencyRow[]> {
  return [...(await loadAllCurrencies())];
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
  // DIVERGENCE (product decision, FT-BR-LEASE-010): the canvas `colGeneratorsInProject` (LL:14)
  // filters the generators by project only; the two type tables are read ACTIVE-only here, so a
  // generator whose type row is inactive drops out of the picker.
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

// Moved to `./countryInflation` (D162, FE-P2-06); re-exported so every caller of this module is unchanged.
export { loadCountryInflation, type CountryInflationRow } from "./countryInflation";

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
        // DIVERGENCE (product decision, FT-BR-LEASE-026): the canvas `LookUp` over 'OPEX & Land Lease
        // Standard Assumptions' (LL:301) has no state filter; active rows only here.
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
 * Deletes go through `deleteRecord` (CONVENTIONS rule 14, CA-27): the generated `delete()` returns nothing,
 * so a refused delete (403, a cascade restriction) resolved as success and the row came back on reload.
 *
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
    remove: (id) => deleteRecord("delete Land Lease contract", LEASE_ENTITY_SET.cost, id),
    label: "Land Lease contract",
  },
  [LEASE_ENTITY_SET.period]: {
    idField: "vsb_landleaseperiodid",
    create: (p) => Vsb_landleaseperiodsService.create(p as never) as unknown as Promise<IOperationResult<Row>>,
    update: (id, p) =>
      Vsb_landleaseperiodsService.update(id, p as never) as unknown as Promise<IOperationResult<Row>>,
    remove: (id) => deleteRecord("delete Land Lease period", LEASE_ENTITY_SET.period, id),
    label: "Land Lease period",
  },
  [LEASE_ENTITY_SET.allocation]: {
    idField: "vsb_landleaseallocationwtgid",
    create: (p) =>
      Vsb_landleaseallocationwtgsService.create(p as never) as unknown as Promise<IOperationResult<Row>>,
    update: (id, p) =>
      Vsb_landleaseallocationwtgsService.update(id, p as never) as unknown as Promise<IOperationResult<Row>>,
    remove: (id) => deleteRecord("delete Land Lease WTG allocation", LEASE_ENTITY_SET.allocation, id),
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
 * Writes go in the planner's order, tier by tier (`LEASE_WRITE_PARALLEL`, OPT-10; one at a time when it is off). Each write's
 * `parentRef` is resolved against the ids the earlier creates returned — `bindParent` does the substitution, which is
 * why the plan carries a marker rather than an OData `$<contentid>` reference: there is no
 * changeset for one to resolve inside.
 *
 * A write whose `parentRef` is still unresolved when its turn comes is a planner/caller bug,
 * and it throws rather than POSTing a row with no parent.
 */
export function applyLeaseWrites(
  writes: readonly LeaseWrite[],
  options?: { independentSteps?: boolean },
): Promise<LeaseWriteResult> {
  return applyPlan(writes, options, LEASE_WRITE_PARALLEL ? runLeaseWritesInTiers : runLeaseWritesSequentially);
}

/** The legacy, one-request-at-a-time `applyLeaseWrites`: the ORACLE of `landLease.writes.test.ts` (OPT-10). Not used by the app. */
export function applyLeaseWritesSequentially(
  writes: readonly LeaseWrite[],
  options?: { independentSteps?: boolean },
): Promise<LeaseWriteResult> {
  return applyPlan(writes, options, runLeaseWritesSequentially);
}

type LeaseRunner = (writes: readonly LeaseWrite[], createdIds: Record<string, string>) => Promise<void>;

async function applyPlan(
  writes: readonly LeaseWrite[],
  options: { independentSteps?: boolean } | undefined,
  runLeaseWrites: LeaseRunner,
): Promise<LeaseWriteResult> {
  const createdIds: Record<string, string> = {};

  if (options?.independentSteps) {
    /*
     * FT-BR-LEASE-089: `Save_1.OnChange` (LL:6062) wraps the header Patch and the period Patch in
     * their OWN `IfError(…, Notify(…))` and carries on after a failure, the allocation loops
     * included. So the contract, allocation and period steps each run to their first failure and
     * the next step still starts; every failure is reported at the end, one message per step.
     */
    const failures: LeaseStepFailure[] = [];
    for (const step of ["contract", "allocation", "period"] as const) {
      const inStep = writes.filter((w) => leaseStepOf(w.entitySet) === step);
      try {
        await runLeaseWrites(inStep, createdIds);
      } catch (e) {
        failures.push({
          step,
          message: e instanceof Error ? e.message : String(e),
          httpResponse: leaseHttpResponse(e),
        });
      }
    }
    if (failures.length > 0) throw new LeaseStepsError(failures);
    return { createdIds };
  }

  await runLeaseWrites(writes, createdIds);
  return { createdIds };
}

/**
 * OPT-10 (B3) — `true`: a plan's writes run in TIERS (`leaseWriteTiers`), the independent writes of a tier side by side; `false`: the
 * legacy loop, one request after another, exactly as before. The same kind of switch as `BULK_SAVE` and `DEFER_*_DELETES`; treat it as a
 * live product decision. The legacy loop stays below as the oracle of `landLease.writes.test.ts`.
 */
export const LEASE_WRITE_PARALLEL = true;

/** How many writes of one tier are in flight at once: creates and updates as everywhere (8), leaf deletes 16, cascade deletes 4. */
function leaseTierWidth(tier: readonly LeaseWrite[]): number {
  if (!tier.every((w) => w.op === "delete")) return WRITE_CONCURRENCY;
  return tier.some((w) => w.entitySet === LEASE_ENTITY_SET.cost) ? CASCADE_DELETE_CONCURRENCY : LEAF_DELETE_CONCURRENCY;
}

/** One write of a plan: binds its parent id, then sends it. A create records the id it got under its `ref`. */
async function sendLeaseWrite(write: LeaseWrite, createdIds: Record<string, string>): Promise<void> {
  const [bound] = bindParent([write], createdIds);
  if (!bound) return;
  const writer = WRITERS[bound.entitySet];
  if (!writer) throw new Error(`No writer for "${bound.entitySet}".`);

  if (bound.op === "delete") {
    await writer.remove(bound.id);
    return;
  }
  if (bound.parentRef) {
    throw new Error(
      `"${bound.entitySet}" write still needs its "${bound.parentRef}" parent id.`,
    );
  }
  if (bound.op === "update") {
    unwrap(await writer.update(bound.id, bound.payload), `update ${writer.label}`);
    return;
  }
  const created = unwrap(await writer.create(bound.payload), `create ${writer.label}`);
  const id = created[writer.idField];
  if (bound.ref && typeof id === "string") createdIds[bound.ref] = id;
}

/**
 * OPT-10: the tiers of `leaseWriteTiers`, one after another; inside a tier the writes go through a bounded pool.
 *
 * FAILURE. The sequential loop stopped at the first write that failed and nothing after it was sent. Here a tier that fails stops
 * starting new writes, waits for the ones in flight, and throws the error of the first failing write IN PLANNER ORDER
 * (`mapLimitFirstFailure`); no later tier starts. A tier has several writes only among the WTG ALLOCATION rows and only of ONE op (see
 * `leaseWriteTiers`): every header and period write, and every create, update or delete of a different kind, is a tier of its own. So the
 * only things that can land after a failure, and that the loop would have left unsent, are the other allocation rows of the SAME op
 * in the failed tier that were already in flight (they cannot be recalled): e.g. another allocation re-write beside a refused one. Never a
 * delete after a failed create, a follower start-date update after a refused period update, or any write of a later tier.
 * `createdIds` is the caller's object, filled as creates land, exactly as in the sequential loop.
 */
async function runLeaseWritesInTiers(
  writes: readonly LeaseWrite[],
  createdIds: Record<string, string>,
): Promise<void> {
  for (const indexes of leaseWriteTiers(writes)) {
    const tier = indexes.map((i) => writes[i] as LeaseWrite);
    await mapLimitFirstFailure(tier, (write) => sendLeaseWrite(write, createdIds), leaseTierWidth(tier));
  }
}

/** The legacy executor, kept as the oracle (OPT-10): one request after another, in the planner's order. */
async function runLeaseWritesSequentially(
  writes: readonly LeaseWrite[],
  createdIds: Record<string, string>,
): Promise<void> {
  for (const write of writes) await sendLeaseWrite(write, createdIds);
}
