/**
 * Project Gates — every business rule of the canvas `Admin Project Gates Approvals Screen`
 * as pure functions. No React, no I/O: the grid, the editor and the payloads are all
 * selectors over the dataset `@/data/adminGatesApprovals` returns.
 *
 * Canvas source: `ProjectDocs/_extracted/msapp/projectmanagement/Src/Admin Project Gates Approvals Screen.pa.yaml`.
 * Citations name the canvas control and property (`ControlName.Property`); `PGAS:<line>` is the
 * line in that file.
 *
 * This screen only writes the DEFAULT rows (`Project Default Approvals`, `Check List Default
 * Approvals`). No flow or plugin fires on either table; the approval flows only READ these rows
 * later from PM Checklist, so the persona JSON shape is kept exactly (D22).
 *
 * Every departure from the canvas is marked `DIVERGENCE:` or `SOURCE DEFECT:` where it is coded
 * (D22; `ProjectDocs/app-docs/09-APPLICATION-SETTINGS-PORT-OPEN-POINTS.md` §2).
 */
import { bindPath, owningBusinessUnitBind } from "@/data/odata";
import { CHECKLIST_ENTITY_SETS, ES_PROCESS } from "@/data/dataverseNames";
import { emptyPlan, guardedUpdate, refusePlan, type PlannedWrite, type WritePlan } from "@/data/writePlan";
import { scopeBreadcrumb } from "@/domain/countryPicker";
import { GATE_TECHNOLOGIES, technologyOptionLabel } from "@/domain/technology";
import type {
  GateTaskApproval, DefaultChecklist, GateTemplate, GatesDataset, Payload,
  PersonRef, ProjectState,
} from "@/data/adminGatesApprovals";

/* ═══════════════════════════════════════════════════════════════ constants ══ */

/** Global choice `vsb_approvalmode`. */
export const MODE = { Formal: 952850000, Local: 952850001, OnlyNotifications: 952850002 } as const;
export type ApprovalMode = (typeof MODE)[keyof typeof MODE];

/** `rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Items` — `Choices('Approval Mode')`, the Dataverse option labels. */
export const MODE_OPTIONS: readonly { value: ApprovalMode; label: string }[] = [
  { value: MODE.Formal, label: "Formal Approval" },
  { value: MODE.Local, label: "Local Approval" },
  { value: MODE.OnlyNotifications, label: "Only Notifications" },
];

/** The PowerCAT pickers' `MaxPeople` (PGAS:3087, 3216, 3348, 3478). */
export const MAX_PEOPLE = { portfolioManager: 1, contributors: 20, approvers: 5, notifications: 20 } as const;

/** Column max lengths of the JSON participant columns. */
export const JSON_MAX = { gate: 4000, task: 1000 } as const;

/**
 * `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval1_ErrorMessage.Text` (and its siblings
 * `…_Approval2_ErrorMessage`, `…_Approvals_ErrorMessage`, `…_Notifications_ErrorMessage`) — verbatim.
 */
export const EMPTY_MESSAGE = "Value cannot be empty.";
/** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State_ErrMessage.Text` — verbatim (PGAS:2656). */
export const GATE_BLANK_MESSAGE = "The cluster cannot be blank.";
/**
 * DIVERGENCE: `lbl_Admin_ProjectGates_Approvals_Form_Fields_State_ErrMessage_1.Text` is
 * "The cluster cannot be blank." under the Check List field (PGAS:2799); this app reworded it to
 * name the field. D22 recorded the canvas wording as kept, and `UT-ADGATE` rules tests pin this
 * wording, so the choice needs a product decision.
 */
export const CHECKLIST_BLANK_MESSAGE = "The check list item cannot be blank.";
/**
 * `lbl_Admin_ProjectGates_Approvals_Form_Fields_Main_ErrorMessage.Text` — verbatim, including the
 * canvas misspelling "allready" (PGAS:2620). When it shows is a DIVERGENCE (see `hasGateConflict`).
 */
export const DUPLICATE_GATE_MESSAGE = "Default Approval for the selected Gate allready exists.";
/** `lbl_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval_Description.Text` — verbatim (PGAS:3586). */
export const RESET_GATE_DESCRIPTION = "Remove all cluster gate participants and deactivate the gate approval.";
/** NEW — no canvas equivalent: shown when a user without admin access reaches a write handler. */
export const NO_PERMISSION_MESSAGE = "You do not have permission to change the default approvals.";
/** NEW — no canvas equivalent: a stored participant whose key is not an Entra object id cannot be written as a bind. */
export const INVALID_PERSON_MESSAGE = "Invalid person, remove and re-add.";

/**
 * Canvas captions, verbatim (CONVENTIONS rule 7). Where the canvas sets no literal
 * `AccessibleLabel`, the same caption is the control's `aria-label` (rule 16).
 */
