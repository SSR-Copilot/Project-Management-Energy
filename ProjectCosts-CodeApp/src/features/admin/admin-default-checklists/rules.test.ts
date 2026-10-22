/**
 * Check List Settings — business rules. Each `it` names the FR/DR/AC it covers in
 * `06-code-app-requirements/01-build-requirements.md`.
 */
import { describe, expect, it } from "vitest";
import type { ChecklistTab, ChecklistTask, TaskForm } from "@/data/adminDefaultChecklists";
import { OPERATION, buildEditPayload } from "@/data/adminDefaultChecklists";
import type { WritePlan } from "@/data/writePlan";
import { OUT_OF_SCOPE_MESSAGE } from "./messages";
import { planSetActive, planToggleCompletion, planUpdateTask } from "./rules";
import {
  BLANK_NAME_MESSAGE, LOCK_TOOLTIP, NEW_TASK_DEFAULT_ACTIVE, busyText, clusterCaption, counter,
  deleteDialog, emptyTaskForm, formFromTask, groupTasksByCluster, isLocked, isTaskFormValid,
  moveItem, nextOrder, orderChanged, renumberAfterDelete, reorderPatch, resolveTabId, sortTabs,
  sortTasks, statusDialog, tabSortKey, truncateHolding, validateTask, yesNo,
  LOCK_LOADING_TOOLTIP, LOCK_UNKNOWN_TOOLTIP, findGroup, lockState, lockTooltipFor,
  reorderSnapshotStale, snapshotGroup,
} from "./rules";

const t = (id: string, order: number | null, over: Partial<ChecklistTask> = {}): ChecklistTask => ({
  id, name: id, order, holdingDescription: "", gateRelevance: false, isCompletionDate: false,
  isActive: true, toDelete: false, clusterId: "c1", tabId: "tab", ...over,
});

describe("LockState / lockTooltipFor", () => {
  const locked = new Set(["t-1"]);
  it("UT-ADCHK-001 loading → 'loading' with the checking tooltip, never the Project Gate text", () => {
    const state = lockState("T-1", { isError: false, data: undefined });
    expect(state).toBe("loading");
    expect(lockTooltipFor(state)).toBe(LOCK_LOADING_TOOLTIP);
    expect(lockTooltipFor(state)).not.toBe(LOCK_TOOLTIP);
  });
  it("UT-ADCHK-002 error → 'unknown' (fails closed) even if stale data is cached", () => {
    expect(lockState("T-1", { isError: true, data: locked })).toBe("unknown");
    expect(lockTooltipFor("unknown")).toBe(LOCK_UNKNOWN_TOOLTIP);
  });
  it("UT-ADCHK-003 loaded → locked (case-insensitive) or free", () => {
    expect(lockState("T-1", { isError: false, data: locked })).toBe("locked");
    expect(lockTooltipFor("locked")).toBe(LOCK_TOOLTIP);
    expect(lockState("T-2", { isError: false, data: locked })).toBe("free");
    expect(lockTooltipFor("free")).toBeNull();
  });
});

describe("FindGroup", () => {
  it("UT-ADCHK-004 finds a group whatever the id case; unknown or null → undefined", () => {
    const groups = new Map([["abc", [t("x", 1)]]]);
    expect(findGroup(groups, "ABC")).toEqual({ key: "abc", tasks: [t("x", 1)] });
    expect(findGroup(groups, "abc")?.key).toBe("abc");
    expect(findGroup(groups, "zzz")).toBeUndefined();
    expect(findGroup(groups, null)).toBeUndefined();
  });
});

