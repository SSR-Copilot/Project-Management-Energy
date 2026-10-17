/**
 * Project Gates — every business rule of the canvas `Admin Project Gates Approvals Screen`
 * as pure functions. No React, no I/O: the grid, the editor and the payloads are all
 * selectors over the dataset `@/data/settings/project-gates` returns.
 *
 * Citations `PGAS:<line>` refer to `Admin Project Gates Approvals Screen.pa.yaml`; FR/DR/D ids
 * to `codeapp-knowledge-base/screens/application-settings/project-gates/06-code-app-requirements/`.
 */
import { bindPath, CHECKLIST_ENTITY_SETS, owningBusinessUnitBind } from "@/data/settings/checklistTables";
import { scopeBreadcrumb } from "@/domain/countryPicker";
import { GATE_TECHNOLOGIES, technologyOptionLabel } from "@/domain/technology";
import type {
  ChecklistApproval, DefaultChecklist, GateTemplate, GatesDataset, Payload,
  PersonRef, ProjectState,
} from "@/data/settings/project-gates";

/** B8: every bind id is validated (and normalised) with `guid()`; a bad id throws before any write. */
export { bindPath };

/* ═══════════════════════════════════════════════════════════════ constants ══ */

/** Global choice `vsb_approvalmode` (04-data/01 §3.1). */
export const MODE = { Formal: 952850000, Local: 952850001, OnlyNotifications: 952850002 } as const;
export type ApprovalMode = (typeof MODE)[keyof typeof MODE];

export const MODE_OPTIONS: readonly { value: ApprovalMode; label: string }[] = [
  { value: MODE.Formal, label: "Formal Approval" },
  { value: MODE.Local, label: "Local Approval" },
  { value: MODE.OnlyNotifications, label: "Only Notifications" },
];

/** V8: the PowerCAT pickers' `MaxPeople` (PGAS:3087, 3216, 3348, 3478). */
export const MAX_PEOPLE = { portfolioManager: 1, contributors: 20, approvers: 5, notifications: 20 } as const;

/** D-07: column max lengths of the JSON participant columns. */
export const JSON_MAX = { gate: 4000, task: 1000 } as const;

export const EMPTY_MESSAGE = "Value cannot be empty.";
/** PGAS:2656 — kept as the canvas wrote it; on the Gate field "cluster" is the business term. */
export const GATE_BLANK_MESSAGE = "The cluster cannot be blank.";
/** PGAS:2799 said "The cluster cannot be blank." on the Check List field — wording fixed. */
export const CHECKLIST_BLANK_MESSAGE = "The check list item cannot be blank.";
/** Replaces PGAS:2620 ("…allready exists.") with a real uniqueness check (D-11). */
export const DUPLICATE_GATE_MESSAGE = "A default approval for the selected gate already exists.";
export const RESET_GATE_DESCRIPTION = "Remove all cluster gate participants and deactivate the gate approval.";
/** B8: a stored participant whose key is not an Entra object id cannot be written as a bind. */
export const INVALID_PERSON_MESSAGE = "Invalid person, remove and re-add.";

const GUID_RE = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const isGuidLike = (value: string | null | undefined) => Boolean(value && GUID_RE.test(value));

/** States whose name makes the PREVIOUS state drop out of the Gate list (PGAS:2722-2727). */
const TERMINAL_NEXT_STATES = ["Inactive/ On-hold", "Abandoned"];

/* ══════════════════════════════════════════════ country × technology (D-24) ══ */
// The rail (countries, order, exclusions, Wind/PV, default Germany / Wind) is the shared M6
// picker configured for this screen: `pickerCountries(rows, GATE_COUNTRY_RULE)`,
// `GATE_TECHNOLOGIES`, `GATE_DEFAULT` (`@/domain/countryPicker`, `@/domain/technology`).

/** The selected context. `technology` is the `vsb_technology` choice CODE (DR-3, D-15). */
export interface GateContext {
  countryId: string;
  countryName: string;
  technology: number;
}

/** PGAS:417-422. The shared E14 breadcrumb with this screen's `" | "` separator. */
export function headline(ctx: { countryName: string; technology: number } | null): string {
  return scopeBreadcrumb("Project Gates", ctx?.countryName, ctx ? technologyOptionLabel(ctx.technology) : undefined, " | ");
}