export const LABELS = {
  /** `cmp_Admin_ProjectGatest_Approvals_Header.Project.Name` — verbatim; also the headline's lead. */
  pageTitle: "Project Gates",
  /** `btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse.Text` — verbatim, the expanded arm. */
  collapse: "-",
  /** `btn_Admin_ProjectGates_DefaultClusterApproval_Item_Collapse.Text` — verbatim, the collapsed arm. */
  expand: "+",
  /** `btn_…_Item_Edit.Icon` and `btn_…_ChecklistDefaultApproval_Item_Edit.Icon` (`="Edit"`) — the icon-only buttons' caption. */
  edit: "Edit",
  /** `btn_…_ChecklistDefaultApproval_Item_Delete.Icon` (`="Delete"`) — the icon-only button's caption. */
  delete: "Delete",
  /**
   * `but_Admin_ProjectGatest_Approvals_Row_Edit_3.Text` — `"   Add Task"`; the leading spaces only
   * made room for the button's `Add` icon, which the code app draws itself.
   */
  addTask: "Add Task",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.Title` — verbatim. */
  deleteTitle: "Delete Check List Approval Item?",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.ConfirmButtonText` — verbatim. */
  deleteConfirm: "Delete",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State.Text` — verbatim. */
  gate: "Gate",
  /** `drp_Admin_ProjectGates_Approvals_Form_Fields_State.AccessibleLabel` — verbatim (the Gate field's `aria-label`). */
  gateAccessible: "Project Status",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State_1.Text` — verbatim. */
  checkList: "Check List",
  /** `tog_Admin_ProjectGates_Approvals_Form_Fields_Active.Label` — verbatim. */
  gateActive: "Gate active",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Text` — verbatim. */
  approvalMode: "Approval Mode",
  /** `btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval.Text` — verbatim. */
  resetGate: "Reset Gate",
} as const;

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const isGuidLike = (value: string | null | undefined) => Boolean(value && GUID_RE.test(value));

/** `drp_Admin_ProjectGates_Approvals_Form_Fields_State.Items`: states whose name makes the PREVIOUS state drop out of the Gate list (PGAS:2722-2727). */
const TERMINAL_NEXT_STATES = ["Inactive/ On-hold", "Abandoned"];

/* ═════════════════════════════════════════════════ country × technology ══ */
// The rail (countries, order, exclusions, Wind/PV, default Germany / Wind) is the shared
// picker configured for this screen: `pickerCountries(rows, GATE_COUNTRY_RULE)`,
// `GATE_TECHNOLOGIES`, `GATE_DEFAULT` (`@/domain/countryPicker`, `@/domain/technology`).

/** The selected context. `technology` is the `vsb_technology` choice CODE. */
export interface GateContext {
  countryId: string;
  countryName: string;
  technology: number;
}

/**
 * `lbl_Admin_ProjectGates_Approvals_Headline.Text` (PGAS:417-422) —
 * `$"Project Gates | {SelectedCountry.Name} {If(IsBlank(tech), "", "| " & tech)}"`, built with the
 * shared `scopeBreadcrumb` and this screen's `" | "` separator.
 * DIVERGENCE: with no country or technology the canvas renders "Project Gates |  "; this app shows
 * "Project Gates". The Wind/PV picker always has a selection, so only the no-country case reaches it.
 */
export function headline(ctx: { countryName: string; technology: number } | null): string {
  return scopeBreadcrumb(LABELS.pageTitle, ctx?.countryName, ctx ? technologyOptionLabel(ctx.technology) : undefined, " | ");
}

/* ═════════════════════════════════════════════════════════════════ gates ══ */

const byOrder = (a: { order: number | null }, b: { order: number | null }) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);

/**
 * `gal_Admin_ProjectGates_DefaultApprovals_Clusters.Items` — `varAllGates: Filter('Project States',
 * 'Is Visible On Checklist', Order < 6)`, then `Sort(…, Order)`: visible on checklist AND order < 6,
 * sorted numerically.
 */
export function visibleGateStates(states: readonly ProjectState[]): ProjectState[] {
  return states
    .filter((s) => s.visibleOnChecklist && s.order !== null && s.order < 6)
    .sort(byOrder);
}

/**
 * `lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ApprovalDescription.Text` (PGAS:1790-1796) —
 * `Switch(ThisItem.Order, 0, "Draft to Cluster 1", $"Cluster {Order} to Cluster {Order + 1}")`, verbatim.
 */
export function gateDescription(order: number): string {
  return order === 0 ? "Draft to Cluster 1" : `Cluster ${order} to Cluster ${order + 1}`;
}

/** The state with order + 1 (searched across ALL states, as the canvas `LookUp` does). */
export function nextState(states: readonly ProjectState[], state: ProjectState): ProjectState | undefined {
  if (state.order === null) return undefined;
  return states.find((s) => s.order === (state.order as number) + 1);
}

/**
 * `drp_Admin_ProjectGates_Approvals_Form_Fields_State.Items` (PGAS:2705-2717): the canvas Gate list is
 * `FirstN(Filter(allStates, 'Is Visible On Checklist'), CountRows(…) − 1)`, so the last visible
 * state (over ALL visible states, not only order < 6) never has a label. States without an order
 * do not take part.
 * DIVERGENCE: the canvas sorts `allStates` by `strOrder = Text(Order)`, a TEXT sort, so with an
 * order of 10 or more it drops a different state ("9" sorts after "10"). This app takes the
 * numerically highest order. Orders 0–9 give the same result.
 */
export function isLastVisibleState(states: readonly ProjectState[], state: ProjectState): boolean {
  if (!state.visibleOnChecklist || state.order === null) return false;
  const orders = states.filter((s) => s.visibleOnChecklist && s.order !== null).map((s) => s.order as number);
  return orders.length > 0 && state.order === Math.max(...orders);
}

/**
 * The Gate field's label, `drp_…_State.Items` `Label: Name & " to " & nextStateName`, or null when
 * the gate is not in the canvas Gate list (PGAS:2705-2727): the state is not visible on checklist,
 * it is the last visible state, its next state is "Inactive/ On-hold" / "Abandoned", or there is
 * no next state.
 */
export function gateLabel(states: readonly ProjectState[], state: ProjectState): string | null {
  if (!state.visibleOnChecklist || isLastVisibleState(states, state)) return null;
  const next = nextState(states, state);
  if (!next || TERMINAL_NEXT_STATES.includes(next.name.trim())) return null;
  return `${state.name} to ${next.name}`;
}

export interface GateRow {
  /** Collapse key: the gate ORDER, stable across refetches. */
  order: number;
  state: ProjectState;
  description: string;
  /** Saved template, or null for an unsaved placeholder. */
  template: GateTemplate | null;
  /** How many saved templates exist for this gate (> 1 = data-integrity warning). */
  templateCount: number;
}

/**
 * `gal_Admin_ProjectGates_DefaultApprovals_Clusters.Items`: one row per visible gate, whether or
 * not a template exists (`Coalesce(LookUp(varColSortedApprovals, Order = Gate.Order), <placeholder>)`).
 * DIVERGENCE: the canvas `LookUp` takes whichever duplicate the server returns first and says
 * nothing; this app takes the oldest by `createdon` and counts the duplicates (`templateCount`)
 * so the grid can warn about them.
 */
export function buildGateRows(states: readonly ProjectState[], templates: readonly GateTemplate[]): GateRow[] {
  return visibleGateStates(states).map((state) => {
    const matches = templates
      .filter((t) => t.stateId !== null && t.stateId.toLowerCase() === state.id.toLowerCase())
      .sort((a, b) => (a.createdOn ?? "").localeCompare(b.createdOn ?? ""));
    return {
      order: state.order as number,
      state,
      description: gateDescription(state.order as number),
      template: matches[0] ?? null,
      templateCount: matches.length,
    };
  });
}

/**
 * The Draft gate is order 0. The canvas tests the state NAME (`drp_…_State.Selected.Name <> "Draft"`)
 * in the panel and `'Cluster State'.Order = 0` on the grid pill; for the Draft state both agree.
 */
export const isDraftGate = (row: Pick<GateRow, "order">) => row.order === 0;

/* ══════════════════════════════════════════════════════════ checklist tasks ══ */

export interface TaskRow {
  approval: GateTaskApproval;
  checklist: DefaultChecklist;
}

const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * A checklist task is shown — as a nested row or as an Add Task option —
 * only while it is active and not marked "To Delete" by Check List Settings.
 * DIVERGENCE: the canvas filters neither (`gal_…_ChecklistDefaultApprovals.Items`,
 * `drp_…_State_1.Items` and `but_…_Row_Edit_3.DisplayMode` read every `Project Default Checklists`
 * row of the scope), so it lists inactive and "To Delete" tasks too (doc 09 §2).
 */
export const isShownChecklist = (c: Pick<DefaultChecklist, "active" | "toDelete">) => c.active && !c.toDelete;

/**
 * `gal_Admin_ProjectGates_DefaultClusterApproval_Item_ChecklistDefaultApprovals.Items`: approvals
 * whose (shown) checklist belongs to this gate, sorted by the checklist's `Order`.
 */
export function tasksOfGate(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): TaskRow[] {
  const out: TaskRow[] = [];
  for (const approval of data.approvals) {
    const checklist = data.checklists.find((c) => sameId(c.id, approval.checklistId));
    if (checklist && isShownChecklist(checklist) && sameId(checklist.stateId, state.id)) out.push({ approval, checklist });
  }
  return out.sort((a, b) => byOrder(a.checklist, b.checklist));
}

/**
 * `drp_Admin_ProjectGates_Approvals_Form_Fields_State_1.Items` on create: this gate's shown
 * checklist tasks that have NO approval yet. `DefaultSelectedItems` is the first of them.
 */
export function taskCandidates(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): DefaultChecklist[] {
  return data.checklists
    .filter(isShownChecklist)
    .filter((c) => sameId(c.stateId, state.id))
    .filter((c) => !data.approvals.some((a) => sameId(a.checklistId, c.id)))
    .sort(byOrder);
}

/**
 * `but_Admin_ProjectGatest_Approvals_Row_Edit_3.DisplayMode`: Add Task is enabled only while the
 * gate has a (shown) task without an approval. The canvas compares against every `Check List
 * Default Approvals` row; a template belongs to one country × technology, so for real data that
 * equals this check over the dataset's approvals (D22).
 */
export function canAddTask(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): boolean {
  return taskCandidates(data, state).length > 0;
}

/* ═══════════════════════════════════════════════════════ participant JSON ══ */

/**
 * The canvas contract `[{"PersonaKey","PersonaName","PersonaRole"}]` (`ParseJSON(ThisItem.'Default
 * Contributors')` and its siblings in the Edit handlers). `PersonaKey` is the Entra object id,
 * `PersonaRole` the e-mail. Null, blank or malformed JSON yields `[]`; it never throws.
 */
export function parsePeople(json: string | null | undefined): PersonRef[] {
  if (!json || !json.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
      .map((v) => ({
        entraId: String(v["PersonaKey"] ?? ""),
        name: String(v["PersonaName"] ?? ""),
        mail: String(v["PersonaRole"] ?? ""),
      }))
      .filter((p) => p.entraId || p.name || p.mail);
  } catch {
    // Unreadable JSON is shown as an empty list.
    return [];
  }
}

/**
 * `JSON(ShowColumns(pcf_….SelectedPeople, PersonaKey, PersonaName, PersonaRole))` in
 * `pcf_but_…_Save.OnChange`. An empty list is `null` (the canvas `Blank()`), never `[]`; key
 * names and order exactly as the canvas writes them.
 */
export function serializePeople(people: readonly PersonRef[]): string | null {
  if (people.length === 0) return null;
  return JSON.stringify(people.map((p) => ({ PersonaKey: p.entraId, PersonaName: p.name, PersonaRole: p.mail })));
}

/**
 * Picker suggestions = search hits minus the people already selected (ids case-insensitive).
 * SOURCE DEFECT: the canvas `Suggestions_Items` is `Filter(colApprovalsN, Not(ThisRecord.Mail in
 * ShowColumns(Self.SelectedPeople, PersonaRole)))`, but `OnSearch` renamed `Mail` to `EMail`, so
 * the filter compared a column that does not exist and selected people were still suggested.
 * This app filters by Entra id.
 * DIVERGENCE: the canvas Portfolio Manager picker shows `colApprovals1` unfiltered; here it is
 * filtered too (with its maximum of 1 the search box is hidden once someone is picked).
 */
export function pickerSuggestions(hits: readonly PersonRef[], selected: readonly PersonRef[]): PersonRef[] {
  const selectedIds = new Set(selected.map((p) => p.entraId.toLowerCase()));
  return hits.filter((p) => p.entraId && !selectedIds.has(p.entraId.toLowerCase()));
}

/* ═════════════════════════════════════════════════════════════ grid cells ══ */

export type ParticipantNoun = "Contributors" | "Approvers" | "Notifications";

export interface ParticipantCell {
  /** "list" (< 4 people), "chip" (≥ 4, "n Approvers") or "empty" ("-"). */
  kind: "list" | "chip" | "empty";
  people: PersonRef[];
  chipText: string;
  /** Full list, one person per entry: `"Name\n(mail)"`. Blank when empty. */
  tooltip: string;
  /**
   * Text appended after every listed person but the last in the cell text
   * (the canvas `Concat` separator minus its line breaks). Empty = none.
   */
  listSeparator: string;
}

const personLines = (p: PersonRef) => (p.mail ? `${p.name}\n(${p.mail})` : p.name);

function cell(
  people: PersonRef[], noun: ParticipantNoun, asList: boolean, tooltipSeparator = "\n\n", listSeparator = "",
): ParticipantCell {
  return {
    kind: people.length === 0 ? "empty" : asList ? "list" : "chip",
    people,
    chipText: `${people.length} ${noun}`,
    tooltip: people.map(personLines).join(tooltipSeparator),
    listSeparator,
  };
}

/**
 * `lbl_Admin_ProjectGates_DefaultClusterApproval_Item_ControllingApprovals.Text` /
 * `…_Item_Approvers.Text` / `…_Item_Notifications.Text` (gate rows) and
 * `…_ChecklistDefaultApproval_Item_Contributors.Text` / `…_Item_Approvers.Text` (task rows):
 * a list when fewer than 4, the chip "n Contributors" etc. when 4 or more, "-" when none. Cell
 * text joins with `"\n\n"` (PGAS:1150-1154, 1906-1910). Tooltip: Contributors `";\n\n"`
 * (PGAS:1175-1179, 1931-1935); Approvers / Notifications `"\n\n"` (PGAS:2051-2055, 2173-2177).
 */
export function participantCell(people: PersonRef[], noun: ParticipantNoun): ParticipantCell {
  return cell(people, noun, people.length < 4, noun === "Contributors" ? ";\n\n" : "\n\n");
}

/**
 * `lbl_…_ChecklistDefaultApproval_Item_Notifications.Text`: the task-row Notifications cell lists names when ALL three lists
 * have fewer than 4 entries, or there is exactly 1 notification (PGAS:1396-1407).
 * The cell TEXT joins with `";\n\n"` (PGAS:1398-1402) — a `;` after every
 * person but the last — and the TOOLTIP with `"\n\n"` (PGAS:1423-1427).
 */
export function taskNotificationsCell(contributors: PersonRef[], approvers: PersonRef[], notifications: PersonRef[]): ParticipantCell {
  const asList =
    (contributors.length < 4 && approvers.length < 4 && notifications.length < 4) || notifications.length === 1;
  return cell(notifications, "Notifications", asList, "\n\n", ";");
}

/**
 * The Portfolio Manager cell: gate rows `btn_Admin_ProjectGates_DefaultClusterApproval_Item_PortfolioManager`
 * (PGAS:1830-1835, `Coalesce('Display Name', "-")`, tooltip `$"{Self.Text}, ({Mail})"`); task rows
 * `lbl_…_ChecklistDefaultApproval_Item_PortfolioManager` (PGAS:1077, name and mail on two lines;
 * the view adds the mail line).
 * DIVERGENCE: an id that does not resolve shows "Unknown user" with the tooltip "Entra id …" (NEW;
 * the canvas lookup is a relationship and always resolves); a blank PM has no tooltip (canvas
 * "-, ()"); the task-row tooltip omits the mail line the canvas `Self.Text` contains.
 */
export function pmCell(pmId: string | null, people: Record<string, PersonRef>): { text: string; mail: string; tooltip: string } {
  if (!pmId) return { text: "-", mail: "", tooltip: "" };
  const p = people[pmId.toLowerCase()];
  if (!p) return { text: "Unknown user", mail: "", tooltip: `Entra id ${pmId}` };
  return { text: p.name || "-", mail: p.mail, tooltip: `${p.name}, (${p.mail})` };
}

/** Power Fx `IsBlank` on a text column: null / undefined or the empty string only. */
const isBlankText = (value: string | null | undefined) => value === null || value === undefined || value === "";

/**
 * `btn_Admin_ProjectGates_DefaultClusterApproval_Item_ToggleStauts.DisplayMode` (PGAS:2217): the
 * gate pill is read-only for Draft, for placeholders (no row to patch), and for rows with
 * no contributors, approvers and notifications (the PM is not considered — canvas parity).
 * Like the canvas `IsBlank(ThisItem.'Default Contributors') && …`, the RAW
 * stored text is tested, not the parsed list — a legacy `"[]"` (or unreadable JSON) keeps the
 * pill clickable.
 */
export function isGateToggleLocked(row: GateRow): boolean {
  if (isDraftGate(row) || !row.template) return true;
  const t = row.template;
  return isBlankText(t.contributors) && isBlankText(t.approvals) && isBlankText(t.notifications);
}

/* ═════════════════════════════════════════════════════════════════ editor ══ */

export interface ApprovalForm {
  mode: ApprovalMode;
  gateActive: boolean;
  /** At most one (MAX_PEOPLE.portfolioManager). */
  portfolioManager: PersonRef[];
  contributors: PersonRef[];
  approvers: PersonRef[];
  notifications: PersonRef[];
  /** Task editor only: the selected Project Default Checklist. */
  checklistId: string | null;
}

export type PeopleRole = "portfolioManager" | "contributors" | "approvers" | "notifications";

/** The people fields' captions (also their grid column headers). */
export const ROLE_LABEL: Record<PeopleRole, string> = {
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval1.Text` — verbatim. */
  portfolioManager: "Portfolio Manager",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval2.Text` — verbatim. */
  contributors: "Contributors",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approvals.Text` — verbatim. */
  approvers: "Approvers",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Notifications.Text` — verbatim. */
  notifications: "Notifications",
};

/** The people pickers' placeholders. */
export const ROLE_PLACEHOLDER: Record<PeopleRole, string> = {
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_PortfolioManger.HintText` — verbatim. */
  portfolioManager: "Select Portfolio Manager",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approval2.HintText` — verbatim. */
  contributors: "Select Contributors",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals.HintText` — verbatim. */
  approvers: "Select Approvers",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications.HintText` — verbatim. */
  notifications: "Select Notifications",
};

const asMode = (value: number | null | undefined): ApprovalMode =>
  value === MODE.Formal || value === MODE.Local || value === MODE.OnlyNotifications ? value : MODE.OnlyNotifications;

/**
 * `rad_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Items` — `If(SelectedNestedValue in
 * ["Wind", "PV"], Choices('Approval Mode'), ['Approval Mode'.'Only Notifications'])`.
 * DIVERGENCE: for a non-Wind/PV gate the canvas Edit handler also silently resets the stored row
 * (Only Notifications, all four participants blank) the moment Edit is clicked; this app writes
 * nothing on open. D22 kept a banner for that case (PO answer 3); this screen no longer shows it.
 * The Wind/PV picker cannot reach the case.
 */
export function modeOptions(technology: number) {
  return GATE_TECHNOLOGIES.some((t) => t.code === technology)
    ? MODE_OPTIONS
    : MODE_OPTIONS.filter((o) => o.value === MODE.OnlyNotifications);
}

/** One PM seed for both editors. An unresolved PM keeps its id so it is not lost. */
function seedPm(pmId: string | null, people: Record<string, PersonRef>): PersonRef[] {
  if (!pmId) return [];
  return [people[pmId.toLowerCase()] ?? { entraId: pmId, name: "Unknown user", mail: "" }];
}

/**
 * The gate editor's form (`btn_…_Item_Edit.OnSelect` pre-fills `colApprovals1..4PreSelected` and
 * the toggle and radio defaults), seeded from THIS row only. A placeholder starts active and in
 * Only Notifications, as the canvas create-on-open row did (`'Gate active': true`, PGAS:2321).
 * DIVERGENCE: the canvas `Patch`es that blank row into Dataverse when Edit is clicked, so Cancel
 * leaves an orphan; this app writes nothing until Save (D22).
 */
export function seedGateForm(row: GateRow, people: Record<string, PersonRef>): ApprovalForm {
  const t = row.template;
  return {
    mode: asMode(t?.mode),
    gateActive: t ? t.gateActive : true,
    portfolioManager: seedPm(t?.pmId ?? null, people),
    contributors: parsePeople(t?.contributors),
    approvers: parsePeople(t?.approvals),
    notifications: parsePeople(t?.notifications),
    checklistId: null,
  };
}

/**
 * The task editor in edit mode (`btn_…_ChecklistDefaultApproval_Item_Edit.OnSelect`): seeded from
 * the task row, including the PM.
 * SOURCE DEFECT: the canvas pre-fills the Portfolio Manager from `Users` with columns the picker
 * does not read, so it always showed empty; this app resolves it from Entra, as for gates (D22).
 */
export function seedTaskForm(task: TaskRow, people: Record<string, PersonRef>): ApprovalForm {
  const a = task.approval;
  return {
    mode: asMode(a.mode),
    gateActive: a.gateActive,
    portfolioManager: seedPm(a.pmId, people),
    contributors: parsePeople(a.contributors),
    approvers: parsePeople(a.approvers),
    notifications: parsePeople(a.notifications),
    checklistId: task.checklist.id,
  };
}

/**
 * The task editor in create mode (`but_Admin_ProjectGatest_Approvals_Row_Edit_3.OnSelect`): a fresh
 * form, inactive, Only Notifications, the first candidate preselected (`drp_…_State_1.DefaultSelectedItems`,
 * PGAS:2833-2864).
 * DIVERGENCE: the canvas `Patch`es a blank `Check List Default Approvals` row when Add Task is
 * clicked (an orphan on Cancel); this app writes nothing until Save (D22).
 */
export function emptyTaskForm(candidates: readonly DefaultChecklist[]): ApprovalForm {
  return {
    mode: MODE.OnlyNotifications,
    gateActive: false,
    portfolioManager: [],
    contributors: [],
    approvers: [],
    notifications: [],
    checklistId: candidates[0]?.id ?? null,
  };
}

export interface FieldRule { visible: boolean; required: boolean }

/**
 * Field visibility and requiredness by approval mode: `con_…_Approval1.Visible` /
 * `con_…_Approval2.Visible` (Formal Approval), `con_…_Approvals.Visible` (not Only Notifications),
 * and the `lbl_…_ErrorMessage.Visible` rules that make each list required in the same modes
 * (Notifications only in Only Notifications).
 */
export function fieldRules(mode: ApprovalMode): Record<PeopleRole, FieldRule> {
  const formal = mode === MODE.Formal;
  const notifyOnly = mode === MODE.OnlyNotifications;
  return {
    portfolioManager: { visible: formal, required: formal },
    contributors: { visible: formal, required: formal },
    approvers: { visible: !notifyOnly, required: !notifyOnly },
    notifications: { visible: true, required: notifyOnly },
  };
}

/**
 * The people a save will actually write per role, as `pcf_but_…_Save.OnChange` does: Portfolio
 * Manager and Contributors only in Formal Approval, Approvers unless Only Notifications,
 * Notifications always (hidden roles are written as null, the canvas `Blank()`).
 */
export function effectivePeople(form: ApprovalForm): Record<PeopleRole, PersonRef[]> {
  const rules = fieldRules(form.mode);
  return {
    portfolioManager: rules.portfolioManager.visible ? form.portfolioManager.slice(0, 1) : [],
    contributors: rules.contributors.visible ? form.contributors : [],
    approvers: rules.approvers.visible ? form.approvers : [],
    notifications: form.notifications,
  };
}

/** What the panel was opened on. Each open builds a new target and a new form. */
export type EditorTarget =
  | {
    kind: "gate"; row: GateRow; label: string | null;
    /** The gate is the highest visible state — canvas saves `vsb_name = " "`, Save allowed. */
    blankLabelAllowed?: boolean;
  }
  | {
    kind: "task"; mode: "create" | "edit"; row: GateRow; label: string | null;
    task?: TaskRow; candidates: readonly DefaultChecklist[];
  };

/** `lblAdmin_ProjectGates_Approvals_Form_Title.Text` — both arms verbatim (PGAS:2531). */
const PANEL_TITLE = { add: "Add Approvers", edit: "Edit Approvers" } as const;

/**
 * `lblAdmin_ProjectGates_Approvals_Form_Title.Text` — `If(IsBlank(locSelectedApprovalsEntity),
 * "Add Approvers", "Edit Approvers")`: "Edit Approvers" for a saved record, "Add Approvers" otherwise.
 * SOURCE DEFECT: on the check-list branch the canvas tests the GATE variable, which the check-list
 * Edit / Add Task never set, so the title showed whatever the last gate panel left (D22).
 * DIVERGENCE: the canvas gate panel always says "Edit Approvers", because Edit has already created
 * the row; with no row created on open (see `seedGateForm`) a placeholder gate says "Add Approvers".
 */
export function panelTitle(target: EditorTarget): string {
  if (target.kind === "gate") return target.row.template ? PANEL_TITLE.edit : PANEL_TITLE.add;
  return target.mode === "edit" ? PANEL_TITLE.edit : PANEL_TITLE.add;
}

/**
 * The read-only Gate field (`drp_Admin_ProjectGates_Approvals_Form_Fields_State`, hard-coded
 * `DisplayMode.Disabled`). The gate editor shows the label (blank when the next state is terminal
 * or missing — Save is then blocked, `GATE_BLANK_MESSAGE`); the task editor falls back to the gate
 * description, because its payload never uses the label.
 */
export function gateFieldText(target: EditorTarget): string {
  if (target.label) return target.label;
  return target.kind === "task" ? target.row.description : "";
}

/**
 * Collapse state (`col_CollapsedApprovalGates`, toggled by `btn_…_Item_Collapse.OnSelect`; every
 * gate starts expanded) is per country × technology × gate, never shared across contexts.
 */
export function collapseKey(ctx: Pick<GateContext, "countryId" | "technology"> | null, order: number): string {
  return `${collapseScope(ctx)}|${order}`;
}

/**
 * The country × technology part of `collapseKey` — the `scope` of the shared `useToggleSet`,
 * which stores `${scope}|${String(order)}`, i.e. exactly `collapseKey(ctx, order)`.
 */
export function collapseScope(ctx: Pick<GateContext, "countryId" | "technology"> | null): string {
  return `${ctx?.countryId.toLowerCase() ?? ""}|${ctx?.technology ?? ""}`;
}

export type FormErrors = Partial<Record<PeopleRole | "gate" | "checklist" | "main", string>>;

export interface ValidationContext {
  kind: "gate" | "task";
  /** Gate label of the edited gate; null = blank Gate field. */
  gateLabel: string | null;
  /** Gate editor: another saved template already exists for this (country, tech, gate). */
  conflict?: boolean;
  /**
   * The gate is the highest visible state, which the canvas Gate list never
   * labels (PGAS:2705-2717) yet still lets Save (PGAS:3679-3688 ignores the Gate message), writing
   * `Name: Coalesce(…Selected.Label, " ")` (PGAS:3731). A terminal / missing next state still blocks.
   */
  blankLabelAllowed?: boolean;
  /**
   * The form the editor was seeded with. A legacy list that already holds more
   * people than `MAX_PEOPLE` re-saves unchanged (the canvas only caps NEW adds via `MaxPeople`,
   * PGAS:3087, 3216, 3348, 3478); the max error fires only when the list grows past its seeded size.
   */
  initial?: ApprovalForm;
}

/** A role is over the limit only if it exceeds MAX_PEOPLE AND grew beyond its seeded count. */
function exceedsMax(role: PeopleRole, count: number, initial: ApprovalForm | undefined): boolean {
  if (count <= MAX_PEOPLE[role]) return false;
  const seeded = initial ? initial[role].length : 0;
  return count > seeded;
}

/** The editor target of a gate row (label per the canvas formula + blank-label allowance). */
export function gateEditorTarget(states: readonly ProjectState[], row: GateRow): Extract<EditorTarget, { kind: "gate" }> {
  const label = gateLabel(states, row.state);
  return { kind: "gate", row, label, blankLabelAllowed: label === null && isLastVisibleState(states, row.state) };
}

/**
 * The panel's validation messages. Every message blocks Save.
 * `pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save.DisplayMode` disables Save only on the four
 * people `…_ErrorMessage` labels and `…_Main_ErrorMessage`.
 * SOURCE DEFECT: a blank Check List showed "The cluster cannot be blank." but left Save enabled,
 * and the save then failed on the required template lookup; here it blocks Save (D22).
 * DIVERGENCE: also blocking here, with no canvas equivalent — a blank Gate label (except the last
 * visible state, `blankLabelAllowed`; the canvas saves `Name: " "` for any blank label), a list that
 * grows past `MAX_PEOPLE`, a serialised list longer than its column, and a Portfolio Manager whose
 * key is not an Entra object id.
 */
export function validateForm(form: ApprovalForm, ctx: ValidationContext): FormErrors {
  const errors: FormErrors = {};
  const rules = fieldRules(form.mode);
  for (const role of ["portfolioManager", "contributors", "approvers", "notifications"] as const) {
    const people = role === "portfolioManager" ? form.portfolioManager : form[role];
    if (rules[role].visible && rules[role].required && people.length === 0) errors[role] = EMPTY_MESSAGE;
    else if (rules[role].visible && exceedsMax(role, people.length, ctx.initial)) errors[role] = `At most ${MAX_PEOPLE[role]} people can be selected.`;
  }
  const max = ctx.kind === "gate" ? JSON_MAX.gate : JSON_MAX.task;
  const people = effectivePeople(form);
  for (const role of ["contributors", "approvers", "notifications"] as const) {
    const length = serializePeople(people[role])?.length ?? 0;
    if (length > max && !errors[role]) {
      errors[role] = `Too many people for this list: the saved value would be ${length} characters, the column holds ${max}. Remove some people.`;
    }
  }
  // The PM is the only person written as a lookup bind; a legacy/garbage id cannot be bound.
  const pm = people.portfolioManager[0];
  if (pm && !isGuidLike(pm.entraId) && !errors.portfolioManager) errors.portfolioManager = INVALID_PERSON_MESSAGE;
  // Only the GATE payload uses the label (`vsb_name`); the task payload never does, so
  // a gate whose next state is terminal or missing must not lock its task approvals.
  if (ctx.kind === "gate" && !ctx.gateLabel && !ctx.blankLabelAllowed) errors.gate = GATE_BLANK_MESSAGE;
  if (ctx.kind === "task" && !form.checklistId) errors.checklist = CHECKLIST_BLANK_MESSAGE;
  if (ctx.kind === "gate" && ctx.conflict) errors.main = DUPLICATE_GATE_MESSAGE;
  return errors;
}

export const canSave = (errors: FormErrors) => Object.keys(errors).length === 0;

/**
 * When `DUPLICATE_GATE_MESSAGE` shows: the gate editor would CREATE while a saved template
 * already exists for the gate. Editing the displayed template of a duplicated gate is allowed
 * (the grid flags the duplicate instead), so the gate is never locked out.
 * DIVERGENCE: the canvas `lbl_…_Main_ErrorMessage.Visible` needs `IsBlank(locSelectedApprovalsEntity)`
 * on the gate branch, which never happens because Edit creates the row first, so it never shows.
 * This app runs it as a real uniqueness check.
 */
export function hasGateConflict(editingId: string | undefined, row: GateRow, templates: readonly GateTemplate[]): boolean {
  if (editingId) return false;
  return templates.some((t) => sameId(t.stateId, row.state.id));
}

/**
 * Roles whose saved people a mode change will clear (warned before Save).
 * DIVERGENCE: NEW — the canvas clears them on Save without a warning.
 */
export function droppedRoles(initial: ApprovalForm, form: ApprovalForm): PeopleRole[] {
  const before = effectivePeople(initial);
  const after = effectivePeople(form);
  return (["portfolioManager", "contributors", "approvers"] as const)
    .filter((r) => before[r].length > 0 && after[r].length === 0 && fieldRules(form.mode)[r].visible === false);
}

/* ═════════════════════════════════════════════════════════════ payloads ══ */

export interface GatePayloadContext {
  countryId: string;
  /** `vsb_technology` choice code. */
  technology: number;
  state: ProjectState;
  label: string | null;
  isCreate: boolean;
}

const pmBind = (nav: string, form: ApprovalForm, isCreate: boolean): Payload => {
  const pm = effectivePeople(form).portfolioManager[0];
  if (pm) return { [`${nav}@odata.bind`]: bindPath("aadusers", pm.entraId) };
  // Clearing a lookup on update is an explicit null bind; on create it is simply omitted.
  return isCreate ? {} : { [`${nav}@odata.bind`]: null };
};

/**
 * `'Owning Business Unit': LookUp('Project States', …).'Owning Business Unit'` on both branches of
 * `pcf_but_…_Save.OnChange`: the gate state's business unit. Written with the shared lower-case key
 * `owningbusinessunit@odata.bind` (`OWNING_BU_BIND` in `@/data/odata`); both generated models
 * (`Vsb_projectdefaultapprovalsesModel.ts`, `Vsb_checklistdefaultapprovalsesModel.ts`) declare the
 * key as `OwningBusinessUnit@odata.bind`.
 */
const buBind = (state: ProjectState): Payload => owningBusinessUnitBind(state.businessUnitId);

/**
 * Gate payload — the "Cluster" branch of `pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save.OnChange`
 * (PGAS:3730-3801): every field on every save, create or update. `Name: Coalesce(Label, " ")`;
 * `'Gate active': If(Selected.Name <> "Draft", toggle, true)`; Technology by label match.
 */
export function toGatePayload(form: ApprovalForm, ctx: GatePayloadContext): Payload {
  const people = effectivePeople(form);
  return {
    vsb_name: ctx.label || " ",
    "vsb_ApprovalsCountry@odata.bind": bindPath("vsb_countries", ctx.countryId),
    "vsb_ClusterState@odata.bind": bindPath("vsb_projectstates", ctx.state.id),
    vsb_approvalmodecode: form.mode,
    vsb_gateactive: ctx.state.order === 0 ? true : form.gateActive,
    ...pmBind("vsb_Approvalparticipant1", form, ctx.isCreate),
    vsb_defaultcontributors: serializePeople(people.contributors),
    vsb_defaultapprovals: serializePeople(people.approvers),
    vsb_defaultnotifications: serializePeople(people.notifications),
    vsb_technologycode: ctx.technology,
    ...buBind(ctx.state),
    ...(ctx.isCreate ? { statecode: 0 } : {}),
  };
}

export interface TaskPayloadContext {
  checklist: DefaultChecklist;
  /** The task's OWN gate state (not a stale dropdown). */
  state: ProjectState;
  isCreate: boolean;
}

/**
 * Task payload — the "Checklist" branch of `pcf_but_…_Save.OnChange` (PGAS:3827-3886):
 * `vsb_defaultapprovers` / `vsb_gateisactive` exactly, the toggle as is (no Draft rule).
 * DIVERGENCE: the canvas writes `Name: drp_…_State_1.Selected.Name` with no fallback; a blank name
 * is written as " " here, as the gate branch does.
 */
export function toChecklistPayload(form: ApprovalForm, ctx: TaskPayloadContext): Payload {
  const people = effectivePeople(form);
  return {
    vsb_name: ctx.checklist.name || " ",
    "vsb_ProjectDefaultCheckListId@odata.bind": bindPath(CHECKLIST_ENTITY_SETS.tasks, ctx.checklist.id),
    vsb_approvalmodecode: form.mode,
    vsb_gateisactive: form.gateActive,
    ...pmBind("vsb_PortfolioManagerId", form, ctx.isCreate),
    vsb_defaultcontributors: serializePeople(people.contributors),
    vsb_defaultapprovers: serializePeople(people.approvers),
    vsb_defaultnotifications: serializePeople(people.notifications),
    ...buBind(ctx.state),
  };
}

/* ═══════════════════════════════════════════════════════════ write plans ══ */

/*
 * Every write of this screen is ONE request, so each is a one-write `WritePlan` that
 * `@/data/runPlan` sends through `data/executePlan.ts` (CONVENTIONS rule 17, D36).
 * DIVERGENCE: updates are `guarded` — the row is read by primary key first and, when another user
 * deleted it, NOTHING is sent and `RecordGoneError` surfaces (the SDK 1.3.1 PATCH would otherwise
 * recreate it). The canvas `Patch` has no such read. This is the documented write-path exception
 * (doc 09 §2). `label` is each failure's operation text, as the screen's tests pin it.
 *
 * `canEdit` is `useAdminAccess()`. The screen refuses first (on the surface the user is looking
 * at); the plan refuses again with the same message, so a plan can never be sent without it.
 *
 * `executePlan` rewrites a string value that contains `@created#<n>` (see `resolveRefs`); no
 * value here can (names come from Dataverse rows, binds are `/<set>(<guid>)`), and none of these
 * plans has a create followed by another write.
 */
const GATE_SET = ES_PROCESS.projectDefaultApprovals;
const TASK_APPROVAL_SET = CHECKLIST_ENTITY_SETS.approvals;

export interface PlanOptions { canEdit: boolean }

/**
 * `btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval.OnSelect` — `Patch(…, {'Gate active':
 * false, 'Portfolio Manager', 'Default Contributors', 'Default Approvals', 'Default Notifications':
 * Blank()})`: exactly those five fields; `vsb_approvalmodecode` is untouched. `false` also for the
 * Draft gate, which Save forces to active — kept as the canvas has it (D22, PO answer 1).
 */
export const RESET_GATE_PAYLOAD: Payload = {
  vsb_gateactive: false,
  "vsb_Approvalparticipant1@odata.bind": null,
  vsb_defaultcontributors: null,
  vsb_defaultapprovals: null,
  vsb_defaultnotifications: null,
};

function singleWrite(opts: PlanOptions, write: PlannedWrite): WritePlan {
  if (!opts.canEdit) return refusePlan(NO_PERMISSION_MESSAGE);
  const plan = emptyPlan();
  plan.writes.push(write);
  return plan;
}

/**
 * Gate Active toggle (`btn_…_Item_ToggleStauts.OnSelect`: `Patch('Project Default Approvals', …,
 * {'Gate active': If(Self.Text = "Active", false, true)})`): one guarded PATCH of `vsb_gateactive`.
 */
export function planSetGateActive(id: string, active: boolean, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    GATE_SET, id, { vsb_gateactive: active }, `gate ${active ? "activated" : "deactivated"}`, "update gate active",
  ));
}

