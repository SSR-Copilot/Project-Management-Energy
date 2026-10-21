/**
 * Admin Cost — the Dataverse reads behind `features/admin/admin-cost` (connected 19 Oct 2026,
 * D24). Every table was already registered in `power.config.json`. The CAPEX chart is
 * `listAllCapexAccounts` (`data/adminCapexAccounts.ts`), shared with Admin CAPEX Accounts.
 *
 * Server automation on the writes (04-flow-inventory.md, verified 19 Oct 2026): deleting a
 * DEVEX/CAPEX standard cost fires `VSB_CapexAssumptionDeletion`, which removes the project CAPEX
 * contracts and costs built from it. Nothing fires on the OPEX & Land Lease table. No flow.
 */
import { TransactioncurrenciesService } from "@/generated/services/TransactioncurrenciesService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_countryinflationprofilesService } from "@/generated/services/Vsb_countryinflationprofilesService";
import { Vsb_devexcapexstandardassumptionsesService } from "@/generated/services/Vsb_devexcapexstandardassumptionsesService";
import { Vsb_landleasesubaccountsService } from "@/generated/services/Vsb_landleasesubaccountsService";
import { Vsb_opexaccountsService } from "@/generated/services/Vsb_opexaccountsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_spvdevcomappingcapexdevexesService } from "@/generated/services/Vsb_spvdevcomappingcapexdevexesService";
import {
  DEVEX_COL, OPEX_COL,
  type CountryRef, type CurrencyRef, type DevexCost, type OpexPeriodRow, type OpexSubaccount,
  type SpvDevCoMapping,
} from "@/features/admin/admin-cost/rules";
import { fetchAll } from "./client";
import { and, eq, inList, lookupEq, numberOf } from "./odata";

const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** `Countries` — the picker's source. Ordered by `buildCountryPicker`. */
export async function listCostCountries(): Promise<CountryRef[]> {
  const rows = await fetchAll(
    "list countries for standard costs",
    (o) => Vsb_countriesService.getAll(o),
    { select: ["vsb_countryid", "vsb_name"] },
  );
  return rows.map((r) => ({ id: r.vsb_countryid, name: r.vsb_name ?? "" }));
}

/**
 * `'Opex Subaccounts'` with `Account.Order` (the O&M heuristic), joined from `'Opex Accounts'`.
 * Sorted by Order, as `colOtherOpexSubaccounts`.
 */
export async function listOpexSubaccounts(): Promise<OpexSubaccount[]> {
  const [subs, accounts] = await Promise.all([
    fetchAll(
      "list OPEX subaccounts",
      (o) => Vsb_opexsubaccountsService.getAll(o),
      { select: ["vsb_opexsubaccountid", "vsb_name", "vsb_order", "_vsb_account_value"], orderBy: ["vsb_order asc"] },
    ),
    fetchAll(
      "list OPEX accounts",
      (o) => Vsb_opexaccountsService.getAll(o),
      { select: ["vsb_opexaccountid", "vsb_order"] },
    ),
  ]);
  const accountOrder = new Map(accounts.map((a) => [a.vsb_opexaccountid, a.vsb_order ?? null]));
  return subs.map((s) => ({
    id: s.vsb_opexsubaccountid,
    name: s.vsb_name ?? "",
    order: s.vsb_order ?? 0,
    accountOrder: s._vsb_account_value ? accountOrder.get(s._vsb_account_value) ?? null : null,
  }));
}

/** `colLandLeaseSubaccounts` — `Sort('Land Lease Subaccounts', Order)`. */
export async function listLandLeaseSubaccounts(): Promise<OpexSubaccount[]> {
  const rows = await fetchAll(
    "list Land Lease subaccounts",
    (o) => Vsb_landleasesubaccountsService.getAll(o),
    { select: ["vsb_landleasesubaccountid", "vsb_name", "vsb_order"], orderBy: ["vsb_order asc"] },
  );
  return rows.map((r) => ({ id: r.vsb_landleasesubaccountid, name: r.vsb_name ?? "", order: r.vsb_order ?? 0, accountOrder: null }));
}

