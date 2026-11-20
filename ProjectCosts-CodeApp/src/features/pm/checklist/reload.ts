/**
 * D150 (`targetedReload`): what a Cluster Check List job reloads once its writes are over. Pure, so the rule is testable without a screen.
 */
import type { QueryKey } from "@tanstack/react-query";
import { ES } from "@/data/dataverseNames";
import { checklistPerf } from "@/data/checklistPerfFlags";
import { qk } from "@/data/keys";
import type { WritePlan } from "@/data/writePlan";

/**
 * The cache keys a job refreshes when its plan writes ONLY `vsb_projectchecklists` rows (a row's Complete, In Progress, date or comment
 * patch; the copy of the templates into a cluster whose tracking exists): the cluster's rows. No server automation fires on that table
 * (`ProjectDocs/migration-plans/04-flow-inventory.md`), so the project, the trackings, the approval settings (keyed by the rows'
 * template ids, so a new set of rows is fetched on arrival) and the session project cannot have changed.
 *
 * `undefined` = the hook's full list (`checklistWriteKeys`): the switch is off, the plan is empty, or it writes anything else (a
 * tracking, a note, the project), which `SynchroniseProjectState` and `UpdateTeamsandSPOSite` react to. Called only for the two jobs
 * that have no flow step (`patchRow`, `prepareCluster`); every approval and cancel job keeps the full list.
 */
export function checklistReloadKeys(projectId: string, plan: WritePlan, flags = checklistPerf()): readonly QueryKey[] | undefined {
  if (!flags.targetedReload || plan.writes.length === 0) return undefined;
  return plan.writes.every((w) => w.entitySet === ES.projectChecklists) ? [qk.checklist(projectId, "rows")] : undefined;
}
