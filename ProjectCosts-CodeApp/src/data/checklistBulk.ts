/**
 * D138 (B1): lets the Generators bulk backend write `vsb_projectchecklists` (the Cluster Check List's materialisation).
 * Loaded only when `CHECKLIST_BULK.materialise` is on (a dynamic import from `features/pm/checklist/hooks.ts`), so with the switch off
 * the five generated services of the bulk backend are not part of the screen at all.
 *
 * The names: entity set `ES.projectChecklists`, logical name `vsb_projectchecklist` (`ProjectDocs/reference/dataverse-entities.json`),
 * primary key `vsb_projectchecklistid` (`.power/schemas/appschemas/dataSourcesInfo.ts`).
 */
import { Vsb_projectchecklistsService } from "@/generated/services/Vsb_projectchecklistsService";
import { registerDefaultBulkBackend } from "./bulkBackend";
import { createGeneratorsBulkBackend, defineBulkTable, registerBulkTables } from "./generatorsBulk";
import { ES } from "./dataverseNames";

let registered = false;

/** Idempotent: the table and the default backend are registered once per page load. */
export function registerChecklistBulk(): void {
  if (registered) return;
  registered = true;
  registerBulkTables([
    defineBulkTable(ES.projectChecklists, "vsb_projectchecklist", "vsb_projectchecklistid", true, Vsb_projectchecklistsService),
  ]);
  registerDefaultBulkBackend(createGeneratorsBulkBackend);
}