describe("Reorder snapshot", () => {
  const snap = snapshotGroup([t("a", 1), t("b", 2)]);
  it("UT-ADCHK-005 captures id, name and order only", () => {
    expect(snap).toEqual([{ id: "a", name: "a", order: 1 }, { id: "b", name: "b", order: 2 }]);
  });
  it("UT-ADCHK-006 not stale when the live group matches (a rename does not matter)", () => {
    expect(reorderSnapshotStale(snap, [t("a", 1, { name: "renamed" }), t("b", 2)])).toBe(false);
  });
  it("UT-ADCHK-007 stale when a row is removed, added or swapped, or an Order changed", () => {
    expect(reorderSnapshotStale(snap, [t("a", 1)])).toBe(true);
    expect(reorderSnapshotStale(snap, [t("a", 1), t("b", 2), t("c", 3)])).toBe(true);
    expect(reorderSnapshotStale(snap, [t("a", 1), t("c", 2)])).toBe(true);
    expect(reorderSnapshotStale(snap, [t("a", 2), t("b", 1)])).toBe(true);
  });
});

describe("ClusterCaption", () => {
  it.each([
    ["Draft", "Draft to Cluster 1"],
    ["Cluster 1", "Cluster 1 to Cluster 2"],
    ["Cluster 2", "Cluster 2 to Cluster 3"],
    ["Cluster 3", "Cluster 3 to Cluster 4"],
    ["Cluster 4", "Cluster 4 to Cluster 5"],
    ["Cluster 5", "Cluster 5 to Cluster 6"],
    ["Cluster 6", "Criteria After Cluster 6 Entry"],
    ["Abandoned", "Abandoned"],
    ["", ""],
  ])("UT-ADCHK-008 %s → %s", (name, caption) => expect(clusterCaption(name)).toBe(caption));
});

describe("TruncateHolding", () => {
  it("UT-ADCHK-009 cuts text longer than 110 characters to 110 + ' ...'", () => {
    expect(truncateHolding("x".repeat(111))).toBe(`${"x".repeat(110)} ...`);
  });
  it("UT-ADCHK-010 returns 110 characters or fewer unchanged", () => {
    expect(truncateHolding("x".repeat(110))).toBe("x".repeat(110));
    expect(truncateHolding("short")).toBe("short");
  });
  it("UT-ADCHK-011 treats null as empty", () => expect(truncateHolding(null)).toBe(""));
});

describe("YesNo", () => {
  it("UT-ADCHK-012 shows Gate Relevance / Completion Date as Yes/No; null → No", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
    expect(yesNo(null)).toBe("No");
    expect(yesNo(undefined)).toBe("No");
  });
});

describe("SortTabs / resolveTabId", () => {
  const tab = (id: string, order: string | null, name = id) => ({ id, order, name });

  it("UT-ADCHK-013 orders 1, 2, 3 show A, B, C", () => {
    expect(sortTabs([tab("C", "3"), tab("A", "1"), tab("B", "2")]).map((x) => x.id)).toEqual(["A", "B", "C"]);
  });
  it("UT-ADCHK-014 text orders '10', '2', '1' display as 1, 2, 10", () => {
    expect(sortTabs([tab("ten", "10"), tab("two", "2"), tab("one", "1")]).map((x) => x.order)).toEqual(["1", "2", "10"]);
  });
  it("UT-ADCHK-015 puts blank and non-numeric orders last, then by text, then by name", () => {
    const sorted = sortTabs([tab("x", null, "Zeta"), tab("y", "abc"), tab("z", "5"), tab("w", null, "Alpha")]);
    expect(sorted.map((x) => x.id)).toEqual(["z", "w", "x", "y"]);
  });
  it("UT-ADCHK-016 tabSortKey parses numbers and pushes blanks to +∞", () => {
    expect(tabSortKey(" 7 ")).toBe(7);
    expect(tabSortKey("")).toBe(Number.POSITIVE_INFINITY);
    expect(tabSortKey("n/a")).toBe(Number.POSITIVE_INFINITY);
  });
  it("UT-ADCHK-017 default tab is the left-most tab when ?tab is missing or unknown", () => {
    const tabs = sortTabs([tab("B", "2"), tab("A", "1")]);
    expect(resolveTabId(tabs, null)).toBe("A");
    expect(resolveTabId(tabs, "nope")).toBe("A");
  });
  it("UT-ADCHK-018 uses ?tab when it names a known tab (case-insensitive GUIDs)", () => {
    expect(resolveTabId([tab("aaa", "1"), tab("BBB", "2")], "bbb")).toBe("BBB");
  });
  it("UT-ADCHK-019 no tabs → null", () => expect(resolveTabId([], "x")).toBeNull());
});

