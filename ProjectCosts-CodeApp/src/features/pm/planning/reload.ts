/**
 * What the Planning screen refreshes after a write (OPT-13).
 *
 * Before, every write (planning Save, permit Save / Delete, acquisition Save / Clear & Save) re-read everything under
 * `["pmPlanning", projectId]`: the project, the planning row, the permits and the acquisition statuses (and the acquisition
 * refetch re-ran its seed check). A job now names only the queries that read the table it writes (`PlanJob.invalidate`):
 *
 *  - permit Save / Delete writes `vsb_permits`                       -> the permits query only;
 *  - acquisition Save / Clear & Save writes `vsb_aquisitionstatuses` -> the acquisition query only;
 *  - planning Save writes `vsb_projectplannings`                     -> the planning row and, as before, the project query.
 *    The project query is kept ON PURPOSE: the inventory (`04-flow-inventory.md`, `hooks.ts` header) lists no flow or plugin on
 *    `vsb_projectplanning` that writes the project, but the Save is the one job whose table the screen shows beside the
 *    project's header data, and one extra single-row read is cheap insurance.
 *
 * `PLANNING_TABLE_READERS` maps a table to the queries that read it; `reload.test.ts` (UT-PLAN-OPT-2xx) proves that every table a
 * real plan builder writes has all its readers in its kind's list and that every query `hooks.ts` defines is mapped.
 * Revert: pass no `invalidate` (the hook's `qk.planningAll` returns).
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { qk } from "@/data/keys";

export type PlanningWriteKind = "planning" | "permit" | "aquisition";

/** The queries that read each table. The permits key is a prefix (it carries the planning id), so one invalidation reaches it. */
export const PLANNING_TABLE_READERS: Readonly<Record<string, (projectId: string) => readonly QueryKey[]>> = {
  [ES.projects]: (id) => [qk.planning(id, "project")],
  [ES.projectPlannings]: (id) => [qk.planning(id, "row")],
  [ES.permits]: (id) => [qk.planning(id, "permits")],
  [ES.aquisitionStatuses]: (id) => [qk.planning(id, "aquisition")],
};

/** The tables each kind of write changes. */
export const PLANNING_KIND_TABLES: Readonly<Record<PlanningWriteKind, readonly string[]>> = {
  planning: [ES.projectPlannings],
  permit: [ES.permits],
  aquisition: [ES.aquisitionStatuses],
};

/** The keys a job of this kind refreshes: its tables' readers, plus the project query for the planning Save. */
export function planningReloadKeys(projectId: string | undefined, kind: PlanningWriteKind): readonly QueryKey[] {
  const id = projectId ?? "";
  const tables = kind === "planning" ? [...PLANNING_KIND_TABLES.planning, ES.projects] : PLANNING_KIND_TABLES[kind];
  return tables.flatMap((table) => PLANNING_TABLE_READERS[table]!(id));
}
