/**
 * Application Settings › Costs — Dataverse reads and writes.
 *
 * Replaces the canvas 'Admin Cost Screen' data access
 * (`codeapp-knowledge-base/screens/application-settings/costs/04-data/02-operations-performed.md`):
 *
 *   R-5        countries                           → the shared `@/data/countries` read (M6)
 *   R-2..R-10  reference data                      → `loadCapexHierarchy`,
 *                                                     `listLandLeaseSubaccounts`, `listOpexSubaccounts`,
 *                                                     `listCostCurrencies`, `listInflationAreas`,
 *                                                     `loadCostPayerDefaults`
 *   R-6 / R-21 T2, whole table, row-limit capped   → `listOpexPeriods`, ONE scoped query, fully paged
 *   R-12       T1, 2 queries per category, capped  → `listDevexCosts`, ONE scoped query, fully paged
 *   W-1        DEVEX save (no IfError)             → `saveDevexCost`
 *   W-2        DEVEX delete                        → `deleteDevexCost` (plug-in errors surfaced)
 *   W-3        Apply-All tracking row on delete    → NOT written (D-APPLY-3)
 *   W-5/W-6    contract / period save              → `saveOpexPeriod`
 *   W-7        Period 1 → later periods, N PATCHes → `saveOpexPeriod`, ONE `UpdateMultiple`
 *   W-8        contract delete (non-delegable)     → `deleteOpexContract`, every row by id, tail first
 *   W-9        last-period delete (wrong new tail) → `deleteOpexPeriod`, new tail by numeric period
 *
 * Every read is scoped server-side and goes through `fetchAll` (DR-2), so the canvas row-limit
 * truncation (D-PERF-1/2) cannot recur. Every write result goes through `unwrap`.
 */
import { TECHNOLOGY as SHARED_TECHNOLOGY } from "@/domain/technology";
import { Vsb_capexaccountlistsService } from "@/generated/services/Vsb_capexaccountlistsService";
import { Vsb_landleasesubaccountsService } from "@/generated/services/Vsb_landleasesubaccountsService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_opexaccountsService } from "@/generated/services/Vsb_opexaccountsService";
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { Vsb_countryinflationprofilesService } from "@/generated/services/Vsb_countryinflationprofilesService";
import { Vsb_spvdevcomappingcapexdevexesService } from "@/generated/services/Vsb_spvdevcomappingcapexdevexesService";
import { Vsb_devexcapexstandardassumptionsesService } from "@/generated/services/Vsb_devexcapexstandardassumptionsesService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { RecordGoneError, unwrap } from "@/platform/errors";
import { deleteRecord, fetchAll, updateRecordIfExists } from "../client";
import { ACTIVE, and, eq, lookupEq, ne } from "../odata";
import { updateMultiple } from "../bulkWrite";

/* ════════════════════════════════════════════════════════════════ contract ══ */

export const DEVEX_ENTITY_SET = "vsb_devexcapexstandardassumptionses";
export const DEVEX_PRIMARY_KEY = "vsb_devexcapexstandardassumptionsid";
export const OPEX_ENTITY_SET = "vsb_opexlandleasestandardassumptionses";
/** `@odata.type` suffix for `UpdateMultiple` targets (logical name, singular). */
export const OPEX_ODATA_TYPE = "vsb_opexlandleasestandardassumptions";
export const OPEX_PRIMARY_KEY = "vsb_opexlandleasestandardassumptionsid";

/** DR-5 — `vsb_typeofcontract` (same values as `TYPE_OF_CONTRACT` in `features/periods/opexRules`). */
export const CONTRACT_TYPE = {
  landLease: 952850000,
  oAndM: 952850001,
  other: 952850002,
  devexCapex: 952850003,
} as const;
export type OpexContractType =
  | typeof CONTRACT_TYPE.landLease | typeof CONTRACT_TYPE.oAndM | typeof CONTRACT_TYPE.other;

/**
 * DR-5 / DR-11 — `vsb_technology`; the picker offers Wind and PV only (D-TECH-1). The codes come
 * from the shared `@/domain/technology` (M10); this narrows them to the two Costs offers.
 */
export const TECHNOLOGY = { wind: SHARED_TECHNOLOGY.wind, pv: SHARED_TECHNOLOGY.pv } as const;
export type CostTechnology = typeof TECHNOLOGY.wind | typeof TECHNOLOGY.pv;
export const TECHNOLOGY_LABEL: Record<CostTechnology, "Wind" | "PV"> = {
  [TECHNOLOGY.wind]: "Wind",
  [TECHNOLOGY.pv]: "PV",
};

/** DR-5 — `vsb_opexlandleaseperiod`: Period n = 952849999 + n, Period 1..10 only. */
export const PERIOD_BASE = 952849999;
export const MAX_PERIOD = 10;
export const periodChoice = (n: number): number => PERIOD_BASE + n;
export function periodNumber(choice: unknown): number | undefined {
  if (typeof choice !== "number") return undefined;
  const n = choice - PERIOD_BASE;
  return n >= 1 && n <= MAX_PERIOD ? n : undefined;
}

/** DR-5 — `vsb_opexaggregation` (same as `AGGREGATION_VALUE` in `costBook.ts`). */
export const AGGREGATION = { sum: 952850000, max: 952850001, min: 952850002 } as const;

/** DR-5 — `vsb_costunit`, in the order the canvas slices it (ACS:10567-10579). */
export const COST_UNIT = {
  eur: 952850000,
  eurMw: 952850001,
  eurWtg: 952850002,
  pln: 952850003,
  plnMw: 952850004,
  plnWtg: 952850005,
} as const;

/** DR-5 — `vsb_costpaidtype` (None 952850000 is never offered). */
export const COST_PAID_BY = { devCo: 952850001, spv: 952850002 } as const;

/** DR-14 — byte-identical constants consumed downstream. */
export const INFLATION_START_YEAR_STRING = "Cluster 6 : Operation";
export const DEVEX_DISTRIBUTION_FREQUENCY = 3;

/* ═══════════════════════════════════════════════════════════════════ models ══ */

