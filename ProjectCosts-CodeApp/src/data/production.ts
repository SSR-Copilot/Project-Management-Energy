/**
 * Project Production — the Dataverse reads behind `features/pm/production` (connected 19 Oct 2026, D28).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Three tables
 * were registered for this screen with `pac code add-data-source`, one at a time (62 → 65):
 * `vsb_energyyield`, `vsb_pvseasonalityvalues` and `vsb_pvnegativeprices`.
 *
 * Reused, not repeated: the project's generator types, PV types, turbines / PV units and device
 * types come from `data/generators.ts`; the country inflation rows from `data/landLease.ts`.
 * `Assumptions Revenues SQL` is a Fabric SQL source (`References/DataSources.json`), not Dataverse,
 * and stays unconnected (D2): nothing here reads it.
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_energyyieldsService } from "@/generated/services/Vsb_energyyieldsService";
import { Vsb_pvseasonalityvaluesesService } from "@/generated/services/Vsb_pvseasonalityvaluesesService";
import { Vsb_pvnegativepricesesService } from "@/generated/services/Vsb_pvnegativepricesesService";
import { Vsb_projectrevenuesService } from "@/generated/services/Vsb_projectrevenuesService";
import { Vsb_opexsubaccountsService } from "@/generated/services/Vsb_opexsubaccountsService";
import { Vsb_opexlandleasestandardassumptionsesService } from "@/generated/services/Vsb_opexlandleasestandardassumptionsesService";
import { Vsb_landleaseprojectcostsService } from "@/generated/services/Vsb_landleaseprojectcostsService";
import { Vsb_opexprojectcostsService } from "@/generated/services/Vsb_opexprojectcostsService";
import {
  NEGATIVE_PRICE_COL, PROJECT_YIELD_COL, REVENUE_COL, SEASONALITY_COL, YIELD_COL, inflationStartYear,
  type EnergyYieldRow, type GenerationInputs, type ProductionProject, type RevenueRow, type StandardAssumption,
  type StoredNegativePrice, type StoredSeasonality,
} from "@/features/pm/production/rules";
import { CHOICE_PRODUCTION, OANDM_SUBACCOUNT_NAME } from "./dataverseNames";
import { fetchAll, fetchPage } from "./client";
import { listDeviceTypes, listGeneratorTypes, listProjectTurbines, listPvTypes } from "./generators";
import { loadCountryInflation } from "./landLease";
import { and, eq, guid, inList, lookupEq, numberOf } from "./odata";

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const raw = <T,>(rows: T[]): Raw[] => rows as unknown as Raw[];
/** A Dataverse date-only value as `yyyy-mm-dd`. */
const ymd = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

/* ═══════════════════════════════════════════════════════════════ the project ══ */

const PROJECT_SELECT = [
  PROJECT_YIELD_COL.id, PROJECT_YIELD_COL.projectIdText, PROJECT_YIELD_COL.projectName, PROJECT_YIELD_COL.country,
  PROJECT_YIELD_COL.technology, PROJECT_YIELD_COL.totalCapacity, PROJECT_YIELD_COL.endDate, PROJECT_YIELD_COL.cod,
  PROJECT_YIELD_COL.plantPvCapacity, PROJECT_YIELD_COL.grossYield, PROJECT_YIELD_COL.windSpeed,
  PROJECT_YIELD_COL.irradiation, PROJECT_YIELD_COL.netYieldP50, PROJECT_YIELD_COL.netYieldP75,
  PROJECT_YIELD_COL.netYieldP90, PROJECT_YIELD_COL.standardCostCreated, PROJECT_YIELD_COL.owningBusinessUnit,
];