const OPEX_SELECT = [
  OPEX_COL.id, OPEX_COL.description, OPEX_COL.startDateString, OPEX_COL.country, OPEX_COL.technology,
  OPEX_COL.typeOfContract, OPEX_COL.period, OPEX_COL.opexSubaccount, OPEX_COL.landLeaseSubaccount,
  OPEX_COL.currency, OPEX_COL.isLastPeriod, OPEX_COL.isCollapsed, OPEX_COL.fixCosts,
  OPEX_COL.percentOfRevenues, OPEX_COL.eurPerMwh, OPEX_COL.eurPerMw, OPEX_COL.eurPerWtg,
  OPEX_COL.aggregation, OPEX_COL.distributionFrequency, OPEX_COL.durationYears, OPEX_COL.durationMonths,
  OPEX_COL.secured, OPEX_COL.allWtgAllocated, OPEX_COL.externalContract, OPEX_COL.useInflationProfile,
  OPEX_COL.useCountryInflationProfile, OPEX_COL.inflationProfile, OPEX_COL.inflationArea,
  OPEX_COL.inflationCountryArea, OPEX_COL.amountOneTimePayment, OPEX_COL.dueDateOneTimePayment,
  OPEX_COL.amountOneTimePayment2, OPEX_COL.dueDateOneTimePayment2, OPEX_COL.amountOneTimePayment3,
  OPEX_COL.dueDateOneTimePayment3, OPEX_COL.threshold, OPEX_COL.thresholdType, OPEX_COL.thresholdIndividual,
  OPEX_COL.alignWithProjectDuration,
];

/**
 * The scope's `OPEX & Land Lease Standard Assumptions`, all three types (the canvas pulls the whole
 * table; here only the country × technology).
 */
export async function listOpexAssumptions(countryId: string, technology: number): Promise<OpexPeriodRow[]> {
  const rows = await fetchAll(
    "list OPEX & Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o),
    {
      select: OPEX_SELECT,
      filter: and(lookupEq("vsb_country", countryId), eq(OPEX_COL.technology, technology)),
      orderBy: [`${OPEX_COL.description} asc`],
    },
  );
  return rows.map((r) => {
    const x = r as unknown as Record<string, unknown>;
    return {
      id: r.vsb_opexlandleasestandardassumptionsid,
      description: r.vsb_description ?? null,
      startDateString: r.vsb_startdatestring ?? null,
      countryId: r._vsb_country_value ?? null,
      technology: num(r.vsb_technology),
      typeOfContract: num(r.vsb_typeofcontract),
      period: num(r.vsb_period),
      opexSubaccountId: r._vsb_opexsubaccount_value ?? null,
      landLeaseSubaccountId: r._vsb_landleasesubaccount_value ?? null,
      currencyId: r._vsb_currency_value ?? null,
      currencyName: str(x[`${OPEX_COL.currency}@OData.Community.Display.V1.FormattedValue`]),
      isLastPeriod: r.vsb_islastperiod === true,
      isCollapsed: r.vsb_iscollapsed === true,
      fixCosts: r.vsb_fixcosts ?? null,
      percentOfRevenues: r.vsb_ofrevenues ?? null,
      eurPerMwh: r.vsb_eurmwh ?? null,
      eurPerMw: r.vsb_eurmw ?? null,
      eurPerWtg: r.vsb_eurwtg ?? null,
      aggregation: num(r.vsb_aggregation),
      distributionFrequency: r.vsb_distributionfrequency ?? null,
      durationYears: r.vsb_durationinyears ?? null,
      durationMonths: r.vsb_durationinmonths ?? null,
      secured: bool(r.vsb_secured),
      allWtgAllocated: bool(r.vsb_allwtgallocated),
      externalContract: bool(r.vsb_externalcontract),
      useInflationProfile: bool(r.vsb_useinflationprofile),
      useCountryInflationProfile: bool(r.vsb_usecountryinflationprofile),
      inflationProfile: r.vsb_inflationprofile ?? null,
      inflationArea: str(r.vsb_inflationarea),
      inflationCountryArea: str(r.vsb_inflationcountryarea),
      amount1: r.vsb_amountonetimepayment ?? null,
      dueDate1: str(r.vsb_duedateonetimepayment),
      amount2: r.vsb_amountonetimepayment2 ?? null,
      dueDate2: str(r.vsb_duedateonetimepayment2),
      amount3: r.vsb_amountonetimepayment3 ?? null,
      dueDate3: str(r.vsb_duedateonetimepayment3),
      threshold: bool(r.vsb_threshold),
      thresholdType: num(r.vsb_thresholdtype),
      thresholdIndividual: r.vsb_thresholdindividual ?? null,
      alignWithProjectDuration: bool(r.vsb_alignwithprojectduration),
    };
  });
}

