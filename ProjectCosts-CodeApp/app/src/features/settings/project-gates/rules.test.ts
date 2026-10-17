/**
 * Project Gates — pure rules. One block per FR/DR/D id; see `07-build-log.md` for the map.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNING_BU_BIND } from "@/data/settings/checklistTables";
import { GATE_COUNTRY_RULE, GATE_DEFAULT, defaultSelection, pickerCountries } from "@/domain/countryPicker";
import { GATE_TECHNOLOGIES, TECHNOLOGY } from "@/domain/technology";
import {
  BU_ID, COUNTRY_IDS, FIXTURE_APPROVALS, FIXTURE_CHECKLISTS, FIXTURE_COUNTRIES, FIXTURE_STATES,
  FIXTURE_TEMPLATES, fixtureDataset, HIDDEN_CHECKLISTS, person,
} from "./fixtures";
import {
  bindPath, buildGateRows, canAddTask, canSave, CHECKLIST_BLANK_MESSAGE, collapseKey, collapseScope,
  deleteConfirmationText, deletingText, droppedRoles, DUPLICATE_GATE_MESSAGE, EMPTY_MESSAGE,
  emptyTaskForm, fieldRules, GATE_BLANK_MESSAGE, gateDescription, gateEditorTarget, gateFieldText,
  gateLabel, hasGateConflict, headline, INVALID_PERSON_MESSAGE, isGateToggleLocked, isLastVisibleState, isShownChecklist,
  JSON_MAX, MAX_PEOPLE, MODE, modeOptions, panelTitle, parsePeople,
  participantCell, pmCell, resetConfirmationText, savingGateText, savingTaskText, seedGateForm, seedTaskForm,
  serializePeople, taskCandidates, taskNotificationsCell, tasksOfGate, toChecklistPayload,
  toGatePayload, validateForm, visibleGateStates, type ApprovalForm, type GateContext, type GateRow,
} from "./rules";

const WIND = TECHNOLOGY.wind;
const PV = TECHNOLOGY.pv;
const ctx: GateContext = { countryId: COUNTRY_IDS.Germany, countryName: "Germany", technology: WIND };
const rows = () => buildGateRows(FIXTURE_STATES, FIXTURE_TEMPLATES);
const row = (order: number) => rows().find((r) => r.order === order) as GateRow;
const state = (order: number) => FIXTURE_STATES.find((s) => s.order === order)!;

const form = (over: Partial<ApprovalForm> = {}): ApprovalForm => ({
  mode: MODE.OnlyNotifications, gateActive: true, portfolioManager: [], contributors: [],
  approvers: [], notifications: [], checklistId: null, ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("FR-2 country / technology rail (shared M6 picker, Project Gates configuration)", () => {
  it("keeps only the configured countries, in the fixed order, and never Spain/Greece/Romania", () => {
    const rail = pickerCountries([...FIXTURE_COUNTRIES, { id: "x", name: "Greece" }, { id: "y", name: "Romania" }], GATE_COUNTRY_RULE);
    expect(rail.map((c) => c.name)).toEqual(["Germany", "France"]);
    expect(GATE_TECHNOLOGIES.map((t) => t.label)).toEqual(["Wind", "PV"]);
  });

  it("defaults to the first country and its first technology (Germany / Wind) and builds the headline", () => {
    const rail = pickerCountries(FIXTURE_COUNTRIES, GATE_COUNTRY_RULE);
    expect(defaultSelection(rail, GATE_TECHNOLOGIES, GATE_DEFAULT)).toEqual({ countryId: COUNTRY_IDS.Germany, technology: WIND });
    expect(headline(ctx)).toBe("Project Gates | Germany | Wind");
    expect(headline({ countryName: "France", technology: PV })).toBe("Project Gates | France | PV");
    expect(headline(null)).toBe("Project Gates");
    expect(defaultSelection([], GATE_TECHNOLOGIES, GATE_DEFAULT)).toBeUndefined();
  });
});

describe("FR-3 gate rows", () => {
  it("one row per visible state with order < 6, sorted numerically (D-25)", () => {
    const shuffled = [...FIXTURE_STATES].reverse();
    expect(visibleGateStates(shuffled).map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
    const numeric = visibleGateStates([
      { id: "a", name: "A", order: 10, visibleOnChecklist: true, businessUnitId: null },
      { id: "b", name: "B", order: 2, visibleOnChecklist: true, businessUnitId: null },
    ]);
    expect(numeric.map((s) => s.order)).toEqual([2]);
  });

  it("6 placeholders without templates; a saved template replaces its placeholder", () => {
    expect(buildGateRows(FIXTURE_STATES, []).every((r) => r.template === null)).toBe(true);
    const r = rows();
    expect(r).toHaveLength(6);
    expect(r[1]!.template?.id).toBe(FIXTURE_TEMPLATES[0]!.id);
    expect(r[2]!.template).toBeNull();
  });

  it("D-12: duplicates show the first by createdon and are counted", () => {
    const dup = { ...FIXTURE_TEMPLATES[0]!, id: "newer", createdOn: "2025-01-01T00:00:00Z" };
    const r = buildGateRows(FIXTURE_STATES, [dup, ...FIXTURE_TEMPLATES]);
    expect(r[1]!.template?.id).toBe(FIXTURE_TEMPLATES[0]!.id);
    expect(r[1]!.templateCount).toBe(2);
  });
});

describe("FR-4 cell content", () => {
  it("gate descriptions", () => {
    expect(gateDescription(0)).toBe("Draft to Cluster 1");
    expect(gateDescription(3)).toBe("Cluster 3 to Cluster 4");
  });

  it("< 4 lists, ≥ 4 chips, none shows '-'; the tooltip lists everyone", () => {
    const three = participantCell([person(1), person(2), person(3)], "Approvers");
    expect(three.kind).toBe("list");
    const four = participantCell([person(1), person(2), person(3), person(4)], "Approvers");
    expect(four.kind).toBe("chip");
    expect(four.chipText).toBe("4 Approvers");
    expect(four.tooltip.split("\n\n")).toHaveLength(4);
    expect(four.tooltip).toContain("Person 4\n(person4@vsb.energy)");
    expect(participantCell([], "Contributors").kind).toBe("empty");
  });

  it("FR-7 AC3 / D-26c: task Notifications list when all three < 4 or exactly 1 notification", () => {
    const many = [person(1), person(2), person(3), person(4)];
    expect(taskNotificationsCell([], [], [person(5), person(6)]).kind).toBe("list");
    expect(taskNotificationsCell(many, [], [person(5), person(6)]).kind).toBe("chip");
    expect(taskNotificationsCell(many, [], [person(5)]).kind).toBe("list");
    expect(taskNotificationsCell([], [], [person(5), person(6)]).tooltip).not.toContain(";");
  });

  it("PM cell: name, '-' when empty, tooltip 'name, (mail)'", () => {
    const people = { [person(1).entraId.toLowerCase()]: person(1) };
    expect(pmCell(person(1).entraId.toUpperCase(), people)).toEqual({
      text: "Person 1", mail: "person1@vsb.energy", tooltip: "Person 1, (person1@vsb.energy)",
    });
    expect(pmCell(null, people).text).toBe("-");
    expect(pmCell("unknown", people).text).toBe("Unknown user");
  });
});

describe("DR-4 participant JSON codec", () => {
  const canvas = '[{"PersonaKey":"k1","PersonaName":"Anna Müller","PersonaRole":"anna@vsb.energy"}]';

  it("round-trips a canvas value unchanged, keys in canvas order", () => {
    expect(serializePeople(parsePeople(canvas))).toBe(canvas);
    expect(parsePeople(canvas)).toEqual([{ entraId: "k1", name: "Anna Müller", mail: "anna@vsb.energy" }]);
  });

  it("empty list serialises to null, never []", () => {
    expect(serializePeople([])).toBeNull();
  });

  it("null / blank → []; malformed → [] with a warning, no throw", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parsePeople(null)).toEqual([]);
    expect(parsePeople("  ")).toEqual([]);
    expect(parsePeople("{oops")).toEqual([]);
    expect(parsePeople('{"PersonaKey":"x"}')).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("FR-5 gate toggle lock (D-19)", () => {
  it("locked for Draft, placeholders and rows without participants", () => {
    expect(isGateToggleLocked(row(0))).toBe(true);
    expect(isGateToggleLocked(row(2))).toBe(true);
    expect(isGateToggleLocked(row(1))).toBe(false);
    const empty = { ...row(1), template: { ...row(1).template!, contributors: null, approvals: null, notifications: null } };
    expect(isGateToggleLocked(empty)).toBe(true);
  });
});

describe("FR-7 / FR-9 / FR-12 checklist tasks", () => {
  const data = fixtureDataset();

  it("tasks of a gate only, sorted by checklist order", () => {
    expect(tasksOfGate(data, state(1)).map((t) => t.checklist.name)).toEqual(["Grid connection request"]);
    expect(tasksOfGate(data, state(2))).toEqual([]);
    const both = { ...data, approvals: [...FIXTURE_APPROVALS, { ...FIXTURE_APPROVALS[0]!, id: "a2", checklistId: FIXTURE_CHECKLISTS[0]!.id }] };
    expect(tasksOfGate(both, state(1)).map((t) => t.checklist.order)).toEqual([1, 2]);
  });

  it("candidates = tasks of THIS gate without an approval; Add Task enablement", () => {
    expect(taskCandidates(data, state(1)).map((c) => c.name)).toEqual(["Land lease signed"]);
    expect(canAddTask(data, state(1))).toBe(true);
    expect(canAddTask(data, state(3))).toBe(false);
    const full = { ...data, approvals: [...FIXTURE_APPROVALS, { ...FIXTURE_APPROVALS[0]!, id: "a2", checklistId: FIXTURE_CHECKLISTS[0]!.id }] };
    expect(canAddTask(full, state(1))).toBe(false);
  });
});

describe("FR-11 / FR-12 editor seeding (D-04, D-05)", () => {
  const people = fixtureDataset().people;

  it("gate form comes from that row only; PM pre-selected with name and mail", () => {
    const f = seedGateForm(row(1), people);
    expect(f.mode).toBe(MODE.Formal);
    expect(f.portfolioManager).toEqual([person(1)]);
    expect(f.approvers).toHaveLength(4);
  });

  it("placeholder defaults: Only Notifications, active, empty lists", () => {
    expect(seedGateForm(row(2), people)).toEqual(form({ gateActive: true }));
  });

  it("task edit seeds from the task (including PM); create is fresh with first candidate", () => {
    const task = tasksOfGate(fixtureDataset(), state(1))[0]!;
    const withPm = { ...task, approval: { ...task.approval, pmId: person(1).entraId } };
    const f = seedTaskForm(withPm, people);
    expect(f).toMatchObject({ mode: MODE.Local, gateActive: false, checklistId: task.checklist.id });
    expect(f.portfolioManager).toEqual([person(1)]);
    expect(emptyTaskForm(taskCandidates(fixtureDataset(), state(1)))).toEqual(
      form({ gateActive: false, checklistId: FIXTURE_CHECKLISTS[0]!.id }),
    );
    expect(emptyTaskForm([]).checklistId).toBeNull();
  });

  it("panel titles", () => {
    expect(panelTitle({ kind: "gate", row: row(1), label: "x" })).toBe("Edit Approvers");
    expect(panelTitle({ kind: "gate", row: row(2), label: "x" })).toBe("Add Approvers");
    expect(panelTitle({ kind: "task", mode: "create", row: row(1), label: "x", candidates: [] })).toBe("Add Approvers");
    expect(panelTitle({ kind: "task", mode: "edit", row: row(1), label: "x", candidates: [] })).toBe("Edit Approvers");
  });
});

describe("FR-13 gate label", () => {
  it("'{state} to {next}', null when next is terminal or missing", () => {
    expect(gateLabel(FIXTURE_STATES, state(0))).toBe("Draft to Cluster 1");
    expect(gateLabel(FIXTURE_STATES, state(6))).toBeNull();
    expect(gateLabel(FIXTURE_STATES, state(7))).toBeNull();
  });
});

describe("FR-14 / FR-15 approval mode matrix", () => {
  it("Wind/PV offer all modes, others only Only Notifications", () => {
    expect(modeOptions(WIND)).toHaveLength(3);
    expect(modeOptions(PV)).toHaveLength(3);
    expect(modeOptions(TECHNOLOGY.bess).map((o) => o.value)).toEqual([MODE.OnlyNotifications]);
  });

  it.each([
    [MODE.Formal, [true, true], [true, true], [true, true], [true, false]],
    [MODE.Local, [false, false], [false, false], [true, true], [true, false]],
    [MODE.OnlyNotifications, [false, false], [false, false], [false, false], [true, true]],
  ])("mode %s → visibility/required", (mode, pm, contributors, approvers, notifications) => {
    const r = fieldRules(mode);
    expect([r.portfolioManager.visible, r.portfolioManager.required]).toEqual(pm);
    expect([r.contributors.visible, r.contributors.required]).toEqual(contributors);
    expect([r.approvers.visible, r.approvers.required]).toEqual(approvers);
    expect([r.notifications.visible, r.notifications.required]).toEqual(notifications);
  });

  it("max people 1 / 20 / 5 / 20", () => {
    expect(MAX_PEOPLE).toEqual({ portfolioManager: 1, contributors: 20, approvers: 5, notifications: 20 });
  });
});

describe("FR-16 validation and Save enablement (D-06, D-07, D-11)", () => {
  const gate = { kind: "gate" as const, gateLabel: "Cluster 1 to Cluster 2" };

  it("required-but-empty fields say 'Value cannot be empty.' and block Save", () => {
    const e = validateForm(form({ mode: MODE.Formal }), gate);
    expect(e).toMatchObject({ portfolioManager: EMPTY_MESSAGE, contributors: EMPTY_MESSAGE, approvers: EMPTY_MESSAGE });
    expect(e.notifications).toBeUndefined();
    expect(canSave(e)).toBe(false);
    expect(validateForm(form(), gate).notifications).toBe(EMPTY_MESSAGE);
    expect(canSave(validateForm(form({ notifications: [person(1)] }), gate))).toBe(true);
  });

  it("task editor without a Check List cannot save, with the corrected wording", () => {
    const e = validateForm(form({ notifications: [person(1)] }), { kind: "task", gateLabel: "x" });
    expect(e.checklist).toBe(CHECKLIST_BLANK_MESSAGE);
    expect(CHECKLIST_BLANK_MESSAGE).not.toMatch(/cluster/i);
    expect(canSave(e)).toBe(false);
  });

  it("blank gate blocks Save (canvas only displayed it)", () => {
    expect(validateForm(form({ notifications: [person(1)] }), { kind: "gate", gateLabel: null }).gate).toBe(GATE_BLANK_MESSAGE);
  });

  it("serialised JSON over the column length blocks Save (1000 task / 4000 gate)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...person(i), name: `A rather long display name ${i}` }));
    expect(serializePeople(many)!.length).toBeGreaterThan(JSON_MAX.task);
    expect(serializePeople(many)!.length).toBeLessThan(JSON_MAX.gate);
    const task = validateForm(form({ notifications: many, checklistId: "c" }), { kind: "task", gateLabel: "x" });
    expect(task.notifications).toMatch(/column holds 1000/);
    expect(canSave(validateForm(form({ notifications: many }), gate))).toBe(true);
  });

  describe("R2-3: legacy lists already over MAX_PEOPLE", () => {
    const approvers = (n: number) => Array.from({ length: n }, (_, i) => person(i + 10));
    const legacy = form({ mode: MODE.Formal, portfolioManager: [person(1)], contributors: [person(2)], approvers: approvers(6), notifications: [person(3)] });
    const max = `At most ${MAX_PEOPLE.approvers} people can be selected.`;

    it("unchanged over-limit list re-saves", () => {
      const e = validateForm(legacy, { ...gate, initial: legacy });
      expect(e.approvers).toBeUndefined();
      expect(canSave(e)).toBe(true);
    });

    it("reduced (still over-limit) list re-saves", () => {
      expect(validateForm({ ...legacy, approvers: approvers(5) }, { ...gate, initial: legacy }).approvers).toBeUndefined();
      const stillOver = { ...legacy, approvers: approvers(7) };
      const reduced = validateForm({ ...stillOver, approvers: approvers(6) }, { ...gate, initial: stillOver });
      expect(reduced.approvers).toBeUndefined();
      expect(canSave(reduced)).toBe(true);
    });

    it("increased over-limit list blocks Save with the existing message", () => {
      const e = validateForm({ ...legacy, approvers: approvers(7) }, { ...gate, initial: legacy });
      expect(e.approvers).toBe(max);
      expect(canSave(e)).toBe(false);
      // A fresh record (no seed, or seeded within the limit) still blocks anything over the limit.
      expect(validateForm(legacy, gate).approvers).toBe(max);
      expect(validateForm(legacy, { ...gate, initial: { ...legacy, approvers: approvers(2) } }).approvers).toBe(max);
    });
  });

  it("uniqueness: creating while another template exists is a conflict; editing the shown one is not", () => {
    expect(hasGateConflict(undefined, row(1), FIXTURE_TEMPLATES)).toBe(true);
    expect(hasGateConflict(undefined, row(2), FIXTURE_TEMPLATES)).toBe(false);
    expect(hasGateConflict(FIXTURE_TEMPLATES[0]!.id, row(1), FIXTURE_TEMPLATES)).toBe(false);
    expect(validateForm(form({ notifications: [person(1)] }), { ...gate, conflict: true }).main).toBe(DUPLICATE_GATE_MESSAGE);
  });

  it("D-18: warns which saved roles a mode change will clear", () => {
    const before = form({ mode: MODE.Formal, portfolioManager: [person(1)], contributors: [person(2)], approvers: [person(3)] });
    expect(droppedRoles(before, { ...before, mode: MODE.Local })).toEqual(["portfolioManager", "contributors"]);
    expect(droppedRoles(before, { ...before, mode: MODE.OnlyNotifications })).toEqual(["portfolioManager", "contributors", "approvers"]);
    expect(droppedRoles(before, before)).toEqual([]);
  });
});

describe("DR-6 gate payload", () => {
  const people = { pm: [person(1)], c: [person(2)], a: [person(3)], n: [person(4)] };
  const full = (mode: ApprovalForm["mode"], gateActive = false) => form({
    mode, gateActive, portfolioManager: people.pm, contributors: people.c, approvers: people.a, notifications: people.n,
  });

  it.each([
    [MODE.Formal, true, true, true],
    [MODE.Local, false, false, true],
    [MODE.OnlyNotifications, false, false, false],
  ])("mode %s × Draft/non-Draft", (mode, hasPm, hasContributors, hasApprovals) => {
    for (const order of [0, 2]) {
      const p = toGatePayload(full(mode), { countryId: COUNTRY_IDS.Germany, technology: PV, state: state(order), label: "L", isCreate: false });
      expect(p.vsb_gateactive).toBe(order === 0);
      expect(p["vsb_Approvalparticipant1@odata.bind"]).toBe(hasPm ? `/aadusers(${person(1).entraId})` : null);
      expect(p.vsb_defaultcontributors !== null).toBe(hasContributors);
      expect(p.vsb_defaultapprovals !== null).toBe(hasApprovals);
      expect(p.vsb_defaultnotifications).toBe(serializePeople(people.n));
      expect(p).toMatchObject({
        vsb_name: "L", vsb_approvalmodecode: mode, vsb_technologycode: 952850001,
        "vsb_ApprovalsCountry@odata.bind": `/vsb_countries(${COUNTRY_IDS.Germany})`,
        "vsb_ClusterState@odata.bind": `/vsb_projectstates(${state(order).id})`,
        "owningbusinessunit@odata.bind": `/businessunits(${BU_ID})`,
      });
      expect(p).not.toHaveProperty("statecode");
    }
  });

  it("create adds statecode 0, omits a null PM bind and uses ' ' for a blank name", () => {
    const p = toGatePayload(form({ notifications: [person(1)] }), { countryId: COUNTRY_IDS.Germany, technology: WIND, state: state(1), label: null, isCreate: true });
    expect(p.statecode).toBe(0);
    expect(p.vsb_name).toBe(" ");
    expect(p).not.toHaveProperty("vsb_Approvalparticipant1@odata.bind");
    expect(p.vsb_defaultnotifications).toBe(serializePeople([person(1)]));
  });
});

describe("DR-7 task payload (D-17 names)", () => {
  const checklist = FIXTURE_CHECKLISTS[0]!;
  it.each([MODE.Formal, MODE.Local, MODE.OnlyNotifications])("mode %s", (mode) => {
    const f = form({ mode, gateActive: false, portfolioManager: [person(1)], contributors: [person(2)], approvers: [person(3)] });
    const p = toChecklistPayload(f, { checklist, state: state(1), isCreate: false });
    expect(p).toMatchObject({
      vsb_name: checklist.name, vsb_gateisactive: false, vsb_approvalmodecode: mode,
      "vsb_ProjectDefaultCheckListId@odata.bind": `/vsb_projectdefaultchecklistses(${checklist.id})`,
      "owningbusinessunit@odata.bind": `/businessunits(${BU_ID})`,
    });
    expect(p).toHaveProperty("vsb_defaultapprovers");
    expect(p).not.toHaveProperty("vsb_defaultapprovals");
    expect(p).not.toHaveProperty("vsb_gateactive");
    expect(p["vsb_PortfolioManagerId@odata.bind"]).toBe(mode === MODE.Formal ? `/aadusers(${person(1).entraId})` : null);
    expect(p.vsb_defaultapprovers !== null).toBe(mode !== MODE.OnlyNotifications);
    expect(p.vsb_defaultnotifications).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════════ gap closure (08) ══ */