/**
 * Task-approval Active toggle (`btn_…_ChecklistDefaultApproval_Item_ToggleStatus.OnSelect`, the same
 * `Patch` on `Check List Default Approvals`): one guarded PATCH of `vsb_gateisactive`.
 */
export function planSetTaskApprovalActive(id: string, active: boolean, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    TASK_APPROVAL_SET, id, { vsb_gateisactive: active },
    `check-list approval ${active ? "activated" : "deactivated"}`, `update ${TASK_APPROVAL_SET}`,
  ));
}

/** Gate save: `id` undefined creates the template, otherwise one guarded PATCH (a null clears a column or lookup bind). */
export function planSaveGate(id: string | undefined, payload: Payload, opts: PlanOptions): WritePlan {
  return singleWrite(opts, id
    ? guardedUpdate(GATE_SET, id, { ...payload }, "gate approval updated", "update gate approval template")
    : { op: "create", entitySet: GATE_SET, data: { ...payload }, reason: "gate approval created", label: "create gate approval template" });
}

/** Task-approval save: `id` undefined creates the row, otherwise one guarded PATCH. */
export function planSaveTaskApproval(id: string | undefined, payload: Payload, opts: PlanOptions): WritePlan {
  return singleWrite(opts, id
    ? guardedUpdate(TASK_APPROVAL_SET, id, { ...payload }, "check-list approval updated", `update ${TASK_APPROVAL_SET}`)
    : { op: "create", entitySet: TASK_APPROVAL_SET, data: { ...payload }, reason: "check-list approval created", label: `create ${TASK_APPROVAL_SET}` });
}

