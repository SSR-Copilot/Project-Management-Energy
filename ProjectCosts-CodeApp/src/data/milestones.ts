/**
 * Project General Milestones — the Dataverse reads behind `features/pm/milestones` (connected
 * 19 Oct 2026, D26).
 *
 * Every read is server-filtered (CONVENTIONS rule 2) and names its `$select` (rule 1). Four tables
 * were registered for this screen with `pac code add-data-source`: `vsb_projectrevenue` (the COD
 * guard), `vsb_estimationpriceinflation` (FID re-pricing), `vsb_fabricsyncjob` and
 * `vsb_fabricjobtype` (the "Currently recalculating" notice).
 *
 * Reused, not repeated: the project states come from `data/generalData.ts` (`listProjectStates`)
 * and the assumption row from `data/costBook.ts` (`loadMilestoneAssumptionValues`).
 *
 * `Assumptions Revenues SQL` is a Fabric SQL source (`[dbo].[AssumptionsRevenue]` on
 * `Lakehouse_Gold`), registered as `AssumptionsRevenueService` (D54). It is read only, for the
 * default revenue seed (`listRevenueAssumptions`, connected 28 Oct 2026).
 */
import { Vsb_projectsService } from "@/generated/services/Vsb_projectsService";
import { Vsb_countriesService } from "@/generated/services/Vsb_countriesService";
import { Vsb_projectrevenuesService } from "@/generated/services/Vsb_projectrevenuesService";
import { Vsb_estimationpriceinflationsService } from "@/generated/services/Vsb_estimationpriceinflationsService";
import { Vsb_generatortypeinprojectsService } from "@/generated/services/Vsb_generatortypeinprojectsService";
import { Vsb_generatorsService } from "@/generated/services/Vsb_generatorsService";
import { Vsb_fabricjobtypesService } from "@/generated/services/Vsb_fabricjobtypesService";
import { Vsb_fabricsyncjobsService } from "@/generated/services/Vsb_fabricsyncjobsService";
import { AssumptionsRevenueService } from "@/generated/services/AssumptionsRevenueService";
import { technologyLabel, technologyValue } from "@/domain/technology";
import { PROJECT_COL } from "@/features/pm/general-data/rules";
import {
  FABRIC_JOB_STATUS, FABRIC_JOB_TYPE_MILESTONES, GENERATOR_TYPE_COL, HEDGE_TYPE_INDIVIDUAL_VOLUMES,
  isInRevenueSlice,
  type MilestoneDates, type MilestoneProject, type PriceInflationRow, type ProjectGenerator,
  type RevenueAssumptionRow, type StandardAssumptionFlags,
} from "@/features/pm/milestones/rules";
import { fetchAll, fetchPage } from "./client";
import { and, chunk, eq, guid, idIn, lookupEq, numberOf, or, startsWith } from "./odata";

/** `<col>@OData.Community.Display.V1.FormattedValue` — a lookup's name or a choice's label. */
const formatted = (col: string): string => `${col}@OData.Community.Display.V1.FormattedValue`;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown): number | null => numberOf(v) ?? null;
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/* ═══════════════════════════════════════════════════════════════ the project ══ */

/** Each milestone key and its `Projects` date column. */
const DATE_COL: Record<keyof MilestoneDates, string> = {
  StartDate: PROJECT_COL.projectStartDate,
  FeasibilityStudies: PROJECT_COL.feasibilityStudies,
  ProjectDevelopmentStarted: PROJECT_COL.projectDevelopmentStarted,
  ApplicationSubmitted: PROJECT_COL.applicationSubmitted,
  LegallyBindingPermits: PROJECT_COL.legallyBindingPermits,
  FinalInvestmentDecision: PROJECT_COL.fid,
  Construction: PROJECT_COL.construction,
  OperationsStartDate: PROJECT_COL.cod,
  EndDate: PROJECT_COL.endDate,
  SalesStartDate: PROJECT_COL.salesStartDate,
  StartCompleted: PROJECT_COL.salesCompleted,
};