describe("G-2 / B1 blank gate label", () => {
  /** States where Cluster 1's next state is terminal, so gate 1 has no label. */
  const terminal = FIXTURE_STATES.map((s) => (s.order === 2 ? { ...s, name: "Abandoned" } : s));
  const valid = form({ notifications: [person(1)], checklistId: FIXTURE_CHECKLISTS[0]!.id });

  it("a null label does NOT block the task editor (its payload never uses the label)", () => {
    expect(gateLabel(terminal, state(1))).toBeNull();
    const e = validateForm(valid, { kind: "task", gateLabel: null });
    expect(e.gate).toBeUndefined();
    expect(canSave(e)).toBe(true);
    // The task payload is complete without a label.
    const p = toChecklistPayload(valid, { checklist: FIXTURE_CHECKLISTS[0]!, state: state(1), isCreate: true });
    expect(p.vsb_name).toBe(FIXTURE_CHECKLISTS[0]!.name);
  });

  it("a null label still blocks the gate editor (vsb_name would be blank)", () => {
    const e = validateForm(form({ notifications: [person(1)] }), { kind: "gate", gateLabel: null });
    expect(e.gate).toBe(GATE_BLANK_MESSAGE);
    expect(canSave(e)).toBe(false);
  });

  it("FR-13: the Gate field shows the label; the task editor falls back to the gate description", () => {
    const r = row(1);
    expect(gateFieldText({ kind: "gate", row: r, label: "Cluster 1 to Cluster 2" })).toBe("Cluster 1 to Cluster 2");
    expect(gateFieldText({ kind: "gate", row: r, label: null })).toBe("");
    expect(gateFieldText({ kind: "task", mode: "create", row: r, label: null, candidates: [] })).toBe("Cluster 1 to Cluster 2");
    expect(gateLabel(FIXTURE_STATES, state(5))).toBe("Cluster 5 to Cluster 6");
    // Numeric order (D-25): "Cluster 10" is not the "next" of "Cluster 1".
    const ten = [...FIXTURE_STATES, { id: "s10", name: "Cluster 10", order: 10, visibleOnChecklist: true, businessUnitId: null }];
    expect(gateLabel(ten, state(1))).toBe("Cluster 1 to Cluster 2");
  });
});

