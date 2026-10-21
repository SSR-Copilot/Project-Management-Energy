/**
 * Admin Project Gates Approvals Screen — unit tests (UT-ADGATE-nnn).
 *
 * Pure functions only; the write PLAN is asserted, which is where the behaviour lives.
 * Redeveloped 19 Oct 2026 (D22): tests that pinned behaviour the canvas does not have were
 * rewritten (001d, 010, 019b, 021, 025, 033*, 035*), and 037–052 cover the fixes.
 */
import { describe, it, expect } from "vitest";
import { CHOICE_PROCESS, CHOICE_ADMIN } from "@/data/dataverseNames";
import {
  MSG, APPROVAL_MODE, APPROVAL_MODE_OPTIONS, PANEL_LABELS, SCREEN_LABELS, GATE_TABLE_COLUMNS,
  GATE_APPROVAL_COL, CHECKLIST_APPROVAL_COL, GATE_NAV, CHECKLIST_NAV, OWNING_BU_BIND,
  GATE_ENTITY_SET, CHECKLIST_APPROVAL_ENTITY_SET, ENTRA_COL, PERSON_LIMITS, PICKER_TOOLTIPS,
  COUNTRY_PICKER_ORDER, PICKER_EXCLUDED_COUNTRIES, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  buildCountryPicker, technologyValue, technologyLabel, isWindOrPv,
  parsePersonaList, serialisePersonaList, applyPersonaSelection, pickerSuggestions,
  configurableGates, mergeGatesWithApprovals, gateDropdownItems, gateTransitionLabel,
  gateRecordName, gateDropdownItemFor, gateDescription, approvalModeChoices, approvalModeLabel,
  defaultApprovalMode, nonWindPvBanner, resolveGateActive, canToggleGateActiveInPanel,
  canToggleGateChip, panelTitle, validatePanel, hasErrors, canSavePanel, panelErrorMessages,
  personaFieldsForMode, buildGatePayload, buildChecklistPayload, planSaveApproval,
  planToggleGateActive, planToggleChecklistActive, planDeleteChecklistApproval, planResetGate,
  canResetGate, checklistApprovalsForGate, checklistOptions, canAddChecklistApproval,
  canAddChecklistApprovalCanvasParity, shouldSearchPeople, entraSearchFilter,
  PERSON_UNSET, formatPersona, personListCell, checklistNotificationsCell,
  gatePortfolioManagerCell, checklistPortfolioManagerCell,
  countryRailKey, techRailKey, parseTechRailKey, buildGateCountryRailItems, buildGateTableRows,
  savingGateText, savingChecklistText, deletingChecklistText, saveErrorText,
  deleteChecklistApprovalText, gatesHeadline, toNestedPicker,
  type GateState, type GateApproval, type ChecklistApproval, type ChecklistItem,
  type ApprovalPanelState, type Persona, type Scope,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const state = (o: Partial<GateState> = {}): GateState => ({
  id: "g1", name: "Cluster 1", order: 1, isVisibleOnChecklist: true,
  owningBusinessUnitId: "bu-1", ...o,
});

const approval = (o: Partial<GateApproval> = {}): GateApproval => ({
  id: "a1", name: "Cluster 1 to Cluster 2", approvalMode: APPROVAL_MODE.formalApproval,
  gateActive: true, clusterStateId: "g1", countryId: "de",
  technology: CHOICE_ADMIN.technology.wind, portfolioManagerId: "pm-1",
  defaultApprovals: "[]", defaultContributors: "[]", defaultNotifications: "[]",
  ...o,
});

const persona = (n: string): Persona => ({
  id: `id-${n}`, displayName: `Name ${n}`, mail: `${n}@vsb.energy`,
});

const scope = (o: Partial<Scope> = {}): Scope => ({
  country: { id: "de", name: "Germany" }, technology: "Wind", ...o,
});

const panel = (o: Partial<ApprovalPanelState> = {}): ApprovalPanelState => ({
  kind: "gate", gate: state(), checklistItem: null,
  mode: APPROVAL_MODE.formalApproval,
  portfolioManager: persona("pm"), contributors: [persona("c")],
  approvers: [persona("a")], notifications: [persona("n")],
  gateActive: true, existingId: null,
  ...o,
});

const item = (o: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: "i1", name: "Permit", order: 1, countryTechId: "sc-de-wind", clusterStateId: "g1", ...o,
});

const clApproval = (o: Partial<ChecklistApproval> = {}): ChecklistApproval => ({
  id: "ca1", name: "Permit", approvalMode: APPROVAL_MODE.formalApproval, gateActive: true,
  projectDefaultChecklistId: "i1", portfolioManagerId: null,
  defaultApprovers: "[]", defaultContributors: null, defaultNotifications: null, ...o,
});

const fiveStates: GateState[] = [1, 2, 3, 4, 5].map((n) =>
  state({ id: `g${n}`, name: `Cluster ${n}`, order: n }));

const NOBODY = (): Persona | null => null;

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission", () => {
  it("UT-ADGATE-001 without the admin rule every plan refuses; nothing is written", () => {
    const plan = planSaveApproval(panel(), scope(), { canEdit: false, gateLabel: "Cluster 1 to Cluster 2" });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.noPermission);
    expect(planDeleteChecklistApproval(clApproval(), false).refusedReason).toBe(MSG.noPermission);
    expect(planToggleChecklistActive(clApproval(), false).refusedReason).toBe(MSG.noPermission);
    expect(planResetGate(panel({ existingId: "a1" }), false).refusedReason).toBe(MSG.noPermission);
  });
});

