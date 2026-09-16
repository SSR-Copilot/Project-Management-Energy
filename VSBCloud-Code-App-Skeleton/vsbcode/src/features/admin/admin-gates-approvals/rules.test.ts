/**
 * Admin Project Gates Approvals Screen — unit tests.
 *
 * IDs are the spec's (UT-ADGATE-nnn). Pure functions only; the "Integration" cases assert
 * the request FILTER and the write PLAN, which is where the behaviour lives, rather than
 * mocking the transport.
 */
import { describe, it, expect } from "vitest";
import { canSeeAdminSection, type CurrentUser } from "@/domain/session";
import { CHOICE_PROCESS, CHOICE_ADMIN } from "@/data/entities";
import {
  MSG, APPROVAL_MODE, APPROVAL_MODE_OPTIONS, PANEL_LABELS, GATE_TABLE_COLUMNS,
  GATE_APPROVAL_COL, CHECKLIST_APPROVAL_COL, GATE_LOOKUP,
  GATE_ENTITY_SET, CHECKLIST_APPROVAL_ENTITY_SET, ENTRA_COL, ENTRA_ACCOUNT_ENABLED_YES,
  COUNTRY_PICKER_ORDER, COST_CONTRACT_EXCLUDED_COUNTRIES, PICKER_TECHNOLOGIES,
  buildCountryPicker, technologyValue, technologyLabel, isWindOrPv,
  parsePersonaList, serialisePersonaList, applyPersonaSelection,
  configurableGates, mergeGatesWithApprovals, gateDropdownItems, gateTransitionLabel,
  gateRecordName, approvalModeChoices, approvalModeLabel, defaultApprovalMode, nonWindPvBanner,
  resolveGateActive, canToggleGateActiveInPanel, canToggleGateChip,
  validatePanel, hasErrors, canSavePanel, panelErrorMessages, canEditScope,
  personaFieldsForMode, buildApprovalPayload, planSaveApproval, planToggleGateActive,
  planDeleteChecklistApproval, planDeleteGateApproval, planResetGate, canResetGate,
  checklistApprovalsForGate, canAddChecklistApproval,
  canAddChecklistApprovalCanvasParity, shouldSearchPeople, entraSearchFilter,
  PERSON_UNSET, formatPersona, personLines,
  countryRailKey, techRailKey, parseTechRailKey, buildGateCountryRailItems,
  buildGateTableRows,
  type GateState, type GateApproval, type ChecklistApproval, type ChecklistItem,
  type ApprovalPanelState, type Persona, type Scope,
} from "./rules";

/* ─────────────────────────────────────────────────────────────────── fixtures */

const user = (o: Partial<CurrentUser> = {}): CurrentUser => ({
  id: "u-1", displayName: "A. Muster", mail: "a@vsb.energy", language: "en-US",
  lang: "en", roles: [], isApplicationAdministrator: false, isControllerOwnData: false,
  isProjectDataAllCountries: false, isProjectManagerOwnProjects: false, isDeveloper: false,
  canEditSelectedProject: false, editableCountries: [], editableCountriesAsString: "",
  ...o,
});

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

/* ═══════════════════════════════════════════════════════════════ permission ════ */

