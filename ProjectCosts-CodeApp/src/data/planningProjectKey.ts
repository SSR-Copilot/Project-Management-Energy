/**
 * PB-10 (`PM_PROJECT_ROW_SHARED`): the cache key of the project row `loadPlanningProject` reads. Planning and Grid Operator select
 * the same columns through the same loader, so with the switch on both use Planning's key and a move from one to the other inside
 * the stale time reads the row once. OFF: Grid Operator keeps its own key (two reads), as before.
 *
 * Its own module (not `data/planning.ts`) so a test that replaces the data module still gets the key.
 */
import { bootDvopt } from "./bootDvoptFlags";
import { qk } from "./keys";

export const planningProjectRowKey = (projectId: string, screen: "planning" | "gridOperator") =>
  screen === "planning" || bootDvopt().pmProjectRowShared ? qk.planning(projectId, "project") : qk.gridOperator(projectId, "project");