/* ═════════════════════════════════════════════════════════════════ gates ══ */

const byOrder = (a: { order: number | null }, b: { order: number | null }) =>
  (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);

/** FR-3: visible on checklist AND order < 6, sorted NUMERICALLY (D-25). */
export function visibleGateStates(states: readonly ProjectState[]): ProjectState[] {
  return states
    .filter((s) => s.visibleOnChecklist && s.order !== null && s.order < 6)
    .sort(byOrder);
}

/** FR-4 / PGAS:1790-1796. */
export function gateDescription(order: number): string {
  return order === 0 ? "Draft to Cluster 1" : `Cluster ${order} to Cluster ${order + 1}`;
}

/** The state with order + 1 (searched across ALL states, as the canvas `LookUp` does). */
export function nextState(states: readonly ProjectState[], state: ProjectState): ProjectState | undefined {
  if (state.order === null) return undefined;
  return states.find((s) => s.order === (state.order as number) + 1);
}

/**
 * Parity R1 GAP-6 / PGAS:2705-2717: the canvas Gate list is
 * `FirstN(Filter(allStates, 'Is Visible On Checklist'), CountRows(…) − 1)`, so the
 * highest-order visible state (over ALL visible states, not only order < 6) never has a label.
 * Order is numeric (D-25); states without an order do not take part.
 */
export function isLastVisibleState(states: readonly ProjectState[], state: ProjectState): boolean {
  if (!state.visibleOnChecklist || state.order === null) return false;
  const orders = states.filter((s) => s.visibleOnChecklist && s.order !== null).map((s) => s.order as number);
  return orders.length > 0 && state.order === Math.max(...orders);
}

/**
 * FR-13: the Gate field's label `"{state} to {next}"`, or null when the gate is not in the
 * canvas Gate list (PGAS:2705-2727): the state is not visible on checklist, it is the highest
 * visible state (GAP-6), its next state is "Inactive/ On-hold" / "Abandoned", or there is no next.
 */
export function gateLabel(states: readonly ProjectState[], state: ProjectState): string | null {
  if (!state.visibleOnChecklist || isLastVisibleState(states, state)) return null;
  const next = nextState(states, state);
  if (!next || TERMINAL_NEXT_STATES.includes(next.name.trim())) return null;
  return `${state.name} to ${next.name}`;
}

export interface GateRow {
  /** Collapse key (FR-6): the gate ORDER, stable across refetches. */
  order: number;
  state: ProjectState;
  description: string;
  /** Saved template, or null for an unsaved placeholder. */
  template: GateTemplate | null;
  /** How many saved templates exist for this gate (> 1 = data-integrity warning, D-12). */
  templateCount: number;
}

/** FR-3: one row per visible gate; the first saved template by `createdon` wins. */
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

/** D-19 / V11: the Draft gate is order 0. */
export const isDraftGate = (row: Pick<GateRow, "order">) => row.order === 0;

/* ══════════════════════════════════════════════════════════ checklist tasks ══ */

export interface TaskRow {
  approval: ChecklistApproval;
  checklist: DefaultChecklist;
}

const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * G-4 / B4 (D-13, D-14): a checklist task is shown — as a nested row or as an Add Task option —
 * only while it is active and not marked "To Delete" by Check List Settings.
 */
export const isShownChecklist = (c: Pick<DefaultChecklist, "active" | "toDelete">) => c.active && !c.toDelete;

/** FR-7: approvals whose (shown) checklist belongs to this gate, sorted by checklist `vsb_order`. */
export function tasksOfGate(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): TaskRow[] {
  const out: TaskRow[] = [];
  for (const approval of data.approvals) {
    const checklist = data.checklists.find((c) => sameId(c.id, approval.checklistId));
    if (checklist && isShownChecklist(checklist) && sameId(checklist.stateId, state.id)) out.push({ approval, checklist });
  }
  return out.sort((a, b) => byOrder(a.checklist, b.checklist));
}

/** FR-12 AC1 / R-11: this gate's shown checklist tasks that have NO approval yet. */
export function taskCandidates(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): DefaultChecklist[] {
  return data.checklists
    .filter(isShownChecklist)
    .filter((c) => sameId(c.stateId, state.id))
    .filter((c) => !data.approvals.some((a) => sameId(a.checklistId, c.id)))
    .sort(byOrder);
}