/** The nine `Is … Standard Assumption?` flags `OnVisible` reads (Y:226-274). */
const FLAG_COL: Partial<Record<keyof MilestoneDates, string>> = {
  ProjectDevelopmentStarted: PROJECT_COL.isProjectDevelopmentStd,
  ApplicationSubmitted: PROJECT_COL.isApplicationSubmittedStd,
  LegallyBindingPermits: PROJECT_COL.isLegallyBindingPermitsStd,
  FinalInvestmentDecision: PROJECT_COL.isFidStd,
  Construction: PROJECT_COL.isConstructionStd,
  OperationsStartDate: PROJECT_COL.isCodStd,
  EndDate: PROJECT_COL.isEndDateStd,
  SalesStartDate: PROJECT_COL.isSalesStartStd,
  StartCompleted: PROJECT_COL.isSalesCompletedStd,
};

const PROJECT_SELECT = [
  PROJECT_COL.id, PROJECT_COL.projectNumber, PROJECT_COL.name, PROJECT_COL.technology,
  PROJECT_COL.startCluster, PROJECT_COL.acquisitionDate, PROJECT_COL.shareOfFarmdown,
  PROJECT_COL.isStandardShareOfFarmdown,
  "_vsb_clusterstate_value", "_vsb_country_value", "_vsb_countryarea_value",
  ...Object.values(DATE_COL), ...Object.values(FLAG_COL),
  "_createdby_value", "createdon", "_modifiedby_value", "modifiedon",
];

/**
 * `OnVisible`: `Set(gblRecordSelectedProject, LookUp(Projects, Project = …))` (Y:51-57), plus
 * `gblRecordSelectedProjectCountry.'Business Unit'` — the owner the save re-stamps (Y:417) —
 * from `LookUp(Countries, Country = project.Country)` (App Loading Screen Y:109-113).
 */
export async function loadMilestoneProject(projectId: string): Promise<MilestoneProject | null> {
  const rows = await fetchPage(
    "load the project's milestones",
    (o) => Vsb_projectsService.getAll(o),
    { select: PROJECT_SELECT, filter: `${PROJECT_COL.id} eq ${guid(projectId)}`, top: 1 },
  );
  const r = rows[0] as unknown as Raw | undefined;
  if (!r) return null;

  const countryId = str(r._vsb_country_value);
  let countryBusinessUnitId: string | null = null;
  if (countryId) {
    const countries = await fetchPage(
      "load the project's country",
      (o) => Vsb_countriesService.getAll(o),
      { select: ["vsb_countryid", "_vsb_businessunit_value"], filter: `vsb_countryid eq ${guid(countryId)}`, top: 1 },
    );
    countryBusinessUnitId = str((countries[0] as unknown as Raw | undefined)?._vsb_businessunit_value);
  }

  const dates = Object.fromEntries(
    Object.entries(DATE_COL).map(([k, col]) => [k, str(r[col])]),
  ) as MilestoneDates;
  // `If(flag = Yes, true, false)` — a blank flag reads false.
  const standardAssumption = Object.fromEntries(
    Object.entries(FLAG_COL).map(([k, col]) => [k, bool(r[col as string]) === true]),
  ) as StandardAssumptionFlags;
  const tech = technologyValue(r[PROJECT_COL.technology]);

  return {
    id: String(r[PROJECT_COL.id]),
    name: str(r[PROJECT_COL.name]),
    projectNumber: str(r[PROJECT_COL.projectNumber]),
    clusterStateName: str(r[formatted("_vsb_clusterstate_value")]),
    countryId,
    countryName: str(r[formatted("_vsb_country_value")]),
    countryBusinessUnitId,
    areaName: str(r[formatted("_vsb_countryarea_value")]),
    technology: technologyLabel(tech, r[formatted(PROJECT_COL.technology)]) || null,
    technologyValue: tech,
    startCluster: num(r[PROJECT_COL.startCluster]),
    acquisitionDate: str(r[PROJECT_COL.acquisitionDate]),
    shareOfFarmdown: num(r[PROJECT_COL.shareOfFarmdown]),
    isStandardShareOfFarmdown: bool(r[PROJECT_COL.isStandardShareOfFarmdown]),
    dates,
    standardAssumption,
    createdByName: str(r[formatted("_createdby_value")]),
    createdOn: str(r.createdon),
    modifiedByName: str(r[formatted("_modifiedby_value")]),
    modifiedOn: str(r.modifiedon),
  };
}