/** Reset Gate: one guarded PATCH with `RESET_GATE_PAYLOAD`. */
export function planResetGate(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, guardedUpdate(
    GATE_SET, id, { ...RESET_GATE_PAYLOAD }, "gate approval reset", "reset gate approval template",
  ));
}

/**
 * Delete a task approval (`cmp_DeleteChecklistApprovalItem_AdminScreen.OnConfirm`:
 * `Remove('Check List Default Approvals', locSelectedChecklistApprovalEntity)`): one DELETE. Gate
 * rows have no delete. A refused delete surfaces (CONVENTIONS rule 14); the canvas ignored it.
 */
export function planDeleteTaskApproval(id: string, opts: PlanOptions): WritePlan {
  return singleWrite(opts, {
    op: "delete", entitySet: TASK_APPROVAL_SET, id, reason: "check-list approval deleted", label: `delete ${TASK_APPROVAL_SET}`,
  });
}

/* ═══════════════════════════════════════════════════════════════ messages ══ */

/*
 * The progress texts are the canvas `locAdminLoadingDialogText` values shown in `cmp_Admin_Loading`,
 * verbatim; `Char(13)` becomes `\n`, `{lbl_…_Headline.Text}` is `headline(ctx)`.
 */

/**
 * `pcf_but_Admin_ProjectGates_Approvals_Form_Buttons_Save.OnChange`, `locAdminLoadingDialogText`
 * (gate branch, PGAS:3713) — verbatim.
 */
