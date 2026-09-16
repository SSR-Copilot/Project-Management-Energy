/**
 * Admin Project Default Checklists Screen — unit tests.
 *
 * IDs are the spec's (UT-ADCHK-nnn). Pure functions only. The two "Permission" cases
 * exercise `canSeeAdminSection`, which is the exact predicate the route guard and the
 * canvas `LeftAdminNavigationMenu` both use, plus `canEditScope` for the country half.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import { CHOICE_ADMIN, CHOICE_PROCESS } from "@/data/entities";
import {
  MSG, DESCRIPTION_MAX_LENGTH, HOLDING_TRUNCATE_AT, CHECKLIST_ENTITY_SET,
  DEFAULT_CHECKLIST_COL, DEFAULT_CHECKLIST_LOOKUP,
  defaultScope, defaultScopeCanvasParity, sortScopes, checklistGates, visibleTasks,
  isTaskLocked, blockingChecklistIds, canEditScope, isSaveEnabled, saveErrors, panelTitle,
  truncateHolding, charCounter, nextOrder, nextOrderFromHighest, compactOrdersAfterDelete,
  reorderPositions, toStatusPair, toggleActivePatch, toggleActiveCanvasParity,
  toggleCompletionDatePatch, buildTaskPayload, planSaveTask, planDeleteTask,
  planReorderTasks, activationTitle, emptyTaskForm, toTaskForm,
  type ScopeRow, type GateRow, type TaskRow, type TaskForm,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const user = (o: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u-1", displayName: "A. Muster", mail: "a@vsb.energy", language: "en-US",
  lang: "en", roles: [],
  isApplicationAdministrator: false, isControllerOwnData: false,
  isProjectDataAllCountries: false, isProjectManagerOwnProjects: false,
  isDeveloper: false, canEditSelectedProject: false,
  editableCountries: [], editableCountriesAsString: "",
  ...o,
});

const scope = (o: Partial<ScopeRow> = {}): ScopeRow => ({
  id: "sc-1", name: "Germany Wind", order: 1, countryId: "de",
  technology: CHOICE_ADMIN.technology.wind, owningBusinessUnitId: "bu-1",
  ...o,
});

const gate = (o: Partial<GateRow> = {}): GateRow => ({
  id: "gs-1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true, ...o,
});

const task = (o: Partial<TaskRow> = {}): TaskRow => ({
  id: "t-1", name: "Permit", order: 1, holdingTaskDescription: "Holding",
  gateRelevance: false, isCompletionDate: false, toDelete: false,
  countryTechId: "sc-1", clusterStateId: "gs-1",
  status: CHOICE_ADMIN.status.active,
  ...o,
});

const form = (o: Partial<TaskForm> = {}): TaskForm => ({ ...emptyTaskForm(), description: "Permit", ...o });

const ctx = (o: Record<string, unknown> = {}) => ({
  scope: scope(), gate: gate(), existing: null as TaskRow | null,
  nextOrderValue: 5, canEdit: true, ...o,
}) as Parameters<typeof buildTaskPayload>[1];

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission", () => {
  it("UT-ADCHK-001 admin route rejects a user with neither admin role", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    // The guard renders 403 before any data request is issued: no query is enabled
    // until a scope exists, and no scope query runs behind the guard.
  });

  it("UT-ADCHK-002 Controller Own Data may enter", () => {
    expect(canSeeAdminSection(user({ isControllerOwnData: true }))).toBe(true);
    expect(canSeeAdminSection(user({ isApplicationAdministrator: true }))).toBe(true);
  });

  it("UT-ADCHK-002b country scope gates the edits, not the entry (new, not in the canvas)", () => {
    const controller = user({
      isControllerOwnData: true,
      editableCountries: [{ id: "de", name: "Germany" }],
      editableCountriesAsString: "Germany",
    });
    expect(canEditScope(controller, scope({ countryId: "de" }))).toBe(true);
    expect(canEditScope(controller, scope({ countryId: "fr" }))).toBe(false);
    // An Application Administrator passes everywhere.
    expect(canEditScope(user({ isApplicationAdministrator: true }), scope({ countryId: "fr" })))
      .toBe(true);
  });
});

/* ═════════════════════════════════════════════════════════════════ binding ════ */