export interface CapexCategory { id: string; name: string; order: number }
export interface CapexAccount { id: string; name: string; order: number; categoryId: string }
export interface CapexSubaccount {
  id: string;
  name: string;
  number: string;
  order: number;
  accountId: string;
  accountName: string;
  accountOrder: number;
  categoryId: string;
  categoryOrder: number;
  /** `"{account} / {name} {number}"` — the canvas `AggregatedName` (ACS:188). */
  aggregatedName: string;
}
export interface CapexHierarchy {
  categories: CapexCategory[];
  accounts: CapexAccount[];
  subaccounts: CapexSubaccount[];
}

export interface LandLeaseSubaccount { id: string; name: string; order: number }
export interface OpexSubaccountRow {
  id: string;
  name: string;
  order: number;
  accountId: string | undefined;
  accountOrder: number | undefined;
  /** R-3/R-4 split: `Account.Order = 1 || Name = "Operation & Maintenance"`. */
  isOAndM: boolean;
}

export interface CostCurrency { id: string; name: string; code: string }

export interface DevexCost {
  id: string;
  description: string;
  descriptionInput: string;
  clusters: [boolean, boolean, boolean, boolean, boolean];
  costAmount: number | undefined;
  unit: number | undefined;
  costPaidBy: number | undefined;
  comment: string;
  countryId: string | undefined;
  technology: number | undefined;
  categoryId: string | undefined;
  subaccountId: string | undefined;
}

export interface OtpValues {
  dueDate1: string | null; amount1: number | null;
  dueDate2: string | null; amount2: number | null;
  dueDate3: string | null; amount3: number | null;
}

export interface OpexPeriod {
  id: string;
  description: string;
  type: number | undefined;
  /** 1..10, or undefined for a row with no/unknown period choice. */
  period: number | undefined;
  isLastPeriodFlag: boolean;
  countryId: string | undefined;
  technology: number | undefined;
  landLeaseSubaccountId: string | undefined;
  opexSubaccountId: string | undefined;
  currencyId: string | undefined;
  startDate: string;
  years: number | undefined;
  months: number | undefined;
  fixCosts: number | undefined;
  ofRevenues: number | undefined;
  eurMwh: number | undefined;
  eurMw: number | undefined;
  eurWtg: number | undefined;
  aggregation: number | undefined;
  distributionFrequency: number | undefined;
  secured: boolean;
  allWtgAllocated: boolean;
  externalContract: boolean | undefined;
  alignWithProjectDuration: boolean;
  useInflation: boolean | undefined;
  useCountryInflation: boolean | undefined;
  inflationProfile: number | undefined;
  /**
   * The Italy Area as the PROJECT screens read it: `vsb_inflationcountryarea`, falling back to
   * `vsb_inflationarea` for rows where only the latter is set (B-10).
   */
  inflationArea: string | undefined;
  threshold: boolean;
  thresholdType: number | undefined;
  thresholdIndividual: number | undefined;
  otp: OtpValues;
  /**
   * The sub-account lookup's stored name (the Dataverse formatted value), whatever the
   * sub-account's state — what the canvas title showed via `'Land Lease Subaccount'.Name`
   * (ACS:4921-4933). Display only (parity r2 R2-4).
   */
  subaccountLabel?: string;
}

/**
 * A NOT-active row of a contract (parity r2 R2-5): hidden from the screen (DR-13) but still
 * counted by the write-integrity reads, so its contract's Add / Delete Period are disabled.
 */
export interface InactiveContractRow {
  id: string;
  type: number | undefined;
  period: number | undefined;
  landLeaseSubaccountId: string | undefined;
  opexSubaccountId: string | undefined;
}

/** The selected Country + Technology — every T1/T2 query and write is keyed by it. */
export interface CostScope { countryId: string; technology: CostTechnology }

/** One contract = Country + Technology + Type Of Contract + sub-account. */
export interface ContractScope extends CostScope {
  type: OpexContractType;
  subaccountId: string;
}

/* ═════════════════════════════════════════════════════════════════ helpers ══ */

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

type Raw = Record<string, unknown>;

/** The lookup column holding a contract's sub-account (DR-4). */
export function subaccountColumn(type: OpexContractType): "vsb_landleasesubaccount" | "vsb_opexsubaccount" {
  return type === CONTRACT_TYPE.landLease ? "vsb_landleasesubaccount" : "vsb_opexsubaccount";
}

/** DR-2 — `_vsb_country_value eq {country} and vsb_technology eq {tech}`. */
function scopeFilter(scope: CostScope): string {
  return and(lookupEq("vsb_country", scope.countryId), eq("vsb_technology", scope.technology)) as string;
}

function contractFilter(scope: ContractScope): string {
  return and(
    scopeFilter(scope),
    eq("vsb_typeofcontract", scope.type),
    lookupEq(subaccountColumn(scope.type), scope.subaccountId),
  ) as string;
}

/* ═══════════════════════════════════════════════════════════════════ reads ══ */

/** One CAPEX account-list row as read for the hierarchy. */
export interface CapexListRow {
  id: string; name: string; number: string; order: number; parentId: string | undefined;
}

export const CAPEX_ROOT_NUMBER = "00001";
export const EXCLUDED_CATEGORY_NAME = "Overleveraging";

/**
 * DR-6 — R-7/R-8/R-9 from ONE read, as a pure and immutable derivation (D-STATE-1: nothing
 * shared is mutated). root (`00001`) → category (excl. "Overleveraging") → account → sub-account.
 */