/** FR-9 / R-7. */
export function canAddTask(data: Pick<GatesDataset, "checklists" | "approvals">, state: ProjectState): boolean {
  return taskCandidates(data, state).length > 0;
}

/* ════════════════════════════════════════════════════ participant JSON (DR-4) ══ */

/**
 * DR-4: the canvas contract `[{"PersonaKey","PersonaName","PersonaRole"}]`. Null, blank or
 * malformed JSON yields `[]` (malformed also warns); it never throws.
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
  } catch (error) {
    console.warn("[project-gates] Unreadable participant JSON; showing it as empty.", error);
    return [];
  }
}

/** DR-4: an empty list is `null`, never `[]`; key names and order exactly as the canvas writes them. */
export function serializePeople(people: readonly PersonRef[]): string | null {
  if (people.length === 0) return null;
  return JSON.stringify(people.map((p) => ({ PersonaKey: p.entraId, PersonaName: p.name, PersonaRole: p.mail })));
}

/** M9g-j / D-26a-b: picker suggestions = search hits minus the people already selected (ids case-insensitive). */
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
   * Parity R1 GAP-1: text appended after every listed person but the last in the cell text
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
 * FR-4: list when fewer than 4, chip when 4 or more, "-" when none. Cell text joins with
 * `"\n\n"` (PGAS:1150-1154, 1906-1910). Tooltip: Contributors `";\n\n"` (PGAS:1175-1179,
 * 1931-1935, parity R1 GAP-3); Approvers / Notifications `"\n\n"` (PGAS:2051-2055, 2173-2177).
 */
export function participantCell(people: PersonRef[], noun: ParticipantNoun): ParticipantCell {
  return cell(people, noun, people.length < 4, noun === "Contributors" ? ";\n\n" : "\n\n");
}

/**
 * FR-7 AC3 / D-26(c), PORTED: the task-row Notifications cell lists names when ALL three lists
 * have fewer than 4 entries, or there is exactly 1 notification (PGAS:1396-1407).
 * Parity R1 GAP-1: the cell TEXT joins with `";\n\n"` (PGAS:1398-1402) — a `;` after every
 * person but the last — and the TOOLTIP with `"\n\n"` (PGAS:1423-1427).
 */
export function taskNotificationsCell(contributors: PersonRef[], approvers: PersonRef[], notifications: PersonRef[]): ParticipantCell {
  const asList =
    (contributors.length < 4 && approvers.length < 4 && notifications.length < 4) || notifications.length === 1;
  return cell(notifications, "Notifications", asList, "\n\n", ";");
}

/** PGAS:1830-1835. */
export function pmCell(pmId: string | null, people: Record<string, PersonRef>): { text: string; mail: string; tooltip: string } {
  if (!pmId) return { text: "-", mail: "", tooltip: "" };
  const p = people[pmId.toLowerCase()];
  if (!p) return { text: "Unknown user", mail: "", tooltip: `Entra id ${pmId}` };
  return { text: p.name || "-", mail: p.mail, tooltip: `${p.name}, (${p.mail})` };
}

/** Power Fx `IsBlank` on a text column: null / undefined or the empty string only. */
const isBlankText = (value: string | null | undefined) => value === null || value === undefined || value === "";

/**
 * FR-5 / PGAS:2217: the gate pill is read-only for Draft, for placeholders, and for rows with
 * no contributors, approvers and notifications (the PM is not considered — canvas parity).
 * Parity R1 GAP-5: like the canvas `IsBlank(ThisItem.'Default Contributors') && …`, the RAW
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

export const ROLE_LABEL: Record<PeopleRole, string> = {
  portfolioManager: "Portfolio Manager",
  contributors: "Contributors",
  approvers: "Approvers",
  notifications: "Notifications",
};

const asMode = (value: number | null | undefined): ApprovalMode =>
  value === MODE.Formal || value === MODE.Local || value === MODE.OnlyNotifications ? value : MODE.OnlyNotifications;

/** FR-14: Wind/PV offer all three modes, any other technology only "Only Notifications". */
export function modeOptions(technology: number) {
  return GATE_TECHNOLOGIES.some((t) => t.code === technology)
    ? MODE_OPTIONS
    : MODE_OPTIONS.filter((o) => o.value === MODE.OnlyNotifications);
}

