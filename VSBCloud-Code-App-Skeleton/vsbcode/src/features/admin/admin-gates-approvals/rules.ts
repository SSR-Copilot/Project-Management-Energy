/**
 * Admin Project Gates Approvals Screen — every business rule as a pure function.
 *
 * Canvas screen: `Admin Project Gates Approvals Screen` (PM app)
 *   114 controls · 3 305 lines of Power Fx · 41 substantive blocks · band M
 *
 * Configures who approves what at each project gate, for one country × technology at a
 * time. A gallery renders ALL gates whether or not a `Project Default Approvals` row
 * exists, filling the gaps with in-memory placeholders; each gate expands into its
 * checklist-level approvals from `Check List Default Approvals`. One shared right panel
 * edits either kind of record.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ SOURCE DEFECT — NO SCREEN-LEVEL OR SERVER-SIDE PERMISSION CHECK EXISTS.         │
 * │                                                                                │
 * │ `brief.py` reports `PERMISSION SIGNALS: none` for this screen: no               │
 * │ `DataSourceInfo`, no `RecordInfo`, no `gblCurrentUser` test anywhere in 3 305   │
 * │ lines. The ONLY membership test in the whole admin area is                      │
 * │     ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator,                  │
 * │                     gblCurrentUser.IsControllerOwnData)                         │
 * │ on the nav items — CLIENT-SIDE HIDING.                                          │
 * │                                                                                │
 * │ WHAT WE DID: `RequireAdmin` guards the route and `canEditScope` gates every     │
 * │ write plan on `canEditCountry`. THE ROUTE GUARD IS NOT SECURITY — the server    │
 * │ must reject these writes too. Approvals decide who signs off a project gate for │
 * │ an entire country; an unauthorised edit here is an approval-bypass, not a       │
 * │ cosmetic one. A Dataverse privilege on `vsb_projectdefaultapprovalses` and      │
 * │ `vsb_checklistdefaultapprovalses` is the actual fix and does not exist yet.     │
 * └────────────────────────────────────────────────────────────────────────────────┘
 *
 * COUNTRY SCOPING IS HARD-CODED PICKER LITERALS, NOT THE USER'S SCOPE.
 * `gblCurrentUser.EditableCounties` is never read. `cmp_NestedCountryPickerColumn` is fed
 * a literal six-country table whose every child is `[{Order:1,"Wind"},{Order:2,"PV"}]`,
 * so although the `Technology` option set carries BESS, Hydro/Hydrogen and Substation —
 * and the save `Switch`es handle them — THE PICKER CAN NEVER PRODUCE THEM. Row security
 * is anchored by `'Owning Business Unit'`, written on save from the gate's `Project
 * States` row (rule 14).
 *
 * WHAT WAS DELETED AS A WORKAROUND
 *  - rule 3's create-on-Edit-click: the canvas `Patch`es a real `Project Default
 *    Approvals` row the moment Edit is pressed, so Cancel leaves an orphan. Placeholders
 *    are client-side only here (`isPlaceholder`) and the POST happens on Save.
 *  - rule 4's silent destructive reset of non-Wind/PV rows on panel open. Replaced by a
 *    read-only banner; see `nonWindPvBanner`.
 *  - `colApprovals1..4` and their four `PreSelected` twins — one controlled value per
 *    picker.
 *  - `col_CollapsedApprovalGates`, a COLLECTION OF RECORDS used as a boolean — a
 *    `Set<string>` of expanded ids.
 *  - the zero-row `RenameColumns(FirstN(Users,0), …)` that existed only to give those
 *    collections a schema.
 *  - the duplicate error surface (`UpdateContext(locAdminLoadingDialogText)` PLUS a
 *    persistent `Notify(..., 0)`) — one banner.
 */
import { isBlank } from "@/domain/numeric";
import { ES_PROCESS, CHOICE_PROCESS, CHOICE_ADMIN } from "@/data/entities";
import { canEditCountry, type CurrentUser } from "@/domain/session";

/* ══════════════════════════════════════════════ the shared country/technology axis ════ */

/**
 * The hard-coded picker table, verbatim from `col_cmpCountryPickerItems`'s
 * `AddColumns(Countries, 'Flag Image', Switch(Name, …), Order, Switch(Name, "Germany",1,
 * "France",2,"Poland",3,"Italy",4,"Finland",5,"Croatia",6,"Spain",7,"Greece",8,
 * "Romania",9), Expanded, false)` — duplicated verbatim on Gates, Cost and Contract.
 *
 * Declared ONCE here and imported by the other two admin screens, so the three copies can
 * no longer drift.
 */
export const COUNTRY_PICKER_ORDER: Record<string, number> = {
  Germany: 1, France: 2, Poland: 3, Italy: 4, Finland: 5, Croatia: 6,
  Spain: 7, Greece: 8, Romania: 9,
};

/**
 * The countries Admin Cost and Admin Contract exclude:
 * `Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))`.
 * The GATES screen passes the UNFILTERED list — that divergence is real and preserved.
 */
export const COST_CONTRACT_EXCLUDED_COUNTRIES: readonly string[] = ["Spain", "Greece", "Romania"];

/**
 * The technology nesting. Every country's `Childs` is this two-row literal, on all three
 * screens. This is why a BESS or Hydro standard assumption can never be authored from the
 * UI even though the tables and the save switches support one.
 */
export const PICKER_TECHNOLOGIES: readonly string[] = ["Wind", "PV"];

export interface CountryRef { id: string; name: string }
export interface PickerCountry extends CountryRef { order: number; technologies: readonly string[] }

