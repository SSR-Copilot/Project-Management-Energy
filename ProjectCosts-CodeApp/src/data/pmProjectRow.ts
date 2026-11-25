/**
 * The `vsb_projects` row the PM screens share, mapped to `RevenueProject` (`gblRecordSelectedProject`). Moved, not copied
 * (CONVENTIONS rule 17), from `data/revenues.ts` (FE-P2-05, D162): `data/finance.ts` reads the project through these, and
 * importing them from `data/revenues.ts` put the Revenues data module and rules into the Finance chunk. `data/revenues.ts`
 * re-exports them, so its importers are unchanged.
 */
import { localDayOf } from "@/domain/dates";
import { PROJECT_COL, type RevenueProject, type Technology } from "@/features/pm/shared/projectRow";
import { CHOICE_FINANCE } from "./dataverseNames";
import { rowStr as str, rowNum as num } from "./rowValues";

type Raw = Record<string, unknown>;

/** A column's OData formatted value (a lookup's name, an option's label), else null. */
export const formatted = (r: Raw, col: string): string | null => str(r[`${col}@OData.Community.Display.V1.FormattedValue`]);

/** `Switch(Technology, Wind, …, PV, …)` — the option-set value, decoded once. */
export function toTechnology(v: unknown): Technology {
  if (v === CHOICE_FINANCE.technology.wind) return "Wind";
  if (v === CHOICE_FINANCE.technology.pv) return "PV";
  return "Other";
}

/** The project columns `RevenueProject` is built from. Finance adds `vsb_financingoptions` (D34). */
export const PROJECT_SELECT = Object.values(PROJECT_COL);

/** One `vsb_projects` row (read with `PROJECT_SELECT`) as the `RevenueProject` the PM screens share. */
export function toRevenueProject(r: Raw, states: readonly { id: string; order: number | null }[]): RevenueProject {
  const clusterId = str(r[PROJECT_COL.clusterState]);
  const countryId = str(r[PROJECT_COL.country]);
  return {
    id: String(r[PROJECT_COL.id]),
    projectIdText: str(r[PROJECT_COL.projectIdText]),
    projectName: str(r[PROJECT_COL.projectName]),
    countryName: formatted(r, PROJECT_COL.country),
    countryCode: countryId,
    technology: toTechnology(r[PROJECT_COL.technology]),
    areaName: formatted(r, PROJECT_COL.countryArea),
    cod: localDayOf(r[PROJECT_COL.cod]),
    fid: localDayOf(r[PROJECT_COL.fid]),
    construction: localDayOf(r[PROJECT_COL.construction]),
    legallyBindingPermits: localDayOf(r[PROJECT_COL.legallyBindingPermits]),
    applicationSubmitted: localDayOf(r[PROJECT_COL.applicationSubmitted]),
    projectDevelopmentStarted: localDayOf(r[PROJECT_COL.projectDevelopmentStarted]),
    feasibilityStudies: localDayOf(r[PROJECT_COL.feasibilityStudies]),
    netYieldP50: num(r[PROJECT_COL.netYieldP50]),
    totalCapacity: num(r[PROJECT_COL.totalCapacity]),
    endDate: localDayOf(r[PROJECT_COL.endDate]),
    clusterStateName: formatted(r, PROJECT_COL.clusterState),
    owningBusinessUnitId: str(r[PROJECT_COL.owningBusinessUnit]),
    clusterStateOrder: clusterId ? states.find((s) => s.id === clusterId)?.order ?? null : null,
  };
}