export function savingGateText(ctx: GateContext, label: string | null): string {
  return `Approvals data for ${headline(ctx)}\nGate: '${label ?? ""}' will be saved, please wait...`;
}

/** `pcf_but_…_Save.OnChange`, `locAdminLoadingDialogText` (check-list branch, PGAS:3712) — verbatim. */
export function savingTaskText(ctx: GateContext, taskName: string): string {
  return `Approvals data for ${headline(ctx)}\nCheck List: '${taskName}' will be saved, please wait...`;
}

/**
 * `cmp_DeleteChecklistApprovalItem_AdminScreen.OnConfirm`, `locAdminLoadingDialogText` (PGAS:3970) — verbatim.
 * SOURCE DEFECT: the canvas takes the name from the panel combobox (`drp_…_State_1.Selected.Name`),
 * i.e. whatever the panel last showed; this app names the deleted row's own task (D22).
 */
export function deletingText(ctx: GateContext, taskName: string): string {
  return `Approval item for ${headline(ctx)}\nCheck List: '${taskName}' being deleted, please wait...`;
}

/**
 * `cmp_DeleteChecklistApprovalItem_AdminScreen.Description` = `locDeleteChecklistApprovalDialogeText`,
 * set by `btn_…_ChecklistDefaultApproval_Item_Delete.OnSelect` (PGAS:1641) — verbatim; `gate` is the
 * gate row's `lbl_…_Item_ApprovalDescription.Text`.
 * SOURCE DEFECT: the last line reads the panel combobox (`drp_…_State_1.Selected.Name`); this app
 * names the clicked row's own task (D22).
 */
export function deleteConfirmationText(ctx: GateContext, gate: string, taskName: string): string {
  return `Are you sure you want to execute the deletion?\n\n${ctx.countryName} - ${technologyOptionLabel(ctx.technology)}\n${gate}\nCheck List Item: '${taskName}'`;
}

/**
 * DIVERGENCE: NEW — the canvas Reset Gate writes at once, with no confirmation (doc 09 §2). The
 * first line is `RESET_GATE_DESCRIPTION`; the rest has no canvas source.
 */
export function resetConfirmationText(ctx: GateContext, gate: string): string {
  return `${RESET_GATE_DESCRIPTION}\n\n${ctx.countryName} - ${technologyOptionLabel(ctx.technology)}\nGate: '${gate}'\n\nThis cannot be undone.`;
}

/** DIVERGENCE: NEW — progress text for Reset Gate; the canvas shows none (it closes the panel at once). */
export function resettingGateText(ctx: GateContext, gate: string): string {
  return `Approvals data for ${headline(ctx)}\nGate: '${gate}' will be reset, please wait...`;
}

// Failed-action text: the screen calls the shared `userErrorText` (`@/platform/userMessage`).