export function buildCapexHierarchy(rows: readonly CapexListRow[]): CapexHierarchy {
  const byOrder = (a: CapexListRow, b: CapexListRow) =>
    a.order - b.order || a.number.localeCompare(b.number) || a.name.localeCompare(b.name);
  const childrenOf = (parentId: string) => rows.filter((r) => r.parentId === parentId).sort(byOrder);
  const root = rows.find((r) => r.number === CAPEX_ROOT_NUMBER);
  if (!root) return { categories: [], accounts: [], subaccounts: [] };

  const categories: CapexCategory[] = [];
  const accounts: CapexAccount[] = [];
  const subaccounts: CapexSubaccount[] = [];
  for (const c of childrenOf(root.id)) {
    if (c.name === EXCLUDED_CATEGORY_NAME) continue;
    categories.push({ id: c.id, name: c.name, order: c.order });
    for (const a of childrenOf(c.id)) {
      accounts.push({ id: a.id, name: a.name, order: a.order, categoryId: c.id });
      for (const s of childrenOf(a.id)) {
        subaccounts.push({
          id: s.id, name: s.name, number: s.number, order: s.order,
          accountId: a.id, accountName: a.name, accountOrder: a.order,
          categoryId: c.id, categoryOrder: c.order,
          aggregatedName: `${a.name} / ${s.name} ${s.number}`,
        });
      }
    }
  }
  return { categories, accounts, subaccounts };
}

export async function loadCapexHierarchy(): Promise<CapexHierarchy> {
  const rows = await fetchAll<Raw>(
    "list CAPEX account hierarchy",
    (o) => Vsb_capexaccountlistsService.getAll(o) as never,
    {
      select: ["vsb_capexaccountlistid", "vsb_name", "vsb_number", "vsb_order", "_vsb_parentaccount_value"],
      filter: ACTIVE,
    },
  );
  return buildCapexHierarchy(rows.map((r) => ({
    id: str(r["vsb_capexaccountlistid"]),
    name: str(r["vsb_name"]),
    number: str(r["vsb_number"]),
    order: num(r["vsb_order"]) ?? 0,
    parentId: optStr(r["_vsb_parentaccount_value"]),
  })));
}