/** `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (`OnVisible`, Y:42). */
export async function loadProductionProject(projectId: string): Promise<ProductionProject | null> {
  const r = raw(await fetchPage(
    "load the project's production data",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_YIELD_COL.id} eq ${guid(projectId)}`, top: 1 },
  ))[0];
  if (!r) return null;
  return {
    id: String(r[PROJECT_YIELD_COL.id]),
    projectIdText: str(r[PROJECT_YIELD_COL.projectIdText]),
    projectName: str(r[PROJECT_YIELD_COL.projectName]),
    countryId: str(r[PROJECT_YIELD_COL.country]),
    technology: num(r[PROJECT_YIELD_COL.technology]),
    totalCapacity: num(r[PROJECT_YIELD_COL.totalCapacity]),
    endDate: ymd(r[PROJECT_YIELD_COL.endDate]),
    cod: ymd(r[PROJECT_YIELD_COL.cod]),
    plantPvCapacity: num(r[PROJECT_YIELD_COL.plantPvCapacity]),
    grossYield: num(r[PROJECT_YIELD_COL.grossYield]),
    windSpeed: num(r[PROJECT_YIELD_COL.windSpeed]),
    irradiation: num(r[PROJECT_YIELD_COL.irradiation]),
    netYieldP50: num(r[PROJECT_YIELD_COL.netYieldP50]),
    netYieldP75: num(r[PROJECT_YIELD_COL.netYieldP75]),
    netYieldP90: num(r[PROJECT_YIELD_COL.netYieldP90]),
    standardCostCreated: bool(r[PROJECT_YIELD_COL.standardCostCreated]) === true,
    owningBusinessUnitId: str(r[PROJECT_YIELD_COL.owningBusinessUnit]),
  };
}

/* ═════════════════════════════════════════════════════════════ energy yields ══ */

const YIELD_SELECT = [
  YIELD_COL.id, YIELD_COL.name, YIELD_COL.description, YIELD_COL.type, YIELD_COL.assessment, YIELD_COL.allocation,
  YIELD_COL.windSpeed, YIELD_COL.irradiation, YIELD_COL.grossYield, YIELD_COL.totalLosses, YIELD_COL.netYieldP50,
  YIELD_COL.uncertainty, YIELD_COL.netYieldP75, YIELD_COL.netYieldP90, YIELD_COL.productionAllocation,
  YIELD_COL.productionLossesP50, YIELD_COL.productionUncertainty, YIELD_COL.considerSeasonality,
  YIELD_COL.considerNegativePrices, "statecode",
];

/** `colEnergyYieldsInProject = Sort(Filter('Energy Yields', Project = …), Name, Ascending)` (Y:42). */
export async function listEnergyYields(projectId: string): Promise<EnergyYieldRow[]> {
  const rows = raw(await fetchAll(
    "load the project's energy yields",
    (o) => Vsb_energyyieldsService.getAll(o),
    { select: YIELD_SELECT, filter: lookupEq("vsb_project", projectId), orderBy: [`${YIELD_COL.name} asc`] },
  ));
  return rows.map((r) => ({
    id: String(r[YIELD_COL.id]),
    name: str(r[YIELD_COL.name]),
    description: str(r[YIELD_COL.description]),
    type: num(r[YIELD_COL.type]),
    assessment: num(r[YIELD_COL.assessment]),
    allocation: num(r[YIELD_COL.allocation]),
    windSpeed: num(r[YIELD_COL.windSpeed]),
    irradiation: num(r[YIELD_COL.irradiation]),
    grossYield: num(r[YIELD_COL.grossYield]),
    totalLosses: num(r[YIELD_COL.totalLosses]),
    netYieldP50: num(r[YIELD_COL.netYieldP50]),
    uncertainty: num(r[YIELD_COL.uncertainty]),
    netYieldP75: num(r[YIELD_COL.netYieldP75]),
    netYieldP90: num(r[YIELD_COL.netYieldP90]),
    productionAllocation: bool(r[YIELD_COL.productionAllocation]),
    productionLossesP50: bool(r[YIELD_COL.productionLossesP50]),
    productionUncertainty: bool(r[YIELD_COL.productionUncertainty]),
    considerSeasonality: bool(r[YIELD_COL.considerSeasonality]),
    considerNegativePrices: bool(r[YIELD_COL.considerNegativePrices]),
    status: num(r.statecode) ?? 0,
  }));
}

/** `LookUp('PV Seasonality Values', 'PV Energy Yield' = selected)` (Edit, Y:653). */
export async function loadStoredSeasonality(energyYieldId: string): Promise<StoredSeasonality> {
  const r = raw(await fetchPage(
    "load the yield's seasonality",
    (o) => Vsb_pvseasonalityvaluesesService.getAll(o),
    {
      select: [SEASONALITY_COL.id, SEASONALITY_COL.standardValuesJson, ...SEASONALITY_COL.months],
      filter: lookupEq("vsb_pvenergyyield", energyYieldId), top: 1,
    },
  ))[0];
  return {
    recordId: r ? String(r[SEASONALITY_COL.id]) : null,
    months: SEASONALITY_COL.months.map((c) => (r ? num(r[c]) : null)),
    standardValuesJson: r ? str(r[SEASONALITY_COL.standardValuesJson]) : null,
  };
}

/** `Filter('PV Negative Prices', 'PV Energy Yield' = selected)` (Edit, Y:796). */
export async function listStoredNegativePrices(energyYieldId: string): Promise<StoredNegativePrice[]> {
  const rows = raw(await fetchAll(
    "load the yield's negative prices",
    (o) => Vsb_pvnegativepricesesService.getAll(o),
    {
      select: [NEGATIVE_PRICE_COL.id, NEGATIVE_PRICE_COL.year, NEGATIVE_PRICE_COL.reduction, NEGATIVE_PRICE_COL.isStandard],
      filter: lookupEq("vsb_pvenergyyield", energyYieldId),
      orderBy: [`${NEGATIVE_PRICE_COL.year} asc`],
    },
  ));
  return rows.map((r) => ({
    id: String(r[NEGATIVE_PRICE_COL.id]),
    year: num(r[NEGATIVE_PRICE_COL.year]) ?? 0,
    reduction: num(r[NEGATIVE_PRICE_COL.reduction]),
    isStandard: bool(r[NEGATIVE_PRICE_COL.isStandard]) === true,
  }));
}

/** `Filter('Project Revenues', Project = …)` — the two negative-price columns the sync reads (Y:5284). */
export async function listProjectRevenues(projectId: string): Promise<RevenueRow[]> {
  const rows = raw(await fetchAll(
    "load the project's revenue contracts",
    (o) => Vsb_projectrevenuesService.getAll(o),
    {
      select: [REVENUE_COL.id, REVENUE_COL.description, REVENUE_COL.considerNegativePrices, REVENUE_COL.manualOverride],
      filter: lookupEq("vsb_project", projectId),
    },
  ));
  return rows.map((r) => ({
    id: String(r[REVENUE_COL.id]),
    description: str(r[REVENUE_COL.description]),
    considerNegativePrices: bool(r[REVENUE_COL.considerNegativePrices]) === true,
    manualOverride: bool(r[REVENUE_COL.manualOverride]) === true,
  }));
}

/* ══════════════════════════════════════════════ what "Recalc" generates from ══ */

const ASSUMPTION_SELECT = [
  "vsb_opexlandleasestandardassumptionsid", "vsb_name", "vsb_description", "vsb_period", "vsb_typeofcontract",
  "_vsb_landleasesubaccount_value", "_vsb_opexsubaccount_value", "_vsb_currency_value",
  "vsb_secured", "vsb_allwtgallocated", "vsb_fixcosts", "vsb_ofrevenues", "vsb_eurmw", "vsb_eurmwh", "vsb_eurwtg",
  "vsb_aggregation", "vsb_durationinyears", "vsb_durationinmonths", "vsb_distributionfrequency",
  "vsb_amountonetimepayment", "vsb_amountonetimepayment2", "vsb_amountonetimepayment3",
  "vsb_duedateonetimepayment", "vsb_duedateonetimepayment2", "vsb_duedateonetimepayment3",
  "vsb_useinflationprofile", "vsb_usecountryinflationprofile", "vsb_inflationprofile", "vsb_inflationcountryarea",
  "vsb_alignwithprojectduration", "vsb_externalcontract", "vsb_threshold", "vsb_thresholdtype", "vsb_thresholdindividual",
];

/**
 * `Sort(Filter('OPEX & Land Lease Standard Assumptions', Country = project's, Technology = project's,
 * 'Type Of Contract' = <family>), Description, Ascending)` for the three families at once (Y:8281,
 * 8541, 8807). No status filter — the canvas has none (a per-screen variant of `loadLeaseAssumptions`,
 * which adds `statecode eq 0` and reads the land-lease family only).
 */
export async function listGenerationAssumptions(countryId: string, technology: number): Promise<StandardAssumption[]> {
  const t = CHOICE_PRODUCTION.typeOfContract;
  const rows = raw(await fetchAll(
    "load the OPEX & Land Lease standard assumptions",
    (o) => Vsb_opexlandleasestandardassumptionsesService.getAll(o),
    {
      select: ASSUMPTION_SELECT,
      filter: and(
        lookupEq("vsb_country", countryId),
        eq("vsb_technology", technology),
        inList("vsb_typeofcontract", [t.landlease, t.opexOandM, t.opexOther]),
      ),
      orderBy: ["vsb_description asc"],
    },
  ));
  return rows.map((r) => ({
    id: String(r.vsb_opexlandleasestandardassumptionsid),
    name: str(r.vsb_name),
    description: str(r.vsb_description),
    period: num(r.vsb_period),
    typeOfContract: num(r.vsb_typeofcontract),
    landLeaseSubaccountId: str(r._vsb_landleasesubaccount_value),
    landLeaseSubaccountName: str(r.vsb_landleasesubaccountname) ?? str(r["_vsb_landleasesubaccount_value@OData.Community.Display.V1.FormattedValue"]),
    opexSubaccountId: str(r._vsb_opexsubaccount_value),
    opexSubaccountName: str(r.vsb_opexsubaccountname) ?? str(r["_vsb_opexsubaccount_value@OData.Community.Display.V1.FormattedValue"]),
    currencyId: str(r._vsb_currency_value),
    secured: bool(r.vsb_secured) === true,
    allWtgAllocated: bool(r.vsb_allwtgallocated) === true,
    fixCosts: num(r.vsb_fixcosts),
    ofRevenues: num(r.vsb_ofrevenues),
    eurMw: num(r.vsb_eurmw),
    eurMwh: num(r.vsb_eurmwh),
    eurWtg: num(r.vsb_eurwtg),
    aggregation: num(r.vsb_aggregation),
    durationInYears: num(r.vsb_durationinyears),
    durationInMonths: num(r.vsb_durationinmonths),
    distributionFrequency: num(r.vsb_distributionfrequency),
    amountOneTimePayment: num(r.vsb_amountonetimepayment),
    amountOneTimePayment2: num(r.vsb_amountonetimepayment2),
    amountOneTimePayment3: num(r.vsb_amountonetimepayment3),
    dueDateOneTimePayment: str(r.vsb_duedateonetimepayment),
    dueDateOneTimePayment2: str(r.vsb_duedateonetimepayment2),
    dueDateOneTimePayment3: str(r.vsb_duedateonetimepayment3),
    useInflationProfile: bool(r.vsb_useinflationprofile) === true,
    useCountryInflationProfile: bool(r.vsb_usecountryinflationprofile) === true,
    inflationProfile: num(r.vsb_inflationprofile),
    inflationCountryArea: str(r.vsb_inflationcountryarea),
    alignWithProjectDuration: bool(r.vsb_alignwithprojectduration) === true,
    externalContract: bool(r.vsb_externalcontract) === true,
    threshold: bool(r.vsb_threshold) === true,
    thresholdType: num(r.vsb_thresholdtype),
    thresholdIndividual: num(r.vsb_thresholdindividual),
  }));
}

/** `locOAndMSubaccount = LookUp('Opex Subaccounts', Name = "Operation & Maintenance")` (`OnVisible`, Y:42). */
export async function findOandMSubaccount(): Promise<{ id: string; name: string } | null> {
  const r = raw(await fetchPage(
    "find the Operation & Maintenance subaccount",
    (o) => Vsb_opexsubaccountsService.getAll(o),
    { select: ["vsb_opexsubaccountid", "vsb_name"], filter: eq("vsb_name", OANDM_SUBACCOUNT_NAME), top: 1 },
  ))[0];
  return r ? { id: String(r.vsb_opexsubaccountid), name: str(r.vsb_name) ?? OANDM_SUBACCOUNT_NAME } : null;
}

/** The project's existing standard contracts per family (`recFilteredStandardContractsForProject`, Y:8275, 8535, 8801). */
async function countStandardContracts(projectId: string, oAndMId: string | null): Promise<GenerationInputs["existing"]> {
  const [landLease, opex] = await Promise.all([
    fetchAll(
      "check the project's standard land lease contracts",
      (o) => Vsb_landleaseprojectcostsService.getAll(o),
      { select: ["vsb_landleaseprojectcostid"], filter: and(lookupEq("vsb_project", projectId), eq("vsb_isstandardcontract", true)) },
    ),
    fetchAll(
      "check the project's standard OPEX contracts",
      (o) => Vsb_opexprojectcostsService.getAll(o),
      { select: ["vsb_opexprojectcostid", "_vsb_subaccount_value"], filter: and(lookupEq("vsb_project", projectId), eq("vsb_isstandardcontract", true)) },
    ),
  ]);
  const opexRows = raw(opex);
  const oAndM = opexRows.filter((r) => oAndMId !== null && r._vsb_subaccount_value === oAndMId).length;
  return { landLease: landLease.length, otherOpex: opexRows.length - oAndM, oAndM };
}

/**
 * Everything the generator half of "Recalc" reads (Y:8014-8097, 8273-8807): the assumptions, the
 * existing standard contracts, every turbine and PV unit (`colGeneratorsInProject`), the device
 * types (`colDeviceTypesInProject`: WTG types by creation, then PV), the O&M subaccount and the
 * country inflation of COD + 1.
 */
export async function loadGenerationInputs(project: ProductionProject): Promise<GenerationInputs> {
  const [wtgTypes, pvTypes, oAndM] = await Promise.all([
    listGeneratorTypes(project.id), listPvTypes(project.id), findOandMSubaccount(),
  ]);
  const typeIds = [...wtgTypes.map((t) => t.id), ...pvTypes.map((t) => t.id)];
  const year = inflationStartYear(project.cod);
  const [assumptions, existing, turbines, deviceLists, inflation] = await Promise.all([
    project.countryId && project.technology !== null
      ? listGenerationAssumptions(project.countryId, project.technology) : Promise.resolve([]),
    countStandardContracts(project.id, oAndM?.id ?? null),
    typeIds.length > 0 ? listProjectTurbines(typeIds) : Promise.resolve([]),
    Promise.all(typeIds.map((id) => listDeviceTypes(id))),
    project.countryId ? loadCountryInflation(project.countryId) : Promise.resolve([]),
  ]);
  return {
    project,
    assumptions,
    existing,
    generators: turbines.map((t) => ({ id: t.id, name: t.name })),
    deviceTypes: deviceLists.flat().map((d) => ({ id: d.id })),
    oAndM,
    countryInflation: inflation.find((r) => r.year === year)?.inflation ?? null,
  };
}