describe("Parity round 1 (09-parity-check-r1)", () => {
  it("GAP-1: task Notifications — ';' between listed people in the cell, none in the tooltip (PGAS:1398-1402, 1423-1427)", () => {
    const c = taskNotificationsCell([], [], [person(5), person(6)]);
    expect(c.listSeparator).toBe(";");
    expect(c.tooltip).toBe("Person 5\n(person5@vsb.energy)\n\nPerson 6\n(person6@vsb.energy)");
    expect(participantCell([person(1)], "Approvers").listSeparator).toBe("");
    expect(participantCell([person(1)], "Notifications").listSeparator).toBe("");
  });

  it("GAP-3: Contributors tooltip joins with ';\\n\\n'; Approvers / Notifications with '\\n\\n'", () => {
    const two = [person(1), person(2)];
    expect(participantCell(two, "Contributors").tooltip).toBe("Person 1\n(person1@vsb.energy);\n\nPerson 2\n(person2@vsb.energy)");
    expect(participantCell(two, "Approvers").tooltip).toBe("Person 1\n(person1@vsb.energy)\n\nPerson 2\n(person2@vsb.energy)");
    expect(participantCell(two, "Notifications").tooltip).not.toContain(";");
    expect(participantCell(two, "Contributors").listSeparator).toBe("");
  });

  it("GAP-5: a legacy '[]' participant value keeps the gate pill clickable (IsBlank on raw text)", () => {
    const base = row(1).template!;
    const withEmptyArray = { ...row(1), template: { ...base, contributors: "[]", approvals: null, notifications: null } };
    expect(isGateToggleLocked(withEmptyArray)).toBe(false);
    const allBlank = { ...row(1), template: { ...base, contributors: "", approvals: null, notifications: null } };
    expect(isGateToggleLocked(allBlank)).toBe(true);
    // Draft and placeholders stay locked whatever the text.
    expect(isGateToggleLocked({ ...row(0), template: { ...row(0).template!, contributors: "[]" } })).toBe(true);
  });

  describe("GAP-6: the highest visible state has no label (PGAS:2705-2717)", () => {
    /** Visible 0..5 only: order 5 is the last visible state and a gate row. */
    const upTo5 = FIXTURE_STATES.map((s) => (s.order === 6 ? { ...s, visibleOnChecklist: false } : s));
    const s5 = upTo5.find((s) => s.order === 5)!;
    const gate5 = buildGateRows(upTo5, FIXTURE_TEMPLATES).find((r) => r.order === 5)!;

    it("no label for the last visible state; earlier gates keep theirs", () => {
      expect(isLastVisibleState(upTo5, s5)).toBe(true);
      expect(gateLabel(upTo5, s5)).toBeNull();
      expect(gateLabel(upTo5, upTo5.find((s) => s.order === 4)!)).toBe("Cluster 4 to Cluster 5");
      // With Cluster 6 visible, Cluster 5 is not last and keeps its label.
      expect(isLastVisibleState(FIXTURE_STATES, state(5))).toBe(false);
      expect(gateLabel(FIXTURE_STATES, state(5))).toBe("Cluster 5 to Cluster 6");
      // A non-visible state is never in the canvas list.
      expect(gateLabel(FIXTURE_STATES, state(7))).toBeNull();
    });

    it("Save stays possible and writes vsb_name ' ', as the canvas Coalesce(Label, ' ') does (PGAS:3731)", () => {
      const target = gateEditorTarget(upTo5, gate5);
      expect(target).toMatchObject({ label: null, blankLabelAllowed: true });
      const f = form({ notifications: [person(1)] });
      const e = validateForm(f, { kind: "gate", gateLabel: target.label, blankLabelAllowed: target.blankLabelAllowed });
      expect(e.gate).toBeUndefined();
      expect(canSave(e)).toBe(true);
      expect(gateFieldText(target)).toBe("");
      const p = toGatePayload(f, { countryId: COUNTRY_IDS.Germany, technology: WIND, state: s5, label: target.label, isCreate: true });
      expect(p.vsb_name).toBe(" ");
    });

    it("G-2 unchanged: a terminal next state (not last visible) is still blocked", () => {
      const terminal = FIXTURE_STATES.map((s) => (s.order === 2 ? { ...s, name: "Abandoned" } : s));
      const target = gateEditorTarget(terminal, row(1));
      expect(target).toMatchObject({ label: null, blankLabelAllowed: false });
      expect(validateForm(form({ notifications: [person(1)] }), { kind: "gate", gateLabel: null, blankLabelAllowed: false }).gate)
        .toBe(GATE_BLANK_MESSAGE);
    });
  });
});

