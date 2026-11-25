/**
 * The project row the PM screens share (`gblRecordSelectedProject`): its type and columns, the page lock and the
 * locale-sensitive assumption number. Moved, not copied (CONVENTIONS rule 17), from `features/pm/revenues/rules.ts`
 * (FE-P2-05, D162): the Finance screen used these five names, and importing them from the Revenues rules put that whole
 * module into the Finance chunk. `revenues/rules.ts` re-exports every name, so its importers are unchanged.
 */
import { isBlank, langRoot, parseNumber, type Lang } from "@/domain/powerFxNumeric";

/** `Switch(recTechnologyType, Technology.Wind, …, Technology.PV, …, Blank())`. */
export type Technology = "Wind" | "PV" | "Other";

/** The project columns this screen reads off `gblRecordSelectedProject`. */
export interface RevenueProject {
  id: string;
  /** `'Project ID'` — a text column, part of the page-lock test. */
  projectIdText: string | null;
  projectName: string | null;
  countryName: string | null;
  /**
   * `Country.Country` — in Power Fx a record's table-named field is its PRIMARY KEY, so this is the
   * country's GUID (`_vsb_country_value`), the key `Country Inflation Profiles` are filtered on.
   * (The earlier note called it a country "code"; corrected D33.)
   */
  countryCode: string | null;
  technology: Technology;
  /** `'Area/State/Province'.Name` */
  areaName: string | null;
  cod: Date | null;
  fid: Date | null;
  construction: Date | null;
  legallyBindingPermits: Date | null;
  applicationSubmitted: Date | null;
  projectDevelopmentStarted: Date | null;
  feasibilityStudies: Date | null;
  netYieldP50: number | null;
  totalCapacity: number | null;
  endDate: Date | null;
  clusterStateName: string | null;
  owningBusinessUnitId: string | null;
  /** `'Cluster State'.Order` — the balancing-price gate (`Order >= 4`). Optional so Finance's fixtures stay valid. */
  clusterStateOrder?: number | null;
}

/**
 * Validation — `con_Milestones_Page_LockMessage_7.Visible`. Five prerequisites:
 * `IsBlank('Project ID')`, `IsBlank('End Date')`, `'Total Capacity' = 0 or blank`,
 * `'Net Yield p50' = 0 or blank`, `IsBlank('Cluster State'.Name) or = "Draft"`. The bullets are
 * `lbl_…_Balancing_Price_VisibilityMessage_34`…`_38.Text`, verbatim. The fifth read "• Cluster State"
 * here before; the canvas (and Finance's own banner) says "• Change the project status from Draft"
 * (D15 f, corrected D33).
 *
 * The Finance screen carries the identical formula (`con_Milestones_Page_LockMessage_8`)
 * and imports this function rather than repeating it.
 */
export function pageLock(project: RevenueProject | null): string[] {
  if (!project) return [];
  const bullets: string[] = [];
  if (isBlank(project.projectIdText)) bullets.push("• General");
  if (!project.endDate) bullets.push("• Milestones");
  if (!project.totalCapacity) bullets.push("• Generator");
  if (!project.netYieldP50) bullets.push("• Production");
  if (isBlank(project.clusterStateName) || project.clusterStateName === "Draft") {
    bullets.push("• Change the project status from Draft");
  }
  return bullets;
}

export const isPageLocked = (p: RevenueProject | null): boolean =>
  p === null || pageLock(p).length > 0;

/**
 * Rule 12 — locale-sensitive number parsing.
 *
 * `With({varLang: Lower(First(Split(Language(),"-")).Value)},
 *   Switch(varLang, "en", Value(x), Value(Substitute(x, ".", ","))))`
 *
 * The SQL columns are invariant strings with a `.` decimal point. On a non-English client
 * `Value()` would read `.` as a thousands separator, so the canvas re-points the
 * separator first. Reproduced exactly rather than "fixed", because the fix belongs
 * server-side (parse to `number` in the repository) not here.
 */
export function assumptionNumber(raw: string | null | undefined, language: Lang = "en-US"): number {
  if (raw === null || raw === undefined || raw === "") return NaN;
  if (langRoot(language) === "en") return parseNumber(raw, language);
  return parseNumber(String(raw).replace(/\./g, ","), language);
}

/** `Projects` columns this screen reads (verified against `Vsb_projectsModel`). */
export const PROJECT_COL = {
  id: "vsb_projectid",
  projectIdText: "vsb_name",
  projectName: "vsb_projectname",
  country: "_vsb_country_value",
  countryArea: "_vsb_countryarea_value",
  technology: "vsb_technology",
  totalCapacity: "vsb_totalcapacity",
  netYieldP50: "vsb_netyieldp50",
  endDate: "vsb_enddate",
  cod: "vsb_operationsstartdatecod",
  fid: "vsb_finalinvestmentdecision",
  construction: "vsb_construction",
  legallyBindingPermits: "vsb_legallybindingpermits",
  applicationSubmitted: "vsb_applicationsubmitted",
  projectDevelopmentStarted: "vsb_projectdevelopmentstarted",
  feasibilityStudies: "vsb_feasibilitystudies",
  clusterState: "_vsb_clusterstate_value",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;