/** One PM seed for both editors (fixes D-05). An unresolved PM keeps its id so it is not lost. */
function seedPm(pmId: string | null, people: Record<string, PersonRef>): PersonRef[] {
  if (!pmId) return [];
  return [people[pmId.toLowerCase()] ?? { entraId: pmId, name: "Unknown user", mail: "" }];
}

/**
 * FR-11: seeded from THIS row only (D-04). A placeholder starts active, as the canvas
 * create-on-open row did (`'Gate active': true`, PGAS:2321) — but nothing is written.
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

/** FR-12, edit mode: seeded from the task row, including the PM (D-05). */
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

/** FR-12, create mode: a fresh empty form, first candidate preselected (PGAS:2833-2864). */
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

/** FR-15: field visibility and requiredness by approval mode. */
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

/** The people a save will actually write per role (hidden roles are written as null, FR-15 AC1). */
export function effectivePeople(form: ApprovalForm): Record<PeopleRole, PersonRef[]> {
  const rules = fieldRules(form.mode);
  return {
    portfolioManager: rules.portfolioManager.visible ? form.portfolioManager.slice(0, 1) : [],
    contributors: rules.contributors.visible ? form.contributors : [],
    approvers: rules.approvers.visible ? form.approvers : [],
    notifications: form.notifications,
  };
}

/** What the panel was opened on. Each open builds a new target and a new form (D-04). */
export type EditorTarget =
  | {
    kind: "gate"; row: GateRow; label: string | null;
    /** GAP-6: the gate is the highest visible state — canvas saves `vsb_name = " "`, Save allowed. */
    blankLabelAllowed?: boolean;
  }
  | {
    kind: "task"; mode: "create" | "edit"; row: GateRow; label: string | null;
    task?: TaskRow; candidates: readonly DefaultChecklist[];
  };

/** FR-11 / FR-12: "Edit Approvers" for a saved record, "Add Approvers" otherwise (fixes PGAS:2531). */
export function panelTitle(target: EditorTarget): string {
  if (target.kind === "gate") return target.row.template ? "Edit Approvers" : "Add Approvers";
  return target.mode === "edit" ? "Edit Approvers" : "Add Approvers";
}

/**
 * FR-13 / G-2: the read-only Gate field. The gate editor shows the label (blank when the next
 * state is terminal or missing — Save is then blocked, `GATE_BLANK_MESSAGE`); the task editor
 * falls back to the gate description, because its payload never uses the label.
 */
export function gateFieldText(target: EditorTarget): string {
  if (target.label) return target.label;
  return target.kind === "task" ? target.row.description : "";
}

/** FR-6 / G-9 (B5): collapse state is per country × technology × gate, never shared across contexts. */
export function collapseKey(ctx: Pick<GateContext, "countryId" | "technology"> | null, order: number): string {
  return `${collapseScope(ctx)}|${order}`;
}

/**
 * The country × technology part of `collapseKey` — the `scope` of the shared `useToggleSet`
 * (H5), which stores `${scope}|${String(order)}`, i.e. exactly `collapseKey(ctx, order)`.
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
   * Parity R1 GAP-6: the gate is the highest visible state, which the canvas Gate list never
   * labels (PGAS:2705-2717) yet still lets Save (PGAS:3679-3688 ignores the Gate message), writing
   * `Name: Coalesce(…Selected.Label, " ")` (PGAS:3731). G-2 still blocks terminal / missing next.
   */
  blankLabelAllowed?: boolean;
  /**
   * Parity R2-3: the form the editor was seeded with. A legacy list that already holds more
   * people than `MAX_PEOPLE` re-saves unchanged (the canvas only caps NEW adds via `MaxPeople`,
   * PGAS:3087, 3216, 3348, 3478); the max error fires only when the list grows past its seeded size.
   */
  initial?: ApprovalForm;
}

/** R2-3: a role is over the limit only if it exceeds MAX_PEOPLE AND grew beyond its seeded count. */
function exceedsMax(role: PeopleRole, count: number, initial: ApprovalForm | undefined): boolean {
  if (count <= MAX_PEOPLE[role]) return false;
  const seeded = initial ? initial[role].length : 0;
  return count > seeded;
}