describe("G-4 / B4 inactive and 'To Delete' checklist tasks", () => {
  const hiddenApprovals = HIDDEN_CHECKLISTS.map((c, i) => ({ ...FIXTURE_APPROVALS[0]!, id: `hidden-${i}`, checklistId: c.id }));
  const data = fixtureDataset({ checklists: [...FIXTURE_CHECKLISTS, ...HIDDEN_CHECKLISTS] });

  it("isShownChecklist = active and not To Delete", () => {
    expect(isShownChecklist({ active: true, toDelete: false })).toBe(true);
    expect(isShownChecklist({ active: false, toDelete: false })).toBe(false);
    expect(isShownChecklist({ active: true, toDelete: true })).toBe(false);
  });

  it("hidden tasks are neither nested rows nor Add Task candidates", () => {
    const withApprovals = { ...data, approvals: [...FIXTURE_APPROVALS, ...hiddenApprovals] };
    expect(tasksOfGate(withApprovals, state(1)).map((t) => t.checklist.name)).toEqual(["Grid connection request"]);
    expect(taskCandidates(data, state(1)).map((c) => c.name)).toEqual(["Land lease signed"]);
  });

  it("a gate whose only free tasks are hidden cannot Add Task", () => {
    const onlyHidden = fixtureDataset({
      checklists: [FIXTURE_CHECKLISTS[1]!, ...HIDDEN_CHECKLISTS],
      approvals: FIXTURE_APPROVALS,
    });
    expect(canAddTask(onlyHidden, state(1))).toBe(false);
  });
});