/* ═══════════════════════════════════════════════════════════ project revenues ══ */

/**
 * The COD guard (`pcf_btn_…_Save.OnChange`, Y:4783-4790): `Filter('Project Revenues', 'Hedge
 * Type' = 'Individual Volumes', Project = …, 'Is Contract Start Date Standard Assumption?' =
 * Yes)`. Only "any?" matters, so one row is asked for: the result is 0 or 1.
 */
export async function countIndividualVolumeContracts(projectId: string): Promise<number> {
  const rows = await fetchPage(
    "check the project's individual-volume revenue contracts",
    (o) => Vsb_projectrevenuesService.getAll(o),
    {
      select: ["vsb_projectrevenueid"],
      filter: and(
        lookupEq("vsb_project", projectId),
        eq("vsb_hedgetype", HEDGE_TYPE_INDIVIDUAL_VOLUMES),
        eq("vsb_iscontractstartdatestandardassumption", true),
      ),
      top: 1,
    },
  );
  return rows.length;
}

/**
 * The seed gate's `CountRows(Filter('Project Revenues', Project = …)) = 0` (Y:515-520) — 0 or 1.
 * Read only for the not-connected notice; the seed itself needs Fabric SQL (D26).
 */
export async function countProjectRevenues(projectId: string): Promise<number> {
  const rows = await fetchPage(
    "check the project's revenue contracts",
    (o) => Vsb_projectrevenuesService.getAll(o),
    { select: ["vsb_projectrevenueid"], filter: lookupEq("vsb_project", projectId), top: 1 },
  );
  return rows.length;
}

/**
 * `recCountryAssumptions` — the country's slice of `Assumptions Revenues SQL` (Fabric SQL, read
 * only). 1.21.753: an Italian project reads every `Italy*` row (`isInRevenueSlice`, which also
 * re-checks the rows in case the connector does not apply the filter).
 */
export async function listRevenueAssumptions(countryName: string): Promise<RevenueAssumptionRow[]> {
  const rows = await fetchAll(
    "read the revenue assumptions (Fabric SQL)",
    (o) => AssumptionsRevenueService.getAll(o),
    {
      select: ["country", "valuetype", "category", "pv", "wind"],
      filter: countryName === "Italy" ? startsWith("country", "Italy") : eq("country", countryName),
    },
  );
  return rows
    .map((r) => ({
      country: r.country ?? "", valuetype: r.valuetype ?? "",
      category: r.category ?? null, pv: r.pv ?? null, wind: r.wind ?? null,
    }))
    .filter((r) => isInRevenueSlice(r.country, countryName));
}

/* ═════════════════════════════════════════════════════════════ FID re-pricing ══ */

/**
 * `LookUp('Estimation Price Inflations', 'FID Year' = Year(FID))` and the same for the previous
 * year (Y:2368-2375), in one read.
 */
export async function loadPriceInflation(
  fidYear: number,
): Promise<{ current: PriceInflationRow | null; previous: PriceInflationRow | null }> {
  const rows = await fetchAll(
    "load the estimation price inflations",
    (o) => Vsb_estimationpriceinflationsService.getAll(o),
    {
      select: [
        "vsb_estimationpriceinflationid", "vsb_fidyear",
        "vsb_annualpriceescalationindex", "vsb_accumulatedpriceescalationindex",
      ],
      filter: or(eq("vsb_fidyear", fidYear), eq("vsb_fidyear", fidYear - 1)),
    },
  );
  const map = (year: number): PriceInflationRow | null => {
    const r = rows.find((x) => x.vsb_fidyear === year);
    return r ? {
      fidYear: year,
      annualIndex: num(r.vsb_annualpriceescalationindex),
      accumulatedIndex: num(r.vsb_accumulatedpriceescalationindex),
    } : null;
  };
  return { current: map(fidYear), previous: map(fidYear - 1) };
}

