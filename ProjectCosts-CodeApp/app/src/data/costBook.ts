/**
 * The Cost book, read from Dataverse.
 *
 * Stage 0.4 of `docs/06-DEMO-COMPLETION-PLAN.md`. Until now `useCostBook` had exactly two
 * behaviours: read demo storage, or throw. Registering the 18 missing tables removed the
 * blocker; this module is the code that actually uses them, so DEVEX/CAPEX renders real
 * project data instead of "Cost data is unavailable".
 *
 * The shape returned is the SAME `CostBook` the demo store produces, so no screen changes.
 * That is deliberate: swapping the source without touching the presentation keeps this
 * reviewable, and keeps the demo build working as a test fixture.
 *
 * PERIODS (O&M / Other OPEX / Land Lease) — mapped below. Both screens model a COST as a CHAIN
 * of periods; see `CostPeriod`'s doc comment in `features/costing/model.ts` for the shape this
 * loader flattens them into.
 *
 *   - O&M and Other OPEX are BOTH `vsb_opexprojectcosts` rows, differentiated by whether the row
 *     carries a `Device Type In Project` (O&M — grouped by device name, e.g. "V150-6.0") or only
 *     a `Subaccount` (Other OPEX — grouped by subaccount name). The chain is `vsb_parentcost`:
 *     every period after the first points at the FIRST one, and `loadOpexPeriods` walks that to
 *     fill `contractId` / `parentId` / `periodIndex`.
 *   - Land Lease is two tables plus a join: `vsb_landleaseprojectcosts` (one header per CONTRACT
 *     — a sub-account can hold many; measured 16 Sep, Project New Data has twelve under
 *     `Locations`), `vsb_landleaseperiods` (the child period rows, `vsb_period` Period1..Period9,
 *     linked by `_vsb_projectcost_value`) and `vsb_landleaseallocationwtgs` (which generators the
 *     contract is allocated to). The period rows carry NO currency, inflation, Secured, Land
 *     Owner, Allocation or one-time-payment fields — those live on the header, shared by every
 *     period under it; threshold / align / external do not exist on Land Lease at all.
 *
 *     **The Land Lease queries are NOT here.** `./landLease.ts` is the app's single Land Lease
 *     reader — the Land Lease screen needs the raw rows, not this flattening — and
 *     `loadLandLeasePeriods` / `loadLandLeaseContracts` / `loadLandLeaseCostFlags` below all read
 *     through it. That is deliberate: this file used to issue a SECOND, narrower set of Land
 *     Lease queries with its own mapping, and that second mapping was the lossy one (see
 *     `mapLandLeasePeriodRow`).
 *
 * See `saveOpexPeriod` / `saveLandLeasePeriod` in `./periodWrites` for the write half.
 *
 * TWO READS THAT WERE WRONG AND ARE FIXED HERE, both verified against VSBCloud_Dev on 16 Sep:
 *   - `vsb_currencyname` was `$select`ed on both period tables. It is not a Web API property —
 *     it is the FetchXML-era lookup alias, and `pac org fetch` returns it EMPTY on every row
 *     (`vsb_currency` returns "Euro" on the same rows). Currency is now read from
 *     `_vsb_currency_value` and resolved against `transactioncurrencies`, which is the same
 *     table `periodWrites`' `resolveCurrencyId` writes back through.
 *   - A Land Lease period's Description came from the HEADER's `vsb_description`. The canvas
 *     table binds `Text: =ThisItem.Name` — the PERIOD's `vsb_name` (`LandLeaseCostScreenCode.txt`
 *     :1642), which is what carries the `… - 2` / `… - 3` chain numbering. The header's
 *     description is the CONTRACT name and is now carried separately as `contractName`.
 *
 * WHAT THIS DOES NOT DO — stated here rather than discovered on screen:
 *   - `comments` is empty on every line, and stays that way: the threaded model is loaded on its
 *     own by `./comments.ts` (`loadComments`), keyed by contract, because the panel and the
 *     grid's red dots want the whole category's thread at once rather than one line's.
 *   - Land Lease's WTG allocation rows ARE read, through `./landLease.ts`, and reach the book as
 *     `CostPeriod.allocatedGeneratorIds`. They used to be written on delete only and never read,
 *     which left the WTG picker with no options and `canSaveLandLease`'s PV/Wind allocation
 *     clause satisfiable only by "allocate to all".
 */
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import { Vsb_capexprojectcontractsService } from "@/generated/services/Vsb_capexprojectcontractsService";
import { Vsb_capexcostsService } from "@/generated/services/Vsb_capexcostsService";
import { Vsb_spvdevcomappingcapexdevexesService } from "@/generated/services/Vsb_spvdevcomappingcapexdevexesService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_opexprojectcostsService } from "@/generated/services/Vsb_opexprojectcostsService";
import { Vsb_devicetypesinprojectsService } from "@/generated/services/Vsb_devicetypesinprojectsService";
import { Vsb_projectstatesService } from "@/generated/services/Vsb_projectstatesService";
import { Vsb_milestonesstandardassumptionsesService } from "@/generated/services/Vsb_milestonesstandardassumptionsesService";
import { Vsb_countryinflationprofilesService } from "@/generated/services/Vsb_countryinflationprofilesService";
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import {
  CATEGORIES, type CostAccount, type CostBook, type CostLine, type CostPeriod,
  type Payment, type PeriodMode,
} from "@/features/costing/model";
import {
  parseByClusterJson, parseStartEndJson, resolveEqualMode,
} from "@/features/capex-costs/rules";
import type { MilestoneDurations } from "@/features/capex-costs/clusters";
import type {
  LeaseAllocationRow, LeaseCostRow, LeasePeriodRow,
} from "@/features/periods/landLeaseRules";
import { loadLeaseBook } from "./landLease";
import { fetchAll } from "./client";
import { ACTIVE, and, chunk, eq, guid, lookupEq, lookupIn, or } from "./odata";

/**
 * `vsb_costtype` — verified against the live environment on 15 Sep.
 *
 * Worth stating because the skeleton's `CHOICE_ADMIN.costPaidType` has these two SWAPPED, and
 * writing the wrong one stores the wrong payer with no error at all.
 */
const COST_TYPE_DEVCO = 952850001;

/** `vsb_distribution`. */
const DISTRIBUTION_EQUAL = 952850000;
/** `vsb_distributionscheme` — % Values 952850000, Absolute Values 952850001. */
const DISTRIBUTION_SCHEME_PERCENT = 952850000;

/**
 * `vsb_opexprojectcostsvsb_aggregation` / `vsb_landleaseperiodsvsb_aggregation` — SUM/MAX/MIN
 * share these three values across both tables, and the panel's dropdown is
 * `Items: Choices('Opex Aggregation')` (`OpexCostScreenCode.txt:7023`), i.e. all three.
 *
 * MEASURED, VSBCloud_Dev 16 Sep: 952 SUM · 18 MAX · **4 MIN**. The four MIN rows are real
 * (`Test - 2`, `Test - 4`, `Test O&M Contract N149-5.7 Period 3`, `CCC`), so the old
 * "MIN reads back as SUM" tolerance was not harmless — reopening and saving one of them
 * rewrote its aggregation.
 */
export const AGGREGATION_VALUE = { sum: 952850000, max: 952850001, min: 952850002 } as const;

/** `vsb_aggregation` -> the `CostPeriod` union. Anything unrecognised is SUM, the column default. */
export function readAggregation(value: unknown): CostPeriod["aggregation"] {
  const n = numberOf(value);
  if (n === AGGREGATION_VALUE.max) return "MAX";
  if (n === AGGREGATION_VALUE.min) return "MIN";
  return "SUM";
}