describe("B8 / B14 / DR-5 lookup binds", () => {
  it("bind ids are validated and normalised with guid()", () => {
    expect(bindPath("businessunits", `{${BU_ID.toUpperCase()}}`)).toBe(`/businessunits(${BU_ID})`);
    expect(() => bindPath("aadusers", "legacy-key")).toThrow(/Not a GUID/);
  });

  it("a non-GUID Portfolio Manager is a field error, so Save is blocked before any write", () => {
    const bad = { entraId: "legacy-key", name: "Old", mail: "" };
    const e = validateForm(form({ mode: MODE.Formal, portfolioManager: [bad], contributors: [person(2)], approvers: [person(3)] }), { kind: "gate", gateLabel: "x" });
    expect(e.portfolioManager).toBe(INVALID_PERSON_MESSAGE);
    // Hidden by the mode → not written → not an error.
    expect(validateForm(form({ portfolioManager: [bad], notifications: [person(1)] }), { kind: "gate", gateLabel: "x" }).portfolioManager).toBeUndefined();
  });

  it("owning-BU bind is lower case on both tables (shared OWNING_BU_BIND; CLDA pending G-1)", () => {
    expect(OWNING_BU_BIND).toBe("owningbusinessunit@odata.bind");
    const t = toChecklistPayload(form({ notifications: [person(1)] }), { checklist: FIXTURE_CHECKLISTS[0]!, state: state(1), isCreate: true });
    expect(Object.keys(t)).toContain("owningbusinessunit@odata.bind");
    const g = toGatePayload(form({ notifications: [person(1)] }), { countryId: COUNTRY_IDS.Germany, technology: WIND, state: state(1), label: "L", isCreate: true });
    expect(Object.keys(g)).toContain("owningbusinessunit@odata.bind");
    const noBu = { ...state(1), businessUnitId: null };
    expect(toGatePayload(form(), { countryId: COUNTRY_IDS.Germany, technology: WIND, state: noBu, label: "L", isCreate: true }))
      .not.toHaveProperty("owningbusinessunit@odata.bind");
  });
});