/**
 * `colProjectGenerators: Filter(GeneratorTypeInProjects, Project = …)` (Y:2344-2353), each with its
 * `Generator` row's price ladder and foundation columns (`Vsb_generatorsModel`).
 */
export async function listProjectGeneratorsForRepricing(projectId: string): Promise<ProjectGenerator[]> {
  const types = await fetchAll(
    "list the project's generator types",
    (o) => Vsb_generatortypeinprojectsService.getAll(o),
    {
      select: [GENERATOR_TYPE_COL.id, "_vsb_generator_value", GENERATOR_TYPE_COL.count, GENERATOR_TYPE_COL.generatorsCost],
      filter: lookupEq("vsb_project", projectId),
    },
  );
  const generatorIds = [...new Set(types.map((t) => t._vsb_generator_value).filter((v): v is string => !!v))];
  const generators = new Map<string, Raw>();
  for (const ids of chunk(generatorIds)) {
    const rows = await fetchAll(
      "load the generator price ladders",
      (o) => Vsb_generatorsService.getAll(o),
      {
        select: [
          "vsb_generatorid", "vsb_wtgprice", "vsb_wtgprice2", "vsb_wtgprice3", "vsb_wtgprice4", "vsb_wtgprice5",
          "vsb_additionalfoundationcost", "vsb_foundationcostincluded",
        ],
        filter: idIn("vsb_generatorid", ids),
      },
    );
    for (const g of rows) generators.set(g.vsb_generatorid, g as unknown as Raw);
  }
  return types.map((t) => {
    const g = t._vsb_generator_value ? generators.get(t._vsb_generator_value) : undefined;
    return {
      id: t.vsb_generatortypeinprojectid,
      count: num(t.vsb_numberofgenerators) ?? 0,
      wtgPrices: ["vsb_wtgprice", "vsb_wtgprice2", "vsb_wtgprice3", "vsb_wtgprice4", "vsb_wtgprice5"]
        .map((c) => (g ? num(g[c]) : null)),
      additionalFoundationCost: g ? num(g.vsb_additionalfoundationcost) : null,
      foundationCostIncluded: g ? bool(g.vsb_foundationcostincluded) === true : false,
      generatorsCost: num(t.vsb_generatorscost) ?? 0,
    };
  });
}

/* ══════════════════════════════════════════════════════ Fabric recalculation ══ */

/**
 * `Icon3.Visible` (Y:4180-4191): `!IsEmpty(Filter('Fabric Sync Jobs', 'Regarding Object' = project,
 * 'Job Type'.Name = "Project Milestones changed", 'Job Status' in ['In Progress', Importing]))`.
 * The job type is resolved by name first, then the jobs are filtered by its id.
 */
export async function isMilestoneRecalculationRunning(projectId: string): Promise<boolean> {
  const types = await fetchPage(
    "find the milestone Fabric job type",
    (o) => Vsb_fabricjobtypesService.getAll(o),
    { select: ["vsb_fabricjobtypeid"], filter: eq("vsb_name", FABRIC_JOB_TYPE_MILESTONES) },
  );
  const typeFilter = or(...types.map((t) => lookupEq("vsb_jobtypeid", t.vsb_fabricjobtypeid)));
  if (!typeFilter) return false;
  const jobs = await fetchPage(
    "check for a running milestone recalculation",
    (o) => Vsb_fabricsyncjobsService.getAll(o),
    {
      select: ["vsb_fabricsyncjobid"],
      filter: and(
        lookupEq("vsb_regardingobjectid", projectId),
        typeFilter,
        or(eq("vsb_jobstatuscode", FABRIC_JOB_STATUS.inProgress), eq("vsb_jobstatuscode", FABRIC_JOB_STATUS.importing)),
      ),
      top: 1,
    },
  );
  return jobs.length > 0;
}