describe("GroupTasksByCluster / sortTasks", () => {
  it("UT-ADCHK-020 Orders 3, 1, 2 render as 1, 2, 3", () => {
    expect(sortTasks([t("c", 3), t("a", 1), t("b", 2)]).map((x) => x.order)).toEqual([1, 2, 3]);
  });
  it("UT-ADCHK-021 blank Orders sort FIRST (canvas SortByColumns/Sort ascending, L455-466, L1571-1575), ties by name", () => {
    const sorted = sortTasks([
      t("c", 2, { name: "C" }), t("n2", null, { name: "Zed" }), t("a", 1, { name: "A" }), t("n1", null, { name: "Alpha" }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["n1", "n2", "a", "c"]);
  });
  it("UT-ADCHK-022 the grouped (grid) rows put blank Orders first", () => {
    const groups = groupTasksByCluster([t("a", 1), t("blank", null), t("b", 2)], [{ id: "c1" }]);
    expect(groups.get("c1")?.map((x) => x.id)).toEqual(["blank", "a", "b"]);
  });
  it("UT-ADCHK-023 rows waiting for deletion are dropped; tasks in an invisible cluster are not shown", () => {
    const groups = groupTasksByCluster(
      [t("keep", 1), t("gone", 2, { toDelete: true }), t("other", 1, { clusterId: "hidden" }), t("nocluster", 1, { clusterId: null })],
      [{ id: "c1" }, { id: "c2" }],
    );
    expect(groups.get("c1")?.map((x) => x.id)).toEqual(["keep"]);
    expect(groups.get("c2")).toEqual([]);
    expect(groups.has("hidden")).toBe(false);
  });
  it("UT-ADCHK-024 matches cluster ids case-insensitively", () => {
    const groups = groupTasksByCluster([t("a", 1, { clusterId: "ABC" })], [{ id: "abc" }]);
    expect(groups.get("abc")?.length).toBe(1);
  });
});

describe("NextOrder", () => {
  it("UT-ADCHK-025 visible Orders [1, 2, 5] → 6", () => expect(nextOrder([t("a", 1), t("b", 2), t("c", 5)])).toBe(6));
  it("UT-ADCHK-026 empty cluster → 1", () => expect(nextOrder([])).toBe(1));
  it("UT-ADCHK-027 ignores rows waiting for deletion and blank Orders", () => {
    expect(nextOrder([t("a", 1), t("b", 9, { toDelete: true }), t("c", null)])).toBe(2);
  });
});

describe("IsLocked", () => {
  it("UT-ADCHK-028 locked only when the id is in the lock set (ids stored lower-case)", () => {
    const set = new Set(["abc-1"]);
    expect(isLocked("ABC-1", set)).toBe(true);
    expect(isLocked("abc-2", set)).toBe(false);
  });
  it("UT-ADCHK-029 uses the canvas tooltip verbatim", () => {
    expect(LOCK_TOOLTIP).toBe(
      "This Check List item is in use by a Project Gate. Delete the Project Gate to edit the Check List item.",
    );
  });
});

describe("ReorderPatch", () => {
  const current = [{ id: "a", order: 1 }, { id: "b", order: 2 }, { id: "c", order: 3 }];
  it("UT-ADCHK-030 moving the 3rd of 3 to the top writes 1, 2, 3 in the new sequence", () => {
    expect(reorderPatch(current, ["c", "a", "b"])).toEqual([
      { id: "c", order: 1 }, { id: "a", order: 2 }, { id: "b", order: 3 },
    ]);
  });
  it("UT-ADCHK-031 unchanged order → no writes", () => expect(reorderPatch(current, ["a", "b", "c"])).toEqual([]));
  it("UT-ADCHK-032 only rows whose Order changed are written (1-based)", () => {
    expect(reorderPatch(current, ["a", "c", "b"])).toEqual([{ id: "c", order: 2 }, { id: "b", order: 3 }]);
  });
  it("UT-ADCHK-033 normalises a 0-based or gapped history to 1-based", () => {
    expect(reorderPatch([{ id: "a", order: 0 }, { id: "b", order: 5 }], ["a", "b"])).toEqual([
      { id: "a", order: 1 }, { id: "b", order: 2 },
    ]);
  });
  it("UT-ADCHK-034 ignores ids not in the current group", () => expect(reorderPatch(current, ["zzz", "b", "c"])).toEqual([]));
});

describe("MoveItem / orderChanged", () => {
  it("UT-ADCHK-035 moves up and down", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
  it("UT-ADCHK-036 out-of-range moves are no-ops", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
  it("UT-ADCHK-037 Save stays disabled while the order is unchanged", () => {
    expect(orderChanged(["a", "b"], ["a", "b"])).toBe(false);
    expect(orderChanged(["a", "b"], ["b", "a"])).toBe(true);
  });
});

describe("RenumberAfterDelete", () => {
  it("UT-ADCHK-038 deleting Order 2 of 1-4 renumbers the former 3 and 4 to 2 and 3", () => {
    const group = [t("t1", 1), t("t2", 2), t("t3", 3), t("t4", 4)];
    expect(renumberAfterDelete(group, group[1] as ChecklistTask)).toEqual([
      { id: "t3", order: 2 }, { id: "t4", order: 3 },
    ]);
  });
  it("UT-ADCHK-039 skips rows waiting for deletion", () => {
    const group = [t("t1", 1), t("t2", 2, { toDelete: true }), t("t3", 3)];
    expect(renumberAfterDelete(group, t("t1", 1))).toEqual([{ id: "t3", order: 2 }]);
  });
  it("UT-ADCHK-040 a deleted row without an Order renumbers nothing (canvas delegated `Order > Blank()` matches no rows, DCS:1742)", () => {
    const group = [t("x", null), t("b", null), t("c", 1), t("d", 2), t("z", 0)];
    expect(renumberAfterDelete(group, t("x", null))).toEqual([]);  });
  it("UT-ADCHK-041 a remaining row without an Order is never renumbered", () => {
    expect(renumberAfterDelete([t("a", 1), t("b", null), t("c", 3)], t("a", 1))).toEqual([{ id: "c", order: 2 }]);
  });
});

describe("ValidateTask", () => {
  it("UT-ADCHK-042 blank or whitespace name → 'Value cannot be blank.'", () => {
    expect(validateTask({ name: "   ", holdingDescription: "" }).name).toBe(BLANK_NAME_MESSAGE);
    expect(isTaskFormValid({ name: "", holdingDescription: "" })).toBe(false);
  });
  it("UT-ADCHK-043 a non-blank name is valid; holding description is optional", () => {
    expect(validateTask({ name: " Foo ", holdingDescription: "" })).toEqual({});
  });
  it("UT-ADCHK-044 counter shows n/256", () => expect(counter("abc")).toBe("3/256"));
});

describe("Form defaults", () => {
  it("UT-ADCHK-045 a new task defaults to Inactive, as in the canvas", () => {
    expect(NEW_TASK_DEFAULT_ACTIVE).toBe(false);
    expect(emptyTaskForm()).toEqual({
      name: "", holdingDescription: "", gateRelevance: false, isCompletionDate: false, isActive: false,
    });
  });
  it("UT-ADCHK-046 edit form is filled from the row; null Completion Date reads off", () => {
    expect(formFromTask(t("a", 1, { name: "N", holdingDescription: "H", gateRelevance: true, isCompletionDate: null, isActive: false })))
      .toEqual({ name: "N", holdingDescription: "H", gateRelevance: true, isCompletionDate: false, isActive: false });
  });
});

describe("Dialog and busy texts", () => {
  it("UT-ADCHK-047 status dialog: typo fixed, row name used", () => {
    expect(statusDialog({ name: "Row", isActive: true })).toEqual({
      title: "Deactivate checklist item?", confirmText: "Deactivate",
      description: 'Are you sure that you want to change status of task "Row"?',
    });
    expect(statusDialog({ name: "Row", isActive: false }).title).toBe("Activate checklist item?");
  });
  it("UT-ADCHK-048 delete dialog says what really happens — no 'permanently'", () => {
    const d = deleteDialog({ name: "Row" });
    expect(d.title).toBe("Delete checklist item?");
    expect(d.description).toContain('"Row"');
    expect(d.description).not.toContain("permanently");
    expect(d.description).toContain("not yet approved");
  });
  it("UT-ADCHK-049 busy texts match the canvas (typo 'Deleteing' fixed)", () => {
    expect(busyText.save(" A ")).toBe("Checklist item 'A' will be saved, please wait...");
    expect(busyText.completion("A")).toBe("Completion Date for 'A' will be changed, please wait...");
    expect(busyText.reorder()).toBe("New order will be saved, please wait...");
    expect(busyText.remove("A")).toBe("Deleting item 'A', please wait...");
  });
});

describe("Write plans (pure shape; the requests they produce are in writes.test.ts)", () => {
  const admin = { canEdit: true } as const;
  const ID = "dddddddd-0000-0000-0000-000000000001";
  const TAB: ChecklistTab = {
    id: "aaaaaaaa-0000-0000-0000-000000000001", name: "DE Wind", order: "1", owningBusinessUnitId: null,
  };
  const FORM: TaskForm = {
    name: " A ", holdingDescription: " h ", gateRelevance: true, isCompletionDate: false, isActive: true,
  };
  const plans = (): [string, WritePlan][] => [
    ["planUpdateTask", planUpdateTask(ID, FORM, TAB, admin)],
    ["planToggleCompletion", planToggleCompletion({ id: ID, isCompletionDate: null }, admin)],
    ["planSetActive", planSetActive(ID, true, admin)],
  ];

  it("UT-ADCHK-060 each builder makes exactly ONE guarded update of the task table", () => {
    for (const [name, plan] of plans()) {
      expect(plan.refusedReason, name).toBeUndefined();
      expect(plan.writes, name).toHaveLength(1);
      expect(plan.writes[0], name).toMatchObject({
        op: "update", guarded: true, entitySet: "vsb_projectdefaultchecklistses", id: ID,
      });
    }
  });

  it("UT-ADCHK-061 every write carries the V9 operation text verbatim, so failure texts are unchanged", () => {
    for (const [name, plan] of plans()) expect(plan.writes[0]?.label, name).toBe("Update checklist item");
    expect(OPERATION.update).toBe("Update checklist item");
  });

  it("UT-ADCHK-062 the edit payload is the shared buildEditPayload; the toggle flips null to true", () => {
    expect(planUpdateTask(ID, FORM, TAB, admin).writes[0]?.data).toEqual(buildEditPayload(FORM, TAB));
    expect(planToggleCompletion({ id: ID, isCompletionDate: null }, admin).writes[0]?.data)
      .toEqual({ vsb_iscompletiondate: true });
    expect(planToggleCompletion({ id: ID, isCompletionDate: true }, admin).writes[0]?.data)
      .toEqual({ vsb_iscompletiondate: false });
    expect(planSetActive(ID, false, admin).writes[0]?.data).toEqual({ statecode: 1, statuscode: 2 });
  });

  it("UT-ADCHK-063 without admin access the plan refuses itself with the screen's out-of-scope text", () => {
    for (const build of [
      () => planUpdateTask(ID, FORM, TAB, { canEdit: false }),
      () => planToggleCompletion({ id: ID, isCompletionDate: null }, { canEdit: false }),
      () => planSetActive(ID, true, { canEdit: false }),
    ]) {
      expect(build()).toEqual({ writes: [], log: [], refusedReason: OUT_OF_SCOPE_MESSAGE });
    }
  });
});