describe("FR-6 / G-9 collapse key", () => {
  it("differs per country and technology, stable per gate", () => {
    const de = { countryId: COUNTRY_IDS.Germany, technology: WIND };
    expect(collapseKey(de, 2)).toBe(collapseKey({ ...de, countryId: COUNTRY_IDS.Germany.toUpperCase() }, 2));
    expect(collapseKey(de, 2)).not.toBe(collapseKey({ ...de, technology: PV }, 2));
    expect(collapseKey(de, 2)).not.toBe(collapseKey({ countryId: COUNTRY_IDS.France, technology: WIND }, 2));
    expect(collapseKey(de, 2)).not.toBe(collapseKey(de, 3));
  });

  it("collapseScope + '|' + order is the collapse key (the shared useToggleSet scope)", () => {
    const de = { countryId: COUNTRY_IDS.Germany.toUpperCase(), technology: WIND };
    expect(`${collapseScope(de)}|${String(2)}`).toBe(collapseKey(de, 2));
    expect(`${collapseScope(null)}|0`).toBe(collapseKey(null, 0));
    expect(collapseScope(de)).not.toBe(collapseScope({ ...de, technology: PV }));
  });
});

describe("messages", () => {
  it("loading, delete and confirmation texts name the right item (D-10)", () => {
    expect(savingGateText(ctx, "Draft to Cluster 1")).toBe(
      "Approvals data for Project Gates | Germany | Wind\nGate: 'Draft to Cluster 1' will be saved, please wait...",
    );
    expect(savingTaskText(ctx, "Permit")).toContain("Check List: 'Permit' will be saved");
    expect(deletingText(ctx, "Permit")).toContain("Check List: 'Permit' being deleted");
    expect(deleteConfirmationText(ctx, "Cluster 1 to Cluster 2", "Permit")).toBe(
      "Are you sure you want to execute the deletion?\n\nGermany - Wind\nCluster 1 to Cluster 2\nCheck List Item: 'Permit'",
    );
  });

  it("the reset confirmation names the country and the technology LABEL (never the code)", () => {
    expect(resetConfirmationText({ ...ctx, technology: PV }, "Cluster 1 to Cluster 2")).toContain("Germany - PV\nGate: 'Cluster 1 to Cluster 2'");
  });
  // Failed-action text is the shared `userErrorText` (M11), covered by `platform/userMessage.test.ts`
  // and asserted on the screen (`Screen.test.tsx`).
});