/** The `CostPeriod` union -> `vsb_aggregation`. The inverse of `readAggregation`. */
export function writeAggregation(value: CostPeriod["aggregation"]): number {
  if (value === "MAX") return AGGREGATION_VALUE.max;
  if (value === "MIN") return AGGREGATION_VALUE.min;
  return AGGREGATION_VALUE.sum;
}

/**
 * `vsb_opexprojectcostsvsb_thresholdtype` — measured 16 Sep: p75 952850000, p90 952850001,
 * Individual 952850002, and all 8 live rows that carry one are Individual.
 *
 * Exported because `periodWrites` writes the same values and the panel offers all three; while
 * the write map hard-coded Individual, choosing p75 or p90 read back as Individual.
 */
export const THRESHOLD_TYPE_VALUE = {
  netYieldP75: 952850000, netYieldP90: 952850001, individual: 952850002,
} as const;

/** `column eq guid` for a PRIMARY KEY id list — `lookupIn` is for `_col_value` lookup columns. */
function idIn(column: string, ids: readonly string[]): string | undefined {
  if (ids.length === 0) return undefined;
  return or(...ids.map((id) => `${column} eq ${guid(id)}`));
}

/** `vsb_devcospv` on the SPVDevCo mapping — same option set as `vsb_costtype`. */
const PAYER_BY_OPTION: Record<number, "DevCo" | "SPV"> = {
  952850001: "DevCo",
  952850002: "SPV",
};

/**
 * The default payer per sub-account, from `SPVDevCo Mapping Capex Devexes`.
 *
 * The canvas falls back to this whenever a contract's own `Cost Type` is blank:
 *
 *   locInitialCostPaidBy: Coalesce(
 *       locTempContract.'Cost Type',
 *       LookUp('SPVDevCo Mapping Capex Devexes',
 *              'Name (Sub-Account)'.'CAPEX Account List' = ...).'DevCo/SPV')
 *
 * Without it, every contract with no `Cost Type` silently reads as SPV — including in the
 * grid's `[SPV]` sub-label and in the payer filter.
 */
export async function loadPayerDefaults(): Promise<Map<string, "DevCo" | "SPV">> {
  const rows = await fetchAll(
    "list SPV/DevCo sub-account mapping",
    (o) => Vsb_spvdevcomappingcapexdevexesService.getAll(o),
    {
      select: [
        "vsb_spvdevcomappingcapexdevexid", "_vsb_namesubaccount_value", "vsb_devcospv",
      ],
      filter: ACTIVE,
    },
  );
  const out = new Map<string, "DevCo" | "SPV">();
  for (const r of rows) {
    const accountId = r._vsb_namesubaccount_value;
    const payer = PAYER_BY_OPTION[numberOf(r.vsb_devcospv) ?? -1];
    if (accountId && payer) out.set(accountId, payer);
  }
  return out;
}

/**
 * The chart of accounts is a TREE, and the category is the level-1 ancestor.
 *
 * This replaces a picklist lookup on `vsb_accountcategory` that I wrote first and that was
 * simply wrong. Measured against VSBCloud_Dev on 15 Sep: of 80 accounts, **77 have no
 * `vsb_accountcategory` at all** and the other 3 are `BoP`. Filtering on it dropped every
 * account and the CAPEX grid rendered nothing.
 *
 * The canvas never used that column. `App.OnStart` builds `colCapexAccountCategoriesNew` from
 * the children of account number "00001", and the real hierarchy backs it up:
 *
 *     00001  Root
 *       10000 Wind Turbine / Panels  ->  80000 Turbine / PV Supply Agreement  ->  80000_0 ...
 *       10001 Development Expenses   ->  81000 External planning costs        ->  81000_0 ...
 *       10002 Construction Expenses      10003 Substation / Grid Connection
 *       10004 Other CAPEX                10006 Overleveraging   (never shown)
 *     10005 BoP  (no parent - not part of the CAPEX tree)
 *
 * Level 2 becomes an account row and level 3 a subaccount row, which is the shape the grid and
 * the demo book both use. A level-1 name that is not one of our five — `Overleveraging` — maps
 * to no category and its whole branch is dropped, which is what the canvas achieved by
 * excluding account number "10006" explicitly.
 */
const CAPEX_ROOT_NUMBER = "00001";

/**
 * A nullable money / numeric column. `undefined` and `null` both mean BLANK, never zero.
 *
 * See `CostPeriod`'s five money fields: the canvas writes `Value(txt.Value)` and `Value("")` is
 * `Blank()`, so an unset column is unset and coalescing it to `0` invents a stored figure.
 */
function money(value: number | null | undefined): number | null {
  return value === null || value === undefined || !Number.isFinite(value) ? null : value;
}

/** Option sets arrive as a number or as its string form depending on the column. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * The Land Lease `Allocation` / `OTP` columns, read off `Vsb_landleaseprojectcosts` (the
 * "Land Lease Project Cost" header a period's `Project Cost` lookup points at).
 *
 * `LandLeaseCostScreenCode.txt` (~6,132 ln): each period row looks up its header —
 * `LookUp(colLandLeaseProjectCosts, 'Land Lease Project Cost' = ThisItem.'Project Cost'.'Land
 * Lease Project Cost')` — and reads two things off it:
 *
 *   Allocation  :1058  `If(varLandLeaseCost.AllWTGAllocated, "Yes", "No")`
 *   OTP         :1010  `If(Not(IsBlank(Due Date One-Time Payment)) &&
 *                           Not(IsBlank(Amount One-Time Payment)), "Yes", "No")`
 *
 * so this is keyed by `vsb_landleaseprojectcostid` — the same id a period's
 * `_vsb_projectcost_value` carries — for `toPeriodRow` (by way of `CostPeriod.allWtgAllocated`
 * / `hasOneTimePayment`) to join against once a period is loaded.
 *
 * `loadLandLeasePeriods` now performs that join itself, off a header query that reads the same
 * columns plus the ones the periods need (currency, inflation, Secured). This stays as the
 * standalone read for a caller that wants only the flags — `costRepository.getLandLeaseCostFlags`
 * — and as the place the two Yes/No rules are written down once.
 */
export interface LandLeaseCostFlags {
  allWtgAllocated: boolean;
  hasOneTimePayment: boolean;
}