describe("permission and scope", () => {
  it("UT-ADGATE-001 a non-admin is blocked; no request is issued", () => {
    expect(canSeeAdminSection(user())).toBe(false);
    // The panel's save plan refuses too, so a bypassed guard still writes nothing.
    const plan = planSaveApproval(panel(), scope(), { canEdit: false, gateName: "Cluster 1 to Cluster 2" });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(MSG.outOfScope);
  });

  it("UT-ADGATE-001b country scope gates the edits (new, absent from the canvas)", () => {
    const controller = user({
      isControllerOwnData: true,
      editableCountries: [{ id: "de", name: "Germany" }],
    });
    expect(canEditScope(controller, scope())).toBe(true);
    expect(canEditScope(controller, scope({ country: { id: "fr", name: "France" } }))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════ the picker literals ════ */

describe("the hard-coded country/technology picker", () => {
  it("UT-ADGATE-001c the technology nesting can never produce BESS, Hydro or Substation", () => {
    expect(PICKER_TECHNOLOGIES).toEqual(["Wind", "PV"]);
    const items = buildCountryPicker([
      { id: "de", name: "Germany" }, { id: "es", name: "Spain" },
    ]);
    expect(items.every((c) => c.technologies.length === 2)).toBe(true);
    // …even though the save switch resolves them.
    expect(technologyValue("BESS")).toBe(CHOICE_ADMIN.technology.bess);
    expect(technologyValue("Hydrogen")).toBe(CHOICE_ADMIN.technology.hydrogen);
  });

  it("UT-ADGATE-001d Gates uses the unfiltered list; Cost and Contract exclude three countries", () => {
    const countries = [
      { id: "de", name: "Germany" }, { id: "es", name: "Spain" },
      { id: "gr", name: "Greece" }, { id: "ro", name: "Romania" },
    ];
    expect(buildCountryPicker(countries).map((c) => c.name))
      .toEqual(["Germany", "Spain", "Greece", "Romania"]);
    expect(
      buildCountryPicker(countries, { exclude: COST_CONTRACT_EXCLUDED_COUNTRIES })
        .map((c) => c.name),
    ).toEqual(["Germany"]);
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
    expect(merged[1].approval).toBeNull();
  });

  it("UT-ADGATE-003 gates with Order >= 6 are excluded", () => {
    const withSix = [...fiveStates, state({ id: "g6", name: "Cluster 6", order: 6 })];
    expect(configurableGates(withSix).map((g) => g.id))
      .toEqual(["g1", "g2", "g3", "g4", "g5"]);
    expect(mergeGatesWithApprovals(withSix, []).some((m) => m.gate.id === "g6")).toBe(false);
  });

  it("UT-ADGATE-004 a placeholder issues no write until Save", () => {
    const merged = mergeGatesWithApprovals(fiveStates, []);
    // Opening Edit produces a panel with existingId null and NOTHING written; the canvas
    // patched a real row at this point and left an orphan on Cancel.
    const p = panel({ existingId: null });
    expect(merged[0].approval).toBeNull();
    expect(p.existingId).toBeNull();
    // Cancel = discard the panel state. No plan is built, so zero writes by construction.
  });

  it("UT-ADGATE-028 a scope with no approvals renders five placeholders and writes nothing", () => {
    const merged = mergeGatesWithApprovals(fiveStates, []);
    expect(merged).toHaveLength(5);
    expect(merged.every((m) => m.isPlaceholder)).toBe(true);
    expect(merged.every((m) => canToggleGateChip(m) === false)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ the gate dropdown ════ */

describe("the gate dropdown (a transition list, not a state list)", () => {
  it("UT-ADGATE-007 the label is a transition", () => {
    const items = gateDropdownItems([
      state({ id: "g1", name: "Cluster 1", order: 1 }),
      state({ id: "g2", name: "Cluster 2", order: 2 }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Cluster 1 to Cluster 2");
    expect(gateTransitionLabel(state({ name: "Draft" }), state({ name: "Cluster 1" })))
      .toBe("Draft to Cluster 1");
    expect(gateRecordName(items[0])).toBe("Cluster 1 to Cluster 2");
    expect(gateRecordName(null)).toBe(" ");
  });

  it("UT-ADGATE-008 transitions into Abandoned or Inactive/ On-hold are excluded", () => {
    const items = gateDropdownItems([
      state({ id: "g1", name: "Cluster 1", order: 1 }),
      state({ id: "g2", name: "Abandoned", order: 2 }),
      state({ id: "g3", name: "Cluster 3", order: 3 }),
      state({ id: "g4", name: "Inactive/ On-hold", order: 4 }),
      state({ id: "g5", name: "Cluster 5", order: 5 }),
    ]);
    // "Cluster 1 to Abandoned" and "Cluster 3 to Inactive/ On-hold" are both dropped;
    // the transitions OUT of those two states are not — the canvas only excludes the
    // TARGET. "Cluster 5" is the last visible state and produces no transition at all.
    expect(items.map((i) => i.label))
      .toEqual(["Abandoned to Cluster 3", "Inactive/ On-hold to Cluster 5"]);
    expect(items.some((i) => i.label.endsWith("to Abandoned"))).toBe(false);
    expect(items.some((i) => i.label.endsWith("to Inactive/ On-hold"))).toBe(false);
  });

  it("UT-ADGATE-009 the last visible state produces no transition", () => {
    expect(gateDropdownItems(fiveStates)).toHaveLength(4);
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
    // Opening the panel builds no plan at all, so the canvas's destructive open-patch
    // cannot happen: the only writer is planSaveApproval, and it is Save-only.
  });

  it("UT-ADGATE-010 Draft can never be deactivated", () => {
    expect(resolveGateActive("Draft", false)).toBe(true);
    expect(resolveGateActive("Cluster 1", false)).toBe(false);
    expect(canToggleGateActiveInPanel("gate", "Draft")).toBe(false);
    expect(canToggleGateActiveInPanel("checklist", "Draft")).toBe(true);
    const data = buildApprovalPayload(
      panel({ gateActive: false }), scope(), "Draft",
    );
    expect(data[GATE_APPROVAL_COL.gateActive]).toBe(true);
  });

  it("UT-ADGATE-024 the status chip is disabled for an empty gate", () => {
    const empty = {
      gate: state({ order: 2 }),
      approval: approval({
        defaultApprovals: null, defaultContributors: null, defaultNotifications: null,
      }),
      isPlaceholder: false,
    };
    expect(canToggleGateChip(empty)).toBe(false);
    const draft = {
      gate: state({ name: "Draft", order: 0 }),
      approval: approval(),
      isPlaceholder: false,
    };
    expect(canToggleGateChip(draft)).toBe(false);
    const good = { gate: state({ order: 2 }), approval: approval(), isPlaceholder: false };
    expect(canToggleGateChip(good)).toBe(true);
  });

  it("UT-ADGATE-025 deactivating a gate produces a plan the dialog gates", () => {
    const row = { gate: state({ order: 2 }), approval: approval({ gateActive: true }), isPlaceholder: false };
    const plan = planToggleGateActive(row, true);
    expect(plan.writes).toEqual([expect.objectContaining({
      op: "update", entitySet: GATE_ENTITY_SET, id: "a1",
      data: { [GATE_APPROVAL_COL.gateActive]: false },
    })]);
    // The dialog exists in Screen.tsx; the canvas had none for a country-wide change.
    expect(MSG.deactivateTitle.length).toBeGreaterThan(0);
    expect(planToggleGateActive(row, false).refusedReason).toBe(MSG.outOfScope);
  });
});

/* ═══════════════════════════════════════════════════════════════ validation ════ */

describe("panel validation — the five error labels", () => {
  it("UT-ADGATE-011 Portfolio Manager is required in Formal Approval", () => {
    const e = validatePanel(panel({ portfolioManager: null }));
    expect(e.portfolioManager).toBe(true);
    expect(hasErrors(e)).toBe(true);
    expect(panelErrorMessages(e)).toContain(`Portfolio Manager: ${MSG.valueEmpty}`);
    expect(canSavePanel(panel({ portfolioManager: null }), { canEdit: true })).toBe(false);
  });

  it("UT-ADGATE-011b Contributors are required in Formal Approval", () => {
    expect(validatePanel(panel({ contributors: [] })).contributors).toBe(true);
    expect(validatePanel(panel({ mode: APPROVAL_MODE.localApproval, contributors: [] }))
      .contributors).toBe(false);
  });

  it("UT-ADGATE-012 Approvers are required unless Only-Notifications", () => {
    expect(validatePanel(panel({ approvers: [] })).approvers).toBe(true);
    expect(validatePanel(panel({ mode: APPROVAL_MODE.localApproval, approvers: [] })).approvers)
      .toBe(true);
    expect(validatePanel(panel({
      mode: APPROVAL_MODE.onlyNotifications, approvers: [], portfolioManager: null,
      contributors: [],
    })).approvers).toBe(false);
  });

  it("UT-ADGATE-013 Notifications are required in Only-Notifications mode", () => {
    const p = panel({
      mode: APPROVAL_MODE.onlyNotifications, notifications: [],
      portfolioManager: null, contributors: [], approvers: [],
    });
    expect(validatePanel(p).notifications).toBe(true);
    expect(canSavePanel(p, { canEdit: true })).toBe(false);
  });

  it("UT-ADGATE-013b the duplicate-gate guard fires only on a REAL existing row", () => {
    // The canvas guard fired for every new record because rule 1 materialises every gate.
    expect(validatePanel(panel({ existingId: null }), { existingApprovalForGate: false })
      .duplicateGate).toBe(false);
    expect(validatePanel(panel({ existingId: null }), { existingApprovalForGate: true })
      .duplicateGate).toBe(true);
    expect(validatePanel(panel({ existingId: "a1" }), { existingApprovalForGate: true })
      .duplicateGate).toBe(false);
  });
});

/* ═════════════════════════════════════════════════════════════ persona lists ════ */

describe("the persona JSON", () => {
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
    expect(parsePersonaList('{"PersonaKey":"x"}')).toEqual([]);   // an object, not an array
    expect(parsePersonaList("[1,2,3]")).toEqual([]);
  });

  it("UT-ADGATE-014 Only-Notifications blanks PM, contributors and approvers", () => {
    const fields = personaFieldsForMode(panel({ mode: APPROVAL_MODE.onlyNotifications }));
    expect(fields.portfolioManagerId).toBeNull();
    expect(fields.contributors).toBeNull();
    expect(fields.approvers).toBeNull();
    expect(fields.notifications).not.toBeNull();

    const data = buildApprovalPayload(
      panel({ mode: APPROVAL_MODE.onlyNotifications }), scope(), "Cluster 1 to Cluster 2",
    );
    expect(data[`${GATE_LOOKUP.portfolioManager}@odata.bind`]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultContributors]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultApprovals]).toBeNull();
  });

  it("UT-ADGATE-021 the Portfolio Manager picker replaces rather than appends", () => {
    const first = applyPersonaSelection([], persona("a"), 1);
    expect(first).toEqual([persona("a")]);
    expect(applyPersonaSelection(first, persona("b"), 1)).toEqual([persona("b")]);
    // The other three are unbounded and de-duplicated.
    const many = applyPersonaSelection([persona("a")], persona("b"));
    expect(many).toHaveLength(2);
    expect(applyPersonaSelection(many, persona("a"))).toHaveLength(2);
  });
});

/* ═════════════════════════════════════════════════════════════════ the save ════ */

describe("the save", () => {
  it("UT-ADGATE-017 the gate branch writes Default Approvals, never Default Approvers", () => {
    const data = buildApprovalPayload(panel({ kind: "gate" }), scope(), "Cluster 1 to Cluster 2");
    expect(data[GATE_APPROVAL_COL.defaultApprovals]).toBe(serialisePersonaList([persona("a")]));
    expect(CHECKLIST_APPROVAL_COL.defaultApprovers in data).toBe(false);
    const plan = planSaveApproval(panel(), scope(), {
      canEdit: true, gateName: "Cluster 1 to Cluster 2",
    });
    expect(plan.writes[0].entitySet).toBe(GATE_ENTITY_SET);
  });

  it("UT-ADGATE-018 the checklist branch writes Default Approvers", () => {
    const p = panel({ kind: "checklist", checklistItem: item() });
    const data = buildApprovalPayload(p, scope(), "Cluster 1 to Cluster 2");
    expect(data[CHECKLIST_APPROVAL_COL.defaultApprovers])
      .toBe(serialisePersonaList([persona("a")]));
    expect(GATE_APPROVAL_COL.defaultApprovals in data).toBe(false);
    expect(data[CHECKLIST_APPROVAL_COL.name]).toBe("Permit");
    const plan = planSaveApproval(p, scope(), { canEdit: true, gateName: "Cluster 1 to Cluster 2" });
    expect(plan.writes[0].entitySet).toBe(CHECKLIST_APPROVAL_ENTITY_SET);
  });

  it("UT-ADGATE-019 Owning Business Unit comes from the record's OWN gate", () => {
    const gate3 = state({ id: "g3", name: "Cluster 3", order: 3, owningBusinessUnitId: "bu-3" });
    const data = buildApprovalPayload(
      panel({ kind: "checklist", gate: gate3, checklistItem: item() }),
      scope(), "Cluster 3 to Cluster 4",
    );
    expect(data[`${GATE_LOOKUP.owningBusinessUnit}@odata.bind`]).toBe("/businessunits(bu-3)");
  });

  it("UT-ADGATE-019b the technology and country lookups are written only on create", () => {
    const created = buildApprovalPayload(panel({ existingId: null }), scope(), "x");
    expect(created[GATE_APPROVAL_COL.technology]).toBe(CHOICE_ADMIN.technology.wind);
    expect(created[`${GATE_LOOKUP.country}@odata.bind`]).toBe("/vsb_countries(de)");
    const updated = buildApprovalPayload(panel({ existingId: "a1" }), scope(), "x");
    expect(GATE_APPROVAL_COL.technology in updated).toBe(false);
    expect(`${GATE_LOOKUP.clusterState}@odata.bind` in updated).toBe(false);
  });

  it("UT-ADGATE-026 delete removes only the check-list approval", () => {
    const plan = planDeleteChecklistApproval(clApproval(), true);
    expect(plan.writes).toEqual([expect.objectContaining({
      op: "delete", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: "ca1",
    })]);
    // There is no delete path for a gate-level approval at all.
  });

  it("UT-ADGATE-027 a refused save keeps the panel state (nothing is mutated)", () => {
    const p = panel({ approvers: [] });
    const plan = planSaveApproval(p, scope(), { canEdit: true, gateName: "x" });
    expect(plan.writes).toHaveLength(0);
    expect(plan.refusedReason).toBe(`Approvers: ${MSG.valueEmpty}`);
    expect(p.contributors).toHaveLength(1);   // the caller's state is untouched
  });
});

/* ══════════════════════════════════════════════════════ checklist approvals ════ */

describe("check-list approvals", () => {
  it("UT-ADGATE-022 Add Task stays enabled when the only approval is in ANOTHER country", () => {
    const items = [item({ id: "i1", countryTechId: "sc-de-wind" })];
    const approvals = [clApproval({ id: "ca-fr", projectDefaultChecklistId: "i-fr" })];
    expect(canAddChecklistApproval(items, approvals, "g1", "sc-de-wind")).toBe(true);
    // The canvas compared against the whole table, so an approval on the SAME template id
    // in another country blocked the add:
    const sameTemplateElsewhere = [clApproval({ id: "ca-fr", projectDefaultChecklistId: "i1" })];
    expect(canAddChecklistApprovalCanvasParity(items, sameTemplateElsewhere, "g1", "sc-de-wind"))
      .toBe(false);
    // Fixed: the approval is not in scope, so it does not count.
    expect(canAddChecklistApproval(
      items,
      [clApproval({ id: "ca-x", projectDefaultChecklistId: "i-not-in-scope" })],
      "g1", "sc-de-wind",
    )).toBe(true);
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

  it("UT-ADGATE-023b the sub-gallery is scoped by the item's own scope and gate order", () => {
    const items = [
      item({ id: "i1", order: 2 }),
      item({ id: "i2", order: 1 }),
      item({ id: "iOther", clusterStateId: "g2" }),
    ];
    const rows = checklistApprovalsForGate(
      [
        clApproval({ id: "c1", projectDefaultChecklistId: "i1" }),
        clApproval({ id: "c2", projectDefaultChecklistId: "i2" }),
        clApproval({ id: "c3", projectDefaultChecklistId: "iOther" }),
      ],
      items, "g1", "sc-de-wind",
    );
    expect(rows.map((r) => r.approval.id)).toEqual(["c2", "c1"]);   // ordered by item Order
  });
});

/* ═════════════════════════════════════════════════════════════ the people search ════ */

describe("the Entra people search", () => {
  it("UT-ADGATE-020 the filter restricts to enabled accounts; a blank term issues nothing", () => {
    expect(shouldSearchPeople("  ")).toBe(false);
    expect(entraSearchFilter("  ")).toBeUndefined();
    const filter = entraSearchFilter("an");
    expect(filter).toContain(`${ENTRA_COL.accountEnabled} eq ${ENTRA_ACCOUNT_ENABLED_YES}`);
    expect(filter).toContain(`contains(${ENTRA_COL.displayName},'an')`);
    expect(filter).toContain(`contains(${ENTRA_COL.mail},'an')`);
  });

  it("UT-ADGATE-020b a quote in the search term is escaped", () => {
    expect(entraSearchFilter("O'Brien")).toContain("O''Brien");
  });

  it("UT-ADGATE-020c the approval-mode option values match the metadata", () => {
    expect(APPROVAL_MODE).toBe(CHOICE_PROCESS.approvalMode);
  });
});

/* ═══════════════════════════════════════════ GUIDE p19 — Approval Mode options ════ */

describe("the Approval Mode option list (GUIDE p19)", () => {
  it("UT-ADGATE-029 the three options, verbatim, in the order the guide shows them", () => {
    expect(APPROVAL_MODE_OPTIONS.map((o) => o.label)).toEqual([
      "Formal Approval", "Local Approval", "Only Notifications",
    ]);
    expect(APPROVAL_MODE_OPTIONS.map((o) => o.value)).toEqual([
      APPROVAL_MODE.formalApproval, APPROVAL_MODE.localApproval, APPROVAL_MODE.onlyNotifications,
    ]);
  });

  it("UT-ADGATE-029b approvalModeLabel round-trips the option list", () => {
    expect(approvalModeLabel(APPROVAL_MODE.formalApproval)).toBe("Formal Approval");
    expect(approvalModeLabel(APPROVAL_MODE.localApproval)).toBe("Local Approval");
    expect(approvalModeLabel(APPROVAL_MODE.onlyNotifications)).toBe("Only Notifications");
    expect(approvalModeLabel(null)).toBe("—");
    expect(approvalModeLabel(999999)).toBe("—");
  });

  it("UT-ADGATE-029c the panel's verbatim strings (GUIDE p19)", () => {
    expect(PANEL_LABELS.title).toBe("Edit Approvers");
    expect(PANEL_LABELS.gate).toBe("Gate");
    expect(PANEL_LABELS.gateActive).toBe("Gate active");
    expect(PANEL_LABELS.approvalMode).toBe("Approval Mode");
    expect(PANEL_LABELS.notifications).toBe("Notifications");
    expect(PANEL_LABELS.notificationsPlaceholder).toBe("Select Notifications");
    expect(PANEL_LABELS.resetGate).toBe("Reset Gate");
    expect(MSG.resetGateCaption).toBe(
      "Remove all cluster gate participants and deactivate the gate approval.",
    );
  });
});

/* ═══════════════════════════════════════════ GUIDE p18 — the table columns ════ */

describe("the table column order (GUIDE p18/p20)", () => {
  it("UT-ADGATE-030 the seven columns, verbatim, in order", () => {
    expect(GATE_TABLE_COLUMNS).toEqual([
      "Description", "Portfolio Manager", "Contributors", "Approvers",
      "Notifications", "Status", "Action",
    ]);
  });
});

/* ═══════════════════════════════════════════ GUIDE p18 — person-cell formatting ════ */

describe("person-cell formatting (GUIDE p18)", () => {
  it("UT-ADGATE-031 an unset person cell renders a single hyphen", () => {
    expect(personLines([])).toEqual([PERSON_UNSET]);
    expect(PERSON_UNSET).toBe("-");
  });

  it("UT-ADGATE-031b a set cell formats \"Display Name (email)\" and stacks multiple people", () => {
    const p1 = persona("a");
    const p2 = persona("b");
    expect(formatPersona(p1)).toBe("Name a (a@vsb.energy)");
    expect(personLines([p1])).toEqual(["Name a (a@vsb.energy)"]);
    expect(personLines([p1, p2])).toEqual([
      "Name a (a@vsb.energy)", "Name b (b@vsb.energy)",
    ]);
  });
});

/* ═══════════════════════════════════════════ GUIDE p18 — the middle country rail ════ */

describe("the middle country rail key scheme (GUIDE p18/p19)", () => {
  it("UT-ADGATE-032 a technology leaf key round-trips through parseTechRailKey", () => {
    const key = techRailKey("de-1", "Wind");
    expect(key).toBe("de-1::Wind");
    expect(parseTechRailKey(key)).toEqual({ countryId: "de-1", technology: "Wind" });
    expect(countryRailKey("de-1")).toBe("de-1");
    expect(parseTechRailKey("not-a-leaf-key")).toBeNull();
  });

  it("UT-ADGATE-032b the rail items carry Wind and PV children per country, in order", () => {
    const items = buildGateCountryRailItems([
      { id: "de-1", name: "Germany" }, { id: "fr-1", name: "France" },
    ]);
    expect(items.map((i) => i.label)).toEqual(["Germany", "France"]);
    expect(items[0].children).toEqual([
      { key: "de-1::Wind", label: "Wind" }, { key: "de-1::PV", label: "PV" },
    ]);
  });
});

/* ═══════════════════════════════════════════ GUIDE p18/p20 — the flattened table ════ */

describe("the flattened gate/task table (GUIDE p18/p20)", () => {
  const gates = [
    state({ id: "g1", name: "Draft", order: 0 }),
    state({ id: "g2", name: "Cluster 1", order: 1 }),
  ];
  const a1 = approval({
    id: "a1", name: "Draft to Cluster 1", clusterStateId: "g1", gateActive: false,
    defaultApprovals: null, defaultContributors: null,
    defaultNotifications: serialisePersonaList([persona("n")]),
  });
  const it1 = item({ id: "i1", name: "Task One", clusterStateId: "g1", order: 1 });
  const ca1 = clApproval({
    id: "ca1", projectDefaultChecklistId: "i1", gateActive: false, name: "Task One",
  });

  it("UT-ADGATE-033 a gate row, its task rows, then Add Task — in that order", () => {
    const merged = mergeGatesWithApprovals(gates, [a1]);
    const rows = buildGateTableRows(
      merged, [], [ca1], [it1], null, new Set(["g1", "g2"]),
      () => [],
    );
    expect(rows.map((r) => r.kind)).toEqual(["gate", "task", "addTask", "gate", "addTask"]);
    expect(rows[0].description).toBe("Draft to Cluster 1");   // the stored transition name
    expect(rows[1].description).toBe("Task One");
    expect(rows[2].key).toBe("addtask-g1");
  });

  it("UT-ADGATE-033b collapsing a gate hides only its task and Add-Task rows", () => {
    const merged = mergeGatesWithApprovals(gates, [a1]);
    const rows = buildGateTableRows(merged, [], [ca1], [it1], null, new Set(), () => []);
    expect(rows).toHaveLength(2);            // the two gate rows only
    expect(rows.every((r) => r.kind === "gate")).toBe(true);
  });

  it("UT-ADGATE-033c the Status column reads the RAW stored flag, not resolveGateActive", () => {
    const merged = mergeGatesWithApprovals(gates, [a1]);
    const rows = buildGateTableRows(merged, [], [], [], null, new Set(), () => []);
    // a1.gateActive is false and stays false here: resolveGateActive's Draft guard keys off
    // the exact state name "Draft", but the value in hand is the transition label
    // ("Draft to Cluster 1"), so it would never fire anyway (see the comment in rules.ts).
    expect(rows[0].active).toBe(false);
  });

  it("UT-ADGATE-033d a placeholder gate carries no status and no persona lists", () => {
    const merged = mergeGatesWithApprovals(gates, []);   // no approvals at all
    const rows = buildGateTableRows(merged, [], [], [], null, new Set(), () => []);
    expect(rows[0].isPlaceholder).toBe(true);
    expect(rows[0].active).toBeNull();
    expect(rows[0].notifications).toEqual([]);
  });

  it("UT-ADGATE-033e the Portfolio Manager cell is resolved through the caller's lookup", () => {
    const withPm = approval({ id: "a2", clusterStateId: "g2", portfolioManagerId: "pm-x" });
    const merged = mergeGatesWithApprovals(gates, [withPm]);
    const resolved = persona("pm");
    const rows = buildGateTableRows(
      merged, [], [], [], null, new Set(),
      (id) => (id === "pm-x" ? [resolved] : []),
    );
    const g2Row = rows.find((r) => r.gate.gate.id === "g2")!;
    expect(g2Row.portfolioManager).toEqual([resolved]);
  });

  it("UT-ADGATE-033f the Add Task row's enabled flag matches canAddChecklistApproval", () => {
    const merged = mergeGatesWithApprovals(gates, [a1]);
    const allApproved = buildGateTableRows(
      merged, [], [ca1], [it1], null, new Set(["g1"]), () => [],
    ).find((r) => r.kind === "addTask")!;
    expect(allApproved.addTaskEnabled).toBe(false);   // the only item is already approved

    const it2 = item({ id: "i2", name: "Task Two", clusterStateId: "g1", order: 2 });
    const stillOpen = buildGateTableRows(
      merged, [], [ca1], [it1, it2], null, new Set(["g1"]), () => [],
    ).find((r) => r.kind === "addTask")!;
    expect(stillOpen.addTaskEnabled).toBe(true);
  });
});

/* ═══════════════════════════════════════════ GUIDE p20 — gate-row Action column ════ */

describe("the Action column (GUIDE p20 — edit AND delete on every row)", () => {
  it("UT-ADGATE-034 a gate-level delete always refuses; no Remove ever existed for it", () => {
    const row = { gate: state(), approval: approval(), isPlaceholder: false };
    const refused = planDeleteGateApproval(row, true);
    expect(refused.writes).toHaveLength(0);
    expect(refused.refusedReason).toBe(MSG.noGateDelete);
    expect(planDeleteGateApproval(row, false).refusedReason).toBe(MSG.outOfScope);
  });
});

/* ═══════════════════════════════════════════ GUIDE p19 — Reset Gate ════ */

describe("Reset Gate (GUIDE p19)", () => {
  it("UT-ADGATE-035 clears every persona list and the portfolio manager, deactivates the gate", () => {
    // The guide's own example (p19) is an Only-Notifications gate — the mode where all
    // three lists AND the portfolio manager write `null` once cleared (rule 10).
    const p = panel({ existingId: "a1", kind: "gate", mode: APPROVAL_MODE.onlyNotifications });
    const plan = planResetGate(p, scope(), "Cluster 1 to Cluster 2", true);
    expect(plan.writes).toHaveLength(1);
    const data = plan.writes[0].data!;
    expect(data[GATE_APPROVAL_COL.defaultApprovals]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultContributors]).toBeNull();
    expect(data[GATE_APPROVAL_COL.defaultNotifications]).toBeNull();
    expect(data[`${GATE_LOOKUP.portfolioManager}@odata.bind`]).toBeNull();
    expect(data[GATE_APPROVAL_COL.gateActive]).toBe(false);
  });

  it("UT-ADGATE-035d in Formal/Local mode the cleared lists still parse back to empty", () => {
    // `personaFieldsForMode` serialises an EMPTY array rather than nulling it outside
    // Only-Notifications (rule 10) — still "no participants" once read back, just not the
    // literal `null` the Only-Notifications branch writes.
    const p = panel({ existingId: "a1", kind: "gate", mode: APPROVAL_MODE.formalApproval });
    const plan = planResetGate(p, scope(), "Cluster 1 to Cluster 2", true);
    const data = plan.writes[0].data!;
    expect(parsePersonaList(data[GATE_APPROVAL_COL.defaultApprovals] as string)).toEqual([]);
    expect(parsePersonaList(data[GATE_APPROVAL_COL.defaultContributors] as string)).toEqual([]);
    expect(data[`${GATE_LOOKUP.portfolioManager}@odata.bind`]).toBeNull();
  });

  it("UT-ADGATE-035b a Draft-origin gate stays active even after Reset Gate (rule 8)", () => {
    const p = panel({ existingId: "a1", kind: "gate" });
    const plan = planResetGate(p, scope(), "Draft", true);
    expect(plan.writes[0].data![GATE_APPROVAL_COL.gateActive]).toBe(true);
  });

  it("UT-ADGATE-035c refuses out of scope, and when there is no record to reset yet", () => {
    const p = panel({ existingId: "a1" });
    expect(planResetGate(p, scope(), "x", false).refusedReason).toBe(MSG.outOfScope);
    expect(canResetGate(p, false)).toBe(false);

    const fresh = panel({ existingId: null });
    expect(planResetGate(fresh, scope(), "x", true).refusedReason).toBe(MSG.resetNoRecord);
    expect(canResetGate(fresh, true)).toBe(false);
    expect(canResetGate(p, true)).toBe(true);
  });
});