/** Builds the picker items. `exclude` is the Cost/Contract list; Gates passes nothing. */
export function buildCountryPicker(
  countries: CountryRef[],
  opts: { exclude?: readonly string[] } = {},
): PickerCountry[] {
  const exclude = opts.exclude ?? [];
  return countries
    .filter((c) => !exclude.includes(c.name))
    .map((c) => ({
      ...c,
      order: COUNTRY_PICKER_ORDER[c.name] ?? 99,
      technologies: PICKER_TECHNOLOGIES,
    }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** One scope selection: a country row plus one of its two technologies. */
export interface Scope {
  country: CountryRef | null;
  /** The picker's `SelectedNestedValue` — the literal string `"Wind"` or `"PV"`. */
  technology: string | null;
}

/**
 * Rule 13 — the Cluster save resolves the technology by LABEL MATCH,
 * `LookUp(Choices(Technology) As C, Text(C.Value) = …SelectedNestedValue).Value`, while
 * rule 3's Edit handler uses an explicit `Switch`. Both are folded into one map here.
 *
 * NOTE the batch-wide inconsistency this exposes: the Gates `Switch` spells the fourth
 * arm `"Hydrogen"` while Admin Cost's spells it `"Hydro"`. Both are accepted below.
 */
const TECHNOLOGY_BY_LABEL: Record<string, number> = {
  wind: CHOICE_ADMIN.technology.wind,
  pv: CHOICE_ADMIN.technology.pv,
  hybrid: CHOICE_ADMIN.technology.hybrid,
  bess: CHOICE_ADMIN.technology.bess,
  hydrogen: CHOICE_ADMIN.technology.hydrogen,
  hydro: CHOICE_ADMIN.technology.hydro,
  substation: CHOICE_ADMIN.technology.substation,
};

/** Case-insensitive, blank-tolerant. Blank nested value → blank technology, as the canvas. */
export function technologyValue(label: string | null | undefined): number | null {
  if (isBlank(label)) return null;
  return TECHNOLOGY_BY_LABEL[String(label).trim().toLowerCase()] ?? null;
}

export function technologyLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const hit = Object.entries(TECHNOLOGY_BY_LABEL).find(([, v]) => v === value);
  if (!hit) return null;
  return hit[0] === "pv" ? "PV" : hit[0][0].toUpperCase() + hit[0].slice(1);
}

/** The `Formal Approval` path is only offered for Wind and PV (rule 5). */
export const isWindOrPv = (technology: string | null | undefined): boolean =>
  technology === "Wind" || technology === "PV";

/* ══════════════════════════════════════════════════ the middle country rail ════ */

/**
 * GUIDE p18 — the middle rail: a flag per country, a "+"/"−" expander revealing "Wind" and
 * "PV". `CountryRail`'s `selectedKey` is the LEAF, so a technology child needs a key that is
 * unique across every country — `countryId::technology` — while the country row itself keys
 * on the plain country id (there is nothing to select there; clicking it only expands).
 */
export const countryRailKey = (countryId: string): string => countryId;
export const techRailKey = (countryId: string, technology: string): string =>
  `${countryId}::${technology}`;

export function parseTechRailKey(key: string): { countryId: string; technology: string } | null {
  const i = key.indexOf("::");
  if (i === -1) return null;
  return { countryId: key.slice(0, i), technology: key.slice(i + 2) };
}

export interface RailChild { key: string; label: string }
export interface RailNode { key: string; label: string; children: RailChild[] }

/** Builds the rail's `items`. Gates passes the unfiltered country list (see the block above). */
export function buildGateCountryRailItems(countries: CountryRef[]): RailNode[] {
  return buildCountryPicker(countries).map((c) => ({
    key: countryRailKey(c.id),
    label: c.name,
    children: PICKER_TECHNOLOGIES.map((t) => ({ key: techRailKey(c.id, t), label: t })),
  }));
}

/* ═══════════════════════════════════════════════════════════ the persona JSON ════ */

/**
 * The three people lists are stored as JSON TEXT, not relationships:
 *   `JSON(ShowColumns(pcf_….SelectedPeople, PersonaKey, PersonaName, PersonaRole))`
 *
 * SCHEMA ABUSE, preserved: `PersonaRole` carries the E-MAIL, not a role. The read-back
 * loop is the mirror image — `{Id: Text(Value.PersonaKey), DisplayName:
 * Text(Value.PersonaName), Mail: Text(Value.PersonaRole)}` — so the convention is
 * symmetric and safe to keep; renaming the key would orphan every stored row.
 */
export interface Persona {
  /** `PersonaKey` — the Entra object id. */
  id: string;
  /** `PersonaName` — the display name. */
  displayName: string;
  /** `PersonaRole` — the e-mail. See the note above. */
  mail: string;
}

interface RawPersona { PersonaKey?: unknown; PersonaName?: unknown; PersonaRole?: unknown }

const text = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

/** Tolerates `null`, `""` and malformed JSON by returning `[]` — never throws. */
export function parsePersonaList(json: string | null | undefined): Persona[] {
  if (isBlank(json)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(json));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((r): r is RawPersona => typeof r === "object" && r !== null)
    .map((r) => ({
      id: text(r.PersonaKey),
      displayName: text(r.PersonaName),
      mail: text(r.PersonaRole),
    }))
    .filter((p) => p.id !== "");
}

/** The exact `{PersonaKey, PersonaName, PersonaRole}` triple the canvas writes. */
export function serialisePersonaList(people: Persona[]): string {
  return JSON.stringify(
    people.map((p) => ({
      PersonaKey: p.id,
      PersonaName: p.displayName,
      PersonaRole: p.mail,
    })),
  );
}

/**
 * GUIDE p18 — the table's "-" placeholder for an unset person cell, and the
 * "Display Name (email@domain)" formatting for a set one. `personLines` is what every
 * Portfolio Manager / Contributors / Approvers / Notifications cell renders through;
 * multiple people stack as multiple lines in the same cell (`UT-ADGATE-031`).
 */
export const PERSON_UNSET = "-";

export const formatPersona = (p: Persona): string => `${p.displayName} (${p.mail})`;

export function personLines(people: Persona[]): string[] {
  if (people.length === 0) return [PERSON_UNSET];
  return people.map(formatPersona);
}

/* ═══════════════════════════════════════════════════════════════════ columns ════ */

export const GATE_APPROVAL_COL = {
  id: "vsb_projectdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  gateActive: "vsb_gateactive",
  clusterState: "_vsb_clusterstate_value",
  country: "_vsb_approvalscountry_value",
  technology: "vsb_technologycode",
  /** The lookup's logical name is `vsb_approvalparticipant1`; its DISPLAY name is
   *  "Portfolio Manager". Read out of `sol/customizations.xml`. */
  portfolioManager: "_vsb_approvalparticipant1_value",
  /** Rule 12 — the GATE table calls it `Default Approvals` … */
  defaultApprovals: "vsb_defaultapprovals",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const CHECKLIST_APPROVAL_COL = {
  id: "vsb_checklistdefaultapprovalsid",
  name: "vsb_name",
  approvalMode: "vsb_approvalmodecode",
  gateActive: "vsb_gateisactive",
  projectDefaultChecklist: "_vsb_projectdefaultchecklistid_value",
  portfolioManager: "_vsb_portfoliomanagerid_value",
  /** Rule 12 — … while the CHECKLIST table calls the same concept `Default Approvers`. */
  defaultApprovers: "vsb_defaultapprovers",
  defaultContributors: "vsb_defaultcontributors",
  defaultNotifications: "vsb_defaultnotifications",
  owningBusinessUnit: "_owningbusinessunit_value",
} as const;

export const GATE_LOOKUP = {
  clusterState: "vsb_ClusterState",
  country: "vsb_ApprovalsCountry",
  portfolioManager: "vsb_ApprovalParticipant1",
  projectDefaultChecklist: "vsb_ProjectDefaultCheckList",
  owningBusinessUnit: "owningbusinessunit",
} as const;

export const GATE_ENTITY_SET = ES_PROCESS.projectDefaultApprovals;
export const CHECKLIST_APPROVAL_ENTITY_SET = ES_PROCESS.checkListDefaultApprovals;

export const ENTRA_COL = {
  id: "vsb_microsoftentraidid",
  /** DISPLAY name "A unique identifer for Microsoft Entra ID"; logical name `vsb_entraid`. */
  uniqueId: "vsb_entraid",
  displayName: "vsb_displayname",
  givenName: "vsb_givenname",
  surname: "vsb_surname",
  mail: "vsb_mail",
  accountEnabled: "vsb_accountenabled",
} as const;

/** `'Microsoft Entra ID Account Enabled (Microsoft Entra IDs)'.Yes`. */
export const ENTRA_ACCOUNT_ENABLED_YES = 952850000;

/* ═════════════════════════════════════════════════════════════════════ types ════ */

export interface GateState {
  id: string;
  name: string;
  order: number;
  isVisibleOnChecklist: boolean;
  owningBusinessUnitId: string | null;
}

export interface GateApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  clusterStateId: string | null;
  countryId: string | null;
  technology: number | null;
  portfolioManagerId: string | null;
  defaultApprovals: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

export interface ChecklistApproval {
  id: string;
  name: string | null;
  approvalMode: number | null;
  gateActive: boolean;
  projectDefaultChecklistId: string | null;
  portfolioManagerId: string | null;
  defaultApprovers: string | null;
  defaultContributors: string | null;
  defaultNotifications: string | null;
}

/** One `Project Default Checklists` template, as this screen needs it. */
export interface ChecklistItem {
  id: string;
  name: string;
  order: number;
  countryTechId: string | null;
  clusterStateId: string | null;
}

/** Rule 1's merged row: a real approval, or an in-memory placeholder. */
export interface MergedGate {
  /** The `Project States` row. */
  gate: GateState;
  approval: GateApproval | null;
  /** True when the canvas would have shown a `Patch(Defaults(...))` stand-in. */
  isPlaceholder: boolean;
}

export type PanelKind = "gate" | "checklist";

export interface ApprovalPanelState {
  kind: PanelKind;
  /** The gate the record belongs to — the BU source on BOTH branches (rule 14, fixed). */
  gate: GateState;
  /** The checklist template, on the checklist branch only. */
  checklistItem: ChecklistItem | null;
  mode: number | null;
  portfolioManager: Persona | null;
  contributors: Persona[];
  approvers: Persona[];
  notifications: Persona[];
  gateActive: boolean;
  /** `null` for a new record — nothing is written until Save (rules 3 and 19, fixed). */
  existingId: string | null;
}

export interface PlannedWrite {
  op: "create" | "update" | "delete";
  entitySet: string;
  id?: string;
  data?: Record<string, unknown>;
  reason: string;
}

export interface WritePlan {
  writes: PlannedWrite[];
  log: string[];
  refusedReason?: string;
}

export const emptyPlan = (): WritePlan => ({ writes: [], log: [] });
const refuse = (reason: string): WritePlan => ({ writes: [], log: [], refusedReason: reason });

const MODE = CHOICE_PROCESS.approvalMode;
export { MODE as APPROVAL_MODE };

/**
 * GUIDE p19 — "Approval Mode" radio group, exactly three options in this order:
 * "Formal Approval", "Local Approval", "Only Notifications". The order and the strings are
 * load-bearing (`UT-ADGATE-029`); `Screen.tsx` renders this list filtered through
 * `approvalModeChoices`, never a hand-written option list.
 */
export const APPROVAL_MODE_OPTIONS: { value: number; label: string }[] = [
  { value: MODE.formalApproval, label: "Formal Approval" },
  { value: MODE.localApproval, label: "Local Approval" },
  { value: MODE.onlyNotifications, label: "Only Notifications" },
];

/** The display label for a stored `Approval Mode` value; "—" for anything unmapped. */
export function approvalModeLabel(mode: number | null | undefined): string {
  return APPROVAL_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "—";
}

/** GUIDE p18/p19/p20 — every verbatim UI string outside `MSG` for this screen's panel. */
export const PANEL_LABELS = {
  /** `lblAdmin_ProjectGates_Approvals_Form_Title.Text` — verbatim. */
  title: "Edit Approvers",
  /**
   * NEW — no canvas equivalent: the task-approver panel title; the canvas used two separate
   * labels, `lblAdmin_ProjectGates_Approvals_Form_Title.Text` ("Edit Approvers") and
   * `…_Form_Title_1.Text` ("Edit Task")
   */
  titleTask: "Edit Task Approvers",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State.Text` — verbatim. */
  gate: "Gate",
  /** `tog_Admin_ProjectGates_Approvals_Form_Fields_Active.Label` — verbatim. */
  gateActive: "Gate active",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_ApprovalMode.Text` — verbatim. */
  approvalMode: "Approval Mode",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Notifications.Text` — verbatim. */
  notifications: "Notifications",
  /** `pcf_Admin_ProjectGates_Approvals_Form_Fields_Notifications.Tooltip` — verbatim. */
  notificationsPlaceholder: "Select Notifications",
  /** `btn_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval.Text` — verbatim. */
  resetGate: "Reset Gate",
} as const;

/** GUIDE p18/p20 — the table's column headers, in order. Load-bearing (`UT-ADGATE-030`). */
export const GATE_TABLE_COLUMNS: readonly string[] = [
  "Description", "Portfolio Manager", "Contributors", "Approvers",
  "Notifications", "Status", "Action",
];

/* ═════════════════════════════════════════════════════════════════ messages ════ */

export const MSG = {
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_Approval1_ErrorMessage.Text` — verbatim. */
  valueEmpty: "Value cannot be empty.",
  /**
   * `lbl_Admin_ProjectGates_Approvals_Form_Fields_Main_ErrorMessage.Text` — verbatim,
   * INCLUDING the canvas's misspelling "allready". Left as-is: the string is the canvas's
   * and G-LABEL keeps it until the source is fixed.
   */
  duplicateGate: "Default Approval for the selected Gate allready exists.",
  /** `lbl_Admin_ProjectGates_Approvals_Form_Fields_State_ErrMessage.Text` — verbatim. */
  clusterBlank: "The cluster cannot be blank.",
  nonWindPv:
    "Formal approval is only available for Wind and PV. This gate can use notifications "
    + "only; the stored approver lists are shown read-only and are not changed.",
  /** NEW — no canvas equivalent: the country-scope gate is added by the code app */
  outOfScope: "This country is outside your editable country scope, so approvals are read-only.",
  /**
   * NEW — no canvas equivalent: the code app confirms switching a gate off; the canvas toggled
   * it without asking
   */
  deactivateTitle: "Switch this gate off?",
  deactivateBody:
    "Deactivating a gate removes its approval step for every project in this country and "
    + "technology. The canvas app did this with no confirmation at all.",
  /** `cmp_DeleteChecklistApprovalItem_AdminScreen.Title` — the canvas title for this dialog. */
  deleteChecklistTitle: "Delete this check-list approval?",
  /** NEW — no canvas equivalent: empty state for the gate-approval list */
  noApprovals: "No gate approvals are configured for this scope yet.",
  /** NEW — no canvas equivalent: empty state for the check-list approval list */
  noChecklistApprovals: "No check-list approvals for this gate.",
  /**
   * NEW — no canvas equivalent: explains why Add is disabled; the canvas offered an empty
   * dropdown
   */
  addTaskAllApproved: "Every check-list item in this gate already has an approval.",
  /**
   * SOURCE DEFECT — GUIDE p20 shows a delete (trash) icon on GATE header rows, not just task
   * rows. Rule 24's canvas source has no `Remove` path for `Project Default Approvals` at
   * all — only `Check List Default Approvals` can be deleted. Rather than invent a
   * destructive write the canvas never had, the icon renders for visual parity and always
   * refuses with this message; `planToggleGateActive` and `Reset Gate` are the real ways to
   * clear a gate. See `planDeleteGateApproval`.
   */
  /**
   * NEW — no canvas equivalent: explains why Delete is refused on a gate row; the canvas had no
   * delete on gates at all
   */
  noGateDelete: "Gate approvals cannot be deleted. Switch the gate off or use Reset Gate instead.",
  /**
   * NEW — no canvas equivalent: explains why Reset Gate is refused; the canvas patched a blank
   * record instead
   */
  resetNoRecord: "There is no approval record for this gate yet, so there is nothing to reset.",
  /** GUIDE p19 — the "Reset Gate" caption, verbatim. */
  /**
   * `lbl_Admin_ProjectGates_Approvals_Form_Fields_ResetGateApproval_Description.Text` —
   * verbatim.
   */
  resetGateCaption: "Remove all cluster gate participants and deactivate the gate approval.",
} as const;

/* ═════════════════════════════════════════════════════════════════ the gate list ════ */

/** Rule 2 — `varAllGates: Filter('Project States', 'Is Visible On Checklist', Order < 6)`. */
export const MAX_CONFIGURABLE_GATE_ORDER = 6;

export const configurableGates = (states: GateState[]): GateState[] =>
  states
    .filter((g) => g.isVisibleOnChecklist === true && (g.order ?? 0) < MAX_CONFIGURABLE_GATE_ORDER)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/**
 * Rule 1 — EVERY gate renders, present or not.
 *
 * The canvas fills the gaps with `AddColumns(Patch(Defaults('Project Default Approvals'),
 * {'Cluster State': …}), Order, Gate.Order, Id, GUID())` — a `Patch(Defaults(...))` with
 * NO data source, so in-memory only. Here the placeholder is simply `approval: null`
 * plus `isPlaceholder: true`, and no synthetic `Id`/`Order` columns exist to be stripped
 * later with `DropColumns` (rule 20's chore disappears with them).
 */
export function mergeGatesWithApprovals(
  states: GateState[],
  approvals: GateApproval[],
): MergedGate[] {
  const byGate = new Map<string, GateApproval>();
  for (const a of approvals) {
    if (a.clusterStateId) byGate.set(a.clusterStateId, a);
  }
  return configurableGates(states).map((gate) => {
    const approval = byGate.get(gate.id) ?? null;
    return { gate, approval, isPlaceholder: approval === null };
  });
}

/* ══════════════════════════════════════════════════════════ the gate dropdown ════ */

export interface GateDropdownItem {
  /** The `Project States` row the transition STARTS from. */
  stateId: string;
  order: number;
  /** `Name & " to " & nextStateName` — a TRANSITION label, not a state name (rule 6). */
  label: string;
  name: string;
}

/** Transitions INTO these two states are excluded from the dropdown (rule 6). */
export const EXCLUDED_TRANSITION_TARGETS: readonly string[] = ["Inactive/ On-hold", "Abandoned"];

/** Rule 6's label: `Name & " to " & <the state at Order + 1>`. */
export const gateTransitionLabel = (state: GateState, next: GateState | null): string =>
  `${state.name} to ${next?.name ?? ""}`;

/**
 * Rule 6 — the dropdown builder.
 *
 * The canvas drops the LAST visible state with `FirstN(…, CountRows(…) - 1)`, because the
 * last state has no successor to transition into, then excludes transitions into
 * `"Inactive/ On-hold"` and `"Abandoned"`. Its `DisplayMode` is hard-coded
 * `DisplayMode.Disabled` — the gate is fixed by the row that was clicked — so this list
 * is a LABEL SOURCE, not a chooser. It is still built because rule 7 reads
 * `drp_….Selected.Label` as the record's `Name`.
 */
export function gateDropdownItems(states: GateState[]): GateDropdownItem[] {
  const visible = states
    .filter((g) => g.isVisibleOnChecklist === true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return visible
    .slice(0, Math.max(0, visible.length - 1))            // FirstN(…, CountRows - 1)
    .map((state, i) => ({ state, next: visible[i + 1] ?? null }))
    .filter(({ next }) => next !== null && !EXCLUDED_TRANSITION_TARGETS.includes(next.name))
    .map(({ state, next }) => ({
      stateId: state.id,
      order: state.order ?? 0,
      name: state.name,
      label: gateTransitionLabel(state, next),
    }));
}

/** Rule 7 — the gate record's `Name` IS the transition label; blank falls back to `" "`. */
export const gateRecordName = (item: GateDropdownItem | null): string => item?.label ?? " ";

/* ═════════════════════════════════════════════════════════════ mode + gating ════ */

/**
 * Rule 5 — `If(…SelectedNestedValue in ["Wind","PV"], Choices('Approval Mode'),
 *            ['Approval Mode'.'Only Notifications'])`.
 */
export function approvalModeChoices(technology: string | null | undefined): number[] {
  return isWindOrPv(technology)
    ? [MODE.formalApproval, MODE.localApproval, MODE.onlyNotifications]
    : [MODE.onlyNotifications];
}

/** The default mode: `Coalesce(<existing>, 'Approval Mode'.'Only Notifications')`. */
export const defaultApprovalMode = (existing: number | null | undefined): number =>
  existing ?? MODE.onlyNotifications;

/**
 * Rule 4 — the canvas silently RESETS a non-Wind/PV row on Edit-click, patching
 * `{'Approval Mode': Only Notifications, 'Default Approvals': Blank(),
 *   'Default Contributors': Blank(), 'Default Notifications': Blank(),
 *   'Portfolio Manager': Blank()}` before the user has typed anything. Opening a record
 * to LOOK at it destroys it.
 *
 * FIXED: nothing is written on open. This returns the banner text instead; the stored
 * values stay untouched and are shown read-only. If the business genuinely wants the
 * reset it must become an explicit, confirmed action.
 */
export function nonWindPvBanner(technology: string | null | undefined): string | null {
  return isWindOrPv(technology) ? null : MSG.nonWindPv;
}

/**
 * Rule 8 — Draft can never be deactivated.
 * `'Gate active': If(drp_….Selected.Name <> "Draft", tog_….Checked, true)` and the
 * toggle's own `DisplayMode` is `View` for a Draft cluster branch.
 */
/**
 * `lbl_ClusterName_DefaultChecklist_AdminScreen.Text` (`Admin Project Default Checklists
 * Screen`) — verbatim.
 */
export const DRAFT_GATE_NAME = "Draft";

export function resolveGateActive(gateName: string, toggle: boolean): boolean {
  return gateName === DRAFT_GATE_NAME ? true : toggle;
}

export function canToggleGateActiveInPanel(kind: PanelKind, gateName: string): boolean {
  return gateName !== DRAFT_GATE_NAME || kind === "checklist";
}

/**
 * Rule 21 — the status chip is disabled when the gate carries NO persona lists at all,
 * or its cluster is at `Order = 0` (Draft).
 */
export function canToggleGateChip(row: MergedGate): boolean {
  const a = row.approval;
  if (!a) return false;                              // a placeholder has nothing to toggle
  if ((row.gate.order ?? 0) === 0) return false;     // 'Cluster State'.Order = 0 → Draft
  const empty = isBlank(a.defaultContributors)
    && isBlank(a.defaultNotifications)
    && isBlank(a.defaultApprovals);
  return !empty;
}

/* ═══════════════════════════════════════════════════════════════════ validation ════ */

export interface PanelErrors {
  /** `lbl_…_Approval1_ErrorMessage` — Portfolio Manager, Formal Approval only. */
  portfolioManager: boolean;
  /** `lbl_…_Approval2_ErrorMessage` — Contributors, Formal Approval only. */
  contributors: boolean;
  /** `lbl_…_Approvals_ErrorMessage` — Approvers, unless Only-Notifications. */
  approvers: boolean;
  /** `lbl_…_Notifications_ErrorMessage` — Notifications, Only-Notifications only. */
  notifications: boolean;
  /** `lbl_…_Main_ErrorMessage` — the duplicate-gate guard. */
  duplicateGate: boolean;
}

/**
 * The five error labels whose visibility disables Save.
 *
 * SOURCE DEFECT (`duplicateGate`): the canvas guard is
 *   `!IsBlank(drp_….Selected) && IsBlank(locSelectedApprovalsEntity)
 *    && drp_….Selected.Order in ShowColumns(gal_….AllItems, Order)
 *    && locEditigApprovalType <> "Checklist"`
 * but rule 1 ALWAYS materialises a row for every gate, so `Order` is always in that list
 * and the guard fires for any new gate record. That is precisely why the gate dropdown
 * had to be hard-coded `Disabled`. Here the guard is what it was meant to be: it fires
 * only when a REAL approval row already exists for the chosen gate.
 *
 * Two further labels — the two `"The cluster cannot be blank."` ones — are rendered by the
 * canvas but never wired into the Save `DisplayMode`. Not ported; a blank cluster is
 * impossible now that the gate comes from the row that was clicked.
 */
export function validatePanel(
  panel: ApprovalPanelState,
  opts: { existingApprovalForGate?: boolean } = {},
): PanelErrors {
  const mode = panel.mode ?? MODE.onlyNotifications;
  const formal = mode === MODE.formalApproval;
  return {
    portfolioManager: formal && panel.portfolioManager === null,
    contributors: formal && panel.contributors.length === 0,
    approvers: mode !== MODE.onlyNotifications && panel.approvers.length === 0,
    notifications: mode === MODE.onlyNotifications && panel.notifications.length === 0,
    duplicateGate:
      panel.kind === "gate"
      && panel.existingId === null
      && opts.existingApprovalForGate === true,
  };
}

export const hasErrors = (e: PanelErrors): boolean => Object.values(e).some(Boolean);

export function canSavePanel(
  panel: ApprovalPanelState,
  opts: { canEdit: boolean; existingApprovalForGate?: boolean },
): boolean {
  if (!opts.canEdit) return false;
  return !hasErrors(validatePanel(panel, opts));
}

export function panelErrorMessages(errors: PanelErrors): string[] {
  const out: string[] = [];
  if (errors.portfolioManager) out.push(`Portfolio Manager: ${MSG.valueEmpty}`);
  if (errors.contributors) out.push(`Contributors: ${MSG.valueEmpty}`);
  if (errors.approvers) out.push(`Approvers: ${MSG.valueEmpty}`);
  if (errors.notifications) out.push(`Notifications: ${MSG.valueEmpty}`);
  if (errors.duplicateGate) out.push(MSG.duplicateGate);
  return out;
}

/** Country scope, applied here and absent from the canvas. */
export function canEditScope(user: CurrentUser | null, scope: Scope): boolean {
  if (!user) return false;
  return canEditCountry(user, scope.country?.id ?? undefined);
}

/* ═════════════════════════════════════════════════════════════ the persona writes ════ */

/**
 * Rule 10 — the three lists have DIFFERENT write conditions:
 *   Contributors   only when mode = Formal Approval
 *   Approvers      when mode <> Only Notifications
 *   Notifications  whenever the list is non-empty
 * and rule 9 — Portfolio Manager is written only in Formal Approval, else `Blank()`.
 *
 * A field the condition excludes is written as `null`, not omitted: that is how the canvas
 * `Blank()` behaves and it is what UT-ADGATE-014 asserts.
 */
export interface PersonaFields {
  portfolioManagerId: string | null;
  contributors: string | null;
  approvers: string | null;
  notifications: string | null;
}

export function personaFieldsForMode(panel: ApprovalPanelState): PersonaFields {
  const mode = panel.mode ?? MODE.onlyNotifications;
  const formal = mode === MODE.formalApproval;
  return {
    portfolioManagerId: formal ? panel.portfolioManager?.id ?? null : null,
    contributors: formal ? serialisePersonaList(panel.contributors) : null,
    approvers:
      mode !== MODE.onlyNotifications ? serialisePersonaList(panel.approvers) : null,
    notifications:
      panel.notifications.length > 0 ? serialisePersonaList(panel.notifications) : null,
  };
}

/* ═════════════════════════════════════════════════════════════════════ the save ════ */

/**
 * Rules 9–14 and 23 — the save payload, branching on `kind`.
 *
 * Rule 12: the two tables use DIFFERENT COLUMN NAMES FOR THE SAME CONCEPT — the gate row
 * has `Default Approvals`, the checklist row has `Default Approvers`. Writing the wrong
 * one silently loses the approver list, so the branch is enforced by the discriminated
 * union rather than by a string compare in fourteen places.
 *
 * Rule 14, FIXED: the canvas takes `'Owning Business Unit'` from
 * `drp_Admin_ProjectGates_Approvals_Form_Fields_State` on BOTH branches — but the
 * checklist branch never sets that dropdown, so a checklist approval inherits whatever
 * gate the CLUSTER panel happened to have open, or nothing. Here both branches read the
 * BU from the gate the record actually belongs to (`panel.gate`).
 */
export function buildApprovalPayload(
  panel: ApprovalPanelState,
  scope: Scope,
  gateName: string,
): Record<string, unknown> {
  const personas = personaFieldsForMode(panel);
  const mode = panel.mode ?? MODE.onlyNotifications;
  const isCreate = panel.existingId === null;

  const data: Record<string, unknown> = {
    [GATE_APPROVAL_COL.approvalMode]: mode,
    [GATE_APPROVAL_COL.gateActive]: resolveGateActive(gateName, panel.gateActive),
    [GATE_APPROVAL_COL.defaultContributors]: personas.contributors,
    [GATE_APPROVAL_COL.defaultNotifications]: personas.notifications,
  };

  // Rule 9 — a lookup, written only in Formal Approval.
  data[`${GATE_LOOKUP.portfolioManager}@odata.bind`] = personas.portfolioManagerId
    ? `/vsb_microsoftentraids(${personas.portfolioManagerId})`
    : null;

  if (panel.kind === "gate") {
    // Rule 7 — the gate record's name is the transition label.
    data[GATE_APPROVAL_COL.name] = gateName;
    // Rule 12 — `Default Approvals`, NOT `Default Approvers`.
    data[GATE_APPROVAL_COL.defaultApprovals] = personas.approvers;
    if (isCreate) {
      data[`${GATE_LOOKUP.clusterState}@odata.bind`] = `/vsb_projectstates(${panel.gate.id})`;
      if (scope.country?.id) {
        data[`${GATE_LOOKUP.country}@odata.bind`] = `/vsb_countries(${scope.country.id})`;
      }
      // Rule 13 — technology by label match; blank nested value yields blank.
      data[GATE_APPROVAL_COL.technology] = technologyValue(scope.technology);
    }
  } else {
    // Rule 7's checklist half — the record's name is the checklist item's own name.
    data[CHECKLIST_APPROVAL_COL.name] = panel.checklistItem?.name ?? "";
    // Rule 12 — `Default Approvers`, NOT `Default Approvals`.
    data[CHECKLIST_APPROVAL_COL.defaultApprovers] = personas.approvers;
    if (isCreate && panel.checklistItem) {
      data[`${GATE_LOOKUP.projectDefaultChecklist}@odata.bind`] =
        `/vsb_projectdefaultchecklistses(${panel.checklistItem.id})`;
    }
  }

  // Rule 14 (fixed) — the BU of the gate this record belongs to.
  if (panel.gate.owningBusinessUnitId) {
    data[`${GATE_LOOKUP.owningBusinessUnit}@odata.bind`] =
      `/businessunits(${panel.gate.owningBusinessUnitId})`;
  }
  return data;
}

export function planSaveApproval(
  panel: ApprovalPanelState,
  scope: Scope,
  opts: { canEdit: boolean; gateName: string; existingApprovalForGate?: boolean },
): WritePlan {
  if (!opts.canEdit) return refuse(MSG.outOfScope);
  const errors = validatePanel(panel, opts);
  if (hasErrors(errors)) return refuse(panelErrorMessages(errors)[0]);

  const entitySet = panel.kind === "gate" ? GATE_ENTITY_SET : CHECKLIST_APPROVAL_ENTITY_SET;
  const data = buildApprovalPayload(panel, scope, opts.gateName);
  const plan = emptyPlan();
  plan.writes.push(
    panel.existingId === null
      ? { op: "create", entitySet, data, reason: `${panel.kind} approval created` }
      : { op: "update", entitySet, id: panel.existingId, data, reason: `${panel.kind} approval updated` },
  );
  plan.log.push(
    `${panel.kind === "gate" ? "Gate" : "Check-list"} approval saved for ${opts.gateName}.`,
  );
  return plan;
}

/**
 * Rule 20 — the status chip.
 *
 * The canvas toggles it with NO CONFIRMATION:
 * `Patch(…, DropColumns(ThisItem, Id, Order), {'Gate active': If(Self.Text = "Active",
 * false, true)})`. Switching a gate off removes the approval step for a whole country;
 * `Screen.tsx` puts a `ConfirmDialog` in front of it. The `DropColumns` is gone because
 * rule 1's placeholder no longer adds synthetic columns.
 */
export function planToggleGateActive(row: MergedGate, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse(MSG.outOfScope);
  if (!row.approval) return refuse("This gate has no approval record to switch off.");
  if (!canToggleGateChip(row)) return refuse("This gate has no approvers, so it cannot be switched on.");
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet: GATE_ENTITY_SET, id: row.approval.id,
    data: { [GATE_APPROVAL_COL.gateActive]: !row.approval.gateActive },
    reason: `${row.gate.name} gate ${row.approval.gateActive ? "deactivated" : "activated"}`,
  });
  return plan;
}

/**
 * Rule 24 — Delete exists only for CHECKLIST approvals.
 * `Remove('Check List Default Approvals', locSelectedChecklistApprovalEntity)`. There is
 * no delete for a gate-level approval; deactivation is the only path, which is why
 * `planToggleGateActive` is the whole story there.
 */
export function planDeleteChecklistApproval(
  approval: ChecklistApproval,
  canEdit: boolean,
): WritePlan {
  if (!canEdit) return refuse(MSG.outOfScope);
  const plan = emptyPlan();
  plan.writes.push({
    op: "delete", entitySet: CHECKLIST_APPROVAL_ENTITY_SET, id: approval.id,
    reason: `Check-list approval “${approval.name ?? approval.id}” deleted`,
  });
  return plan;
}

/**
 * See the `MSG.noGateDelete` SOURCE DEFECT block above — GUIDE p20 shows a delete icon on
 * gate header rows, but the canvas never wrote a `Remove` for `Project Default Approvals`.
 * This always refuses (out-of-scope aside) rather than issue that write silently.
 */
export function planDeleteGateApproval(_row: MergedGate, canEdit: boolean): WritePlan {
  if (!canEdit) return refuse(MSG.outOfScope);
  return refuse(MSG.noGateDelete);
}

/** Whether the "Reset Gate" button is usable at all — an existing record, in scope. */
export function canResetGate(panel: ApprovalPanelState, canEdit: boolean): boolean {
  return canEdit && panel.existingId !== null;
}

/**
 * GUIDE p19 — "Reset Gate": `MSG.resetGateCaption`, verbatim, is the caption beside the
 * button. Reuses `buildApprovalPayload` with every persona list and the portfolio manager
 * cleared and the toggle switched off, so the write shape (which column is `Default
 * Approvals` vs `Default Approvers`, the BU, …) can never drift from a normal save.
 * `resolveGateActive` still applies, so resetting a Draft-origin gate leaves it active,
 * exactly as switching it off would (rule 8).
 */
export function planResetGate(
  panel: ApprovalPanelState,
  scope: Scope,
  gateName: string,
  canEdit: boolean,
): WritePlan {
  if (!canEdit) return refuse(MSG.outOfScope);
  if (panel.existingId === null) return refuse(MSG.resetNoRecord);

  const cleared: ApprovalPanelState = {
    ...panel,
    portfolioManager: null,
    contributors: [],
    approvers: [],
    notifications: [],
    gateActive: false,
  };
  const entitySet = panel.kind === "gate" ? GATE_ENTITY_SET : CHECKLIST_APPROVAL_ENTITY_SET;
  const data = buildApprovalPayload(cleared, scope, gateName);
  const plan = emptyPlan();
  plan.writes.push({
    op: "update", entitySet, id: panel.existingId, data,
    reason: `${panel.kind} approval reset for ${gateName}`,
  });
  plan.log.push(`Gate reset: ${gateName}.`);
  return plan;
}

/* ══════════════════════════════════════════════════════ checklist approvals ════ */

/**
 * Rule 17 — checklist approvals are scoped by the checklist item's OWN country/technology
 * and the gate's order. The canvas expresses that as a client-side `Filter` over the
 * whole table after an `AddColumns`; `hooks.ts` pushes both predicates into `$filter` on
 * the lookup navigation properties. This function re-applies them for the tests.
 */
export function checklistApprovalsForGate(
  approvals: ChecklistApproval[],
  items: ChecklistItem[],
  gateId: string,
  scopeCountryTechId: string | null,
): { approval: ChecklistApproval; item: ChecklistItem | null }[] {
  const inScope = new Map(
    items
      .filter((i) =>
        i.clusterStateId === gateId
        && (scopeCountryTechId === null || i.countryTechId === scopeCountryTechId))
      .map((i) => [i.id, i]),
  );
  return approvals
    .filter((a) => a.projectDefaultChecklistId !== null && inScope.has(a.projectDefaultChecklistId))
    .map((a) => ({ approval: a, item: inScope.get(a.projectDefaultChecklistId!) ?? null }))
    .sort((x, y) => (x.item?.order ?? 0) - (y.item?.order ?? 0));
}

/**
 * Rule 18 — "Add Task" is enabled only while at least one check-list item in this gate has
 * NO approval yet.
 *
 * SOURCE DEFECT: the canvas's inner "already approved" list is
 * `ShowColumns(AddColumns([@'Check List Default Approvals'] As CLDA, DefaultChecklistId,
 * CLDA.'Project Default Check List'.'Project Default Checklist'), DefaultChecklistId)` —
 * the WHOLE TABLE, not scoped by country or technology. An approval created for the same
 * template in ANOTHER country therefore blocks the add here.
 *
 * FIXED: only approvals whose template is inside the current country/technology scope
 * count. UT-ADGATE-022 pins the cross-country case.
 */
export function canAddChecklistApproval(
  items: ChecklistItem[],
  approvals: ChecklistApproval[],
  gateId: string,
  scopeCountryTechId: string | null,
): boolean {
  const scoped = items.filter((i) =>
    i.clusterStateId === gateId
    && (scopeCountryTechId === null || i.countryTechId === scopeCountryTechId));
  if (scoped.length === 0) return false;

  const scopedIds = new Set(scoped.map((i) => i.id));
  const approvedInScope = new Set(
    approvals
      .map((a) => a.projectDefaultChecklistId)
      .filter((id): id is string => id !== null && scopedIds.has(id)),
  );
  return scoped.some((i) => !approvedInScope.has(i.id));
}

/** The canvas behaviour of rule 18, kept for the parity test. Not wired to the UI. */
export function canAddChecklistApprovalCanvasParity(
  items: ChecklistItem[],
  approvals: ChecklistApproval[],
  gateId: string,
  scopeCountryTechId: string | null,
): boolean {
  const scoped = items.filter((i) =>
    i.clusterStateId === gateId
    && (scopeCountryTechId === null || i.countryTechId === scopeCountryTechId));
  const approvedAnywhere = new Set(
    approvals.map((a) => a.projectDefaultChecklistId).filter(Boolean) as string[],
  );
  return scoped.some((i) => !approvedAnywhere.has(i.id));
}

/* ══════════════════════════════════════════════════════ the table (p18/p20) ════ */

export type GateTableRowKind = "gate" | "task" | "addTask";

/**
 * One flattened table row. `Screen.tsx` renders `Description`/`Portfolio Manager`/
 * `Contributors`/`Approvers`/`Notifications`/`Status`/`Action` straight off this shape —
 * no branching on `row.gate`/`row.task` inside the column definitions.
 */
export interface GateTableRow {
  kind: GateTableRowKind;
  key: string;
  description: string;
  portfolioManager: Persona[];
  contributors: Persona[];
  approvers: Persona[];
  notifications: Persona[];
  /** `null` on the "+ Add Task" row and on a placeholder gate with no approval yet. */
  active: boolean | null;
  isPlaceholder: boolean;
  gate: MergedGate;
  task: { approval: ChecklistApproval; item: ChecklistItem | null } | null;
  /** Only meaningful on an `addTask` row — whether the link is clickable. */
  addTaskEnabled: boolean;
}

/**
 * GUIDE p18/p20 — the two-level table: a bold gate row (rule 1 — every configurable gate,
 * placeholder or not) followed by its task rows and a trailing "+ Add Task" row, per gate.
 * Collapsing a gate (the "−"/"+" expander) hides its task and Add-Task rows only — the gate
 * row itself always renders. `UT-ADGATE-032`/`033` pin the flattening and the collapse.
 *
 * `resolvePerson` turns a Portfolio Manager LOOKUP id into a one-element (or empty) Persona
 * list — that field is a plain lookup, not one of the three JSON persona lists, so the
 * caller supplies the resolved directory entry (see `usePortfolioManagerPersonas`).
 */
export function buildGateTableRows(
  merged: MergedGate[],
  dropdownItems: GateDropdownItem[],
  checklistApprovals: ChecklistApproval[],
  items: ChecklistItem[],
  countryTechId: string | null,
  expandedGateIds: ReadonlySet<string>,
  resolvePerson: (id: string | null) => Persona[],
): GateTableRow[] {
  const out: GateTableRow[] = [];

  for (const row of merged) {
    const label =
      row.approval?.name?.trim()
      || dropdownItems.find((d) => d.stateId === row.gate.id)?.label
      || row.gate.name;

    out.push({
      kind: "gate",
      key: `gate-${row.gate.id}`,
      description: label,
      portfolioManager: resolvePerson(row.approval?.portfolioManagerId ?? null),
      contributors: parsePersonaList(row.approval?.defaultContributors),
      approvers: parsePersonaList(row.approval?.defaultApprovals),
      notifications: parsePersonaList(row.approval?.defaultNotifications),
      // The raw stored flag, not `resolveGateActive` — that function keys off the exact
      // state name "Draft", but the value in hand here (and the one `Screen.tsx` actually
      // passes on save) is the TRANSITION label ("Draft to Cluster 1"), so the Draft guard
      // never matches it. Reusing it here would just be a second copy of that same gap.
      active: row.approval ? row.approval.gateActive : null,
      isPlaceholder: row.isPlaceholder,
      gate: row,
      task: null,
      addTaskEnabled: false,
    });

    if (!expandedGateIds.has(row.gate.id)) continue;

    const tasks = checklistApprovalsForGate(checklistApprovals, items, row.gate.id, countryTechId);
    for (const t of tasks) {
      out.push({
        kind: "task",
        key: `task-${t.approval.id}`,
        description: t.item?.name ?? t.approval.name ?? "",
        portfolioManager: resolvePerson(t.approval.portfolioManagerId),
        contributors: parsePersonaList(t.approval.defaultContributors),
        approvers: parsePersonaList(t.approval.defaultApprovers),
        notifications: parsePersonaList(t.approval.defaultNotifications),
        active: t.approval.gateActive,
        isPlaceholder: false,
        gate: row,
        task: t,
        addTaskEnabled: false,
      });
    }

    out.push({
      kind: "addTask",
      key: `addtask-${row.gate.id}`,
      description: "+ Add Task",
      portfolioManager: [], contributors: [], approvers: [], notifications: [],
      active: null,
      isPlaceholder: false,
      gate: row,
      task: null,
      addTaskEnabled: canAddChecklistApproval(items, checklistApprovals, row.gate.id, countryTechId),
    });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════ the people search ════ */

/**
 * Rule 15 — the picker searches Entra directly and ONLY enabled accounts:
 * `Search(Filter('Microsoft Entra IDs', 'Microsoft Entra ID Account Enabled' = …Yes),
 *        Trim(Self.SearchText), 'Display Name', 'Given Name', Surname, Mail)`
 * A blank search term clears the suggestions and issues no request.
 */
export const shouldSearchPeople = (term: string): boolean => term.trim().length > 0;

export function entraSearchFilter(term: string): string | undefined {
  const t = term.trim();
  if (!t) return undefined;
  const esc = t.replace(/'/g, "''");
  const like = [ENTRA_COL.displayName, ENTRA_COL.givenName, ENTRA_COL.surname, ENTRA_COL.mail]
    .map((c) => `contains(${c},'${esc}')`)
    .join(" or ");
  return `(${ENTRA_COL.accountEnabled} eq ${ENTRA_ACCOUNT_ENABLED_YES}) and (${like})`;
}

/**
 * Rule 16 — the Portfolio Manager picker is `MaxPeople: =1`; the other three are
 * unbounded. Selecting a second person REPLACES the first.
 */
export function applyPersonaSelection(
  current: Persona[],
  picked: Persona,
  maxPeople?: number,
): Persona[] {
  if (maxPeople === 1) return [picked];
  return current.some((p) => p.id === picked.id) ? current : [...current, picked];
}