export async function loadLandLeaseCostFlags(
  projectId: string,
): Promise<Map<string, LandLeaseCostFlags>> {
  // Through the one Land Lease reader (`./landLease.ts`), like every other Land Lease read here.
  const { costs } = await loadLeaseBook(projectId);
  const out = new Map<string, LandLeaseCostFlags>();
  for (const c of costs) {
    out.set(c.id, {
      allWtgAllocated: c.allWtgAllocated,
      hasOneTimePayment: c.dueDateOneTimePayment != null && c.amountOneTimePayment != null,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════ periods ══ */

/** A device-type / sub-account / location name the loader could not resolve. Visible, not lost. */
const UNASSIGNED = { om: "Unassigned Device", other: "Unassigned Sub-account", land: "Unassigned Location" };

/**
 * `vsb_landleaseperiodsvsb_period` — Period1..Period9, in order.
 *
 * MEASURED, `stringmap` on VSBCloud_Dev, 16 Sep: 952850000 = "Period 1" … 952850008 = "Period 9",
 * and the live period rows use Period 1 (384), Period 2 (118), Period 3 (13), Period 4 (2).
 * Exported because `periodWrites` writes the same nine values and the two must not drift.
 */
export const LAND_LEASE_PERIOD_CHOICE = [
  952850000, 952850001, 952850002, 952850003, 952850004, 952850005, 952850006, 952850007, 952850008,
] as const;

/** `vsb_landleaseprojectcostsvsb_secured` — measured: Yes 952850000, No 952850001. */
export const LAND_LEASE_SECURED = { yes: 952850000, no: 952850001 } as const;

/**
 * The canvas gallery's sort, for both screens.
 *
 * `Sort(Sort(rows, 'Start Date', Ascending), Description, Ascending)` — OPEX
 * (`OpexCostScreenCode.txt:1452-1464`, `:3915-3927`) and, with `Name` in place of `Description`,
 * Land Lease (`LandLeaseCostScreenCode.txt:919-943`). Power Fx's `Sort` is stable, so the OUTER
 * key wins and the inner one only breaks its ties: description first, then start date. Doing it
 * the other way round — which "sort by start date then description" would read as — reorders a
 * whole card.
 */
function byCanvasOrder(a: CostPeriod, b: CostPeriod): number {
  return a.description.localeCompare(b.description) || a.startDate.localeCompare(b.startDate);
}

/**
 * `transactioncurrencyid` -> `currencyname`, for the two period tables' `vsb_currency` lookup.
 *
 * A second narrow query rather than `$expand` — the SDK ceiling documented on `loadProjectStates`.
 * Returns an empty Map when nothing references a currency, so a project with no periods pays
 * nothing. Deliberately UNFILTERED by `statecode`: a period that points at a currency somebody
 * has since deactivated should still show the name it was saved with, not an empty cell.
 */
async function loadCurrencyNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await fetchAll(
    "list transaction currencies for periods",
    (o) => TransactioncurrenciesService.getAll(o),
    { select: ["transactioncurrencyid", "currencyname"] },
  );
  return new Map(rows.map((r) => [r.transactioncurrencyid, r.currencyname ?? ""]));
}

interface OpexCostRow {
  vsb_opexprojectcostid: string;
  vsb_name?: string;
  vsb_description?: string;
  _vsb_parentcost_value?: string;
  _vsb_devicetypeinproject_value?: string;
  _vsb_subaccount_value?: string;
  _vsb_currency_value?: string;
  vsb_startdate?: string;
  vsb_opexprojectdurationyears?: number;
  vsb_opexprojectdurationmonths?: number;
  vsb_fixcosts?: number;
  vsb_ofrevenues?: number;
  vsb_eurmwh?: number;
  vsb_eurmw?: number;
  vsb_eurwtg?: number;
  vsb_aggregation?: number;
  vsb_distributionfrequency?: number;
  vsb_threshold?: boolean;
  vsb_thresholdtype?: number;
  vsb_thresholdindividual?: number;
  vsb_useinflationprofile?: boolean;
  vsb_usecountryinflationprofile?: boolean;
  vsb_inflationprofile?: number;
  vsb_inflationstartyear?: number;
  vsb_inflationcountryarea?: string;
  vsb_alignwithprojectduration?: boolean;
  vsb_externalcontract?: boolean;
  vsb_isstandardcontract?: boolean;
  vsb_isstartdatestandardassumption?: boolean;
}

/** Where a row sits in its chain, as `linkOpexChains` works it out. */
export interface OpexChainPlace {
  contractId: string;
  contractName: string;
  periodIndex: number;
}

/**
 * `vsb_opexprojectcosts` row -> `CostPeriod`. Exported and pure, so the mapping is unit-testable
 * without a mocked `fetchAll`.
 */
export function mapOpexRow(
  r: OpexCostRow,
  group: string,
  mode: "om" | "other",
  currencyName = "",
  place?: OpexChainPlace,
): CostPeriod {
  return {
    id: r.vsb_opexprojectcostid,
    group,
    mode,
    description: r.vsb_description ?? "",
    startDate: (r.vsb_startdate ?? "").slice(0, 10),
    years: r.vsb_opexprojectdurationyears ?? 0,
    months: r.vsb_opexprojectdurationmonths ?? 0,
    currency: currencyName,
    // `Value(txt.Value)` stores Blank for an empty box, so a missing column is null and NOT 0.
    fixed: money(r.vsb_fixcosts),
    revenue: money(r.vsb_ofrevenues),
    perMwh: money(r.vsb_eurmwh),
    perMw: money(r.vsb_eurmw),
    perWtg: money(r.vsb_eurwtg),
    aggregation: readAggregation(r.vsb_aggregation),
    frequency: r.vsb_distributionfrequency ?? 1,
    inflation: r.vsb_useinflationprofile === true,
    countryInflation: r.vsb_usecountryinflationprofile === true,
    inflationYear: r.vsb_inflationstartyear ?? 0,
    inflationPercent: r.vsb_inflationprofile ?? 0,
    inflationCountryArea: r.vsb_inflationcountryarea ?? "",
    threshold: r.vsb_threshold === true,
    // Both columns were `$select`ed and then dropped on the floor, which is how a p75/p90 choice
    // came back as Individual and how the Individual figure came back as `vsb_eurmwh`.
    thresholdType: numberOf(r.vsb_thresholdtype),
    thresholdIndividual: money(r.vsb_thresholdindividual),
    align: r.vsb_alignwithprojectduration === true,
    external: r.vsb_externalcontract === true,
    standard: r.vsb_isstandardcontract === true,
    isStartDateStandard: r.vsb_isstartdatestandardassumption === true,
    parentId: r._vsb_parentcost_value || undefined,
    contractId: place?.contractId ?? (r._vsb_parentcost_value || r.vsb_opexprojectcostid),
    contractName: place?.contractName ?? (r.vsb_description ?? ""),
    periodIndex: place?.periodIndex ?? 1,
  };
}

/**
 * The `Parent Cost` chains, as the canvas reads them.
 *
 * A HEAD is a row with no `vsb_parentcost`; every later period of the same contract points
 * straight back at that head, so the shape is a star and not a list. Within a chain the canvas
 * orders by `Name` ascending — `Last(Sort(Filter(costs, 'Parent Cost' = head), Name, Ascending))`
 * is how it decides which period may be deleted (`OpexCostScreenCode.txt:557-568`) — and the
 * names are `<prefix> - 2`, `- 3`, … so that is chain order. Ties fall back to start date.
 *
 * An ORPHAN — a child whose head is not in this project's rows, which happens when a head has
 * been deactivated — becomes its own single-period contract rather than disappearing. `statecode`
 * filtering makes that reachable, and a silently dropped cost row is the failure this codebase
 * has already had once.
 */
export function linkOpexChains(rows: readonly OpexCostRow[]): Map<string, OpexChainPlace> {
  const byId = new Map(rows.map((r) => [r.vsb_opexprojectcostid, r]));
  const childrenOf = new Map<string, OpexCostRow[]>();
  const heads: OpexCostRow[] = [];

  for (const r of rows) {
    const parent = r._vsb_parentcost_value;
    if (parent && byId.has(parent)) {
      const bucket = childrenOf.get(parent);
      if (bucket) bucket.push(r);
      else childrenOf.set(parent, [r]);
    } else {
      heads.push(r);
    }
  }

  const out = new Map<string, OpexChainPlace>();
  for (const head of heads) {
    const contractId = head.vsb_opexprojectcostid;
    const contractName = head.vsb_description ?? "";
    out.set(contractId, { contractId, contractName, periodIndex: 1 });
    const children = [...(childrenOf.get(contractId) ?? [])].sort(
      (a, b) =>
        (a.vsb_name ?? "").localeCompare(b.vsb_name ?? "")
        || (a.vsb_startdate ?? "").localeCompare(b.vsb_startdate ?? ""),
    );
    children.forEach((child, i) => {
      out.set(child.vsb_opexprojectcostid, { contractId, contractName, periodIndex: i + 2 });
    });
  }
  return out;
}

/** `vsb_period` option value -> 1-based slot. Anything unrecognised is slot 1. */
export function landLeasePeriodIndex(value: number | undefined): number {
  const at = LAND_LEASE_PERIOD_CHOICE.indexOf(value as (typeof LAND_LEASE_PERIOD_CHOICE)[number]);
  return at === -1 ? 1 : at + 1;
}

/**
 * `vsb_landleaseperiods` row + its `vsb_landleaseprojectcosts` header -> `CostPeriod`.
 *
 * THE ROWS COME FROM `./landLease.ts`. There is exactly ONE set of Land Lease queries in the app
 * — `loadLeaseBook` — and this is its projection into the shared book's flat `CostPeriod`. It
 * used to be a second, narrower query set with a second mapping, and that second mapping was the
 * lossy one: it coalesced all five money columns with `?? 0`, never selected `vsb_landowner` or
 * the six one-time-payment columns, and never looked at `vsb_landleaseallocationwtgs` at all.
 * Sharing the reader is what makes those three impossible to reintroduce independently.
 *
 * The header carries every field the period row itself does not: currency, inflation, Secured,
 * the Land Owner, the three one-time payments and the Allocation flag. `threshold` / `align` /
 * `external` are always `false` — Land Lease has no such columns.
 *
 * `description` is the PERIOD's `name` (`vsb_name`), which is what the canvas table shows and
 * what the `… - 2` chain numbering lives in; the header's `description` is the CONTRACT name and
 * becomes `contractName`.
 */
export function mapLandLeasePeriodRow(
  pr: LeasePeriodRow,
  header: LeaseCostRow | undefined,
  group: string,
  currencyName = "",
  allocatedGeneratorIds: readonly string[] = [],
): CostPeriod {
  return {
    id: pr.id,
    group,
    mode: "land",
    description: pr.name,
    startDate: (pr.startDate ?? "").slice(0, 10),
    years: pr.durationYears ?? 0,
    months: pr.durationMonths ?? 0,
    currency: currencyName,
    // NOT `?? 0`: a blank rate is blank. See `CostPeriod`'s money fields.
    fixed: pr.fixedCosts,
    revenue: pr.percentOfRevenues,
    perMwh: pr.eurPerMwh,
    perMw: pr.eurPerMw,
    perWtg: pr.eurPerWtg,
    aggregation: readAggregation(pr.aggregation),
    frequency: pr.distributionFrequency ?? 1,
    inflation: header?.useInflationProfile === true,
    countryInflation: header?.useCountryInflationProfile === true,
    inflationYear: header?.inflationStartYear ?? 0,
    inflationPercent: header?.inflationProfile ?? 0,
    inflationCountryArea: header?.inflationCountryArea ?? "",
    threshold: false,
    align: false,
    external: false,
    standard: header?.isStandardContract === true,
    isStartDateStandard: header?.isStartDateStandardAssumption === true,
    contractId: pr.projectCostId || undefined,
    contractName: header?.description ?? "",
    periodIndex: landLeasePeriodIndex(pr.period ?? undefined),
    secured: header?.secured === LAND_LEASE_SECURED.yes,
    allWtgAllocated: header?.allWtgAllocated === true,
    // `LandLeaseCostScreenCode.txt:1010` checks only the FIRST of the three payments.
    hasOneTimePayment:
      header?.dueDateOneTimePayment != null && header?.amountOneTimePayment != null,
    landOwner: header?.landOwner ?? null,
    amountOneTimePayment: header?.amountOneTimePayment ?? null,
    amountOneTimePayment2: header?.amountOneTimePayment2 ?? null,
    amountOneTimePayment3: header?.amountOneTimePayment3 ?? null,
    dueDateOneTimePayment: header?.dueDateOneTimePayment ?? null,
    dueDateOneTimePayment2: header?.dueDateOneTimePayment2 ?? null,
    dueDateOneTimePayment3: header?.dueDateOneTimePayment3 ?? null,
    allocatedGeneratorIds,
  };
}

/** O&M and Other OPEX — both `vsb_opexprojectcosts`, split by whether a device type is set. */
async function loadOpexPeriods(projectId: string): Promise<CostPeriod[]> {
  const costRows = await fetchAll(
    "list OPEX project costs",
    (o) => Vsb_opexprojectcostsService.getAll(o),
    {
      select: [
        "vsb_opexprojectcostid", "vsb_name", "vsb_description", "_vsb_parentcost_value",
        "_vsb_devicetypeinproject_value", "_vsb_subaccount_value", "_vsb_currency_value",
        "vsb_startdate", "vsb_opexprojectdurationyears", "vsb_opexprojectdurationmonths",
        "vsb_fixcosts", "vsb_ofrevenues",
        "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg", "vsb_aggregation", "vsb_distributionfrequency",
        "vsb_threshold", "vsb_thresholdtype", "vsb_thresholdindividual",
        "vsb_useinflationprofile", "vsb_usecountryinflationprofile",
        "vsb_inflationprofile", "vsb_inflationstartyear", "vsb_inflationcountryarea",
        "vsb_alignwithprojectduration", "vsb_externalcontract", "vsb_isstandardcontract",
        "vsb_isstartdatestandardassumption",
      ],
      filter: and(lookupEq("vsb_project", projectId), ACTIVE),
    },
  );
  if (costRows.length === 0) return [];

  const currencyIds = [...new Set(
    costRows.map((r) => r._vsb_currency_value).filter((v): v is string => Boolean(v)),
  )];
  const [subaccounts, currencyName] = await Promise.all([
    fetchAll(
      "list OPEX subaccounts",
      (o) => Vsb_opexsubaccountsService.getAll(o),
      { select: ["vsb_opexsubaccountid", "vsb_name"], filter: ACTIVE },
    ),
    loadCurrencyNames(currencyIds),
  ]);
  const subaccountName = new Map(subaccounts.map((s) => [s.vsb_opexsubaccountid, s.vsb_name ?? ""]));

  const deviceIds = [...new Set(
    costRows.map((r) => r._vsb_devicetypeinproject_value).filter((v): v is string => Boolean(v)),
  )];
  const deviceName = new Map<string, string>();
  if (deviceIds.length > 0) {
    const batches = await Promise.all(
      chunk(deviceIds).map((ids) => fetchAll(
        "list device types for OPEX periods",
        (o) => Vsb_devicetypesinprojectsService.getAll(o),
        { select: ["vsb_devicetypesinprojectid", "vsb_name"], filter: idIn("vsb_devicetypesinprojectid", ids) },
      )),
    );
    for (const d of batches.flat()) deviceName.set(d.vsb_devicetypesinprojectid, d.vsb_name ?? "");
  }

  const places = linkOpexChains(costRows);

  return costRows.map((r) => {
    const isOm = Boolean(r._vsb_devicetypeinproject_value);
    const mode: "om" | "other" = isOm ? "om" : "other";
    const group = isOm
      ? (deviceName.get(r._vsb_devicetypeinproject_value ?? "") || UNASSIGNED.om)
      : (subaccountName.get(r._vsb_subaccount_value ?? "") || UNASSIGNED.other);
    return mapOpexRow(
      r, group, mode,
      currencyName.get(r._vsb_currency_value ?? "") ?? "",
      places.get(r.vsb_opexprojectcostid),
    );
  }).sort(byCanvasOrder);
}

/**
 * The `vsb_landleaseallocationwtgs` rows grouped by their header, ids ascending.
 *
 * Sorted so that two reads of the same allocation set produce the same array and
 * `useCostBook`'s save diff does not see a change where there is none. Exported because
 * `periodWrites`' allocation reconcile needs exactly this shape to diff against.
 */
export function groupAllocations(
  rows: readonly LeaseAllocationRow[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.projectCostId || !r.generatorInProjectId) continue;
    const bucket = out.get(r.projectCostId);
    if (bucket) bucket.push(r.generatorInProjectId);
    else out.set(r.projectCostId, [r.generatorInProjectId]);
  }
  for (const bucket of out.values()) bucket.sort();
  return out;
}

/**
 * Land Lease — the header table joined to its child period rows.
 *
 * Reads through `loadLeaseBook` (`./landLease.ts`) rather than issuing its own queries, so the
 * app has ONE Land Lease reader. That reader already selects `vsb_landowner`, the six one-time
 * payment columns and the WTG allocations, and it keeps a null money column null — the three
 * things this path used to lose.
 */
async function loadLandLeasePeriods(
  projectId: string,
): Promise<{ periods: CostPeriod[]; extraGroups: string[] }> {
  const book = await loadLeaseBook(projectId);
  if (book.costs.length === 0) return { periods: [], extraGroups: [] };

  const subaccountName = new Map(book.subaccounts.map((s) => [s.id, s.name]));
  const headerById = new Map(book.costs.map((h) => [h.id, h]));
  const allocationsByHeader = groupAllocations(book.allocations);

  const periods = book.periods.map((pr) => {
    const header = headerById.get(pr.projectCostId ?? "");
    const group = (header && subaccountName.get(header.subaccountId ?? "")) || UNASSIGNED.land;
    return mapLandLeasePeriodRow(
      pr, header, group, header?.currencyName ?? "",
      allocationsByHeader.get(header?.id ?? "") ?? [],
    );
  }).sort(byCanvasOrder);

  // Any subaccount with a header on this project is a real group, fixed or user-added alike.
  const extraGroups = [...new Set(
    book.costs.map((h) => subaccountName.get(h.subaccountId ?? "") ?? "").filter(Boolean),
  )];

  return { periods, extraGroups };
}

/**
 * Every Land Lease CONTRACT on the project — one entry per `vsb_landleaseprojectcosts` header.
 *
 * A sub-account card lists periods from every contract under it (the canvas gallery is a flat
 * `Filter(colLandLeasePeriods, 'Project Cost' in <the sub-account's costs>)`), and a header with
 * NO periods yet is invisible in that list — measured on Project New Data, 16 Sep, 19 of its 27
 * headers have no period row at all. The screen needs them anyway, to offer "Add Period" on a
 * contract type that was created and never filled in, so they are returned separately rather
 * than faked as periods.
 */
export interface LandLeaseContract {
  id: string;
  group: string;
  name: string;
  standard: boolean;
  secured: boolean;
  allWtgAllocated: boolean;
  hasOneTimePayment: boolean;
}

export async function loadLandLeaseContracts(projectId: string): Promise<LandLeaseContract[]> {
  // Through the one Land Lease reader, for the reason `loadLandLeasePeriods` gives.
  const book = await loadLeaseBook(projectId);
  const subaccountName = new Map(book.subaccounts.map((s) => [s.id, s.name]));
  return book.costs.map((h) => ({
    id: h.id,
    group: subaccountName.get(h.subaccountId ?? "") || UNASSIGNED.land,
    name: h.description,
    standard: h.isStandardContract,
    secured: h.secured === LAND_LEASE_SECURED.yes,
    allWtgAllocated: h.allWtgAllocated,
    hasOneTimePayment:
      h.dueDateOneTimePayment != null && h.amountOneTimePayment != null,
  }));
}

/**
 * The `Inflation Country Area` choices for a project's country.
 *
 * `Distinct(Filter('Country Inflation Profiles', Country.Country = gblSelectedProject.Country
 * .Country).Area, Area)` — `OpexCostScreenCode.txt:7622`, the dropdown that feeds the
 * `vsb_inflationcountryarea` TEXT column. Sorted so the list is stable between renders; the
 * canvas' `Distinct` has no order of its own.
 */
export async function loadCountryInflationAreas(
  countryId: string | undefined,
): Promise<string[]> {
  if (!countryId) return [];
  const rows = await fetchAll(
    "list country inflation areas",
    (o) => Vsb_countryinflationprofilesService.getAll(o),
    {
      select: ["vsb_countryinflationprofileid", "vsb_area"],
      filter: and(lookupEq("vsb_country", countryId), ACTIVE),
    },
  );
  return [...new Set(rows.map((r) => r.vsb_area ?? "").filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

/** Every O&M / Other OPEX / Land Lease period on the project, plus Land Lease's extra groups. */
async function loadPeriods(
  projectId: string,
): Promise<{ periods: CostPeriod[]; extraGroups: Record<PeriodMode, string[]> }> {
  const [opex, land] = await Promise.all([
    loadOpexPeriods(projectId),
    loadLandLeasePeriods(projectId),
  ]);
  return {
    periods: [...opex, ...land.periods],
    extraGroups: { om: [], other: [], land: land.extraGroups },
  };
}

/* ══════════════════════════════════════════════════════════════ accounts ══ */

/**
 * The level-1 account name the canvas never shows a tab for.
 *
 * `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")), "vsb_order")`
 * — the canvas excludes it BY NAME, not by account number, so this matches on the name too.
 */
const EXCLUDED_CATEGORY_NAME = "Overleveraging";

/**
 * The DEVEX/CAPEX category tab labels, as Dataverse actually has them.
 *
 * The canvas builds the tab strip from
 * `SortByColumns(Filter(colCapexAccountCategoriesNew, Not(Name = "Overleveraging")), "vsb_order")`
 * — the live children of account "00001" in `vsb_order`. Ours has a hard-coded `CATEGORIES` in
 * `features/costing/model.ts`, which is correct today and silently wrong the day an admin adds a
 * category: the new one would simply never get a tab.
 *
 * MEASURED, 16 Sep, VSBCloud_Dev (`pac org fetch`, children of "00001" by `vsb_order`):
 *
 *     1 Wind Turbine / Panels · 2 Development Expenses · 3 Construction Expenses
 *     4 Overleveraging (excluded) · 5 Substation / Grid Connection · 6 Other CAPEX
 *
 * which is `CATEGORIES` exactly, in that order — so this renders identically today and is a
 * resilience fix, not a visible one.
 *
 * It is a SEPARATE loader rather than a change to `loadCostAccounts`' return shape on purpose.
 * `CostAccount.category` is an index, and every consumer of it (`gridRows`, `loadCapexTotals`,
 * `resolveCategory`, the Add Cost from Table sheet, and `Screen.tsx`'s tab strip) reads that
 * index against `CATEGORIES`. Re-basing the index on the live list in one step would change all
 * of them at once, including a file this change may not edit. See `categoryTabs` /
 * `resolveCategory` in `features/capex-costs/rules.ts`, which now take the list as an argument
 * and default to `CATEGORIES`: wiring is a one-line change in `Screen.tsx`.
 */
export async function loadCapexCategories(): Promise<string[]> {
  const rows = await fetchAll(
    "list CAPEX account categories",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order",
        "_vsb_parentaccount_value",
      ],
      filter: ACTIVE,
    },
  );
  const rootId = rows.find((r) => r.vsb_number === CAPEX_ROOT_NUMBER)?.vsb_capexaccountlistid;
  if (!rootId) return [];
  return rows
    .filter((r) => r._vsb_parentaccount_value === rootId)
    .filter((r) => (r.vsb_name ?? "") !== EXCLUDED_CATEGORY_NAME)
    .sort((a, b) =>
      (a.vsb_order ?? 0) - (b.vsb_order ?? 0)
      || (a.vsb_number ?? "").localeCompare(b.vsb_number ?? ""))
    .map((r) => r.vsb_name ?? "");
}

export async function loadCostAccounts(): Promise<CostAccount[]> {
  const rows = await fetchAll(
    "list CAPEX accounts for the cost book",
    (o) => Vsb_capexaccountlistsService.getAll(o),
    {
      select: [
        "vsb_capexaccountlistid", "vsb_number", "vsb_name", "vsb_order",
        "_vsb_parentaccount_value",
      ],
      filter: ACTIVE,
    },
  );

  interface Node { id: string; number: string; name: string; order: number }
  const childrenOf = new Map<string, Node[]>();
  let rootId: string | undefined;

  for (const r of rows) {
    const node: Node = {
      id: r.vsb_capexaccountlistid,
      number: r.vsb_number ?? "",
      name: r.vsb_name ?? "",
      order: r.vsb_order ?? 0,
    };
    if (node.number === CAPEX_ROOT_NUMBER) rootId = node.id;
    const parent = r._vsb_parentaccount_value;
    if (!parent) continue;
    const bucket = childrenOf.get(parent);
    if (bucket) bucket.push(node);
    else childrenOf.set(parent, [node]);
  }

  if (!rootId) return [];

  const ordered = (parentId: string) =>
    [...(childrenOf.get(parentId) ?? [])].sort(
      (a, b) => a.order - b.order || a.number.localeCompare(b.number),
    );

  const out: CostAccount[] = [];
  for (const level1 of ordered(rootId)) {
    const category = CATEGORIES.indexOf(level1.name as (typeof CATEGORIES)[number]);
    if (category === -1) continue;
    for (const level2 of ordered(level1.id)) {
      // Level 2 is an account row: no parent in our model, exactly as the demo book shapes it.
      out.push({ id: level2.id, number: level2.number, name: level2.name, category });
      for (const level3 of ordered(level2.id)) {
        out.push({
          id: level3.id, number: level3.number, name: level3.name,
          category, parentId: level2.id,
        });
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════ project states ══ */

/**
 * One `Project States` row — the table `vsb_capexprojectcontract.vsb_linkedcluster` points at.
 *
 * `Order` is the number the screen shows ("Link to Cluster 3"), not a row count: the table holds
 * ten rows and only 1..6 are clusters. Measured on VSBCloud_Dev, 16 Sep:
 *
 *     0 Draft · 1..6 Cluster 1..6 · 8 Abandoned · 9 Inactive/ On-hold
 *
 * so a consumer that wants "the clusters" has to filter on `order` in 1..6, exactly as the
 * canvas dropdown does (`Order in [1, 2, 3, 4, 5, 6]`, `CapexScreenCode.txt:11272`).
 */
export interface ProjectState {
  id: string;
  /** `vsb_name` — "Cluster 3". The canvas panel compares the dropdown's selection by this. */
  name: string;
  /** `vsb_order`. */
  order: number;
}

/**
 * Every `Project States` row, in `Order`.
 *
 * A separate query rather than an `$expand` on the contract: `IGetAllOptions`
 * (`src/generated/models/CommonModels.ts`) declares no `expand` at all, and
 * `convertOptionsToQueryString` in `@microsoft/power-apps` serialises only `$select`, `$filter`,
 * `$orderby`, `$top`, `$skip`, `$count` and `$skiptoken` — the same ceiling that rules out
 * `$apply=aggregate` in `loadContractCostSums`. The table is ten rows of global master data, so
 * one extra round trip buys the lookup for every contract at once. This is the shape
 * `loadPayerDefaults` already uses for the SPV/DevCo mapping.
 *
 * Exported on its own because the Add/Edit panel's "Link to Milestone" dropdown needs the whole
 * list, not just the rows some contract happens to reference.
 */
export async function loadProjectStates(): Promise<ProjectState[]> {
  const rows = await fetchAll(
    "list project states",
    (o) => Vsb_projectstatesService.getAll(o),
    {
      select: ["vsb_projectstateid", "vsb_name", "vsb_order"],
      filter: ACTIVE,
    },
  );
  return rows
    .map((r) => ({
      id: r.vsb_projectstateid,
      name: r.vsb_name ?? "",
      order: r.vsb_order ?? 0,
    }))
    .sort((a, b) => a.order - b.order);
}

/* ═══════════════════════════════════════════════ milestone assumptions ══ */

/**
 * `Name` on the one `Milestones Standard Assumptions` row the cluster chain uses.
 *
 * The table holds two rows per Country+Technology — `"average duration [months]"` and
 * `"success rate [-]"` — with the same six numeric columns meaning entirely different things
 * (17 months versus 0.2 probability). The canvas' `LookUp` names it explicitly
 * (`CapexScreenCode.txt:18139-18142`) and so must this: reading the wrong row would back-date
 * clusters by a fraction of a month and look almost right.
 */
const AVERAGE_DURATION_NAME = "average duration [months]";

/**
 * The cluster durations for a project's country and technology, for `synthesiseClusterDates`.
 *
 *     LookUp('Milestones Standard Assumptions',
 *            Name = "average duration [months]"
 *            && Country.Country = gblSelectedProject.Country.Country
 *            && Technology = gblSelectedProject.Technology)
 *
 * — `CapexScreenCode.txt:18138-18143`. The canvas compares `Country.Country`, i.e. the country
 * row's primary key, which is `_vsb_country_value` here; `Technology` is the same global option
 * set on both tables (952850000 Wind, 952850001 PV, 952850002 Hybrid, 952850003 BESS …), so the
 * numbers compare directly with no mapping.
 *
 * `undefined` when nothing matches, which `synthesiseClusterDates` treats exactly as the canvas'
 * `Coalesce(varMilestoneDurations.'Cluster N', 0)` does — see its doc comment. That is not rare:
 * measured 16 Sep, the table has 19 "average duration [months]" rows covering DE/IT/PL/ES/FR/FI/
 * HR/GR/RO against Wind/PV/BESS only, so a Hydro or Substation project matches nothing at all.
 *
 * `countryId` and `technology` come from `loadProjectExtras` (`./project.ts`); neither is on
 * `ProjectContext`. This lives here rather than in `project.ts` because the only thing that
 * consumes it is the CAPEX cluster timeline, next to `loadProjectStates` above.
 */
export async function loadMilestoneDurations(
  countryId: string | undefined,
  technology: number | undefined,
): Promise<MilestoneDurations | undefined> {
  if (!countryId || technology === undefined) return undefined;
  const rows = await fetchAll(
    "load milestone standard assumptions",
    (o) => Vsb_milestonesstandardassumptionsesService.getAll(o),
    {
      select: [
        "vsb_milestonesstandardassumptionsid",
        "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
        "vsb_finalinvestmentdecision",
      ],
      filter: and(
        eq("vsb_name", AVERAGE_DURATION_NAME),
        lookupEq("vsb_country", countryId),
        eq("vsb_technology", technology),
        ACTIVE,
      ),
      top: 1,
    },
  );
  const row = rows[0];
  if (!row) return undefined;
  const months = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return {
    cluster1: months(row.vsb_cluster1),
    cluster2: months(row.vsb_cluster2),
    cluster3: months(row.vsb_cluster3),
    cluster4: months(row.vsb_cluster4),
    cluster5: months(row.vsb_cluster5),
    finalInvestmentDecision: months(row.vsb_finalinvestmentdecision),
  };
}

/* ═════════════════════════════════════════════════════════════════ lines ══ */

/** The text the grid shows for a contract row. Blank-safe, not just null-safe. */
export function contractLabel(
  description: string | undefined,
  name: string | undefined,
): string {
  const d = description?.trim();
  if (d) return d;
  return name?.trim() ?? "";
}

/**
 * The cost lines of ONE category.
 *
 * `accountIds` is the category's accounts and sub-accounts, so the `$filter` narrows on the
 * server. Fetching every contract on the project and filtering client-side is the thing the
 * canvas rebuild is supposed to stop doing — a project's whole cost set is tens of thousands of
 * monthly rows, and the grid only ever shows one category at a time.
 *
 * Cost rows come back for EVERY year, not just the selected one, because the grid's Total /
 * Planned / Actual columns are all-years figures. Narrowing by year would make the totals wrong.
 */
export async function loadCostLines(
  projectId: string,
  accountIds: readonly string[],
  payerDefaults: ReadonlyMap<string, "DevCo" | "SPV"> = new Map(),
): Promise<CostLine[]> {
  if (accountIds.length === 0) return [];
  const contractBatches = await Promise.all(
    chunk(accountIds).map((ids) =>
      fetchAll(
        "list CAPEX project contracts",
        (o) => Vsb_capexprojectcontractsService.getAll(o),
        {
          select: [
            "vsb_capexprojectcontractid", "_vsb_account_value", "vsb_name", "vsb_description",
            "vsb_costtype", "vsb_totalcost",
            "vsb_depreciation", "vsb_applyvat", "vsb_isstandardcontract", "vsb_distribution",
            "vsb_distributionscheme",
            "vsb_distributionfrequency", "vsb_byclusterjson", "vsb_bystartenddatejson",
            "_vsb_capexstandardassumptioncontract_value",
            // The "Link to Milestone" selection. Only the id comes back on the contract row;
            // `loadProjectStates` below resolves it to the Name and Order the screen shows.
            "_vsb_linkedcluster_value",
          ],
          filter: and(lookupEq("vsb_project", projectId), lookupIn("vsb_account", ids), ACTIVE),
        },
      ),
    ),
  );
  const contracts = contractBatches.flat();
  if (contracts.length === 0) return [];

  // The `Project States` lookup is only worth a round trip when something actually references
  // it. Across VSBCloud_Dev only 31 contracts carry one and none of them are on Wirmighausen, so
  // the common case pays nothing.
  const hasLinkedCluster = contracts.some((c) => c._vsb_linkedcluster_value);
  const [payments, projectStates] = await Promise.all([
    loadPayments(contracts.map((c) => c.vsb_capexprojectcontractid)),
    hasLinkedCluster ? loadProjectStates() : Promise.resolve<ProjectState[]>([]),
  ]);
  const stateById = new Map(projectStates.map((s) => [s.id, s]));

  return contracts.map((c) => {
    /*
     * `CPC.'Linked Cluster'` — blank unless the lookup is set AND resolves.
     *
     * An id that no longer resolves (the Project States row was deactivated, which `ACTIVE`
     * filters out) is treated as NOT LINKED rather than as a link with an unknown order: every
     * canvas consumer tests `Not(IsBlank(CPC.'Linked Cluster'))` and would then read a blank
     * `.Order`, which renders as "Link to Cluster " with nothing after it.
     */
    const linked = c._vsb_linkedcluster_value
      ? stateById.get(c._vsb_linkedcluster_value)
      : undefined;
    const equal = numberOf(c.vsb_distribution) === DISTRIBUTION_EQUAL;
    /*
     * Both parsers now live in `capex-costs/rules.ts`, next to the functions that WRITE these
     * two columns, so the round trip cannot drift apart again.
     *
     * The regex scanner they replace was actively wrong. `vsb_byclusterjson` always lists all
     * five keys — `[{"Cluster1":false,"Cluster2":true,"Cluster3":false,...}]` — so pulling
     * "any integer 1-6 out of the string" matched the digits in the KEY NAMES and returned
     * [1,2,3,4,5] for every contract that had the column set, whatever was actually ticked.
     * Every stored cluster selection read back as "all five", which is what made a correctly
     * saved selection look like it had not saved at all.
     */
    const clusters = parseByClusterJson(c.vsb_byclusterjson);
    const { startDate, endDate } = parseStartEndJson(c.vsb_bystartenddatejson);
    return {
      id: c.vsb_capexprojectcontractid,
      accountId: c._vsb_account_value ?? "",
      // `vsb_description` first, falling back to `vsb_name` — the skeleton's `buildGrid` rule
      // (`contract.description ?? contract.name`). This is not a nicety: measured on
      // VSBCloud_Dev, `vsb_description` is EMPTY on every contract and the name lives in
      // `vsb_name` ("Gesamt (CAPEX_after_FID) (59018_0_47110101)"). Reading only the
      // description left every contract row in the grid blank.
      description: contractLabel(c.vsb_description, c.vsb_name),
      // Coalesce(contract.'Cost Type', mapping.'DevCo/SPV') — the canvas rule. A blank
      // Cost Type is NOT SPV; it means "ask the sub-account mapping".
      payer: resolvePayer(numberOf(c.vsb_costtype), payerDefaults.get(c._vsb_account_value ?? "")),
      depreciation: c.vsb_depreciation === true,
      vat: c.vsb_applyvat === true,
      standard: c.vsb_isstandardcontract === true,
      standardAssumptionId: c._vsb_capexstandardassumptioncontract_value ?? undefined,
      distribution: equal ? "equal" : "individual",
      distributionScheme:
        numberOf(c.vsb_distributionscheme) === DISTRIBUTION_SCHEME_PERCENT ? "percent" : "absolute",
      // The canvas stores the two equal-distribution modes as two different JSON columns;
      // whichever one carries a value is the mode that was chosen. `resolveEqualMode` also
      // carries the canvas' fallback for a contract that has NEITHER: By Cluster, not dates.
      equalMode: resolveEqualMode(clusters, startDate, endDate),
      startDate,
      endDate,
      frequency: c.vsb_distributionfrequency ?? 1,
      clusters,
      payments: payments.get(c.vsb_capexprojectcontractid) ?? [],
      comments: [],
      totalCost: c.vsb_totalcost ?? undefined,
      linkedClusterId: linked ? linked.id : undefined,
      linkedClusterName: linked ? linked.name : undefined,
      linkedClusterOrder: linked ? linked.order : undefined,
    };
  });
}

/** `Coalesce('Cost Type', mapping.'DevCo/SPV')`, defaulting to SPV only when neither is set. */
export function resolvePayer(
  costType: number | undefined,
  mapped: "DevCo" | "SPV" | undefined,
): "DevCo" | "SPV" {
  if (costType === COST_TYPE_DEVCO) return "DevCo";
  if (costType !== undefined && costType in PAYER_BY_OPTION) {
    return PAYER_BY_OPTION[costType] as "DevCo" | "SPV";
  }
  return mapped ?? "SPV";
}

/** The monthly rows, grouped by contract. */
async function loadPayments(contractIds: string[]): Promise<Map<string, Payment[]>> {
  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "list CAPEX costs for the cost book",
        (o) => Vsb_capexcostsService.getAll(o),
        {
          select: [
            "vsb_capexcostid", "_vsb_contract_value", "vsb_year", "vsb_month",
            "vsb_cost", "vsb_costpaid",
          ],
          filter: and(lookupIn("vsb_contract", ids), ACTIVE),
        },
      ),
    ),
  );

  const byContract = new Map<string, Payment[]>();
  for (const row of batches.flat()) {
    const contractId = row._vsb_contract_value;
    if (!contractId) continue;
    const bucket = byContract.get(contractId) ?? [];
    bucket.push({
      id: row.vsb_capexcostid,
      year: Number(row.vsb_year ?? 0),
      // `vsb_month` is a global picklist whose option values are 1-12 in calendar order.
      month: Number(numberOf(row.vsb_month) ?? 0),
      amount: row.vsb_cost ?? 0,
      paid: row.vsb_costpaid === true,
    });
    byContract.set(contractId, bucket);
  }
  for (const bucket of byContract.values()) {
    bucket.sort((a, b) => a.year - b.year || a.month - b.month);
  }
  return byContract;
}

/* ═════════════════════════════════════════════════════════════ the book ══ */

/**
 * The cost book for one screen's worth of data.
 *
 * `category` is the DEVEX/CAPEX tab index, and it decides how much is fetched:
 *
 *   0..4        that category's accounts only — contracts and their monthly rows
 *   undefined   no cost lines at all (the OPEX / Land Lease screens, which want periods)
 *
 * The Summary tab does NOT come through here: it needs one figure per category and none of the
 * contract detail, which is `loadCapexTotals` — two narrow queries instead of the whole book.
 */
export async function loadCostBook(projectId: string, category?: number): Promise<CostBook> {
  const accounts = await loadCostAccounts();
  const scoped =
    category === undefined ? [] : accounts.filter((a) => a.category === category);
  const payerDefaults = scoped.length > 0 ? await loadPayerDefaults() : new Map();
  const lines = await loadCostLines(projectId, scoped.map((a) => a.id), payerDefaults);
  // Periods are what the O&M / Land Lease / Other OPEX screens want and DEVEX/CAPEX never
  // does — `category === undefined` is exactly how those screens call `useCostBook()` (see
  // `useCostBook`'s own doc comment), so a CAPEX tab's book load skips these queries entirely.
  const { periods, extraGroups } =
    category === undefined
      ? await loadPeriods(projectId)
      : { periods: [], extraGroups: { om: [], land: [], other: [] } };
  return { accounts, lines, periods, extraGroups };
}

/* ══════════════════════════════════════════════════════ the Summary tab ══ */

/** One category's total, as the DEVEX/CAPEX Summary tab shows it. */
export interface CapexCategoryTotal {
  category: number;
  total: number;
}

/**
 * The sum of `vsb_cost` per contract, in as few rows as Dataverse will give them.
 *
 * `$apply=aggregate(...)` and FetchXML are both out of reach: `convertOptionsToQueryString` in
 * `@microsoft/power-apps` (`internal/data/core/data/executors/shared/stringQueryOptions.js`)
 * serialises only `$select`, `$filter`, `$orderby`, `$top`, `$skip`, `$count` and `$skiptoken`,
 * and `IOperationOptions` has no `fetchXml`. A server-side SUM is therefore not available to
 * this app at all, so the sum is done here over the narrowest possible projection: TWO columns,
 * no formatted-value annotations, at the platform's maximum page size so 579 rows (the whole of
 * Wirmighausen) arrive in a single round trip instead of two, and 5,000 in one instead of ten.
 */
async function loadContractCostSums(
  contractIds: readonly string[],
): Promise<Map<string, number>> {
  if (contractIds.length === 0) return new Map();
  const batches = await Promise.all(
    chunk(contractIds).map((ids) =>
      fetchAll(
        "sum CAPEX cost rows per contract",
        (o) => Vsb_capexcostsService.getAll(o),
        {
          select: ["_vsb_contract_value", "vsb_cost"],
          filter: and(lookupIn("vsb_contract", ids), ACTIVE),
          // 5000 is Dataverse's ceiling for `odata.maxpagesize`; `fetchAll` still follows the
          // skip token, so this changes the number of round trips and nothing else.
          maxPageSize: 5000,
        },
      ),
    ),
  );

  const sums = new Map<string, number>();
  for (const row of batches.flat()) {
    const contractId = row._vsb_contract_value;
    if (!contractId) continue;
    sums.set(contractId, (sums.get(contractId) ?? 0) + (row.vsb_cost ?? 0));
  }
  return sums;
}

/**
 * Totals per category, as the DEVEX/CAPEX Summary tab shows them.
 *
 * THE SUMMARY AND THE GRID DELIBERATELY DISAGREE ABOUT WHERE A TOTAL COMES FROM. This is not an
 * inconsistency to be tidied up — it is two different canvas expressions, and each screen has to
 * match its own:
 *
 *   - The GRID (`gridRows.ts`) uses `Coalesce(C.'Total Cost', Sum(costs), 0)` — the contract's
 *     STORED `vsb_totalcost` wins (`Capex Costs Screen.pa.yaml:1536-1546`).
 *   - The SUMMARY uses the MONTHLY COST ROWS, floored at zero
 *     (`:2472-2504`, `CapexScreenCode.txt:642`):
 *
 *         Sum: Max(Sum(Filter(colCapexCosts, Contract in lclContracts), Cost), 0)
 *
 *     `colCapexCosts` is the cost-row collection; `'Total Cost'` appears nowhere in it.
 *
 * This read `vsb_totalcost` — the grid's source — and so showed a figure the canvas app never
 * shows. Measured on Wirmighausen (`9f5aade5-…`) on 16 Sep: Σ cost rows 42,681,823.46 against
 * Σ `vsb_totalcost` 42,678,824, a 2,999.46 gap concentrated in three contracts.
 *
 * `Max(…, 0)` is transcribed, not defensive: a project whose cost rows sum negative reports 0.
 *
 * Cost: still two round trips for a project of Wirmighausen's size — one page of contracts and
 * one page of cost rows (see `loadContractCostSums`) — plus the shared account tree.
 */
export async function loadCapexTotals(projectId: string): Promise<CapexCategoryTotal[]> {
  const [accounts, contracts] = await Promise.all([
    loadCostAccounts(),
    fetchAll(
      "list CAPEX contract totals",
      (o) => Vsb_capexprojectcontractsService.getAll(o),
      {
        // `vsb_totalcost` is deliberately NOT selected. The Summary does not use it, and
        // selecting it would invite the next reader to sum the wrong column again.
        select: ["vsb_capexprojectcontractid", "_vsb_account_value"],
        filter: and(lookupEq("vsb_project", projectId), ACTIVE),
      },
    ),
  ]);

  const categoryOf = new Map(accounts.map((a) => [a.id, a.category]));
  // Only contracts that land in a real category are worth fetching cost rows for — a contract
  // under Overleveraging or BoP has no Summary tile to appear on.
  const categoryByContract = new Map<string, number>();
  for (const c of contracts) {
    const category = c._vsb_account_value ? categoryOf.get(c._vsb_account_value) : undefined;
    if (category !== undefined) categoryByContract.set(c.vsb_capexprojectcontractid, category);
  }

  const costSums = await loadContractCostSums([...categoryByContract.keys()]);
  const totals = new Map<number, number>();
  for (const [contractId, category] of categoryByContract) {
    totals.set(category, (totals.get(category) ?? 0) + (costSums.get(contractId) ?? 0));
  }
  return CATEGORIES.map((_name, category) => ({
    category,
    total: Math.max(totals.get(category) ?? 0, 0),
  }));
}