/** The scope's `Devex/Capex Standard Assumptions` (`Country = …, Lower(Text(Technology)) = …`). */
export async function listDevexCosts(countryId: string, technology: number): Promise<DevexCost[]> {
  const C = DEVEX_COL;
  const rows = await fetchAll(
    "list DEVEX/CAPEX standard assumptions",
    (o) => Vsb_devexcapexstandardassumptionsesService.getAll(o),
    {
      select: [
        C.id, C.description, C.descriptionInput, C.costAmount, C.unit, C.costPaidBy, C.comment,
        C.technology, C.country, C.category, C.subaccount, C.cluster1, C.cluster2, C.cluster3,
        C.cluster4, C.cluster5,
      ],
      filter: and(lookupEq("vsb_country", countryId), eq(C.technology, technology)),
    },
  );
  return rows.map((r) => ({
    id: r.vsb_devexcapexstandardassumptionsid,
    description: r.vsb_description ?? null,
    descriptionInput: r.vsb_descriptioninput ?? null,
    costAmount: r.vsb_costamount ?? null,
    unit: num(r.vsb_unit),
    costPaidBy: num(r.vsb_costpaidby),
    comment: r.vsb_comment ?? null,
    technology: num(r.vsb_technology),
    countryId: r._vsb_country_value ?? null,
    categoryId: r._vsb_category_value ?? null,
    subaccountId: r._vsb_subaccount_value ?? null,
    clusters: [
      r.vsb_cluster1 === true, r.vsb_cluster2 === true, r.vsb_cluster3 === true,
      r.vsb_cluster4 === true, r.vsb_cluster5 === true,
    ],
  }));
}

/** `colSpvDevCoSubaccountsMapping` — `'SPVDevCo Mapping Capex Devexes'`. */
export async function listSpvDevCoMapping(): Promise<SpvDevCoMapping[]> {
  const rows = await fetchAll(
    "list the SPV / DevCo mapping",
    (o) => Vsb_spvdevcomappingcapexdevexesService.getAll(o),
    { select: ["vsb_spvdevcomappingcapexdevexid", "vsb_accountnumber", "_vsb_namesubaccount_value", "vsb_devcospv"] },
  );
  return rows.map((r) => ({
    id: r.vsb_spvdevcomappingcapexdevexid,
    accountNumber: r.vsb_accountnumber ?? null,
    subaccountId: r._vsb_namesubaccount_value ?? null,
    devCoSpv: num(r.vsb_devcospv),
  }));
}

/** `Distinct(Filter('Country Inflation Profiles', Country = …).Area, Area)`. */
export async function listInflationAreas(countryId: string): Promise<string[]> {
  const rows = await fetchAll(
    "list country inflation areas",
    (o) => Vsb_countryinflationprofilesService.getAll(o),
    { select: ["vsb_countryinflationprofileid", "vsb_area"], filter: lookupEq("vsb_country", countryId) },
  );
  return [...new Set(rows.map((r) => r.vsb_area ?? "").filter(Boolean))];
}

/** `Currencies` (`transactioncurrencies`) — only the two the panel can preset, EUR and PLN. */
export async function listCostCurrencies(): Promise<CurrencyRef[]> {
  const rows = await fetchAll(
    "list currencies",
    (o) => TransactioncurrenciesService.getAll(o),
    { select: ["transactioncurrencyid", "isocurrencycode", "currencyname"], filter: inList("isocurrencycode", ["EUR", "PLN"]) },
  );
  return rows.map((r) => ({ id: r.transactioncurrencyid, code: r.isocurrencycode, name: r.currencyname }));
}