/* ══════════════════════════════════════════════════ the picker literals ════ */

describe("the hard-coded country/technology picker", () => {
  it("UT-ADGATE-001c the technology nesting can never produce BESS, Hydro or Substation", () => {
    expect(PICKER_TECHNOLOGIES).toEqual(["Wind", "PV"]);
    const items = buildCountryPicker([{ id: "de", name: "Germany" }, { id: "fr", name: "France" }]);
    expect(items.every((c) => c.technologies.length === 2)).toBe(true);
    expect(technologyValue("BESS")).toBe(CHOICE_ADMIN.technology.bess);
    expect(technologyValue("Hydrogen")).toBe(CHOICE_ADMIN.technology.hydrogen);
  });

  it("UT-ADGATE-001d the Gates rail excludes Spain, Greece and Romania, as the canvas does", () => {
    const countries = [
      { id: "fr", name: "France" }, { id: "de", name: "Germany" }, { id: "es", name: "Spain" },
      { id: "gr", name: "Greece" }, { id: "ro", name: "Romania" },
    ];
    expect(PICKER_EXCLUDED_COUNTRIES).toEqual(["Spain", "Greece", "Romania"]);
    expect(COST_CONTRACT_EXCLUDED_COUNTRIES).toBe(PICKER_EXCLUDED_COUNTRIES);
    expect(buildGateCountryRailItems(countries).map((c) => c.label)).toEqual(["Germany", "France"]);
    expect(COUNTRY_PICKER_ORDER.Germany).toBe(1);
  });

  it("UT-ADGATE-001e technology labels round-trip, case-insensitively", () => {
    expect(technologyValue("wind")).toBe(CHOICE_ADMIN.technology.wind);
    expect(technologyLabel(CHOICE_ADMIN.technology.pv)).toBe("PV");
    expect(technologyValue(null)).toBeNull();
    expect(technologyValue("")).toBeNull();
    expect(isWindOrPv("Wind")).toBe(true);
    expect(isWindOrPv("BESS")).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════ the gate list ════ */

describe("the gate list", () => {
  it("UT-ADGATE-002 all five gates render, gaps flagged as placeholders", () => {
    const merged = mergeGatesWithApprovals(fiveStates, [
      approval({ id: "a1", clusterStateId: "g1" }),
      approval({ id: "a3", clusterStateId: "g3" }),
    ]);
    expect(merged).toHaveLength(5);
    expect(merged.map((m) => m.isPlaceholder)).toEqual([false, true, false, true, true]);
    expect(merged[1]!.approval).toBeNull();
  });

  it("UT-ADGATE-003 gates with Order >= 6 are excluded", () => {
    const withSix = [...fiveStates, state({ id: "g6", name: "Cluster 6", order: 6 })];
    expect(configurableGates(withSix).map((g) => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5"]);
  });

  it("UT-ADGATE-028 a scope with no approvals renders five placeholders whose chips are off", () => {
    const merged = mergeGatesWithApprovals(fiveStates, []);
    expect(merged.every((m) => m.isPlaceholder)).toBe(true);
    expect(merged.every((m) => canToggleGateChip(m) === false)).toBe(true);
  });

  it("UT-ADGATE-037 a duplicate row for a gate: the FIRST one wins (canvas LookUp)", () => {
    const merged = mergeGatesWithApprovals(fiveStates, [
      approval({ id: "first", clusterStateId: "g2" }),
      approval({ id: "second", clusterStateId: "g2" }),
    ]);
    expect(merged[1]!.approval?.id).toBe("first");
  });

  it("UT-ADGATE-038 the gate description is the canvas Switch on Order", () => {
    expect(gateDescription(0)).toBe("Draft to Cluster 1");
    expect(gateDescription(1)).toBe("Cluster 1 to Cluster 2");
    expect(gateDescription(4)).toBe("Cluster 4 to Cluster 5");
  });
});

/* ═══════════════════════════════════════════════════════ the gate dropdown ════ */

describe("the gate dropdown (a transition list, not a state list)", () => {
  it("UT-ADGATE-007 the label is a transition; a blank label becomes \" \"", () => {
    const items = gateDropdownItems([
      state({ id: "g1", name: "Cluster 1", order: 1 }),
      state({ id: "g2", name: "Cluster 2", order: 2 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Cluster 1 to Cluster 2");
    expect(items[0]!.name).toBe("Cluster 1");
    expect(gateTransitionLabel(state({ name: "Draft" }), state({ name: "Cluster 1" }))).toBe("Draft to Cluster 1");
    expect(gateRecordName(items[0]!)).toBe("Cluster 1 to Cluster 2");
    expect(gateRecordName(null)).toBe(" ");
    expect(gateDropdownItemFor(items, "g1")).toBe(items[0]);
    expect(gateDropdownItemFor(items, "g2")).toBeNull();
  });

  it("UT-ADGATE-008 transitions into Abandoned or Inactive/ On-hold are excluded", () => {
    const items = gateDropdownItems([
      state({ id: "g1", name: "Cluster 1", order: 1 }),
      state({ id: "g2", name: "Abandoned", order: 2 }),
      state({ id: "g3", name: "Cluster 3", order: 3 }),
      state({ id: "g4", name: "Inactive/ On-hold", order: 4 }),
      state({ id: "g5", name: "Cluster 5", order: 5 }),
    ]);
    expect(items.map((i) => i.label)).toEqual(["Abandoned to Cluster 3", "Inactive/ On-hold to Cluster 5"]);
  });

  it("UT-ADGATE-009 the last visible state produces no transition", () => {
    expect(gateDropdownItems(fiveStates)).toHaveLength(4);
  });

  it("UT-ADGATE-039 the next state is looked up over ALL states, visible or not", () => {
    const items = gateDropdownItems([
      state({ id: "g1", name: "Cluster 1", order: 1 }),
      state({ id: "gx", name: "Hidden Step", order: 2, isVisibleOnChecklist: false }),
      state({ id: "g3", name: "Cluster 3", order: 3 }),
    ]);
    expect(items.map((i) => i.label)).toEqual(["Cluster 1 to Hidden Step"]);
  });
});

/* ══════════════════════════════════════════════════════════ mode and gating ════ */

describe("approval mode and gate activity", () => {
  it("UT-ADGATE-005 the choices are limited to Only Notifications for BESS", () => {
    expect(approvalModeChoices("BESS")).toEqual([APPROVAL_MODE.onlyNotifications]);
    expect(approvalModeChoices(null)).toEqual([APPROVAL_MODE.onlyNotifications]);
  });

  it("UT-ADGATE-006 all three choices are offered for Wind and PV", () => {
    expect(approvalModeChoices("Wind")).toEqual([
      APPROVAL_MODE.formalApproval, APPROVAL_MODE.localApproval, APPROVAL_MODE.onlyNotifications,
    ]);
    expect(approvalModeChoices("PV")).toHaveLength(3);
    expect(defaultApprovalMode(null)).toBe(APPROVAL_MODE.onlyNotifications);
    expect(defaultApprovalMode(APPROVAL_MODE.localApproval)).toBe(APPROVAL_MODE.localApproval);
  });

  it("UT-ADGATE-006b a non-Wind/PV record is banner-warned, never silently reset", () => {
    expect(nonWindPvBanner("BESS")).toBe(MSG.nonWindPv);
    expect(nonWindPvBanner("Wind")).toBeNull();
  });

  it("UT-ADGATE-010 the Draft rule keys on the STATE name, on the gate branch only", () => {
    expect(resolveGateActive("Draft", false)).toBe(true);
    expect(resolveGateActive("Cluster 1", false)).toBe(false);
    expect(canToggleGateActiveInPanel("gate", "Draft")).toBe(false);
    expect(canToggleGateActiveInPanel("checklist", "Draft")).toBe(true);
    const draft = state({ id: "g0", name: "Draft", order: 0 });
    // The gate branch forces true for Draft even though the label is "Draft to Cluster 1".
    const gate = buildGatePayload(panel({ gate: draft, gateActive: false }), scope(), "Draft to Cluster 1");
    expect(gate[GATE_APPROVAL_COL.gateActive]).toBe(true);
    // The check-list branch writes the toggle as is (no Draft rule in the canvas).
    const cl = buildChecklistPayload(panel({ kind: "checklist", gate: draft, checklistItem: item(), gateActive: false }));
    expect(cl[CHECKLIST_APPROVAL_COL.gateActive]).toBe(false);
  });

  it("UT-ADGATE-024 the gate chip is off for an empty gate and for the Draft gate", () => {
    const empty = {
      gate: state({ order: 2 }),
      approval: approval({ defaultApprovals: null, defaultContributors: null, defaultNotifications: null }),
      isPlaceholder: false,
    };
    expect(canToggleGateChip(empty)).toBe(false);
    expect(canToggleGateChip({ gate: state({ name: "Draft", order: 0 }), approval: approval(), isPlaceholder: false })).toBe(false);
    expect(canToggleGateChip({ gate: state({ order: 2 }), approval: approval(), isPlaceholder: false })).toBe(true);
  });

  it("UT-ADGATE-025 the gate chip flips 'Gate active' only, with no confirmation step", () => {
    const row = { gate: state({ order: 2 }), approval: approval({ gateActive: true }), isPlaceholder: false };
    expect(planToggleGateActive(row, true).writes).toEqual([expect.objectContaining({
      op: "update", entitySet: GATE_ENTITY_SET, id: "a1", data: { [GATE_APPROVAL_COL.gateActive]: false },
    })]);
    const off = { ...row, approval: approval({ gateActive: false }) };
    expect(planToggleGateActive(off, true).writes[0]!.data).toEqual({ [GATE_APPROVAL_COL.gateActive]: true });
    expect(planToggleGateActive({ gate: state(), approval: null, isPlaceholder: true }, true).refusedReason)
      .toBe(MSG.toggleNoRecord);
  });

  it("UT-ADGATE-040 the check-list chip flips vsb_gateisactive (always enabled in the canvas)", () => {
    const plan = planToggleChecklistActive(clApproval({ gateActive: true }), true);
    expect(plan.writes).toEqual([expect.objectContaining({
      op: "update", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: "ca1",
      data: { vsb_gateisactive: false },
    })]);
    expect(planToggleChecklistActive(clApproval({ gateActive: false }), true).writes[0]!.data)
      .toEqual({ vsb_gateisactive: true });
  });

  it("UT-ADGATE-041 the panel title: gates always 'Edit Approvers'; check lists Add / Edit", () => {
    expect(panelTitle({ kind: "gate", existingId: null })).toBe("Edit Approvers");
    expect(panelTitle({ kind: "gate", existingId: "a1" })).toBe("Edit Approvers");
    expect(panelTitle({ kind: "checklist", existingId: null })).toBe("Add Approvers");
    expect(panelTitle({ kind: "checklist", existingId: "ca1" })).toBe("Edit Approvers");
  });
});

/* ═══════════════════════════════════════════════════════════════ validation ════ */

describe("panel validation — the error labels", () => {
  it("UT-ADGATE-011 Portfolio Manager is required in Formal Approval", () => {
    const e = validatePanel(panel({ portfolioManager: null }));
    expect(e.portfolioManager).toBe(true);
    expect(hasErrors(e)).toBe(true);
    expect(panelErrorMessages(e)).toContain(`Portfolio Manager: ${MSG.valueEmpty}`);
    expect(canSavePanel(panel({ portfolioManager: null }), { canEdit: true })).toBe(false);
  });

  it("UT-ADGATE-011b Contributors are required in Formal Approval", () => {
    expect(validatePanel(panel({ contributors: [] })).contributors).toBe(true);
    expect(validatePanel(panel({ mode: APPROVAL_MODE.localApproval, contributors: [] })).contributors).toBe(false);
  });

  it("UT-ADGATE-012 Approvers are required unless Only Notifications", () => {
    expect(validatePanel(panel({ approvers: [] })).approvers).toBe(true);
    expect(validatePanel(panel({ mode: APPROVAL_MODE.localApproval, approvers: [] })).approvers).toBe(true);
    expect(validatePanel(panel({
      mode: APPROVAL_MODE.onlyNotifications, approvers: [], portfolioManager: null, contributors: [],
    })).approvers).toBe(false);
  });

  it("UT-ADGATE-013 Notifications are required in Only Notifications mode", () => {
    const p = panel({
      mode: APPROVAL_MODE.onlyNotifications, notifications: [],
      portfolioManager: null, contributors: [], approvers: [],
    });
    expect(validatePanel(p).notifications).toBe(true);
    expect(canSavePanel(p, { canEdit: true })).toBe(false);
  });

  it("UT-ADGATE-013b the duplicate-gate guard fires only on a REAL existing row", () => {
    expect(validatePanel(panel({ existingId: null }), { existingApprovalForGate: false }).duplicateGate).toBe(false);
    expect(validatePanel(panel({ existingId: null }), { existingApprovalForGate: true }).duplicateGate).toBe(true);
    expect(validatePanel(panel({ existingId: "a1" }), { existingApprovalForGate: true }).duplicateGate).toBe(false);
  });

  it("UT-ADGATE-042 a blank Check List shows 'The cluster cannot be blank.' and blocks Save (SOURCE DEFECT fix)", () => {
    const p = panel({ kind: "checklist", checklistItem: null });
    expect(validatePanel(p).checklistBlank).toBe(true);
    expect(panelErrorMessages(validatePanel(p))).toContain(MSG.clusterBlank);
    expect(canSavePanel(p, { canEdit: true })).toBe(false);
    expect(validatePanel(panel({ kind: "checklist", checklistItem: item() })).checklistBlank).toBe(false);
    expect(validatePanel(panel({ kind: "gate" })).checklistBlank).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════ persona lists ════ */

describe("the persona JSON and the pickers", () => {
  it("UT-ADGATE-015 a persona list round-trips exactly", () => {
    const people = [persona("a"), persona("b")];
    const json = serialisePersonaList(people);
    expect(JSON.parse(json)).toEqual([
      { PersonaKey: "id-a", PersonaName: "Name a", PersonaRole: "a@vsb.energy" },
      { PersonaKey: "id-b", PersonaName: "Name b", PersonaRole: "b@vsb.energy" },
    ]);
    expect(parsePersonaList(json)).toEqual(people);
  });

  it("UT-ADGATE-016 malformed, null and empty persona JSON yield [] without throwing", () => {
    expect(parsePersonaList("{not json")).toEqual([]);
    expect(parsePersonaList(null)).toEqual([]);
    expect(parsePersonaList("")).toEqual([]);
    expect(parsePersonaList('{"PersonaKey":"x"}')).toEqual([]);
    expect(parsePersonaList("[1,2,3]")).toEqual([]);
  });

  it("UT-ADGATE-014 Only Notifications blanks PM, contributors and approvers", () => {
    const fields = personaFieldsForMode(panel({ mode: APPROVAL_MODE.onlyNotifications }));
    expect(fields.portfolioManagerId).toBeNull();
    expect(fields.contributors).toBeNull();
    expect(fields.approvers).toBeNull();
    expect(fields.notifications).not.toBeNull();
    const data = buildGatePayload(panel({ mode: APPROVAL_MODE.onlyNotifications, existingId: "a1" }), scope(), "x");
    expect(data[`${GATE_NAV.portfolioManager}@odata.bind`]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultContributors]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultApprovals]).toBeNull();
  });

  it("UT-ADGATE-021 MaxPeople caps 1 / 20 / 5 / 20; a duplicate is ignored", () => {
    expect(PERSON_LIMITS).toEqual({ portfolioManager: 1, contributors: 20, approvers: 5, notifications: 20 });
    const one = applyPersonaSelection([], persona("a"), 1);
    expect(one).toEqual([persona("a")]);
    expect(applyPersonaSelection(one, persona("b"), 1)).toEqual([persona("a")]);   // full
    const five = ["1", "2", "3", "4", "5"].map(persona);
    expect(applyPersonaSelection(five, persona("6"), PERSON_LIMITS.approvers)).toHaveLength(5);
    expect(applyPersonaSelection(five.slice(0, 4), persona("6"), PERSON_LIMITS.approvers)).toHaveLength(5);
    expect(applyPersonaSelection([persona("a")], persona("a"), 20)).toHaveLength(1);
  });

  it("UT-ADGATE-043 suggestions hide people already selected (by mail), except on the PM picker", () => {
    const found = [persona("a"), persona("b")];
    expect(pickerSuggestions(found, [persona("a")], true)).toEqual([persona("b")]);
    expect(pickerSuggestions(found, [persona("a")], false)).toEqual(found);
  });

  it("UT-ADGATE-044 the picker tooltips, verbatim", () => {
    expect(PICKER_TOOLTIPS).toEqual({
      portfolioManager: "Search for portfolio manager",
      contributors: "Select Contributors",
      approvers: "Select Approvers",
      notifications: "Select Notifications",
    });
  });
});

/* ═════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADGATE-017 the gate payload: every canvas field, on the gate table's own columns", () => {
    const data = buildGatePayload(panel({ existingId: "a1" }), scope(), "Cluster 1 to Cluster 2");
    expect(data).toEqual({
      vsb_name: "Cluster 1 to Cluster 2",
      vsb_approvalmodecode: APPROVAL_MODE.formalApproval,
      vsb_gateactive: true,
      vsb_defaultcontributors: serialisePersonaList([persona("c")]),
      vsb_defaultapprovals: serialisePersonaList([persona("a")]),
      vsb_defaultnotifications: serialisePersonaList([persona("n")]),
      vsb_technologycode: CHOICE_ADMIN.technology.wind,
      "vsb_ApprovalsCountry@odata.bind": "/vsb_countries(de)",
      "vsb_ClusterState@odata.bind": "/vsb_projectstates(g1)",
      "vsb_Approvalparticipant1@odata.bind": "/aadusers(id-pm)",
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
    expect(CHECKLIST_APPROVAL_COL.defaultApprovers in data).toBe(false);
    const plan = planSaveApproval(panel(), scope(), { canEdit: true, gateLabel: "Cluster 1 to Cluster 2" });
    expect(plan.writes[0]).toEqual(expect.objectContaining({ op: "create", entitySet: GATE_ENTITY_SET }));
  });

  it("UT-ADGATE-018 the check-list payload: vsb_gateisactive, vsb_PortfolioManagerId, vsb_ProjectDefaultCheckListId", () => {
    const p = panel({ kind: "checklist", checklistItem: item(), existingId: "ca1", gateActive: false });
    expect(buildChecklistPayload(p)).toEqual({
      vsb_name: "Permit",
      vsb_approvalmodecode: APPROVAL_MODE.formalApproval,
      vsb_gateisactive: false,
      vsb_defaultcontributors: serialisePersonaList([persona("c")]),
      vsb_defaultapprovers: serialisePersonaList([persona("a")]),
      vsb_defaultnotifications: serialisePersonaList([persona("n")]),
      "vsb_ProjectDefaultCheckListId@odata.bind": "/vsb_projectdefaultchecklistses(i1)",
      "vsb_PortfolioManagerId@odata.bind": "/aadusers(id-pm)",
      "owningbusinessunit@odata.bind": "/businessunits(bu-1)",
    });
    expect(CHECKLIST_NAV.portfolioManager).toBe("vsb_PortfolioManagerId");
    const plan = planSaveApproval(p, scope(), { canEdit: true, gateLabel: "x" });
    expect(plan.writes[0]).toEqual(expect.objectContaining({ op: "update", id: "ca1", entitySet: CHECKLIST_APPROVAL_ENTITY_SET }));
  });

  it("UT-ADGATE-019 Owning Business Unit comes from the record's OWN gate", () => {
    const gate3 = state({ id: "g3", name: "Cluster 3", order: 3, owningBusinessUnitId: "bu-3" });
    expect(buildChecklistPayload(panel({ kind: "checklist", gate: gate3, checklistItem: item() }))[OWNING_BU_BIND])
      .toBe("/businessunits(bu-3)");
  });

  it("UT-ADGATE-019b country, cluster state and technology are written on EVERY save, as the canvas does", () => {
    const updated = buildGatePayload(panel({ existingId: "a1" }), scope({ technology: "PV" }), "x");
    expect(updated[GATE_APPROVAL_COL.technology]).toBe(CHOICE_ADMIN.technology.pv);
    expect(updated[`${GATE_NAV.clusterState}@odata.bind`]).toBe("/vsb_projectstates(g1)");
    expect(updated[`${GATE_NAV.country}@odata.bind`]).toBe("/vsb_countries(de)");
    // A cleared lookup is null on an update and simply absent on a create.
    const created = buildGatePayload(panel({ mode: APPROVAL_MODE.localApproval }), scope(), "x");
    expect(`${GATE_NAV.portfolioManager}@odata.bind` in created).toBe(false);
    expect(buildGatePayload(panel(), scope(), "")[GATE_APPROVAL_COL.name]).toBe(" ");
  });

  it("UT-ADGATE-026 delete removes only the check-list approval", () => {
    expect(planDeleteChecklistApproval(clApproval(), true).writes).toEqual([expect.objectContaining({
      op: "delete", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: "ca1",
    })]);
  });

  it("UT-ADGATE-027 a refused save keeps the panel state (nothing is mutated)", () => {
    const p = panel({ approvers: [] });
    const plan = planSaveApproval(p, scope(), { canEdit: true, gateLabel: "x" });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(`Approvers: ${MSG.valueEmpty}`);
    expect(p.contributors).toHaveLength(1);
  });

  it("UT-ADGATE-045 the canvas progress, success and error texts", () => {
    const h = gatesHeadline("Germany", "Wind");
    expect(h).toBe("Project Gates | Germany | Wind");
    expect(savingGateText(h, "Cluster 1 to Cluster 2"))
      .toBe("Approvals data for Project Gates | Germany | Wind\nGate: 'Cluster 1 to Cluster 2' will be saved, please wait...");
    expect(savingChecklistText(h, "Permit"))
      .toBe("Approvals data for Project Gates | Germany | Wind\nCheck List: 'Permit' will be saved, please wait...");
    expect(deletingChecklistText(h, "Permit"))
      .toBe("Approval item for Project Gates | Germany | Wind\nCheck List: 'Permit' being deleted, please wait...");
    expect(MSG.saved).toBe("Approvals was successfully saved.");
    expect(saveErrorText("boom")).toBe("Error: Approvals type could not be saved. Internal error: boom");
    expect(deleteChecklistApprovalText("Germany", "Wind", "Cluster 1 to Cluster 2", "Permit"))
      .toBe("Are you sure you want to execute the deletion?\n\nGermany - Wind\nCluster 1 to Cluster 2\nCheck List Item: 'Permit'");
  });
});

/* ══════════════════════════════════════════════════════ checklist approvals ════ */

describe("check-list approvals", () => {
  it("UT-ADGATE-022 Add Task: the scoped check equals the canvas whole-table check for real data", () => {
    const items = [item({ id: "i1", countryTechId: "sc-de-wind" })];
    const unrelated = [clApproval({ id: "ca-x", projectDefaultChecklistId: "i-other-scope" })];
    expect(canAddChecklistApproval(items, unrelated, "g1", "sc-de-wind")).toBe(true);
    expect(canAddChecklistApprovalCanvasParity(items, unrelated, "g1", "sc-de-wind")).toBe(true);
    const same = [clApproval({ id: "ca-1", projectDefaultChecklistId: "i1" })];
    expect(canAddChecklistApproval(items, same, "g1", "sc-de-wind")).toBe(false);
    expect(canAddChecklistApprovalCanvasParity(items, same, "g1", "sc-de-wind")).toBe(false);
  });

  it("UT-ADGATE-023 Add Task is disabled when every item in the gate is approved", () => {
    const items = [item({ id: "i1" }), item({ id: "i2", order: 2 })];
    const approvals = [
      clApproval({ id: "c1", projectDefaultChecklistId: "i1" }),
      clApproval({ id: "c2", projectDefaultChecklistId: "i2" }),
    ];
    expect(canAddChecklistApproval(items, approvals, "g1", "sc-de-wind")).toBe(false);
    expect(canAddChecklistApproval([], approvals, "g1", "sc-de-wind")).toBe(false);
  });

  it("UT-ADGATE-023b the sub-gallery is scoped by the item's own scope and gate, ordered by template Order", () => {
    const items = [item({ id: "i1", order: 2 }), item({ id: "i2", order: 1 }), item({ id: "iOther", clusterStateId: "g2" })];
    const rows = checklistApprovalsForGate(
      [
        clApproval({ id: "c1", projectDefaultChecklistId: "i1" }),
        clApproval({ id: "c2", projectDefaultChecklistId: "i2" }),
        clApproval({ id: "c3", projectDefaultChecklistId: "iOther" }),
      ],
      items, "g1", "sc-de-wind",
    );
    expect(rows.map((r) => r.approval.id)).toEqual(["c2", "c1"]);
  });

  it("UT-ADGATE-046 the Check List options exclude approved templates on create; edit shows only its own", () => {
    const items = [item({ id: "i1" }), item({ id: "i2", name: "Grid", order: 2 }), item({ id: "i3", clusterStateId: "g2" })];
    const approvals = [clApproval({ projectDefaultChecklistId: "i1" })];
    expect(checklistOptions(items, approvals, "g1", "sc-de-wind", null).map((i) => i.id)).toEqual(["i2"]);
    expect(checklistOptions(items, approvals, "g1", "sc-de-wind", items[0]!)).toEqual([items[0]]);
  });
});

/* ═════════════════════════════════════════════════════════════ the people search ════ */

describe("the Entra people search (aadusers)", () => {
  it("UT-ADGATE-020 enabled accounts only (a Boolean), contains on four columns; blank issues nothing", () => {
    expect(shouldSearchPeople("  ")).toBe(false);
    expect(entraSearchFilter("  ")).toBeUndefined();
    const filter = entraSearchFilter("an")!;
    expect(filter).toContain("accountenabled eq true");
    for (const c of ["displayname", "givenname", "surname", "mail"]) expect(filter).toContain(`contains(${c},'an')`);
    expect(ENTRA_COL.objectId).toBe("id");
    expect(ENTRA_COL.rowId).toBe("aaduserid");
  });

  it("UT-ADGATE-020b a quote in the search term is escaped", () => {
    expect(entraSearchFilter("O'Brien")).toContain("O''Brien");
  });

  it("UT-ADGATE-020c the approval-mode option values match the metadata", () => {
    expect(APPROVAL_MODE).toBe(CHOICE_PROCESS.approvalMode);
  });
});

/* ═══════════════════════════════════════════ captions ════ */

describe("captions", () => {
  it("UT-ADGATE-029 the three Approval Mode options, verbatim, in metadata order", () => {
    expect(APPROVAL_MODE_OPTIONS.map((o) => o.label)).toEqual(["Formal Approval", "Local Approval", "Only Notifications"]);
    expect(approvalModeLabel(APPROVAL_MODE.localApproval)).toBe("Local Approval");
    expect(approvalModeLabel(null)).toBe("—");
  });

  it("UT-ADGATE-029c the panel's verbatim strings", () => {
    expect(PANEL_LABELS.title).toBe("Edit Approvers");
    expect(SCREEN_LABELS.titleAdd).toBe("Add Approvers");
    expect(PANEL_LABELS.gate).toBe("Gate");
    expect(PANEL_LABELS.gateActive).toBe("Gate active");
    expect(PANEL_LABELS.approvalMode).toBe("Approval Mode");
    expect(PANEL_LABELS.resetGate).toBe("Reset Gate");
    expect(MSG.resetGateCaption).toBe("Remove all cluster gate participants and deactivate the gate approval.");
    expect(SCREEN_LABELS.deleteTitle).toBe("Delete Check List Approval Item?");
  });

  it("UT-ADGATE-030 the seven columns, verbatim, in order", () => {
    expect(GATE_TABLE_COLUMNS).toEqual([
      "Description", "Portfolio Manager", "Contributors", "Approvers", "Notifications", "Status", "Action",
    ]);
  });
});

/* ═══════════════════════════════════════════ the person cells ════ */

describe("person cells", () => {
  it("UT-ADGATE-031 an empty cell is \"-\" with no tooltip", () => {
    expect(PERSON_UNSET).toBe("-");
    expect(personListCell([], "Contributors")).toEqual({ text: "-", tooltip: undefined });
  });

  it("UT-ADGATE-031b up to three people are listed as name, newline, (mail), blank line between", () => {
    const cell = personListCell([persona("a"), persona("b")], "Approvers");
    expect(cell.text).toBe("Name a\n(a@vsb.energy)\n\nName b\n(b@vsb.energy)");
    expect(cell.tooltip).toBe(cell.text);
    expect(formatPersona(persona("a"))).toBe("Name a (a@vsb.energy)");
  });

  it("UT-ADGATE-047 four or more collapse to \"N Contributors\" / \"N Approvers\" / \"N Notifications\"", () => {
    const four = ["1", "2", "3", "4"].map(persona);
    expect(personListCell(four, "Contributors", { tooltipSeparator: ";\n\n" }).text).toBe("4 Contributors");
    expect(personListCell(four, "Contributors", { tooltipSeparator: ";\n\n" }).tooltip)
      .toBe(four.map((p) => `${p.displayName}\n(${p.mail})`).join(";\n\n"));
    expect(personListCell(four, "Approvers").text).toBe("4 Approvers");
    expect(personListCell(four, "Notifications").text).toBe("4 Notifications");
  });

  it("UT-ADGATE-048 the check-list Notifications cell lists when all < 4 or exactly one, with ';' separators", () => {
    const four = ["1", "2", "3", "4"].map(persona);
    const two = [persona("x"), persona("y")];
    expect(checklistNotificationsCell([], [], two).text).toBe("Name x\n(x@vsb.energy);\n\nName y\n(y@vsb.energy)");
    expect(checklistNotificationsCell(four, [], two).text).toBe("2 Notifications");
    expect(checklistNotificationsCell(four, [], [persona("x")]).text).toBe("Name x\n(x@vsb.energy)");
    expect(checklistNotificationsCell(four, [], []).text).toBe("-");
  });

  it("UT-ADGATE-049 the Portfolio Manager cells: gate name only; check list name + mail", () => {
    expect(gatePortfolioManagerCell(persona("p"))).toEqual({ text: "Name p", tooltip: "Name p, (p@vsb.energy)" });
    expect(gatePortfolioManagerCell(null)).toEqual({ text: "-", tooltip: "-, ()" });
    expect(checklistPortfolioManagerCell(persona("p")).text).toBe("Name p\np@vsb.energy");
    expect(checklistPortfolioManagerCell(null).text).toBe("-");
  });
});

/* ═══════════════════════════════════════════ the country rail ════ */

describe("the country rail key scheme", () => {
  it("UT-ADGATE-032 a technology leaf key round-trips through parseTechRailKey", () => {
    const key = techRailKey("de-1", "Wind");
    expect(key).toBe("de-1::Wind");
    expect(parseTechRailKey(key)).toEqual({ countryId: "de-1", technology: "Wind" });
    expect(countryRailKey("de-1")).toBe("de-1");
    expect(parseTechRailKey("not-a-leaf-key")).toBeNull();
  });

  it("UT-ADGATE-032b the rail items carry Wind and PV children per country, in order", () => {
    const items = buildGateCountryRailItems([{ id: "fr-1", name: "France" }, { id: "de-1", name: "Germany" }]);
    expect(items.map((i) => i.label)).toEqual(["Germany", "France"]);
    expect(items[0]!.children).toEqual([{ key: "de-1::Wind", label: "Wind" }, { key: "de-1::PV", label: "PV" }]);
  });
});

/* ═══════════════════════════════════════════ the flattened table ════ */

describe("the flattened gate/task table", () => {
  const gates = [state({ id: "g1", name: "Draft", order: 0 }), state({ id: "g2", name: "Cluster 1", order: 1 })];
  const a1 = approval({
    id: "a1", name: "stored name", clusterStateId: "g1", gateActive: false,
    defaultApprovals: null, defaultContributors: null,
    defaultNotifications: serialisePersonaList([persona("n")]),
  });
  const it1 = item({ id: "i1", name: "Task One", clusterStateId: "g1", order: 1 });
  const ca1 = clApproval({ id: "ca1", projectDefaultChecklistId: "i1", gateActive: false, name: "Task One" });

  it("UT-ADGATE-033 a gate row, its task rows, then Add Task; the gate description is the Order Switch", () => {
    const rows = buildGateTableRows(mergeGatesWithApprovals(gates, [a1]), [ca1], [it1], null, new Set(), NOBODY);
    expect(rows.map((r) => r.kind)).toEqual(["gate", "task", "addTask", "gate", "addTask"]);
    expect(rows[0]!.description).toBe("Draft to Cluster 1");
    expect(rows[0]!.taskCount).toBe(1);
    expect(rows[1]!.description).toBe("Task One");
    expect(rows[3]!.description).toBe("Cluster 1 to Cluster 2");
  });

  it("UT-ADGATE-033b collapsing a gate hides its task rows; Add Task stays visible", () => {
    const rows = buildGateTableRows(mergeGatesWithApprovals(gates, [a1]), [ca1], [it1], null, new Set(["g1"]), NOBODY);
    expect(rows.map((r) => r.kind)).toEqual(["gate", "addTask", "gate", "addTask"]);
    expect(rows[0]!.taskCount).toBe(1);   // the Collapse button stays
  });

  it("UT-ADGATE-033c the Status column reads the stored flag", () => {
    const rows = buildGateTableRows(mergeGatesWithApprovals(gates, [a1]), [], [], null, new Set(), NOBODY);
    expect(rows[0]!.active).toBe(false);
  });

  it("UT-ADGATE-033d a placeholder gate carries no status and \"-\" cells", () => {
    const rows = buildGateTableRows(mergeGatesWithApprovals(gates, []), [], [], null, new Set(), NOBODY);
    expect(rows[0]!.isPlaceholder).toBe(true);
    expect(rows[0]!.active).toBeNull();
    expect(rows[0]!.cells.notifications.text).toBe("-");
    expect(rows[0]!.cells.portfolioManager.text).toBe("-");
  });

  it("UT-ADGATE-033e the Portfolio Manager cell is resolved through the caller's lookup", () => {
    const withPm = approval({ id: "a2", clusterStateId: "g2", portfolioManagerId: "pm-x" });
    const resolved = persona("pm");
    const rows = buildGateTableRows(
      mergeGatesWithApprovals(gates, [withPm]), [], [], null, new Set(),
      (id) => (id === "pm-x" ? resolved : null),
    );
    const g2 = rows.find((r) => r.kind === "gate" && r.gate.gate.id === "g2")!;
    expect(g2.portfolioManager).toEqual([resolved]);
    expect(g2.cells.portfolioManager.text).toBe("Name pm");
  });

  it("UT-ADGATE-033f the Add Task row's enabled flag matches canAddChecklistApproval", () => {
    const merged = mergeGatesWithApprovals(gates, [a1]);
    expect(buildGateTableRows(merged, [ca1], [it1], null, new Set(), NOBODY).find((r) => r.kind === "addTask")!.addTaskEnabled)
      .toBe(false);
    const it2 = item({ id: "i2", name: "Task Two", clusterStateId: "g1", order: 2 });
    expect(buildGateTableRows(merged, [ca1], [it1, it2], null, new Set(), NOBODY).find((r) => r.kind === "addTask")!.addTaskEnabled)
      .toBe(true);
  });
});

/* ═══════════════════════════════════════════ Reset Gate ════ */

describe("Reset Gate", () => {
  it("UT-ADGATE-035 writes exactly the five canvas fields: inactive, PM and the three lists blank", () => {
    const plan = planResetGate(panel({ existingId: "a1", kind: "gate" }), true);
    expect(plan.writes).toEqual([expect.objectContaining({
      op: "update", entitySet: GATE_ENTITY_SET, id: "a1",
      data: {
        vsb_gateactive: false,
        "vsb_Approvalparticipant1@odata.bind": null,
        vsb_defaultcontributors: null,
        vsb_defaultapprovals: null,
        vsb_defaultnotifications: null,
      },
    })]);
  });

  it("UT-ADGATE-035b the Draft gate is deactivated too (canvas parity)", () => {
    const p = panel({ existingId: "a0", gate: state({ id: "g0", name: "Draft", order: 0 }) });
    expect(planResetGate(p, true).writes[0]!.data![GATE_APPROVAL_COL.gateActive]).toBe(false);
  });

  it("UT-ADGATE-035c refuses when there is no gate row to reset yet", () => {
    const fresh = panel({ existingId: null });
    expect(planResetGate(fresh, true).refusedReason).toBe(MSG.resetNoRecord);
    expect(canResetGate(fresh, true)).toBe(false);
    expect(canResetGate(panel({ existingId: "a1" }), true)).toBe(true);
    expect(canResetGate(panel({ existingId: "a1" }), false)).toBe(false);
    expect(canResetGate(panel({ existingId: "ca1", kind: "checklist" }), true)).toBe(false);
  });
});

/* ════════════════════════════════ cmp_NestedCountryPickerColumn — the picker input ════ */

describe("the reusable country picker's inputs", () => {
  it("UT-ADGATE-036 toNestedPicker maps picker items to Countries and Nestings", () => {
    const items = buildCountryPicker([
      { id: "c-fr", name: "France" }, { id: "c-de", name: "Germany" }, { id: "c-es", name: "Spain" },
    ], { exclude: PICKER_EXCLUDED_COUNTRIES });
    const out = toNestedPicker(items);
    expect(out.countries).toEqual([{ key: "c-de", name: "Germany" }, { key: "c-fr", name: "France" }]);
    expect(out.nestings[0]).toEqual({ country: "Germany", childs: [{ order: 1, value: "Wind" }, { order: 2, value: "PV" }] });
  });
});