describe("scope and gates", () => {
  it("UT-ADCHK-003 gate list is filtered to Is Visible On Checklist and ordered", () => {
    const gates = checklistGates([
      gate({ id: "c", name: "Cluster 3", order: 3 }),
      gate({ id: "x", name: "Hidden", order: 2, isVisibleOnChecklist: false }),
      gate({ id: "a", name: "Cluster 1", order: 1 }),
      gate({ id: "y", name: "Hidden 2", order: 4, isVisibleOnChecklist: false }),
      gate({ id: "b", name: "Cluster 2", order: 2 }),
    ]);
    expect(gates.map((g) => g.id)).toEqual(["a", "b", "c"]);
  });

  it("UT-ADCHK-003b default scope is the first tab BY ORDER (canvas used name)", () => {
    const scopes = [
      scope({ id: "s2", name: "Austria PV", order: 2 }),
      scope({ id: "s1", name: "Germany Wind", order: 1 }),
    ];
    expect(sortScopes(scopes).map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(defaultScope(scopes)?.id).toBe("s1");
    // The canvas picked `First(SortByColumns(…, "vsb_name"))` — "Austria PV" — while the
    // tab strip highlighted "Germany Wind". That mismatch is the defect we fixed.
    expect(defaultScopeCanvasParity(scopes)?.id).toBe("s2");
  });

  it("UT-ADCHK-004 task query is scoped by both lookups and excludes soft deletes", () => {
    const rows = [
      task({ id: "in", countryTechId: "sc-1", clusterStateId: "gs-1" }),
      task({ id: "otherScope", countryTechId: "sc-2" }),
      task({ id: "otherGate", clusterStateId: "gs-2" }),
    ];
    expect(visibleTasks(rows, "sc-1", "gs-1").map((t) => t.id)).toEqual(["in"]);
  });

  it("UT-ADCHK-005 soft-deleted tasks are hidden", () => {
    const rows = [task({ id: "a", order: 1 }), task({ id: "gone", order: 2, toDelete: true })];
    expect(visibleTasks(rows, "sc-1", "gs-1").map((t) => t.id)).toEqual(["a"]);
  });

  it("UT-ADCHK-022 an empty scope renders an empty grid, not a crash", () => {
    expect(visibleTasks([], "sc-1", "gs-1")).toEqual([]);
    // Add is still enabled — nothing about the empty set disables the save gate.
    expect(isSaveEnabled(form())).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════ validation ════ */

describe("validation and the panel", () => {
  it("UT-ADCHK-006 Save is disabled when the description is blank or whitespace", () => {
    expect(isSaveEnabled(form({ description: "   " }))).toBe(false);
    expect(saveErrors(form({ description: "   " }))).toEqual([MSG.descriptionBlank]);
    expect(isSaveEnabled(form({ description: "x" }))).toBe(true);
    expect(saveErrors(form({ description: "x" }))).toEqual([]);
  });

  it("UT-ADCHK-006b a blank description refuses the plan, not just the button", () => {
    const plan = planSaveTask(form({ description: "  " }), ctx());
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.descriptionBlank);
  });

  it("UT-ADCHK-020 panel title switches on selection", () => {
    expect(panelTitle(null)).toBe("Add Task");
    expect(panelTitle(task())).toBe("Edit Task");
  });

  it("UT-ADCHK-020b the character counter mirrors the canvas label", () => {
    expect(charCounter("abc")).toBe(`3/${DESCRIPTION_MAX_LENGTH}`);
  });

  it("UT-ADCHK-019 holding description is truncated at 110 characters", () => {
    const long = "x".repeat(150);
    const out = truncateHolding(long);
    expect(out).toBe(`${"x".repeat(HOLDING_TRUNCATE_AT)} ...`);
    expect(truncateHolding("short")).toBe("short");
    expect(truncateHolding(null)).toBe("");
    expect(truncateHolding("y".repeat(110))).toBe("y".repeat(110));
  });

  it("UT-ADCHK-019b the activation dialog title follows the current state", () => {
    expect(activationTitle(true)).toBe(MSG.deactivateTitle);
    expect(activationTitle(false)).toBe(MSG.activateTitle);
  });
});

/* ═══════════════════════════════════════════════════════════════════ the save ════ */

describe("the save payload", () => {
  it("UT-ADCHK-007 description and holding description are trimmed", () => {
    const p = buildTaskPayload(
      form({ description: "  Permit  ", holdingDescription: "  Hold  " }), ctx(),
    );
    expect(p[DEFAULT_CHECKLIST_COL.name]).toBe("Permit");
    expect(p[DEFAULT_CHECKLIST_COL.holdingTaskDescription]).toBe("Hold");
  });

  it("UT-ADCHK-008 a new task's order is count + 1", () => {
    expect(nextOrder(4)).toBe(5);
    expect(nextOrderFromHighest(4)).toBe(5);
    expect(nextOrder(0)).toBe(1);
    expect(nextOrderFromHighest(null)).toBe(1);
    const p = buildTaskPayload(form(), ctx({ nextOrderValue: 5 }));
    expect(p[DEFAULT_CHECKLIST_COL.order]).toBe(5);
  });

  it("UT-ADCHK-009 the Active toggle writes BOTH status fields", () => {
    expect(toStatusPair(true)).toEqual({
      statecode: CHOICE_ADMIN.status.active, statuscode: CHOICE_ADMIN.statusReason.active,
    });
    const p = buildTaskPayload(form({ active: true }), ctx());
    expect(p[DEFAULT_CHECKLIST_COL.statecode]).toBe(CHOICE_ADMIN.status.active);
    expect(p[DEFAULT_CHECKLIST_COL.statuscode]).toBe(CHOICE_ADMIN.statusReason.active);
    const q = buildTaskPayload(form({ active: false }), ctx());
    expect(q[DEFAULT_CHECKLIST_COL.statecode]).toBe(CHOICE_ADMIN.status.inactive);
    expect(q[DEFAULT_CHECKLIST_COL.statuscode]).toBe(CHOICE_ADMIN.statusReason.inactive);
  });

  it("UT-ADCHK-010 Owning Business Unit is copied from the scope row", () => {
    const p = buildTaskPayload(form(), ctx({ scope: scope({ owningBusinessUnitId: "bu-1" }) }));
    expect(p[`${DEFAULT_CHECKLIST_LOOKUP.owningBusinessUnit}@odata.bind`])
      .toBe("/businessunits(bu-1)");
  });

  it("UT-ADCHK-011 a new task inherits the gate it was added from", () => {
    const p = buildTaskPayload(form(), ctx({ gate: gate({ id: "gs-3", name: "Cluster 3" }) }));
    expect(p[`${DEFAULT_CHECKLIST_LOOKUP.clusterState}@odata.bind`])
      .toBe("/vsb_projectstates(gs-3)");
  });

  it("UT-ADCHK-012 editing never moves a task between gates", () => {
    const existing = task({ id: "t-9", clusterStateId: "gs-2" });
    const p = buildTaskPayload(form(), ctx({ existing, gate: gate({ id: "gs-7" }) }));
    // No Cluster State key at all on an update — the stored gate is preserved.
    expect(p[`${DEFAULT_CHECKLIST_LOOKUP.clusterState}@odata.bind`]).toBeUndefined();
    expect(p[DEFAULT_CHECKLIST_COL.order]).toBeUndefined();
    const plan = planSaveTask(form(), ctx({ existing }));
    expect(plan.writes).toEqual([expect.objectContaining({ op: "update", id: "t-9" })]);
  });

  it("UT-ADCHK-012b a save with no country scope is refused before any request", () => {
    const plan = planSaveTask(form(), ctx({ canEdit: false }));
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.outOfScope);
  });

  it("UT-ADCHK-012c a create is ONE write, not the canvas create-then-update pair", () => {
    const plan = planSaveTask(form(), ctx());
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].op).toBe("create");
    expect(plan.writes[0].entitySet).toBe(CHECKLIST_ENTITY_SET);
  });
});

/* ═══════════════════════════════════════════════════════════════ the in-use lock ════ */

describe("the in-use lock", () => {
  it("UT-ADCHK-013 all four row actions are locked when a gate approval references the task", () => {
    const blocking = blockingChecklistIds(
      [{ projectDefaultChecklistId: "t-1", approvalMode: CHOICE_PROCESS.approvalMode.formalApproval }],
      CHOICE_PROCESS.approvalMode.onlyNotifications,
    );
    expect(isTaskLocked("t-1", blocking)).toBe(true);
    const plan = planDeleteTask({ target: task(), siblings: [], locked: true, canEdit: true });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.inUse);
  });

  it("UT-ADCHK-014 Only-Notifications approvals do NOT lock the row", () => {
    const blocking = blockingChecklistIds(
      [{
        projectDefaultChecklistId: "t-1",
        approvalMode: CHOICE_PROCESS.approvalMode.onlyNotifications,
      }],
      CHOICE_PROCESS.approvalMode.onlyNotifications,
    );
    expect(blocking.size).toBe(0);
    expect(isTaskLocked("t-1", blocking)).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════ delete + reorder ════ */

describe("delete and reorder", () => {
  const five = [1, 2, 3, 4, 5].map((n) => task({ id: `t-${n}`, order: n, name: `Task ${n}` }));

  it("UT-ADCHK-015 delete soft-deletes and compacts every later order", () => {
    const plan = planDeleteTask({
      target: five[2], siblings: five, locked: false, canEdit: true,
    });
    expect(plan.writes[0]).toMatchObject({
      op: "update", id: "t-3", data: { [DEFAULT_CHECKLIST_COL.toDelete]: true },
    });
    expect(plan.writes.slice(1).map((w) => ({ id: w.id, order: w.data?.[DEFAULT_CHECKLIST_COL.order] })))
      .toEqual([{ id: "t-4", order: 3 }, { id: "t-5", order: 4 }]);
    // One batch, not five round-trips.
    expect(plan.writes).toHaveLength(3);
  });

  it("UT-ADCHK-016 delete does not touch earlier siblings", () => {
    const moves = compactOrdersAfterDelete(five, 3);
    expect(moves.map((m) => m.id)).toEqual(["t-4", "t-5"]);
    expect(moves.some((m) => m.id === "t-1" || m.id === "t-2")).toBe(false);
  });

  it("UT-ADCHK-016b compaction ignores rows already soft-deleted", () => {
    const rows = [...five, task({ id: "dead", order: 6, toDelete: true })];
    expect(compactOrdersAfterDelete(rows, 3).map((m) => m.id)).toEqual(["t-4", "t-5"]);
  });

  it("UT-ADCHK-017 the completion-date toggle negates the stored value", () => {
    expect(toggleCompletionDatePatch(task({ isCompletionDate: false })))
      .toEqual({ [DEFAULT_CHECKLIST_COL.isCompletionDate]: true });
    expect(toggleCompletionDatePatch(task({ isCompletionDate: true })))
      .toEqual({ [DEFAULT_CHECKLIST_COL.isCompletionDate]: false });
  });

  it("UT-ADCHK-017b the active toggle writes both columns; the canvas wrote one", () => {
    const active = task({ status: CHOICE_ADMIN.status.active });
    expect(toggleActivePatch(active)).toEqual({
      [DEFAULT_CHECKLIST_COL.statecode]: CHOICE_ADMIN.status.inactive,
      [DEFAULT_CHECKLIST_COL.statuscode]: CHOICE_ADMIN.statusReason.inactive,
    });
    expect(toggleActiveCanvasParity(active)).toEqual({
      [DEFAULT_CHECKLIST_COL.statecode]: CHOICE_ADMIN.status.inactive,
    });
    expect(DEFAULT_CHECKLIST_COL.statuscode in toggleActiveCanvasParity(active)).toBe(false);
  });

  it("UT-ADCHK-018 reorder sends one batch of positions", () => {
    const four = [1, 2, 3, 4].map((n) => task({ id: `t-${n}`, order: n }));
    const plan = planReorderTasks({
      tasks: four, orderedIds: ["t-4", "t-1", "t-2", "t-3"], canEdit: true,
    });
    expect(plan.writes.map((w) => ({ id: w.id, order: w.data?.[DEFAULT_CHECKLIST_COL.order] })))
      .toEqual([
        { id: "t-4", order: 1 }, { id: "t-1", order: 2 },
        { id: "t-2", order: 3 }, { id: "t-3", order: 4 },
      ]);
  });

  it("UT-ADCHK-018b a reorder that changes nothing writes nothing", () => {
    const four = [1, 2, 3, 4].map((n) => task({ id: `t-${n}`, order: n }));
    expect(reorderPositions(four, ["t-1", "t-2", "t-3", "t-4"])).toEqual([]);
    expect(planReorderTasks({ tasks: four, orderedIds: ["t-1", "t-2", "t-3", "t-4"], canEdit: true })
      .writes).toHaveLength(0);
  });
});

/* ═════════════════════════════════════════════════════════════════════ errors ════ */

describe("error handling", () => {
  it("UT-ADCHK-021 a refused plan carries a reason and issues nothing", () => {
    const plan = planReorderTasks({ tasks: [], orderedIds: ["a"], canEdit: false });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.outOfScope);
  });

  it("UT-ADCHK-021b the form round-trips a stored row", () => {
    const t = task({
      name: "Permit", holdingTaskDescription: "Hold", gateRelevance: true,
      isCompletionDate: true, status: CHOICE_ADMIN.status.inactive,
    });
    expect(toTaskForm(t)).toEqual({
      description: "Permit", holdingDescription: "Hold",
      gateRelevance: true, isCompletionDate: true, active: false,
    });
    expect(toTaskForm(null)).toEqual(emptyTaskForm());
  });
});

/* ═══════════════════════════════════════════════════════════════════ shell ════ */

describe("shell (GUIDE p17)", () => {
  it("UT-ADCHK-024 page title is verbatim, distinct from the left-rail label", () => {
    expect(MSG.pageTitle).toBe("Checklist settings");
  });

  it("UT-ADCHK-023 the gate-transition sequence renders in the captured order and wording", () => {
    const states: GateRow[] = [
      "Draft to Cluster 1", "Cluster 1 to Cluster 2", "Cluster 2 to Cluster 3",
      "Cluster 3 to Cluster 4", "Cluster 4 to Cluster 5", "Cluster 5 to Cluster 6",
      "Criteria After Cluster 6 Entry",
    ].map((name, i) => gate({ id: `g${i}`, name, order: i + 1 }));
    // Shuffle the input to prove the sort, not the fixture order, produces the sequence.
    const shuffled = [states[3], states[0], states[6], states[1], states[5], states[2], states[4]];
    expect(checklistGates(shuffled).map((g) => g.name)).toEqual([
      "Draft to Cluster 1", "Cluster 1 to Cluster 2", "Cluster 2 to Cluster 3",
      "Cluster 3 to Cluster 4", "Cluster 4 to Cluster 5", "Cluster 5 to Cluster 6",
      "Criteria After Cluster 6 Entry",
    ]);
  });
});