/** GAP-6: the editor target of a gate row (label per the canvas formula + blank-label allowance). */
export function gateEditorTarget(states: readonly ProjectState[], row: GateRow): Extract<EditorTarget, { kind: "gate" }> {
  const label = gateLabel(states, row.state);
  return { kind: "gate", row, label, blankLabelAllowed: label === null && isLastVisibleState(states, row.state) };
}

/**
 * FR-15/16, V1-V7, D-06, D-07: every message blocks Save — including the two "cannot be blank"
 * rules the canvas only displayed — and serialised JSON is length-checked against the column.
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
  // B8: the PM is the only person written as a lookup bind; a legacy/garbage id cannot be bound.
  const pm = people.portfolioManager[0];
  if (pm && !isGuidLike(pm.entraId) && !errors.portfolioManager) errors.portfolioManager = INVALID_PERSON_MESSAGE;
  // G-2 / B1: only the GATE payload uses the label (`vsb_name`); the task payload never does, so
  // a gate whose next state is terminal or missing must not lock its task approvals.
  if (ctx.kind === "gate" && !ctx.gateLabel && !ctx.blankLabelAllowed) errors.gate = GATE_BLANK_MESSAGE;
  if (ctx.kind === "task" && !form.checklistId) errors.checklist = CHECKLIST_BLANK_MESSAGE;
  if (ctx.kind === "gate" && ctx.conflict) errors.main = DUPLICATE_GATE_MESSAGE;
  return errors;
}

export const canSave = (errors: FormErrors) => Object.keys(errors).length === 0;

/**
 * FR-16 / D-11: a real uniqueness check — the gate editor would CREATE while a saved template
 * already exists for the gate. Editing the displayed template of a duplicated gate is allowed
 * (the grid flags the duplicate instead), so the gate is never locked out.
 */
export function hasGateConflict(editingId: string | undefined, row: GateRow, templates: readonly GateTemplate[]): boolean {
  if (editingId) return false;
  return templates.some((t) => sameId(t.stateId, row.state.id));
}

/** D-18: roles whose saved people a mode change will clear (warned before Save). */
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
 * B14: the owning-BU bind, LOWER CASE on both tables (`OWNING_BU_BIND`). PDA: as the generated
 * `Vsb_projectdefaultapprovalsesModel.ts` declares it. CLDA: no generated model yet (G-1) —
 * VERIFY against the generated model after G-1.
 */
const buBind = (state: ProjectState): Payload => owningBusinessUnitBind(state.businessUnitId);

/** DR-6 (PGAS:3730-3801). */
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
  /** The task's OWN gate state (not a stale dropdown, D-04). */
  state: ProjectState;
  isCreate: boolean;
}

/** DR-7 (PGAS:3827-3886). `vsb_defaultapprovers` / `vsb_gateisactive` exactly (D-17). */
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

/* ═══════════════════════════════════════════════════════════════ messages ══ */

/** FR-17 / PGAS:3713. */
export function savingGateText(ctx: GateContext, label: string | null): string {
  return `Approvals data for ${headline(ctx)}\nGate: '${label ?? ""}' will be saved, please wait...`;
}

/** FR-18 / PGAS:3712. */
export function savingTaskText(ctx: GateContext, taskName: string): string {
  return `Approvals data for ${headline(ctx)}\nCheck List: '${taskName}' will be saved, please wait...`;
}

/** PGAS:3970, naming the ROW's task (D-10). */
export function deletingText(ctx: GateContext, taskName: string): string {
  return `Approval item for ${headline(ctx)}\nCheck List: '${taskName}' being deleted, please wait...`;
}

/** FR-10 / PGAS:1641, with the row's own task name (D-10). */
export function deleteConfirmationText(ctx: GateContext, gate: string, taskName: string): string {
  return `Are you sure you want to execute the deletion?\n\n${ctx.countryName} - ${technologyOptionLabel(ctx.technology)}\n${gate}\nCheck List Item: '${taskName}'`;
}

export function resetConfirmationText(ctx: GateContext, gate: string): string {
  return `${RESET_GATE_DESCRIPTION}\n\n${ctx.countryName} - ${technologyOptionLabel(ctx.technology)}\nGate: '${gate}'\n\nThis cannot be undone.`;
}

// Failed-action text: the screen calls the shared `userErrorText` (`@/platform/userMessage`, M11).
