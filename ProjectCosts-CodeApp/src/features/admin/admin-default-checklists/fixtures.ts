/**
 * Static fixture data for the tests (rules and screen render tests). The UI was first laid out
 * against these before the screen was connected. Never imported by the screen at runtime.
 */
import type {
  ChecklistCluster, ChecklistTab, ChecklistTask,
} from "@/data/adminDefaultChecklists";

export const FIXTURE_TABS: ChecklistTab[] = [
  { id: "aaaaaaaa-0000-0000-0000-000000000010", name: "FR Wind", order: "10", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-000000000001" },
  { id: "aaaaaaaa-0000-0000-0000-000000000002", name: "DE PV", order: "2", owningBusinessUnitId: "bbbbbbbb-0000-0000-0000-000000000001" },
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "DE Wind", order: "1", owningBusinessUnitId: null },
];

export const FIXTURE_CLUSTERS: ChecklistCluster[] = [
  { id: "cccccccc-0000-0000-0000-000000000000", name: "Draft", order: 0 },
  { id: "cccccccc-0000-0000-0000-000000000001", name: "Cluster 1", order: 1 },
  { id: "cccccccc-0000-0000-0000-000000000006", name: "Cluster 6", order: 6 },
];

const task = (
  n: number, clusterId: string, tabId: string, over: Partial<ChecklistTask> = {},
): ChecklistTask => ({
  id: `dddddddd-0000-0000-0000-${String(n).padStart(12, "0")}`,
  name: `Task ${n}`,
  order: n,
  holdingDescription: "",
  gateRelevance: false,
  isCompletionDate: false,
  isActive: true,
  toDelete: false,
  clusterId,
  tabId,
  ...over,
});

const DE_WIND = "aaaaaaaa-0000-0000-0000-000000000001";
const DRAFT = "cccccccc-0000-0000-0000-000000000000";
const C1 = "cccccccc-0000-0000-0000-000000000001";

export const FIXTURE_TASKS: ChecklistTask[] = [
  task(2, DRAFT, DE_WIND, { name: "Land lease secured", gateRelevance: true, holdingDescription: "x".repeat(130) }),
  task(1, DRAFT, DE_WIND, { name: "Site identified", isCompletionDate: null }),
  task(3, DRAFT, DE_WIND, { name: "Grid request filed", isActive: false }),
  task(1, C1, DE_WIND, { id: "dddddddd-0000-0000-0000-000000000101", name: "Permit applied", order: 1 }),
];

/** Task 2 ("Land lease secured") is used by a Project Gate. */
export const FIXTURE_LOCKED = new Set<string>(["dddddddd-0000-0000-0000-000000000002"]);