/** R-2 — sorted by `vsb_order`. */
export async function listLandLeaseSubaccounts(): Promise<LandLeaseSubaccount[]> {
  const rows = await fetchAll<Raw>(
    "list land lease sub-accounts",
    (o) => Vsb_landleasesubaccountsService.getAll(o) as never,
    { select: ["vsb_landleasesubaccountid", "vsb_name", "vsb_order"], filter: ACTIVE, orderBy: ["vsb_order asc"] },
  );
  return rows
    .map((r) => ({ id: str(r["vsb_landleasesubaccountid"]), name: str(r["vsb_name"]), order: num(r["vsb_order"]) ?? 0 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * R-3/R-4 — one sub-account read joined to the accounts (the generated `getAll` has no
 * `$expand`), split client-side into O&M and Other by the canvas predicate.
 */
export async function listOpexSubaccounts(): Promise<OpexSubaccountRow[]> {
  const [subs, accounts] = await Promise.all([
    fetchAll<Raw>(
      "list OPEX sub-accounts",
      (o) => Vsb_opexsubaccountsService.getAll(o) as never,
      { select: ["vsb_opexsubaccountid", "vsb_name", "vsb_order", "_vsb_account_value"], filter: ACTIVE },
    ),
    fetchAll<Raw>(
      "list OPEX accounts",
      (o) => Vsb_opexaccountsService.getAll(o) as never,
      { select: ["vsb_opexaccountid", "vsb_order"], filter: ACTIVE },
    ),
  ]);
  const accountOrder = new Map(accounts.map((a) => [str(a["vsb_opexaccountid"]), num(a["vsb_order"])]));
  return subs
    .map((r) => {
      const accountId = optStr(r["_vsb_account_value"]);
      const order = accountId ? accountOrder.get(accountId) : undefined;
      const name = str(r["vsb_name"]);
      return {
        id: str(r["vsb_opexsubaccountid"]),
        name,
        order: num(r["vsb_order"]) ?? 0,
        accountId,
        accountOrder: order,
        isOAndM: order === 1 || name === "Operation & Maintenance",
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** R-15 — not filtered by state: a stored currency must still resolve to its name. */
export async function listCostCurrencies(): Promise<CostCurrency[]> {
  const rows = await fetchAll<Raw>(
    "list currencies",
    (o) => TransactioncurrenciesService.getAll(o) as never,
    { select: ["transactioncurrencyid", "currencyname", "isocurrencycode"] },
  );
  return rows.map((r) => ({
    id: str(r["transactioncurrencyid"]), name: str(r["currencyname"]), code: str(r["isocurrencycode"]),
  }));
}

/** R-16 — distinct areas of the country's inflation profiles (D-DATA-7: country-filtered). */
export async function listInflationAreas(countryId: string): Promise<string[]> {
  const rows = await fetchAll<Raw>(
    "list country inflation areas",
    (o) => Vsb_countryinflationprofilesService.getAll(o) as never,
    { select: ["vsb_countryinflationprofileid", "vsb_area"], filter: and(lookupEq("vsb_country", countryId), ACTIVE) },
  );
  return [...new Set(rows.map((r) => str(r["vsb_area"])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** R-10 / D-DATA-8 — Cost Paid By default per CAPEX sub-account id. */
export async function loadCostPayerDefaults(): Promise<Map<string, number>> {
  const rows = await fetchAll<Raw>(
    "list SPV/DevCo sub-account mapping",
    (o) => Vsb_spvdevcomappingcapexdevexesService.getAll(o) as never,
    { select: ["vsb_spvdevcomappingcapexdevexid", "_vsb_namesubaccount_value", "vsb_devcospv"], filter: ACTIVE },
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    const id = optStr(r["_vsb_namesubaccount_value"]);
    const value = num(r["vsb_devcospv"]);
    if (id && (value === COST_PAID_BY.devCo || value === COST_PAID_BY.spv)) out.set(id, value);
  }
  return out;
}

/** DR-3 — T1 columns read by the screen. */
export const DEVEX_SELECT = [
  DEVEX_PRIMARY_KEY, "vsb_description", "vsb_descriptioninput",
  "vsb_cluster1", "vsb_cluster2", "vsb_cluster3", "vsb_cluster4", "vsb_cluster5",
  "vsb_costamount", "vsb_unit", "vsb_costpaidby", "vsb_comment", "vsb_technology",
  "_vsb_country_value", "_vsb_category_value", "_vsb_subaccount_value",
];

export function toDevexCost(r: Raw): DevexCost {
  return {
    id: str(r[DEVEX_PRIMARY_KEY]),
    description: str(r["vsb_description"]),
    descriptionInput: str(r["vsb_descriptioninput"]),
    clusters: [
      r["vsb_cluster1"] === true, r["vsb_cluster2"] === true, r["vsb_cluster3"] === true,
      r["vsb_cluster4"] === true, r["vsb_cluster5"] === true,
    ],
    costAmount: num(r["vsb_costamount"]),
    unit: num(r["vsb_unit"]),
    costPaidBy: num(r["vsb_costpaidby"]),
    comment: str(r["vsb_comment"]),
    countryId: optStr(r["_vsb_country_value"]),
    technology: num(r["vsb_technology"]),
    categoryId: optStr(r["_vsb_category_value"]),
    subaccountId: optStr(r["_vsb_subaccount_value"]),
  };
}

/** R-12 as ONE scoped, fully paged query (D-PERF-1). Grouping/sorting is a UI rule. */
export async function listDevexCosts(scope: CostScope): Promise<DevexCost[]> {
  const rows = await fetchAll<Raw>(
    "list DEVEX/CAPEX standard costs",
    (o) => Vsb_devexcapexstandardassumptionsesService.getAll(o) as never,
    { select: DEVEX_SELECT, filter: and(scopeFilter(scope), ACTIVE) },
  );
  return rows.map(toDevexCost);
}

/** DR-3 — T2 columns read by the screen. */
export const OPEX_SELECT = [
  OPEX_PRIMARY_KEY, "vsb_description", "vsb_typeofcontract", "vsb_period", "vsb_islastperiod",
  "_vsb_country_value", "vsb_technology", "_vsb_landleasesubaccount_value", "_vsb_opexsubaccount_value",
  "_vsb_currency_value", "vsb_startdatestring", "vsb_durationinyears", "vsb_durationinmonths",
  "vsb_fixcosts", "vsb_ofrevenues", "vsb_eurmwh", "vsb_eurmw", "vsb_eurwtg", "vsb_aggregation",
  "vsb_distributionfrequency", "vsb_secured", "vsb_allwtgallocated", "vsb_externalcontract",
  "vsb_alignwithprojectduration", "vsb_useinflationprofile", "vsb_usecountryinflationprofile",
  "vsb_inflationprofile", "vsb_inflationarea", "vsb_inflationcountryarea", "vsb_threshold", "vsb_thresholdtype",
  "vsb_thresholdindividual", "vsb_duedateonetimepayment", "vsb_amountonetimepayment",
  "vsb_duedateonetimepayment2", "vsb_amountonetimepayment2", "vsb_duedateonetimepayment3",
  "vsb_amountonetimepayment3",
];

const optBool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
/** The standard OData lookup-name annotation suffix. */
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

export function toOpexPeriod(r: Raw): OpexPeriod {
  return {
    id: str(r[OPEX_PRIMARY_KEY]),
    description: str(r["vsb_description"]),
    type: num(r["vsb_typeofcontract"]),
    period: periodNumber(r["vsb_period"]),
    isLastPeriodFlag: r["vsb_islastperiod"] === true,
    countryId: optStr(r["_vsb_country_value"]),
    technology: num(r["vsb_technology"]),
    landLeaseSubaccountId: optStr(r["_vsb_landleasesubaccount_value"]),
    opexSubaccountId: optStr(r["_vsb_opexsubaccount_value"]),
    subaccountLabel: optStr(r[`_vsb_landleasesubaccount_value${FORMATTED}`])
      ?? optStr(r[`_vsb_opexsubaccount_value${FORMATTED}`]),
    currencyId: optStr(r["_vsb_currency_value"]),
    startDate: str(r["vsb_startdatestring"]),
    years: num(r["vsb_durationinyears"]),
    months: num(r["vsb_durationinmonths"]),
    fixCosts: num(r["vsb_fixcosts"]),
    ofRevenues: num(r["vsb_ofrevenues"]),
    eurMwh: num(r["vsb_eurmwh"]),
    eurMw: num(r["vsb_eurmw"]),
    eurWtg: num(r["vsb_eurwtg"]),
    aggregation: num(r["vsb_aggregation"]),
    distributionFrequency: num(r["vsb_distributionfrequency"]),
    secured: r["vsb_secured"] === true,
    allWtgAllocated: r["vsb_allwtgallocated"] === true,
    externalContract: optBool(r["vsb_externalcontract"]),
    alignWithProjectDuration: r["vsb_alignwithprojectduration"] === true,
    useInflation: optBool(r["vsb_useinflationprofile"]),
    useCountryInflation: optBool(r["vsb_usecountryinflationprofile"]),
    inflationProfile: num(r["vsb_inflationprofile"]),
    inflationArea: optStr(r["vsb_inflationcountryarea"]) ?? optStr(r["vsb_inflationarea"]),
    threshold: r["vsb_threshold"] === true,
    thresholdType: num(r["vsb_thresholdtype"]),
    thresholdIndividual: num(r["vsb_thresholdindividual"]),
    otp: {
      dueDate1: optStr(r["vsb_duedateonetimepayment"]) ?? null,
      amount1: num(r["vsb_amountonetimepayment"]) ?? null,
      dueDate2: optStr(r["vsb_duedateonetimepayment2"]) ?? null,
      amount2: num(r["vsb_amountonetimepayment2"]) ?? null,
      dueDate3: optStr(r["vsb_duedateonetimepayment3"]) ?? null,
      amount3: num(r["vsb_amountonetimepayment3"]) ?? null,
    },
  };
}

/** R-6 / R-21 as ONE scoped, fully paged query (D-PERF-2). Grouping/ordering is a UI rule. */
export async function listOpexPeriods(scope: CostScope): Promise<OpexPeriod[]> {
  const rows = await fetchAll<Raw>(
    "list OPEX & Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o) as never,
    { select: OPEX_SELECT, filter: and(scopeFilter(scope), ACTIVE) },
  );
  return rows.map(toOpexPeriod);
}

/**
 * Parity r2 R2-5 — the scope's NOT-active T2 rows (minimal columns, fully paged). The screen
 * still hides them (DR-13; the inactive-row policy D-DATA-6 / B-7 is a pending decision), but
 * the integrity reads count them, so the screen uses this to disable Add / Delete Period with
 * an explanation instead of letting the user hit a "changed since it was loaded" dead end.
 */
export async function listInactiveOpexRows(scope: CostScope): Promise<InactiveContractRow[]> {
  const rows = await fetchAll<Raw>(
    "list inactive OPEX & Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o) as never,
    {
      select: [OPEX_PRIMARY_KEY, "vsb_typeofcontract", "vsb_period", "_vsb_landleasesubaccount_value", "_vsb_opexsubaccount_value"],
      filter: and(scopeFilter(scope), ne("statecode", 0)),
    },
  );
  return rows.map((r) => ({
    id: str(r[OPEX_PRIMARY_KEY]),
    type: num(r["vsb_typeofcontract"]),
    period: periodNumber(r["vsb_period"]),
    landLeaseSubaccountId: optStr(r["_vsb_landleasesubaccount_value"]),
    opexSubaccountId: optStr(r["_vsb_opexsubaccount_value"]),
  }));
}

/** Every row of one contract, ANY state, fully paged — the integrity source for writes. */
interface ContractRow { id: string; period: number | undefined; isLast: boolean }

async function listContractRows(scope: ContractScope): Promise<ContractRow[]> {
  const rows = await fetchAll<Raw>(
    "list contract periods",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o) as never,
    { select: [OPEX_PRIMARY_KEY, "vsb_period", "vsb_islastperiod"], filter: contractFilter(scope) },
  );
  return rows.map((r) => ({
    id: str(r[OPEX_PRIMARY_KEY]),
    period: periodNumber(r["vsb_period"]),
    isLast: r["vsb_islastperiod"] === true,
  }));
}

/* ══════════════════════════════════════════════════════════════════ writes ══ */

/** Removes `null`/`undefined` — a create has nothing to clear (DR-7: blank on create = omitted). */
function withoutBlanks(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== null && v !== undefined));
}

/* ─────────────────────────────────────────────────────────────── DEVEX (T1) ── */

export interface DevexWrite {
  /** Absent = create. */
  id?: string;
  countryId: string;
  countryName: string;
  technology: CostTechnology;
  categoryId: string;
  subaccountId: string;
  subaccountName: string;
  descriptionInput: string;
  clusters: readonly [boolean, boolean, boolean, boolean, boolean];
  unit: number;
  costAmount: number;
  comment: string;
  costPaidBy: number;
}

/**
 * W-1 field map (FR-12, DR-14). Apply VAT / Depreciation / Distribution Frequency are the canvas
 * fixed values (D-FIXED-1). Description and comment are trimmed (DR-7).
 */
export function devexPayload(w: DevexWrite): Record<string, unknown> {
  const description = w.descriptionInput.trim();
  return {
    vsb_name: `Standard Cost : ${w.countryName}-${TECHNOLOGY_LABEL[w.technology]}-${w.subaccountName}`,
    vsb_cluster1: w.clusters[0],
    vsb_cluster2: w.clusters[1],
    vsb_cluster3: w.clusters[2],
    vsb_cluster4: w.clusters[3],
    vsb_cluster5: w.clusters[4],
    vsb_description: `Standard ${w.subaccountName} - ${description}`,
    vsb_descriptioninput: description,
    "vsb_Country@odata.bind": `/vsb_countries(${w.countryId})`,
    vsb_technology: w.technology,
    vsb_unit: w.unit,
    vsb_applyvat: true,
    vsb_depreciation: true,
    vsb_distributionfrequency: DEVEX_DISTRIBUTION_FREQUENCY,
    vsb_costamount: w.costAmount,
    vsb_comment: w.comment.trim(),
    vsb_costpaidby: w.costPaidBy,
    "vsb_Subaccount@odata.bind": `/vsb_capexaccountlists(${w.subaccountId})`,
    "vsb_Category@odata.bind": `/vsb_capexaccountlists(${w.categoryId})`,
  };
}

/** B-2 — shown when the cost's sub-account is not in the active CAPEX hierarchy. */
export const INACTIVE_SUBACCOUNT_MESSAGE = "The sub-account of this cost is inactive; choose an active sub-account.";

/** A DEVEX write refused before it reached Dataverse (it would have written malformed names). */
export class DevexRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevexRuleError";
  }
}

/**
 * W-1 with error handling (D-SAVE-1): throws a `DataError` on failure, returns the row id.
 * Refuses (B-2, DR-14) a write without a sub-account name: it would store
 * `"Standard Cost : Germany-Wind-"` / `"Standard  - X"`, which the project screens match on.
 */
export async function saveDevexCost(w: DevexWrite): Promise<string> {
  if (!w.subaccountId || !w.categoryId || w.subaccountName.trim() === "") {
    throw new DevexRuleError(INACTIVE_SUBACCOUNT_MESSAGE);
  }
  const payload = devexPayload(w);
  if (w.id) {
    // V-1 (S2): guarded PATCH — a cost deleted meanwhile raises RecordGoneError, never upserted.
    await updateRecordIfExists("update standard cost", DEVEX_ENTITY_SET, w.id, payload, { primaryKey: DEVEX_PRIMARY_KEY });
    return w.id;
  }
  const created = unwrap(
    await Vsb_devexcapexstandardassumptionsesService.create(payload as never),
    "create standard cost",
  ) as unknown as Raw;
  return str(created?.[DEVEX_PRIMARY_KEY]);
}

/**
 * W-2. Goes through `deleteRecord` because the generated `delete` discards the result — and the
 * synchronous `VSB_CapexAssumptionDeletion` plug-in (D-DEL-3, DR-15) reports its refusals there.
 * No `vsb_applyandapplyalltracking` row is written (D-APPLY-3).
 */
export async function deleteDevexCost(id: string): Promise<void> {
  await deleteRecord("delete standard cost", DEVEX_ENTITY_SET, id);
}

/* ─────────────────────────────────────────────────────── OPEX / Land Lease (T2) ── */

/** The writable values of one period (W-5). Blank numerics are `null` (DR-7). */
export interface OpexFields {
  description: string;
  startDate: string;
  years: number;
  months: number;
  fixCosts: number | null;
  ofRevenues: number | null;
  eurMwh: number | null;
  eurMw: number | null;
  eurWtg: number | null;
  aggregation: number;
  distributionFrequency: number;
  useInflation: boolean;
  useCountryInflation: boolean;
  /** Written only when the custom (non-country) profile is used; otherwise null. */
  inflationProfile: number | null;
  /**
   * True when `inflationProfile` equals the stored value of the row being edited: the PATCH
   * then omits the column, so an untouched value is never rewritten.
   */
  inflationProfileUnchanged?: boolean;
  area: string | null;
  /**
   * True when the user did not change the Area of the row being edited: neither area column is
   * written (row PATCH or Period-1 propagation), so a column the user never touched is never
   * blanked (B-10). When the Area IS written, both columns get the same value.
   */
  areaUnchanged?: boolean;
  /** O&M / Other only; `undefined` for Land Lease = not written (D-EXT-1). */
  externalContract: boolean | undefined;
  /** D-FIXED-1 locked values (false / true / false / false). */
  secured: boolean;
  allWtgAllocated: boolean;
  alignWithProjectDuration: boolean;
  threshold: boolean;
  /** Hidden fields carried from the edited / reference row exactly as the canvas does (D-OTP-1). */
  thresholdType: number | null;
  thresholdIndividual: number | null;
  otp: OtpValues;
}

export type OpexSaveMode = "new" | "edit" | "addPeriod";

export interface OpexWrite {
  mode: OpexSaveMode;
  /** Edit mode only. */
  id?: string;
  scope: ContractScope;
  countryName: string;
  /** New = 1; edit = stored; add = (highest existing + 1). */
  period: number;
  /** New/add = true; edit = stored flag. */
  isLastPeriod: boolean;
  currencyId: string | undefined;
  fields: OpexFields;
}

/**
 * The contract-level fields copied from Period 1 to every later period (FR-25, W-7).
 * `vsb_inflationcountryarea` is the column the project screens and the import read
 * (`data/landLease.ts`, `data/periodWrites.ts`); `vsb_inflationarea` is kept in step with it.
 * Both are omitted when the Area is unchanged (`areaUnchanged`, B-10).
 */
export function propagationFields(f: OpexFields): Record<string, unknown> {
  return {
    vsb_thresholdindividual: f.thresholdIndividual,
    vsb_threshold: f.threshold,
    vsb_thresholdtype: f.thresholdType,
    vsb_alignwithprojectduration: f.alignWithProjectDuration,
    ...(f.areaUnchanged ? {} : { vsb_inflationcountryarea: f.area, vsb_inflationarea: f.area }),
    vsb_inflationprofile: f.inflationProfile,
    vsb_useinflationprofile: f.useInflation,
    vsb_usecountryinflationprofile: f.useCountryInflation,
    vsb_allwtgallocated: f.allWtgAllocated,
    vsb_secured: f.secured,
    vsb_duedateonetimepayment: f.otp.dueDate1,
    vsb_amountonetimepayment: f.otp.amount1,
    vsb_duedateonetimepayment2: f.otp.dueDate2,
    vsb_amountonetimepayment2: f.otp.amount2,
    vsb_duedateonetimepayment3: f.otp.dueDate3,
    vsb_amountonetimepayment3: f.otp.amount3,
  };
}

/** W-5 field map (FR-24, DR-14). */
export function opexPayload(w: OpexWrite): Record<string, unknown> {
  const f = w.fields;
  const tech = TECHNOLOGY_LABEL[w.scope.technology];
  const subBind = w.scope.type === CONTRACT_TYPE.landLease
    ? { "vsb_LandLeaseSubaccount@odata.bind": `/vsb_landleasesubaccounts(${w.scope.subaccountId})` }
    : { "vsb_OpexSubaccount@odata.bind": `/vsb_opexsubaccounts(${w.scope.subaccountId})` };
  return {
    vsb_name: `${f.description} - ${w.countryName} - ${tech}`,
    vsb_startdatestring: f.startDate,
    vsb_description: f.description,
    ...subBind,
    vsb_typeofcontract: w.scope.type,
    ...(w.currencyId ? { "vsb_Currency@odata.bind": `/transactioncurrencies(${w.currencyId})` } : {}),
    vsb_period: periodChoice(w.period),
    vsb_inflationstartyearstring: INFLATION_START_YEAR_STRING,
    vsb_fixcosts: f.fixCosts,
    vsb_ofrevenues: f.ofRevenues,
    vsb_aggregation: f.aggregation,
    vsb_durationinyears: f.years,
    vsb_durationinmonths: f.months,
    vsb_eurmwh: f.eurMwh,
    vsb_eurmw: f.eurMw,
    vsb_eurwtg: f.eurWtg,
    vsb_distributionfrequency: f.distributionFrequency,
    "vsb_Country@odata.bind": `/vsb_countries(${w.scope.countryId})`,
    vsb_technology: w.scope.technology,
    vsb_islastperiod: w.isLastPeriod,
    ...(f.externalContract === undefined ? {} : { vsb_externalcontract: f.externalContract }),
    ...propagationFields(f),
  };
}

/** A save whose main row landed but whose follow-up step did not. */
export class OpexFollowUpError extends Error {
  readonly savedId: string;
  override readonly cause?: unknown;
  constructor(message: string, savedId: string, cause: unknown) {
    super(message);
    this.name = "OpexFollowUpError";
    this.savedId = savedId;
    this.cause = cause;
  }
}

/** The contract changed underneath the open panel, or a business rule refused the write. */
export class OpexRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpexRuleError";
  }
}

/**
 * DR-12 — exactly one `vsb_islastperiod = true` per contract: the row with the highest period.
 * Returns the flag changes needed (pure).
 */
export function lastFlagUpdates(
  rows: readonly { id: string; period: number | undefined; isLast: boolean }[],
): { id: string; isLast: boolean }[] {
  const numbered = rows.filter((r) => r.period !== undefined);
  if (numbered.length === 0) return [];
  const tail = numbered.reduce((best, r) => ((r.period ?? 0) > (best.period ?? 0) ? r : best));
  return rows
    .filter((r) => (r.id === tail.id ? !r.isLast : r.isLast))
    .map((r) => ({ id: r.id, isLast: r.id === tail.id }));
}

async function applyFlagUpdates(updates: readonly { id: string; isLast: boolean }[]): Promise<void> {
  for (const u of updates) {
    try {
      // V-1 (S3): guarded PATCH. A period deleted since the contract was read is SKIPPED (it no
      // longer needs a flag) instead of being recreated as a flag-only row by the upsert.
      await updateRecordIfExists("update last-period flag", OPEX_ENTITY_SET, u.id, { vsb_islastperiod: u.isLast }, {
        primaryKey: OPEX_PRIMARY_KEY,
      });
    } catch (error) {
      if (!(error instanceof RecordGoneError)) throw error;
    }
  }
}

const highestPeriod = (rows: readonly ContractRow[]): number =>
  rows.reduce((max, r) => Math.max(max, r.period ?? 0), 0);

/**
 * DR-12 — a precise sentence for a contract whose last-period flags are wrong, e.g.
 * "Period 2 and Period 3 are marked as last; only Period 3 should be."; `undefined` when the
 * flags are consistent (pure).
 */
export function describeLastFlagIssue(
  rows: readonly { id: string; period: number | undefined; isLast: boolean }[],
): string | undefined {
  if (lastFlagUpdates(rows).length === 0) return undefined;
  const label = (r: { period: number | undefined }) => (r.period === undefined ? "a row without a period" : `Period ${r.period}`);
  const flagged = [...rows].filter((r) => r.isLast).sort((a, b) => (a.period ?? 99) - (b.period ?? 99)).map(label);
  const expected = `Period ${rows.reduce((m, r) => Math.max(m, r.period ?? 0), 0)}`;
  if (flagged.length === 0) return `No period is marked as last; ${expected} should be.`;
  const list = flagged.length === 1 ? flagged[0] : `${flagged.slice(0, -1).join(", ")} and ${flagged[flagged.length - 1]}`;
  return `${list} ${flagged.length === 1 ? "is" : "are"} marked as last; only ${expected} should be.`;
}

const UNCHECKED_FLAGS = "The last-period flags could not be checked; reload the screen to see the current periods.";

/**
 * DR-12 repair after a partial failure: re-read the contract from the server and flag exactly
 * its highest period as last. Best effort — never throws; returns `undefined` when the contract
 * is consistent afterwards, otherwise a precise description of what is still wrong.
 */
export async function repairLastFlags(scope: ContractScope): Promise<string | undefined> {
  let rows: ContractRow[];
  try {
    rows = await listContractRows(scope);
  } catch {
    return UNCHECKED_FLAGS;
  }
  try {
    await applyFlagUpdates(lastFlagUpdates(rows));
    return undefined;
  } catch {
    try {
      rows = await listContractRows(scope);
    } catch {
      return describeLastFlagIssue(rows) ?? UNCHECKED_FLAGS;
    }
    return describeLastFlagIssue(rows);
  }
}

/** Normalise the flags from known rows; on failure, repair from the server once. */
async function normaliseLastFlags(rows: readonly ContractRow[], scope: ContractScope): Promise<string | undefined> {
  try {
    await applyFlagUpdates(lastFlagUpdates(rows));
    return undefined;
  } catch {
    return repairLastFlags(scope);
  }
}

/** B-3 — a contract without a sub-account cannot be addressed safely (no `Not a GUID` text). */
function requireSubaccount(scope: ContractScope): void {
  if (!scope.subaccountId) {
    throw new OpexRuleError("This contract has no sub-account, so it cannot be changed here. Reload the screen.");
  }
}

/**
 * W-5 + W-6 + W-7, in a safe order:
 *  1. integrity checks against the SERVER (one contract per sub-account; next period =
 *     highest + 1, never past Period 10 — D-PER-1);
 *  2. the row write — a failure here throws and nothing was written (D-SAVE-1/3);
 *  3. add-period: re-flag so only the new tail is last (W-6, DR-12);
 *  4. Period 1: copy the contract-level fields to every later period in ONE `UpdateMultiple`,
 *     only after a successful Period-1 write and from the saved values (FR-25, D-SAVE-2).
 * A failure in 3/4 throws `OpexFollowUpError` (the row itself is saved).
 */
export async function saveOpexPeriod(w: OpexWrite): Promise<{ id: string; propagated: number }> {
  requireSubaccount(w.scope);
  let rows: ContractRow[] | undefined;
  if (w.mode === "new") {
    rows = await listContractRows(w.scope);
    if (rows.length > 0) {
      throw new OpexRuleError("A contract already exists for this sub-account. Reload the screen and edit the existing contract.");
    }
    if (w.period !== 1) throw new OpexRuleError("A new contract always starts at Period 1.");
  } else if (w.mode === "addPeriod") {
    rows = await listContractRows(w.scope);
    const next = highestPeriod(rows) + 1;
    if (next > MAX_PERIOD) throw new OpexRuleError(`Maximum of ${MAX_PERIOD} periods reached.`);
    if (w.period !== next) {
      throw new OpexRuleError("This contract was changed since it was loaded. Close the panel and try again.");
    }
  }

  const payload = opexPayload(w);
  let id: string;
  if (w.mode === "edit") {
    if (!w.id) throw new OpexRuleError("No period selected to edit.");
    // Never rewrite an untouched inflation value (the canvas rounded it to 1 dp on every save).
    const patch = w.fields.inflationProfileUnchanged
      ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "vsb_inflationprofile"))
      : payload;
    // V-1 (S4): guarded PATCH — a period deleted meanwhile raises RecordGoneError, nothing written.
    await updateRecordIfExists("update standard contract", OPEX_ENTITY_SET, w.id, patch, { primaryKey: OPEX_PRIMARY_KEY });
    id = w.id;
  } else {
    const created = unwrap(
      await Vsb_opexlandleasestandardassumptionsesService.create(withoutBlanks(payload) as never),
      "create standard contract",
    ) as unknown as Raw;
    id = str(created?.[OPEX_PRIMARY_KEY]);
  }

  if (w.mode === "addPeriod" && rows) {
    const issue = await normaliseLastFlags([...rows, { id, period: w.period, isLast: true }], w.scope);
    if (issue) {
      throw new OpexFollowUpError(`The period was saved, but the last-period flags could not be corrected: ${issue}`, id, new Error(issue));
    }
  }

  let propagated = 0;
  if (w.mode === "edit") {
    // Re-read the contract after the write: the source for propagation (Period 1) and for the
    // last-flag normalisation (B-5 / DR-12) — a stale screen can never leave a middle period flagged.
    let after: ContractRow[];
    try {
      after = await listContractRows(w.scope);
    } catch (error) {
      throw new OpexFollowUpError(
        w.period === 1
          ? "Period 1 was saved, but its contract-level values could not be copied to the later periods."
          : "The period was saved, but the contract could not be re-read to check its last period. Reload the screen.",
        id, error,
      );
    }
    let propagationError: unknown;
    if (w.period === 1) {
      try {
        const later = after.filter((r) => r.id !== id && (r.period ?? 0) > 1);
        const fields = propagationFields(w.fields);
        await updateMultiple(OPEX_ENTITY_SET, OPEX_ODATA_TYPE, later.map((r) => ({ [OPEX_PRIMARY_KEY]: r.id, ...fields })));
        propagated = later.length;
      } catch (error) {
        propagationError = error ?? new Error("propagation failed");
      }
    }
    const flagIssue = await normaliseLastFlags(after, w.scope);
    if (propagationError !== undefined || flagIssue) {
      const parts = [
        propagationError !== undefined
          ? "Period 1 was saved, but its contract-level values could not be copied to the later periods."
          : "The period was saved, but the last-period flags could not be corrected:",
        flagIssue ? (propagationError !== undefined ? `The last-period flags are also inconsistent: ${flagIssue}` : flagIssue) : "",
      ];
      throw new OpexFollowUpError(parts.filter(Boolean).join(" "), id, propagationError ?? new Error(flagIssue));
    }
  }
  return { id, propagated };
}

/** A contract delete that stopped part-way. */
export class ContractDeleteError extends Error {
  readonly deleted: number;
  readonly total: number;
  /** After the repair attempt: what is still wrong with the last-period flags (undefined = consistent). */
  readonly flagIssue: string | undefined;
  override readonly cause?: unknown;
  constructor(deleted: number, total: number, cause: unknown, flagIssue?: string) {
    super(`${deleted} of ${total} row(s) were deleted before the delete failed.`);
    this.name = "ContractDeleteError";
    this.deleted = deleted;
    this.total = total;
    this.cause = cause;
    this.flagIssue = flagIssue;
  }
}

/**
 * W-8 — every row of the contract (any state, fully paged; D-PERF-2), later periods first and
 * Period 1 last, so a partial failure never leaves periods without their head (FR-27, DR-9).
 * After a partial failure the surviving rows are re-flagged so exactly one is last (B-4, DR-12).
 */
export async function deleteOpexContract(scope: ContractScope): Promise<{ deleted: number }> {
  requireSubaccount(scope);
  const rows = await listContractRows(scope);
  // Tail first (highest period, rows without a period before it), ONE AT A TIME, each awaited
  // before the next starts (parity r2 R2-3): a stop part-way always leaves a contiguous
  // Period 1..n behind, never a gap. At most 10 rows, so sequential is cheap.
  const later = rows.filter((r) => r.period !== 1)
    .sort((a, b) => (b.period ?? Number.MAX_SAFE_INTEGER) - (a.period ?? Number.MAX_SAFE_INTEGER));
  const heads = rows.filter((r) => r.period === 1);
  let deleted = 0;
  try {
    for (const r of later) {
      await deleteRecord("delete contract period", OPEX_ENTITY_SET, r.id);
      deleted += 1;
    }
    for (const r of heads) {
      await deleteRecord("delete contract", OPEX_ENTITY_SET, r.id);
      deleted += 1;
    }
  } catch (error) {
    const flagIssue = deleted > 0 ? await repairLastFlags(scope) : undefined;
    throw new ContractDeleteError(deleted, rows.length, error, flagIssue);
  }
  return { deleted };
}

/**
 * W-9 — re-check on the SERVER that the row is still the contract's last period (B-6: a stale
 * screen must never delete a middle period and leave a gap), delete it, then mark the remaining
 * row with the highest NUMERIC period as last (D-DEL-1, D-DEL-2), so "Add Period" stays
 * available. A failed re-flag is repaired once from the server before it is reported.
 */
export async function deleteOpexPeriod(id: string, scope: ContractScope): Promise<void> {
  requireSubaccount(scope);
  const before = await listContractRows(scope);
  const target = before.find((r) => r.id === id);
  if (!target) throw new OpexRuleError("This period no longer exists. Reload the screen.");
  if (target.period === 1) throw new OpexRuleError("Period 1 can only be deleted together with the whole contract.");
  if (target.period === undefined || target.period !== highestPeriod(before)) {
    throw new OpexRuleError("This contract was changed since it was loaded: the period is no longer the last period. Reload the screen and try again.");
  }
  await deleteRecord("delete period", OPEX_ENTITY_SET, id);
  let remaining: ContractRow[];
  try {
    remaining = (await listContractRows(scope)).filter((r) => r.id !== id);
  } catch {
    remaining = before.filter((r) => r.id !== id);
  }
  const issue = await normaliseLastFlags(remaining, scope);
  if (issue) {
    throw new OpexFollowUpError(`The period was deleted, but the new last period could not be marked as last: ${issue}`, id, new Error(issue));
  }
}
