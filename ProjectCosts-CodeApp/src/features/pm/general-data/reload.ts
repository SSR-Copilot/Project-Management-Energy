/**
 * What the General Data screen refreshes after a write — the one list `useGeneralDataWrites` and the Screen share.
 *
 * OPT-13: the cluster-panel save (`saveClusterPanel`) is the FIRST of two jobs; the main save (`runSave`) follows at once and uses
 * the snapshot and form captured when the user pressed Save, so the awaited reload of the first job fed nothing. The first job
 * now only marks these keys stale (`PlanJob.staleOnly`), and the main save reloads them once, awaited, as every save does. If the
 * first job fails the main save does not run, and the Screen reloads them for real (`reloadAll`).
 *
 * The session project (`qk.project`) stays in the list and stays awaited at the end of the main save: General Data can change the
 * project name and the cluster state the shell header shows (S5-08 is not applied here).
 */
import type { QueryKey } from "@tanstack/react-query";
import { qk } from "@/data/keys";

export function generalDataReloadKeys(projectId: string | undefined): readonly QueryKey[] {
  const id = projectId ?? "";
  return [qk.generalDataProject(id), qk.shareholders(id), qk.stateTrackings(id), qk.project(id)];
}
